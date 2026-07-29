let products = [];
let lineItems = [];
let lineKeyCounter = 0;
let editOrderId = null;
let editOrderData = null;

function emptyLine() {
  return { key: lineKeyCounter++, product_id: "", wave_id: "", jumlah: "1" };
}

window.onAuthReady = async function () {
  const params = new URLSearchParams(location.search);
  editOrderId = params.get("edit");

  try {
    const prodSnap = await db.collection("products").orderBy("nama").get();
    products = prodSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    showToast("Gagal memuat produk: " + friendlyFirebaseError(err), "error");
  }

  if (editOrderId) {
    document.getElementById("page-heading").textContent = "Edit Pesanan";
    try {
      const orderDoc = await db.collection("orders").doc(editOrderId).get();
      if (!orderDoc.exists) {
        showToast("Pesanan tidak ditemukan.", "error");
        window.location.href = "pesanan.html";
        return;
      }
      editOrderData = { id: orderDoc.id, ...orderDoc.data() };
      lineItems = (editOrderData.items || []).map((it) => ({
        key: lineKeyCounter++,
        product_id: it.product_id,
        wave_id: it.wave_id,
        jumlah: String(it.jumlah),
      }));
    } catch (err) {
      showToast(friendlyFirebaseError(err), "error");
    }
  }

  if (lineItems.length === 0) lineItems = [emptyLine()];
  renderForm();
};

function getProduct(id) {
  return products.find((p) => p.id === id);
}
function getWave(product, waveId) {
  return product ? (product.waves || []).find((w) => w.id === waveId) : null;
}
function lineSubtotal(line) {
  const prod = getProduct(line.product_id);
  const wave = getWave(prod, line.wave_id);
  const jumlah = Number(line.jumlah) || 0;
  return wave ? wave.harga * jumlah : 0;
}
function grandTotal() {
  return lineItems.reduce((sum, l) => sum + lineSubtotal(l), 0);
}

function renderForm() {
  const container = document.getElementById("form-container");
  const isEdit = !!editOrderId;
  const namaVal = isEdit ? editOrderData.nama_pembeli : "";
  const alamatVal = isEdit ? editOrderData.alamat || "" : "";
  const noHpVal = isEdit ? editOrderData.no_hp || "" : "";
  const catatanVal = isEdit ? editOrderData.catatan || "" : "";
  const tanggalVal = isEdit && editOrderData.tanggal
    ? (editOrderData.tanggal.toDate ? editOrderData.tanggal.toDate() : new Date(editOrderData.tanggal)).toISOString().slice(0, 10)
    : todayInputValue();

  container.innerHTML = `
    <div class="order-layout">
      <div class="card order-form-col">
        <form id="order-form">
          <div class="field">
            <label>Tanggal *</label>
            <input type="date" id="f-tanggal" required value="${tanggalVal}" />
          </div>
          <div class="field">
            <label>Nama Pembeli *</label>
            <input type="text" id="f-nama" required minlength="3" value="${escapeHtml(namaVal)}" />
          </div>
          <div class="field">
            <label>Alamat *</label>
            <input type="text" id="f-alamat" required minlength="3" value="${escapeHtml(alamatVal)}" />
          </div>
          <div class="field">
            <label>No. HP</label>
            <input type="text" id="f-nohp" value="${escapeHtml(noHpVal)}" />
          </div>
          <div class="field">
            <label>Catatan</label>
            <textarea id="f-catatan" rows="2" placeholder="Catatan tambahan (opsional)">${escapeHtml(catatanVal)}</textarea>
          </div>

          <div class="field">
            <label style="margin-bottom:8px;">Produk Dipesan</label>
            <div id="line-items"></div>
            <button type="button" class="btn-secondary btn-sm" onclick="addLine()" style="margin-top:6px;">+ Tambah Produk Lain</button>
          </div>

          <div class="field">
            ${
              isEdit
                ? `<label>Sudah Dibayar</label>
                   <div style="background:var(--gray-50); border-radius:var(--radius-sm); padding:10px 12px; font-weight:600;">${formatRupiah(editOrderData.paid_amount || 0)}</div>
                   <p style="font-size:12px; color:var(--gray-500); margin:4px 0 0;">Tidak bisa diubah di sini supaya riwayat pembayaran tetap tercatat rapi. Untuk mencatat pembayaran baru atau melihat riwayatnya, gunakan tombol "Detail / Bayar" di Daftar Pesanan.</p>`
                : `<label>Uang Muka / Bayar Sekarang (Rp) *</label>
                   <input type="number" id="f-bayar" min="0" value="0" required />
                   <p style="font-size:12px; color:var(--gray-500); margin:4px 0 0;">Isi 0 jika belum bayar sama sekali, atau isi sesuai total untuk status Lunas.</p>`
            }
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--gray-200); padding-top:14px; margin-top:6px;">
            <span style="font-size:16px; font-weight:600;">Total Pesanan</span>
            <span id="f-total" style="font-size:20px; font-weight:700; color:var(--brand-700);">Rp 0</span>
          </div>

          <div id="order-form-alert" style="margin-top:12px;"></div>

          <div style="display:flex; gap:10px; margin-top:16px;">
            <button type="submit" class="btn-primary" style="flex:1; justify-content:center; padding:12px;" id="submit-btn">
              ${isEdit ? "Simpan Perubahan" : "Simpan Pesanan"}
            </button>
            ${isEdit ? `<a href="pesanan.html" class="btn-secondary" style="padding:12px 18px;">Batal</a>` : ""}
          </div>
        </form>
      </div>

      <div class="card order-summary-col">
        <h3 style="margin-top:0; margin-bottom:14px; font-size:15px;">Ringkasan Pesanan</h3>
        <div id="summary-body"></div>
      </div>
    </div>
  `;

  renderLineItems();
  document.getElementById("order-form").addEventListener("submit", handleSubmit);
  const bayarInput = document.getElementById("f-bayar");
  if (bayarInput) bayarInput.addEventListener("input", updateTotalDisplay);
  document.getElementById("f-nama").addEventListener("input", updateSummaryPanel);
  updateSummaryPanel();
}

function updateSummaryPanel() {
  const panel = document.getElementById("summary-body");
  if (!panel) return;

  const namaEl = document.getElementById("f-nama");
  const nama = namaEl ? namaEl.value.trim() : "";
  const total = grandTotal();
  const isEdit = !!editOrderId;
  const bayarInput = document.getElementById("f-bayar");
  const paidAmount = isEdit ? editOrderData.paid_amount || 0 : bayarInput ? Number(bayarInput.value) || 0 : 0;
  const sisa = total - paidAmount;
  const status = computeStatusBayar(total, paidAmount);

  const validLines = lineItems.filter((l) => l.product_id && l.wave_id && Number(l.jumlah) > 0);
  const itemsHtml = validLines.length
    ? validLines
        .map((l) => {
          const prod = getProduct(l.product_id);
          const wave = getWave(prod, l.wave_id);
          return `
        <div class="summary-item-row">
          <span style="color:var(--gray-700);">
            ${escapeHtml(prod ? prod.nama : "")} <span style="color:var(--gray-400);">x${escapeHtml(l.jumlah)}</span>
            <div style="font-size:11px; color:var(--brand-600);">${escapeHtml(wave ? wave.label : "")}</div>
          </span>
          <span style="font-weight:600; white-space:nowrap;">${formatRupiah(lineSubtotal(l))}</span>
        </div>`;
        })
        .join("")
    : `<div style="font-size:12.5px; color:var(--gray-400); padding:8px 0;">Belum ada produk dipilih.</div>`;

  panel.innerHTML = `
    <div style="font-size:12.5px; color:var(--gray-500); margin-bottom:2px;">Pemesan</div>
    <div style="font-weight:700; margin-bottom:10px; color:var(--gray-900);">${escapeHtml(nama || "-")}</div>
    ${itemsHtml}
    <div style="display:flex; justify-content:space-between; margin-top:12px; padding-top:10px; border-top:1px solid var(--gray-200); font-size:14px;">
      <span>Total</span><strong>${formatRupiah(total)}</strong>
    </div>
    <div style="display:flex; justify-content:space-between; font-size:13px; color:var(--gray-500); margin-top:4px;">
      <span>${isEdit ? "Sudah Dibayar" : "Bayar Sekarang"}</span><span>${formatRupiah(paidAmount)}</span>
    </div>
    <div style="display:flex; justify-content:space-between; font-size:13px; margin-top:2px; ${sisa > 0 ? "color:var(--red-600); font-weight:600;" : "color:var(--gray-500);"}">
      <span>Sisa</span><span>${formatRupiah(sisa)}</span>
    </div>
    <div style="margin-top:10px;"><span class="badge ${STATUS_BAYAR_BADGE[status]}">${STATUS_BAYAR_LABEL[status].toUpperCase()}</span></div>
  `;
}

// Peringatan LEMBUT saja, bukan larangan: stok cuma catatan kasar dari Owner
// (bisa berubah kapan saja karena ada barang yang laku cash duluan di luar
// sistem ini), jadi tidak pernah memblokir penyimpanan pesanan. Kalau field
// stok produk dikosongkan, tidak ada peringatan sama sekali.
function stockWarningHtml(prod, jumlah) {
  if (!prod || prod.stok === null || prod.stok === undefined || prod.stok === "") return "";
  const qty = Number(jumlah) || 0;
  if (qty <= prod.stok) return "";
  return `<p style="font-size:12px; color:#b45309; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:5px 8px; margin:6px 0 0;">⚠️ Melebihi stok tercatat untuk ${escapeHtml(prod.nama)} (stok: ${prod.stok}). Tetap bisa disimpan — cek dulu stok fisiknya kalau perlu.</p>`;
}

function renderLineItems() {
  const wrap = document.getElementById("line-items");
  wrap.innerHTML = lineItems
    .map((line) => {
      const prod = getProduct(line.product_id);
      const wave = getWave(prod, line.wave_id);
      const productOptions = products
        .map((p) => `<option value="${p.id}" ${p.id === line.product_id ? "selected" : ""}>${escapeHtml(p.nama)}</option>`)
        .join("");
      const waveOptions = (prod ? prod.waves || [] : [])
        .map((w) => `<option value="${w.id}" ${w.id === line.wave_id ? "selected" : ""}>${escapeHtml(w.label)}</option>`)
        .join("");
      return `
      <div style="background:var(--gray-50); border-radius:10px; padding:10px; margin-bottom:8px;">
        <div class="grid" style="grid-template-columns: 2fr 1.2fr 0.8fr; gap:8px;">
          <select onchange="updateLine(${line.key}, 'product_id', this.value)">
            <option value="">Pilih Produk</option>
            ${productOptions}
          </select>
          <select onchange="updateLine(${line.key}, 'wave_id', this.value)" ${!prod ? "disabled" : ""}>
            <option value="">Gelombang</option>
            ${waveOptions}
          </select>
          <input type="number" min="0" placeholder="Jumlah" value="${escapeHtml(line.jumlah)}" oninput="updateLine(${line.key}, 'jumlah', this.value)" />
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:12.5px; color:var(--gray-500);">
          <span>Harga satuan: ${wave ? formatRupiah(wave.harga) : "-"}</span>
          <span style="display:flex; gap:10px; align-items:center;">
            <strong id="subtotal-${line.key}" style="color:var(--gray-700);">Subtotal: ${formatRupiah(lineSubtotal(line))}</strong>
            ${lineItems.length > 1 ? `<a href="#" onclick="removeLine(${line.key}); return false;" style="color:var(--red-600);">Hapus</a>` : ""}
          </span>
        </div>
        <div id="stock-warning-${line.key}">${stockWarningHtml(prod, line.jumlah)}</div>
      </div>`;
    })
    .join("");
  updateTotalDisplay();
}

function updateLine(key, field, value) {
  const line = lineItems.find((l) => l.key === key);
  if (!line) return;
  line[field] = value;
  if (field === "product_id") {
    const prod = getProduct(value);
    const activeWave = prod ? (prod.waves || []).find((w) => w.aktif) || (prod.waves || [])[0] : null;
    line.wave_id = activeWave ? activeWave.id : "";
  }
  if (field === "jumlah") {
    const subtotalEl = document.getElementById(`subtotal-${key}`);
    if (subtotalEl) subtotalEl.textContent = `Subtotal: ${formatRupiah(lineSubtotal(line))}`;
    const warnEl = document.getElementById(`stock-warning-${key}`);
    if (warnEl) warnEl.innerHTML = stockWarningHtml(getProduct(line.product_id), line.jumlah);
    updateTotalDisplay();
    return;
  }
  renderLineItems();
}

function addLine() {
  lineItems.push(emptyLine());
  renderLineItems();
}
function removeLine(key) {
  if (lineItems.length <= 1) return;
  lineItems = lineItems.filter((l) => l.key !== key);
  renderLineItems();
}

function updateTotalDisplay() {
  const total = grandTotal();
  const totalEl = document.getElementById("f-total");
  if (totalEl) totalEl.textContent = formatRupiah(total);
  updateSummaryPanel();
}

async function handleSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById("order-form-alert");
  alertBox.innerHTML = "";

  const namaCek = document.getElementById("f-nama").value.trim();
  const alamatCek = document.getElementById("f-alamat").value.trim();
  if (namaCek.length < 3) {
    alertBox.innerHTML = `<div class="alert alert-error">Nama Pembeli wajib diisi, minimal 3 karakter.</div>`;
    document.getElementById("f-nama").focus();
    return;
  }
  if (alamatCek.length < 3) {
    alertBox.innerHTML = `<div class="alert alert-error">Alamat wajib diisi, minimal 3 karakter.</div>`;
    document.getElementById("f-alamat").focus();
    return;
  }

  const validLines = lineItems.filter((l) => l.product_id && l.wave_id && Number(l.jumlah) > 0);
  if (validLines.length === 0) {
    alertBox.innerHTML = `<div class="alert alert-error">Minimal pilih 1 produk dengan jumlah yang valid.</div>`;
    return;
  }

  const total = grandTotal();
  const paidAmount = editOrderId ? editOrderData.paid_amount || 0 : Number(document.getElementById("f-bayar").value) || 0;
  if (paidAmount > total) {
    alertBox.innerHTML = editOrderId
      ? `<div class="alert alert-error">Total pesanan baru (${formatRupiah(total)}) lebih kecil dari yang sudah dibayar (${formatRupiah(paidAmount)}). Kurangi jumlah dulu, atau sesuaikan pembayarannya lewat Detail Pesanan di Daftar Pesanan.</div>`
      : `<div class="alert alert-error">Jumlah bayar tidak boleh melebihi total pesanan.</div>`;
    return;
  }

  const itemsData = validLines.map((l) => {
    const prod = getProduct(l.product_id);
    const wave = getWave(prod, l.wave_id);
    const jumlah = Number(l.jumlah);
    return {
      product_id: l.product_id,
      product_name: prod.nama,
      wave_id: l.wave_id,
      wave_label: wave.label,
      harga_satuan: wave.harga,
      jumlah,
      subtotal: wave.harga * jumlah,
    };
  });

  const btn = document.getElementById("submit-btn");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  const tanggal = new Date(document.getElementById("f-tanggal").value);
  const namaPembeli = document.getElementById("f-nama").value.trim();
  const alamat = document.getElementById("f-alamat").value.trim();
  const noHp = document.getElementById("f-nohp").value.trim();
  const catatan = document.getElementById("f-catatan").value.trim();
  const profile = window.currentUserProfile;

  try {
    if (editOrderId) {
      await db.collection("orders").doc(editOrderId).update({
        tanggal,
        nama_pembeli: namaPembeli,
        alamat,
        no_hp: noHp,
        catatan,
        items: itemsData,
        total,
        paid_amount: paidAmount,
        status_bayar: computeStatusBayar(total, paidAmount),
      });
      showToast("Pesanan berhasil diperbarui.", "success");
      window.location.href = "pesanan.html";
      return;
    }

    const ids = await getNextOrderIdentifiers();
    const newOrderRef = db.collection("orders").doc();
    await newOrderRef.set({
      order_no: ids.order_no,
      nota_tahun: ids.nota_tahun,
      nota_seq: ids.nota_seq,
      tanggal,
      nama_pembeli: namaPembeli,
      alamat,
      no_hp: noHp,
      catatan,
      items: itemsData,
      total,
      paid_amount: paidAmount,
      status_bayar: computeStatusBayar(total, paidAmount),
      is_diambil: false,
      tanggal_ambil: null,
      created_by: profile.uid,
      created_by_name: profile.full_name,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
    });

    if (paidAmount > 0) {
      await newOrderRef.collection("payments").add({
        tanggal: firebase.firestore.FieldValue.serverTimestamp(),
        jumlah: paidAmount,
        catatan: "Pembayaran awal saat pesan",
        created_by: profile.uid,
        created_by_name: profile.full_name,
        created_at: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    showToast("Pesanan berhasil disimpan.", "success");
    document.getElementById("form-container").style.display = "none";
    const successBox = document.getElementById("success-box");
    successBox.style.display = "block";
    document.getElementById("btn-cetak-nota").onclick = () => {
      window.open(`nota.html?id=${newOrderRef.id}`, "_blank");
    };
    document.getElementById("btn-input-lagi").onclick = () => {
      window.location.reload();
    };
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${friendlyFirebaseError(err)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = editOrderId ? "Simpan Perubahan" : "Simpan Pesanan";
  }
}
