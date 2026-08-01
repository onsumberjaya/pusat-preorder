let allOrders = [];
let allProductsMap = {};
let allCabangMap = {};
let selectedIds = new Set();
let currentProfile = null;
let currentPage = 1;
let pageSize = 20;

// Kotak centang per pesanan disembunyikan sampai kotak centang di header
// diklik pertama kali (baru muncul, belum memilih apa pun). Klik header
// berikutnya berfungsi sebagai select all / deselect all seperti biasa.
let checkboxesRevealed = false;

// Default rentang tanggal saat halaman dibuka: 30 hari terakhir. Ini murni
// supaya bacaan Firestore tidak membengkak seiring bertambahnya riwayat
// pesanan -- untuk lihat data yang lebih lama, ubah saja tanggal "Dari".
function defaultDariTanggal() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// Tombol "Filter" di pojok kanan atas -- kotak filter disembunyikan
// secara default dan baru muncul saat tombol ini diklik.
function togglePesananFilterVisibility() {
  const toolbar = document.getElementById("pesanan-filter-toolbar");
  const btn = document.getElementById("pesanan-filter-toggle-btn");
  const hidden = toolbar.style.display === "none";
  toolbar.style.display = hidden ? "" : "none";
  btn.innerHTML = hidden
    ? '<i class="ph-bold ph-eye-slash"></i> Sembunyikan Filter'
    : '<i class="ph-bold ph-funnel"></i> Filter';
}

// resolveWaveLabel() & hasOrderAnomaly() (deteksi harga/subtotal/total
// janggal) sekarang di js/utils.js supaya tidak disalin-tempel 3x di tiap
// halaman (Daftar Pesanan, Laporan, Dashboard).

// ---------- Filter Cepat / Preset ----------
// 2 kondisi yang paling sering dicek kasir sehari-hari: pesanan yang belum
// diambil minggu ini (buat siapin barangnya), dan yang belum lunas (buat
// tagih). Sengaja cuma 1 klik -- daripada isi filter manual tiap kali.
function startEndOfThisWeek() {
  const now = new Date();
  const day = now.getDay(); // 0 = Minggu
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { senin: monday.toISOString().slice(0, 10), minggu: sunday.toISOString().slice(0, 10) };
}

function clearQuickFilterActive() {
  const a = document.getElementById("quick-chip-belum-diambil");
  const b = document.getElementById("quick-chip-belum-lunas");
  if (a) a.classList.remove("active");
  if (b) b.classList.remove("active");
}

function applyQuickFilter(type) {
  currentPage = 1;

  // Bersihkan filter lain dulu supaya presetnya "bersih" (tidak nyampur
  // dengan filter manual yang mungkin masih menyala dari sebelumnya).
  document.getElementById("filter-search").value = "";
  document.getElementById("filter-produk").value = "";
  document.getElementById("filter-gelombang").innerHTML = '<option value="">Semua Gelombang</option>';
  document.getElementById("filter-harga-janggal").checked = false;
  document.getElementById("anomali-chip").classList.remove("active");
  const cabangFilterEl = document.getElementById("filter-cabang");
  if (cabangFilterEl) cabangFilterEl.value = "";
  document.getElementById("filter-bayar").value = "";
  document.getElementById("filter-ambil").value = "";

  if (type === "belum-diambil-minggu-ini") {
    const { senin, minggu } = startEndOfThisWeek();
    document.getElementById("filter-dari").value = senin;
    document.getElementById("filter-sampai").value = minggu;
    document.getElementById("filter-ambil").value = "belum";
  } else if (type === "belum-lunas") {
    // Sengaja TIDAK dibatasi tanggal (dikosongkan) -- tunggakan lama yang
    // sudah lewat 30 hari terakhir tetap harus kelihatan, bukan cuma yang baru.
    document.getElementById("filter-dari").value = "";
    document.getElementById("filter-sampai").value = "";
    document.getElementById("filter-bayar").value = "belum_lunas";
  }

  // Buka panel filter biar kelihatan kondisi apa yang lagi aktif.
  document.getElementById("pesanan-filter-toolbar").style.display = "";
  document.getElementById("pesanan-filter-toggle-btn").innerHTML = '<i class="ph-bold ph-eye-slash"></i> Sembunyikan Filter';

  clearQuickFilterActive();
  const chip = document.getElementById(type === "belum-diambil-minggu-ini" ? "quick-chip-belum-diambil" : "quick-chip-belum-lunas");
  if (chip) chip.classList.add("active");

  loadOrders(); // rentang tanggal berubah -> query ke Firestore harus diulang
}

window.onAuthReady = function (profile) {
  currentProfile = profile;
  listenProductFilters();

  // Kalau datang dari banner "Pesanan Terdeteksi Janggal" di Dashboard,
  // langsung nyalakan filter anomali -- dan JANGAN batasi ke 30 hari
  // terakhir (defaultnya), soalnya pesanan janggalnya bisa saja lebih lama
  // dari itu dan jadi tidak kelihatan kalau dibatasi.
  const params = new URLSearchParams(window.location.search);
  const fromAnomaliLink = params.get("anomali") === "1";
  const cariDariTopbar = params.get("cari") || "";

  // Pencarian dari bar cari global (topbar) juga sengaja tidak dibatasi 30
  // hari terakhir -- orang yang cari lewat situ biasanya cari 1 nota
  // spesifik, bisa saja dari bulan lalu, jangan sampai tidak ketemu gara-gara
  // kena batas tanggal default.
  document.getElementById("filter-dari").value = fromAnomaliLink || cariDariTopbar ? "" : defaultDariTanggal();
  document.getElementById("filter-sampai").value = fromAnomaliLink || cariDariTopbar ? "" : new Date().toISOString().slice(0, 10);
  if (fromAnomaliLink) {
    document.getElementById("filter-harga-janggal").checked = true;
    document.getElementById("anomali-chip").classList.add("active");
  }
  if (cariDariTopbar) {
    document.getElementById("filter-search").value = cariDariTopbar;
    togglePesananFilterVisibility(); // buka panel filter biar kelihatan lagi cari apa
  }
  loadOrders();

  if (canAccessAllBranches(profile)) {
    listenCabangFilter();
  }

  document.getElementById("filter-dari").addEventListener("change", () => {
    currentPage = 1;
    clearQuickFilterActive();
    loadOrders();
  });
  document.getElementById("filter-sampai").addEventListener("change", () => {
    currentPage = 1;
    clearQuickFilterActive();
    loadOrders();
  });
  document.getElementById("filter-search").addEventListener("input", () => {
    currentPage = 1;
    clearQuickFilterActive();
    debounceRender();
  });
  document.getElementById("filter-cabang").addEventListener("change", () => {
    currentPage = 1;
    clearQuickFilterActive();
    renderOrders();
  });
  document.getElementById("filter-produk").addEventListener("change", () => {
    currentPage = 1;
    clearQuickFilterActive();
    updateGelombangFilterOptions();
    renderOrders();
  });
  document.getElementById("filter-gelombang").addEventListener("change", () => {
    currentPage = 1;
    clearQuickFilterActive();
    renderOrders();
  });
  document.getElementById("filter-bayar").addEventListener("change", () => {
    currentPage = 1;
    clearQuickFilterActive();
    renderOrders();
  });
  document.getElementById("filter-ambil").addEventListener("change", () => {
    currentPage = 1;
    clearQuickFilterActive();
    renderOrders();
  });
  document.getElementById("filter-harga-janggal").addEventListener("change", () => {
    currentPage = 1;
    clearQuickFilterActive();
    renderOrders();
  });
  document.getElementById("filter-pagesize").addEventListener("change", (e) => {
    pageSize = Number(e.target.value) || 20;
    currentPage = 1;
    renderOrders();
  });

  const anomaliCheckbox = document.getElementById("filter-harga-janggal");
  const anomaliChip = document.getElementById("anomali-chip");
  anomaliCheckbox.addEventListener("change", () => {
    anomaliChip.classList.toggle("active", anomaliCheckbox.checked);
  });

  document.getElementById("bulk-delete-btn").style.display = profile.role === "owner" ? "inline-flex" : "none";
};

// Filter Cabang cuma ditampilkan untuk Owner/Admin Kasir (yang boleh lihat
// semua cabang) -- Karyawan cabang tidak perlu ini karena datanya sudah
// otomatis terbatas ke cabangnya sendiri lewat query di loadOrders().
function listenCabangFilter() {
  const select = document.getElementById("filter-cabang");
  select.style.display = "";
  db.collection("cabang")
    .orderBy("nama")
    .onSnapshot(
      (snap) => {
        allCabangMap = {};
        const currentValue = select.value;
        select.innerHTML = '<option value="">Semua Cabang</option>';
        snap.docs.forEach((d) => {
          const c = { id: d.id, ...d.data() };
          allCabangMap[c.id] = c;
          const opt = document.createElement("option");
          opt.value = c.id;
          opt.textContent = c.nama;
          select.appendChild(opt);
        });
        if (Array.from(select.options).some((o) => o.value === currentValue)) select.value = currentValue;
        renderOrders();
      },
      (err) => {
        showToast("Gagal memuat cabang: " + friendlyFirebaseError(err), "error");
      }
    );
}

let debounceTimer;
function debounceRender() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(renderOrders, 200);
}

function listenProductFilters() {
  const select = document.getElementById("filter-produk");
  db.collection("products")
    .orderBy("nama")
    .onSnapshot(
      (snap) => {
        const currentProductId = select.value;
        allProductsMap = {};
        select.innerHTML = '<option value="">Semua Produk</option>';
        snap.docs.forEach((d) => {
          const p = { id: d.id, ...d.data() };
          allProductsMap[p.id] = p;
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.nama;
          select.appendChild(opt);
        });
        if (allProductsMap[currentProductId]) select.value = currentProductId;
        updateGelombangFilterOptions();
        renderOrders();
      },
      (err) => {
        showToast("Gagal memuat produk: " + friendlyFirebaseError(err), "error");
      }
    );
}

function updateGelombangFilterOptions() {
  const productId = document.getElementById("filter-produk").value;
  const select = document.getElementById("filter-gelombang");
  const currentValue = select.value;
  select.innerHTML = '<option value="">Semua Gelombang</option>';
  const product = allProductsMap[productId];
  if (product) {
    (product.waves || []).forEach((w) => {
      const opt = document.createElement("option");
      opt.value = w.label;
      opt.textContent = w.label;
      select.appendChild(opt);
    });
  } else {
    // Kalau produk belum dipilih, tampilkan semua label gelombang unik yang pernah dipakai
    const labels = new Set();
    Object.values(allProductsMap).forEach((p) => (p.waves || []).forEach((w) => labels.add(w.label)));
    labels.forEach((label) => {
      const opt = document.createElement("option");
      opt.value = label;
      opt.textContent = label;
      select.appendChild(opt);
    });
  }
  const optionValues = Array.from(select.options).map((o) => o.value);
  if (optionValues.includes(currentValue)) select.value = currentValue;
}

// Karyawan cabang: query WAJIB dibatasi where('cabang_id', '==', ...) --
// bukan cuma supaya rapi, tapi karena Firestore rules menolak query yang
// berpotensi mengembalikan dokumen di luar izin baca user (lihat komentar
// di firestore.rules). Owner/Admin Kasir tetap lihat semua cabang seperti biasa.
// Catatan: sengaja pakai .get() (baca sekali), BUKAN onSnapshot (real-time).
// Data pesanan di sini bisa banyak & terus bertambah, jadi listener real-time
// yang menyala terus-menerus di halaman ini cukup boros bacaan Firestore.
// Kalau ada pembayaran/perubahan baru dari perangkat lain, klik "Muat Ulang"
// atau ubah filter tanggal untuk menyegarkan datanya.
async function loadOrders() {
  const profile = currentProfile;
  if (!profile) return;

  const dari = document.getElementById("filter-dari").value;
  const sampai = document.getElementById("filter-sampai").value;
  const container = document.getElementById("order-list");
  container.innerHTML = `<div class="loading-center"><div class="spinner"></div></div>`;

  try {
    let query = db.collection("orders");
    if (!canAccessAllBranches(profile) && profile.cabang_id) {
      query = query.where("cabang_id", "==", profile.cabang_id);
    }
    if (dari) query = query.where("tanggal", ">=", new Date(dari + "T00:00:00"));
    if (sampai) query = query.where("tanggal", "<=", new Date(sampai + "T23:59:59"));
    query = query.orderBy("tanggal", "desc");

    const snap = await query.get();
    allOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderOrders();
  } catch (err) {
    container.innerHTML = `<div class="alert alert-error">${friendlyFirebaseError(err)}</div>`;
  }
}

function refreshOrders() {
  currentPage = 1;
  loadOrders();
}

function getFilteredOrders() {
  const search = document.getElementById("filter-search").value.trim().toLowerCase();
  const cabangFilterEl = document.getElementById("filter-cabang");
  const cabangId = cabangFilterEl ? cabangFilterEl.value : "";
  const produkId = document.getElementById("filter-produk").value;
  const gelombangLabel = document.getElementById("filter-gelombang").value;
  const statusBayar = document.getElementById("filter-bayar").value;
  const statusAmbil = document.getElementById("filter-ambil").value;

  return allOrders.filter((o) => {
    if (cabangId && o.cabang_id !== cabangId) return false;
    if (search) {
      const hay = `${o.nama_pembeli} ${o.no_hp} ${o.order_no} ${formatOrderNo(o)}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (produkId && !(o.items || []).some((it) => it.product_id === produkId)) return false;
    if (gelombangLabel && !(o.items || []).some((it) => resolveWaveLabel(it, allProductsMap) === gelombangLabel)) return false;
    if (statusBayar === "belum_lunas" && o.status_bayar === "lunas") return false;
    if (statusBayar && statusBayar !== "belum_lunas" && o.status_bayar !== statusBayar) return false;
    if (statusAmbil === "sudah" && !o.is_diambil) return false;
    if (statusAmbil === "belum" && o.is_diambil) return false;
    if (document.getElementById("filter-harga-janggal").checked && !hasOrderAnomaly(o, allProductsMap)) return false;
    return true;
  });
}

function resetFilters() {
  currentPage = 1;
  clearQuickFilterActive();
  document.getElementById("filter-search").value = "";
  const cabangFilterEl = document.getElementById("filter-cabang");
  if (cabangFilterEl) cabangFilterEl.value = "";
  document.getElementById("filter-produk").value = "";
  document.getElementById("filter-gelombang").innerHTML = '<option value="">Semua Gelombang</option>';
  document.getElementById("filter-bayar").value = "";
  document.getElementById("filter-ambil").value = "";
  document.getElementById("filter-harga-janggal").checked = false;
  document.getElementById("anomali-chip").classList.remove("active");

  const dariEl = document.getElementById("filter-dari");
  const sampaiEl = document.getElementById("filter-sampai");
  const rangeChanged = dariEl.value !== defaultDariTanggal() || sampaiEl.value !== new Date().toISOString().slice(0, 10);
  dariEl.value = defaultDariTanggal();
  sampaiEl.value = new Date().toISOString().slice(0, 10);

  if (rangeChanged) loadOrders();
  else renderOrders();
}

function renderOrders() {
  const list = getFilteredOrders();
  const container = document.getElementById("order-list");

  if (list.length === 0) {
    container.innerHTML = `<div class="card empty-state">Tidak ada pesanan yang cocok dengan filter.</div>`;
    updateBulkToolbar();
    return;
  }

  // Potong ke halaman yang sedang aktif. Kalau halaman aktif ternyata sudah
  // melebihi jumlah halaman yang ada (mis. setelah filter dipersempit atau
  // ada pesanan yang dihapus), otomatis mundur ke halaman terakhir yang
  // masih valid supaya tidak nampilkan halaman kosong.
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const startIdx = (currentPage - 1) * pageSize;
  const pageList = list.slice(startIdx, startIdx + pageSize);

  const isOwner = window.currentUserProfile && window.currentUserProfile.role === "owner";
  const showCabangCol = canAccessAllBranches(window.currentUserProfile);

  container.innerHTML = `
    <div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="text-align:center;">
                ${
                  checkboxesRevealed
                    ? `<input type="checkbox" id="select-all" onchange="toggleSelectAll(this.checked)" title="Pilih/batal pilih semua" /><br /><a href="#" onclick="exitSelectionMode(); return false;" style="font-size:10px; color:var(--gray-400); text-decoration:underline;">Batal</a>`
                    : `<input type="checkbox" id="select-all" onchange="toggleSelectAll(this.checked)" title="Klik untuk mulai pilih beberapa pesanan sekaligus" /><br /><span style="font-size:10px; font-weight:400; color:var(--gray-400);">No</span>`
                }
              </th>
              <th>Nota / Tanggal</th>
              ${showCabangCol ? "<th>Cabang</th>" : ""}
              <th>Pemesan</th>
              <th>Produk & Gelombang</th>
              <th>Qty</th>
              <th style="text-align:right;">Total Tagihan</th>
              <th>Status Bayar</th>
              <th>Pengambilan</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${pageList.map((o, idx) => renderRow(o, startIdx + idx, isOwner, showCabangCol)).join("")}
          </tbody>
        </table>
      </div>
    </div>
    ${renderPaginationControls(currentPage, pageSize, list.length, "goToPage")}
  `;
  syncSelectAllCheckbox();
  updateBulkToolbar();
}

function goToPage(page) {
  currentPage = page;
  renderOrders();
  document.getElementById("order-list").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderRow(o, idx, isOwner, showCabangCol) {
  const items = o.items || [];
  const checked = selectedIds.has(o.id) ? "checked" : "";
  const janggal = hasOrderAnomaly(o, allProductsMap);
  const cabangNama = o.cabang_id && allCabangMap[o.cabang_id] ? allCabangMap[o.cabang_id].nama : "-";

  const produkCell = items
    .map(
      (it) => `
      <div class="order-item-line">
        <div class="item-produk">${escapeHtml(it.product_name)}</div>
        <div class="item-gelombang">${escapeHtml(resolveWaveLabel(it, allProductsMap))}</div>
      </div>`
    )
    .join("");

  const qtyCell = items
    .map(
      (it) => `
      <div class="order-item-line">
        <div class="item-qty">${it.jumlah}</div>
        <div class="item-qty-spacer">&nbsp;</div>
      </div>`
    )
    .join("");

  const belumLunas = o.status_bayar !== "lunas";

  return `
    <tr>
      <td style="text-align:center; color:var(--gray-400); font-size:12.5px;">
        ${checkboxesRevealed ? `<input type="checkbox" ${checked} onchange="toggleSelect('${o.id}', this.checked)" />` : idx + 1}
      </td>
      <td>
        <div style="font-weight:700; color:var(--gray-900);">${formatOrderNo(o)} ${janggal ? '<span title="Harga di pesanan ini berbeda dari harga gelombang yang berlaku sekarang" style="color:var(--red-600);">⚠️</span>' : ""}</div>
        <div style="font-size:10px; color:var(--gray-400); margin-top:1px;">${formatTanggal(o.tanggal)}</div>
      </td>
      ${
        showCabangCol
          ? `<td>
        <div style="font-weight:600;">${escapeHtml(cabangNama)}</div>
        <div style="font-size:10px; color:var(--gray-400); margin-top:1px;">${escapeHtml(o.alamat || "-")}</div>
      </td>`
          : ""
      }
      <td>
        <div style="font-weight:600;">${escapeHtml(o.nama_pembeli)}</div>
        <div style="font-size:10px; color:var(--gray-400); margin-top:1px;">${escapeHtml(o.no_hp || "-")}</div>
      </td>
      <td style="min-width:170px;">${produkCell}</td>
      <td>${qtyCell}</td>
      <td style="text-align:right;">
        <div style="font-weight:700; color:var(--gray-900);">${formatRupiah(o.total)}</div>
        ${belumLunas ? `<div style="font-size:9.5px; color:var(--gray-400); margin-top:1px;">Bayar: ${formatRupiah(o.paid_amount || 0)}</div>` : ""}
      </td>
      <td><span class="badge ${STATUS_BAYAR_BADGE[o.status_bayar]}">${STATUS_BAYAR_LABEL[o.status_bayar].toUpperCase()}</span></td>
      <td><span class="badge ${o.is_diambil ? "badge-green" : "badge-gray"}">${o.is_diambil ? "SUDAH" : "BELUM"}</span></td>
      <td style="white-space:nowrap;">
        <div style="display:flex; gap:6px;">
          <button class="icon-btn" title="Lihat Detail / Catat Bayar" onclick="openDetailModal('${o.id}')"><i class="ph ph-eye"></i></button>
          <button class="icon-btn" title="Cetak Nota" onclick="window.open('nota.html?id=${o.id}','_blank')"><i class="ph ph-printer"></i></button>
        </div>
      </td>
    </tr>`;
}

// ---------- Seleksi & Bulk Action ----------
function exitSelectionMode() {
  checkboxesRevealed = false;
  selectedIds.clear();
  renderOrders();
}
function toggleSelect(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  if (selectedIds.size === 0) {
    // Semua terpilih sudah dibatalkan satu-satu -> otomatis balik ke
    // tampilan nomor urut lagi (perlu render ulang tabelnya).
    checkboxesRevealed = false;
    renderOrders();
    return;
  }
  syncSelectAllCheckbox();
  updateBulkToolbar();
}
function toggleSelectAll(nativeChecked) {
  // Klik pertama pada checkbox header: cuma menampilkan checkbox per item,
  // belum memilih apa pun. Checkbox header dikembalikan ke kondisi kosong.
  if (!checkboxesRevealed) {
    checkboxesRevealed = true;
    renderOrders();
    return;
  }
  // Klik-klik berikutnya: select all / deselect all seperti biasa.
  const visible = getFilteredOrders();
  if (nativeChecked) {
    visible.forEach((o) => selectedIds.add(o.id));
  } else {
    visible.forEach((o) => selectedIds.delete(o.id));
    // Kalau habis "batal pilih semua" ternyata tidak ada satupun yang
    // tersisa terpilih (mis. tidak ada seleksi lain di luar yang sedang
    // difilter), otomatis balik ke tampilan nomor urut.
    if (selectedIds.size === 0) checkboxesRevealed = false;
  }
  renderOrders();
}
function syncSelectAllCheckbox() {
  const box = document.getElementById("select-all");
  if (!box) return;
  if (!checkboxesRevealed) {
    box.checked = false;
    box.indeterminate = false;
    return;
  }
  const visible = getFilteredOrders();
  const selectedVisible = visible.filter((o) => selectedIds.has(o.id)).length;
  box.checked = visible.length > 0 && selectedVisible === visible.length;
  box.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
}
function updateBulkToolbar() {
  const toolbar = document.getElementById("bulk-toolbar");
  const count = selectedIds.size;
  document.getElementById("bulk-count").textContent = `${count} dipilih`;
  toolbar.style.display = count > 0 ? "block" : "none";
}

async function bulkAction(value) {
  if (selectedIds.size === 0) return;
  const label = value ? "Sudah Diambil" : "Belum Diambil";

  if (!(await showConfirmModal(`Terapkan status "${label}" ke ${selectedIds.size} pesanan terpilih?`))) return;

  const batch = db.batch();
  selectedIds.forEach((id) => {
    const ref = db.collection("orders").doc(id);
    batch.update(ref, {
      is_diambil: value,
      tanggal_ambil: value ? firebase.firestore.FieldValue.serverTimestamp() : null,
    });
  });

  try {
    await batch.commit();
    showToast("Berhasil memperbarui pesanan terpilih.", "success");
    selectedIds.clear();
    updateBulkToolbar();
    await loadOrders();
  } catch (err) {
    showToast(friendlyFirebaseError(err), "error");
  }
}

async function bulkDelete() {
  if (selectedIds.size === 0) return;
  if (!(await showConfirmModal(`Hapus permanen ${selectedIds.size} pesanan terpilih? Tindakan ini tidak bisa dibatalkan.`, { okLabel: "Ya, Hapus", danger: true }))) return;
  try {
    for (const id of selectedIds) {
      await deleteOrderCascade(id);
    }
    showToast("Pesanan terpilih dihapus.", "success");
    selectedIds.clear();
    updateBulkToolbar();
    await loadOrders();
  } catch (err) {
    showToast(friendlyFirebaseError(err), "error");
  }
}

async function deleteOrder(id) {
  if (!(await showConfirmModal("Hapus pesanan ini secara permanen?", { okLabel: "Ya, Hapus", danger: true }))) return;
  try {
    await deleteOrderCascade(id);
    showToast("Pesanan dihapus.", "success");
    await loadOrders();
  } catch (err) {
    showToast(friendlyFirebaseError(err), "error");
  }
}

async function deleteOrderCascade(id) {
  const paymentsSnap = await db.collection("orders").doc(id).collection("payments").get();
  const batch = db.batch();
  paymentsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(db.collection("orders").doc(id));
  await batch.commit();
}

// ---------- Modal Detail & Cicilan ----------
let detailUnsub = null;

function openDetailModal(orderId) {
  const order = allOrders.find((o) => o.id === orderId);
  if (!order) return;
  document.getElementById("detail-modal").style.display = "flex";
  renderDetailModal(order);

  if (detailUnsub) detailUnsub();
  detailUnsub = db
    .collection("orders")
    .doc(orderId)
    .collection("payments")
    .orderBy("created_at", "desc")
    .onSnapshot((snap) => {
      const payments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderPaymentHistory(orderId, payments);
    });
}

function closeDetailModal() {
  document.getElementById("detail-modal").style.display = "none";
  if (detailUnsub) {
    detailUnsub();
    detailUnsub = null;
  }
}

function renderDetailModal(order) {
  const items = order.items || [];
  const itemRows = items
    .map(
      (it) => `
    <tr>
      <td>${escapeHtml(it.product_name)} <span style="color:var(--gray-400);">(${escapeHtml(resolveWaveLabel(it, allProductsMap))})</span></td>
      <td style="text-align:center;">${it.jumlah}</td>
      <td style="text-align:right;">${formatRupiah(it.subtotal)}</td>
    </tr>`
    )
    .join("");
  const sisa = order.total - (order.paid_amount || 0);
  const isOwner = window.currentUserProfile && window.currentUserProfile.role === "owner";

  document.getElementById("detail-modal-content").innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
      <h3 style="margin:0;">Pesanan ${formatOrderNo(order)}</h3>
      <button class="icon-btn" onclick="closeDetailModal()"><i class="ph ph-x"></i></button>
    </div>
    <p style="color:var(--gray-500); font-size:13px; margin:4px 0 4px;">
      ${escapeHtml(order.nama_pembeli)} · ${formatTanggal(order.tanggal)}
    </p>
    <div style="background:var(--gray-50); border-radius:var(--radius-sm); padding:10px 12px; margin-bottom:14px; font-size:12.5px; color:var(--gray-600); display:grid; gap:4px;">
      <div><i class="ph ph-phone" style="color:var(--gray-400);"></i> ${escapeHtml(order.no_hp || "-")}</div>
      <div><i class="ph ph-map-pin" style="color:var(--gray-400);"></i> ${escapeHtml(order.alamat || "-")}</div>
      ${order.catatan ? `<div><i class="ph ph-note" style="color:var(--gray-400);"></i> ${escapeHtml(order.catatan)}</div>` : ""}
    </div>
    <table style="margin-bottom:10px;">
      <tbody>${itemRows}</tbody>
    </table>
    <div style="display:flex; justify-content:space-between; font-size:14px; padding-top:8px; border-top:1px solid var(--gray-200);">
      <span>Total</span><strong>${formatRupiah(order.total)}</strong>
    </div>
    <div style="display:flex; justify-content:space-between; font-size:14px;">
      <span>Sudah Dibayar</span><strong>${formatRupiah(order.paid_amount || 0)}</strong>
    </div>
    <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:14px;">
      <span>Sisa</span><strong style="color:${sisa > 0 ? "var(--red-600)" : "var(--brand-700)"};">${formatRupiah(sisa)}</strong>
    </div>

    ${
      sisa > 0
        ? `
    <form id="payment-form" style="background:var(--gray-50); border-radius:10px; padding:12px; margin-bottom:14px;">
      <label style="margin-bottom:6px;">Catat Pembayaran Baru</label>
      <div style="display:flex; gap:8px;">
        <input type="number" id="payment-amount" min="1" max="${sisa}" placeholder="Jumlah (Rp)" required style="flex:1;" />
        <button type="submit" class="btn-primary btn-sm">Simpan</button>
      </div>
      <p style="font-size:11.5px; color:var(--gray-500); margin:6px 0 0;">
        <a href="#" onclick="document.getElementById('payment-amount').value=${sisa}; return false;">Isi lunas (${formatRupiah(sisa)})</a>
      </p>
    </form>`
        : `<div class="alert alert-success">Pesanan ini sudah lunas.</div>`
    }

    <div style="font-weight:600; font-size:13.5px; margin-bottom:6px;">Riwayat Pembayaran</div>
    <div id="payment-history"><p style="color:var(--gray-400); font-size:13px;">Memuat...</p></div>

    ${renderEditLogSection(order)}

    ${
      isOwner
        ? `
    <div style="display:flex; gap:8px; margin-top:16px; padding-top:14px; border-top:1px solid var(--gray-100);">
      <a class="btn-secondary btn-sm" href="input-pesanan.html?edit=${order.id}" style="flex:1; justify-content:center;"><i class="ph ph-pencil-simple"></i> Edit Pesanan</a>
      <button class="btn-danger btn-sm" style="flex:1; justify-content:center;" onclick="closeDetailModal(); deleteOrder('${order.id}');"><i class="ph ph-trash"></i> Hapus</button>
    </div>`
        : `
    <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--gray-100);">
      <button class="btn-secondary btn-sm" style="width:100%; justify-content:center;" onclick="openEditJumlahModal('${order.id}')"><i class="ph ph-pencil-simple"></i> Ubah Jumlah Pesanan</button>
    </div>`
    }
  `;

  const form = document.getElementById("payment-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const amount = Number(document.getElementById("payment-amount").value);
      if (amount <= 0 || amount > sisa) {
        showToast("Jumlah pembayaran tidak valid.", "error");
        return;
      }
      const profile = window.currentUserProfile;
      const orderRef = db.collection("orders").doc(order.id);
      const paymentRef = orderRef.collection("payments").doc();
      try {
        // Pakai transaksi: baca ulang paid_amount TERBARU dari server tepat saat
        // menyimpan (bukan dari data yang sudah dibuka sejak modal ini dibuka).
        // Ini mencegah 2 karyawan catat bayar bersamaan saling menimpa angka
        // paid_amount satu sama lain (race condition / lost update).
        const updated = await db.runTransaction(async (tx) => {
          const freshDoc = await tx.get(orderRef);
          if (!freshDoc.exists) throw new Error("Pesanan tidak ditemukan (mungkin baru saja dihapus).");
          const freshOrder = freshDoc.data();
          const freshSisa = freshOrder.total - (freshOrder.paid_amount || 0);
          if (amount > freshSisa) {
            throw new Error(
              `Jumlah melebihi sisa tagihan terbaru (${formatRupiah(freshSisa)}). Kemungkinan ada pembayaran lain yang baru saja tercatat oleh rekan kerja — cek ulang Detail Pesanan.`
            );
          }
          const newPaid = (freshOrder.paid_amount || 0) + amount;
          const newStatus = computeStatusBayar(freshOrder.total, newPaid);
          tx.set(paymentRef, {
            tanggal: firebase.firestore.FieldValue.serverTimestamp(),
            jumlah: amount,
            catatan: "",
            created_by: profile.uid,
            created_by_name: profile.full_name,
            created_at: firebase.firestore.FieldValue.serverTimestamp(),
          });
          tx.update(orderRef, { paid_amount: newPaid, status_bayar: newStatus });
          return { ...order, paid_amount: newPaid, status_bayar: newStatus };
        });
        showToast("Pembayaran tercatat.", "success");
        renderDetailModal(updated);
        // List di belakang modal sudah tidak realtime -- perbarui manual di
        // memori supaya begitu modal ditutup, tabelnya langsung sinkron
        // tanpa perlu baca ulang seluruh koleksi dari server.
        const idx = allOrders.findIndex((o) => o.id === updated.id);
        if (idx !== -1) allOrders[idx] = updated;
        renderOrders();
      } catch (err) {
        showToast(err.message || friendlyFirebaseError(err), "error");
      }
    });
  }
}

// Riwayat perubahan (mini log) -- ditulis oleh js/input-pesanan.js tiap kali
// item/total/data pembeli diubah lewat Edit Pesanan. Cuma dibaca dari field
// edit_log yang sudah ada di dokumen order (tidak perlu baca subcollection
// terpisah), jadi tidak nambah biaya baca Firestore.
function renderEditLogSection(order) {
  const log = order.edit_log || [];
  if (log.length === 0) return "";
  const rows = [...log]
    .sort((a, b) => {
      const ta = a.at && a.at.toDate ? a.at.toDate() : new Date(a.at);
      const tb = b.at && b.at.toDate ? b.at.toDate() : new Date(b.at);
      return tb - ta;
    })
    .map(
      (entry) => `
      <div style="padding:8px 0; border-bottom:1px dashed var(--gray-200); font-size:12.5px;">
        <div style="color:var(--gray-700);">Diedit oleh <strong>${escapeHtml(entry.by_name || "-")}</strong> pada ${formatTanggalWaktu(entry.at)}</div>
        <div style="color:var(--gray-500); margin-top:2px;">${escapeHtml(entry.ringkasan || "-")}</div>
      </div>`
    )
    .join("");

  return `
    <div style="font-weight:600; font-size:13.5px; margin:14px 0 6px;">Riwayat Perubahan</div>
    <div style="background:var(--gray-50); border-radius:var(--radius-sm); padding:4px 12px;">${rows}</div>
  `;
}

function renderPaymentHistory(orderId, payments) {
  const container = document.getElementById("payment-history");
  if (!container) return;
  if (payments.length === 0) {
    container.innerHTML = `<p style="color:var(--gray-400); font-size:13px;">Belum ada pembayaran tercatat.</p>`;
    return;
  }
  container.innerHTML = `
    <table>
      <thead><tr><th>Tanggal</th><th style="text-align:right;">Jumlah</th></tr></thead>
      <tbody>
        ${payments
          .map(
            (p) => `
          <tr>
            <td>${formatTanggalWaktu(p.tanggal)}<br><span style="color:var(--gray-400); font-size:11px;">oleh ${escapeHtml(p.created_by_name || "-")}</span></td>
            <td style="text-align:right;">${formatRupiah(p.jumlah)}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

// ---------- "Ubah Jumlah Pesanan" (Admin Kasir & Karyawan) ----------
// Versi terbatas dari Edit Pesanan: HANYA boleh ubah jumlah tiap item yang
// sudah ada -- produk, gelombang, harga satuan, dan data pembeli semuanya
// read-only di sini (dan memang tidak dikirim ke server sama sekali). Kalau
// perlu ganti produk/harga/tambah-hapus baris/data pembeli, tetap harus
// lewat Owner (menu Edit Pesanan penuh).
let ejOrder = null;

function openEditJumlahModal(orderId) {
  const order = allOrders.find((o) => o.id === orderId);
  if (!order) return;
  ejOrder = order;
  renderEditJumlahForm(order);
}

function renderEditJumlahForm(order) {
  const items = order.items || [];
  const rows = items
    .map(
      (it, idx) => `
    <tr>
      <td>
        <div style="font-weight:600; color:var(--gray-800);">${escapeHtml(it.product_name)}</div>
        <div style="font-size:11px; color:var(--brand-600);">${escapeHtml(resolveWaveLabel(it, allProductsMap))}</div>
      </td>
      <td style="text-align:right; white-space:nowrap; color:var(--gray-500);">${formatRupiah(it.harga_satuan)}</td>
      <td style="text-align:center;">
        <input type="number" min="1" step="1" value="${it.jumlah}" data-idx="${idx}" class="ej-jumlah-input" style="width:70px; text-align:center;" oninput="updateEjSubtotal()" />
      </td>
      <td style="text-align:right; white-space:nowrap; font-weight:600;" id="ej-subtotal-${idx}">${formatRupiah(it.subtotal)}</td>
    </tr>`
    )
    .join("");

  document.getElementById("detail-modal-content").innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
      <h3 style="margin:0;">Ubah Jumlah — ${formatOrderNo(order)}</h3>
      <button class="icon-btn" onclick="closeDetailModal()"><i class="ph ph-x"></i></button>
    </div>
    <p style="color:var(--gray-500); font-size:12.5px; margin:4px 0 14px;">
      Hanya jumlah yang bisa diubah di sini. Produk, gelombang, harga satuan, dan data pembeli tidak bisa diganti lewat form ini — hubungi Owner kalau itu yang perlu diubah.
    </p>
    <table style="margin-bottom:6px;">
      <thead><tr><th>Produk</th><th style="text-align:right;">Harga Satuan</th><th style="text-align:center;">Jumlah</th><th style="text-align:right;">Subtotal</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:flex; justify-content:space-between; font-size:14px; padding-top:8px; border-top:1px solid var(--gray-200); margin-bottom:14px;">
      <span>Total Baru</span><strong id="ej-total">${formatRupiah(order.total)}</strong>
    </div>
    <div id="ej-alert"></div>
    <div style="display:flex; gap:10px;">
      <button class="btn-primary btn-sm" style="flex:1; justify-content:center;" id="ej-submit-btn" onclick="submitEditJumlah('${order.id}')">Simpan Perubahan</button>
      <button type="button" class="btn-secondary btn-sm" onclick="renderDetailModal(ejOrder)">Batal</button>
    </div>
  `;
}

function updateEjSubtotal() {
  let total = 0;
  document.querySelectorAll(".ej-jumlah-input").forEach((el) => {
    const idx = Number(el.dataset.idx);
    const jumlah = Math.max(1, Math.floor(Number(el.value) || 1));
    const subtotal = ejOrder.items[idx].harga_satuan * jumlah;
    const cell = document.getElementById(`ej-subtotal-${idx}`);
    if (cell) cell.textContent = formatRupiah(subtotal);
    total += subtotal;
  });
  document.getElementById("ej-total").textContent = formatRupiah(total);
}

async function submitEditJumlah(orderId) {
  const alertBox = document.getElementById("ej-alert");
  const btn = document.getElementById("ej-submit-btn");
  alertBox.innerHTML = "";

  const newItems = ejOrder.items.map((it, idx) => {
    const input = document.querySelector(`.ej-jumlah-input[data-idx="${idx}"]`);
    const jumlah = Math.max(1, Math.floor(Number(input.value) || 1));
    return { ...it, jumlah, subtotal: it.harga_satuan * jumlah };
  });
  const newTotal = newItems.reduce((sum, it) => sum + it.subtotal, 0);

  const changedParts = [];
  ejOrder.items.forEach((it, idx) => {
    if (it.jumlah !== newItems[idx].jumlah) {
      changedParts.push(`${it.product_name} (${resolveWaveLabel(it, allProductsMap)}): ${it.jumlah} → ${newItems[idx].jumlah}`);
    }
  });
  if (changedParts.length === 0) {
    alertBox.innerHTML = `<div class="alert alert-error">Belum ada jumlah yang diubah.</div>`;
    return;
  }

  btn.disabled = true;
  btn.textContent = "Menyimpan...";
  const profile = window.currentUserProfile;
  const orderRef = db.collection("orders").doc(orderId);
  try {
    const updated = await db.runTransaction(async (tx) => {
      // Baca ulang paid_amount TERBARU dari server (sama seperti alur Edit
      // Pesanan Owner) -- supaya tidak mengunci total di bawah pembayaran
      // yang baru saja tercatat oleh rekan kerja lain selagi form ini dibuka.
      const freshDoc = await tx.get(orderRef);
      if (!freshDoc.exists) throw new Error("Pesanan tidak ditemukan (mungkin baru saja dihapus).");
      const freshPaidAmount = freshDoc.data().paid_amount || 0;
      if (newTotal < freshPaidAmount) {
        throw new Error(
          `Total baru (${formatRupiah(newTotal)}) lebih kecil dari yang sudah dibayar (${formatRupiah(freshPaidAmount)}). Tidak bisa mengurangi jumlah sampai di bawah nilai yang sudah dibayar -- hubungi Owner kalau memang perlu koreksi lebih lanjut.`
        );
      }
      const newStatus = computeStatusBayar(newTotal, freshPaidAmount);
      tx.update(orderRef, {
        items: newItems,
        total: newTotal,
        status_bayar: newStatus,
        // Dipakai FieldValue.arrayUnion() (bukan serverTimestamp) karena
        // Firestore tidak mengizinkan sentinel serverTimestamp di dalam array.
        edit_log: firebase.firestore.FieldValue.arrayUnion({
          by: profile.uid,
          by_name: profile.full_name || profile.username || "-",
          at: new Date(),
          ringkasan: "Jumlah diubah — " + changedParts.join(", "),
        }),
      });
      return { ...ejOrder, items: newItems, total: newTotal, paid_amount: freshPaidAmount, status_bayar: newStatus };
    });
    showToast("Jumlah pesanan berhasil diperbarui.", "success");
    const idx = allOrders.findIndex((o) => o.id === updated.id);
    if (idx !== -1) allOrders[idx] = updated;
    ejOrder = updated;
    renderOrders();
    renderDetailModal(updated);
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${err.message || friendlyFirebaseError(err)}</div>`;
    btn.disabled = false;
    btn.textContent = "Simpan Perubahan";
  }
}
