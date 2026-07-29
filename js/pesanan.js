let allOrders = [];
let allProductsMap = {};
let selectedIds = new Set();
let unsubscribeOrders = null;

window.onAuthReady = function (profile) {
  loadProductFilters();
  listenOrders();

  document.getElementById("filter-search").addEventListener("input", debounceRender);
  document.getElementById("filter-produk").addEventListener("change", () => {
    updateGelombangFilterOptions();
    renderOrders();
  });
  document.getElementById("filter-gelombang").addEventListener("change", renderOrders);
  document.getElementById("filter-bayar").addEventListener("change", renderOrders);
  document.getElementById("filter-ambil").addEventListener("change", renderOrders);

  document.getElementById("bulk-delete-btn").style.display = profile.role === "owner" ? "inline-flex" : "none";
};

let debounceTimer;
function debounceRender() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(renderOrders, 200);
}

async function loadProductFilters() {
  const snap = await db.collection("products").orderBy("nama").get();
  const select = document.getElementById("filter-produk");
  snap.docs.forEach((d) => {
    const p = { id: d.id, ...d.data() };
    allProductsMap[p.id] = p;
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.nama;
    select.appendChild(opt);
  });
  updateGelombangFilterOptions();
}

function updateGelombangFilterOptions() {
  const productId = document.getElementById("filter-produk").value;
  const select = document.getElementById("filter-gelombang");
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
}

function listenOrders() {
  unsubscribeOrders = db.collection("orders").orderBy("order_no", "desc").onSnapshot(
    (snap) => {
      allOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderOrders();
    },
    (err) => {
      showToast("Gagal memuat pesanan: " + friendlyFirebaseError(err), "error");
    }
  );
}

function getFilteredOrders() {
  const search = document.getElementById("filter-search").value.trim().toLowerCase();
  const produkId = document.getElementById("filter-produk").value;
  const gelombangLabel = document.getElementById("filter-gelombang").value;
  const statusBayar = document.getElementById("filter-bayar").value;
  const statusAmbil = document.getElementById("filter-ambil").value;

  return allOrders.filter((o) => {
    if (search) {
      const hay = `${o.nama_pembeli} ${o.no_hp} ${o.order_no} ${formatOrderNo(o)}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (produkId && !(o.items || []).some((it) => it.product_id === produkId)) return false;
    if (gelombangLabel && !(o.items || []).some((it) => it.wave_label === gelombangLabel)) return false;
    if (statusBayar && o.status_bayar !== statusBayar) return false;
    if (statusAmbil === "sudah" && !o.is_diambil) return false;
    if (statusAmbil === "belum" && o.is_diambil) return false;
    return true;
  });
}

function resetFilters() {
  document.getElementById("filter-search").value = "";
  document.getElementById("filter-produk").value = "";
  document.getElementById("filter-gelombang").innerHTML = '<option value="">Semua Gelombang</option>';
  document.getElementById("filter-bayar").value = "";
  document.getElementById("filter-ambil").value = "";
  renderOrders();
}

function renderOrders() {
  const list = getFilteredOrders();
  const container = document.getElementById("order-list");

  if (list.length === 0) {
    container.innerHTML = `<div class="card empty-state">Tidak ada pesanan yang cocok dengan filter.</div>`;
    updateBulkToolbar();
    return;
  }

  const isOwner = window.currentUserProfile && window.currentUserProfile.role === "owner";

  container.innerHTML = `
    <div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" id="select-all" onchange="toggleSelectAll(this.checked)" /></th>
              <th>Nota / Tanggal</th>
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
            ${list.map((o) => renderRow(o, isOwner)).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  updateBulkToolbar();
}

function renderRow(o, isOwner) {
  const items = o.items || [];
  const checked = selectedIds.has(o.id) ? "checked" : "";

  const produkCell = items
    .map(
      (it) => `
      <div class="order-item-line">
        <div class="item-produk">${escapeHtml(it.product_name)}</div>
        <div class="item-gelombang">${escapeHtml(it.wave_label)}</div>
      </div>`
    )
    .join("");

  const qtyCell = items
    .map((it) => `<div class="order-item-line"><div class="item-qty">${it.jumlah}</div></div>`)
    .join("");

  const belumLunas = o.status_bayar !== "lunas";

  return `
    <tr>
      <td><input type="checkbox" ${checked} onchange="toggleSelect('${o.id}', this.checked)" /></td>
      <td>
        <div style="font-weight:700; color:var(--gray-900);">${formatOrderNo(o)}</div>
        <div style="font-size:11.5px; color:var(--gray-400); margin-top:1px;">${formatTanggal(o.tanggal)}</div>
      </td>
      <td>
        <div style="font-weight:600;">${escapeHtml(o.nama_pembeli)}</div>
        <div style="font-size:11.5px; color:var(--gray-400); margin-top:1px;">${escapeHtml(o.no_hp || "-")}</div>
      </td>
      <td style="min-width:170px;">${produkCell}</td>
      <td>${qtyCell}</td>
      <td style="text-align:right;">
        <div style="font-weight:700; color:var(--gray-900);">${formatRupiah(o.total)}</div>
        ${belumLunas ? `<div style="font-size:11px; color:var(--gray-400); margin-top:1px;">Bayar: ${formatRupiah(o.paid_amount || 0)}</div>` : ""}
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
function toggleSelect(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  updateBulkToolbar();
}
function toggleSelectAll(checked) {
  const visible = getFilteredOrders();
  if (checked) visible.forEach((o) => selectedIds.add(o.id));
  else visible.forEach((o) => selectedIds.delete(o.id));
  renderOrders();
}
function updateBulkToolbar() {
  const toolbar = document.getElementById("bulk-toolbar");
  const count = selectedIds.size;
  document.getElementById("bulk-count").textContent = `${count} dipilih`;
  toolbar.style.display = count > 0 ? "block" : "none";
}

async function bulkAction(type, value) {
  if (selectedIds.size === 0) return;
  const label = type === "diambil" ? (value ? "Sudah Diambil" : "Belum Diambil") : STATUS_BAYAR_LABEL[value];
  if (!confirm(`Terapkan status "${label}" ke ${selectedIds.size} pesanan terpilih?`)) return;

  const batch = db.batch();
  selectedIds.forEach((id) => {
    const ref = db.collection("orders").doc(id);
    if (type === "diambil") {
      batch.update(ref, {
        is_diambil: value,
        tanggal_ambil: value ? firebase.firestore.FieldValue.serverTimestamp() : null,
      });
    } else if (type === "bayar") {
      const order = allOrders.find((o) => o.id === id);
      const paid = value === "lunas" ? (order ? order.total : 0) : 0;
      batch.update(ref, { status_bayar: value, paid_amount: paid });
    }
  });

  try {
    await batch.commit();
    showToast("Berhasil memperbarui pesanan terpilih.", "success");
    selectedIds.clear();
    updateBulkToolbar();
  } catch (err) {
    showToast(friendlyFirebaseError(err), "error");
  }
}

async function bulkDelete() {
  if (selectedIds.size === 0) return;
  if (!confirm(`Hapus permanen ${selectedIds.size} pesanan terpilih? Tindakan ini tidak bisa dibatalkan.`)) return;
  try {
    for (const id of selectedIds) {
      await deleteOrderCascade(id);
    }
    showToast("Pesanan terpilih dihapus.", "success");
    selectedIds.clear();
    updateBulkToolbar();
  } catch (err) {
    showToast(friendlyFirebaseError(err), "error");
  }
}

async function deleteOrder(id) {
  if (!confirm("Hapus pesanan ini secara permanen?")) return;
  try {
    await deleteOrderCascade(id);
    showToast("Pesanan dihapus.", "success");
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
      <td>${escapeHtml(it.product_name)} <span style="color:var(--gray-400);">(${escapeHtml(it.wave_label)})</span></td>
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

    ${
      isOwner
        ? `
    <div style="display:flex; gap:8px; margin-top:16px; padding-top:14px; border-top:1px solid var(--gray-100);">
      <a class="btn-secondary btn-sm" href="input-pesanan.html?edit=${order.id}" style="flex:1; justify-content:center;"><i class="ph ph-pencil-simple"></i> Edit Pesanan</a>
      <button class="btn-danger btn-sm" style="flex:1; justify-content:center;" onclick="closeDetailModal(); deleteOrder('${order.id}');"><i class="ph ph-trash"></i> Hapus</button>
    </div>`
        : ""
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
      try {
        const profile = window.currentUserProfile;
        const orderRef = db.collection("orders").doc(order.id);
        await orderRef.collection("payments").add({
          tanggal: firebase.firestore.FieldValue.serverTimestamp(),
          jumlah: amount,
          catatan: "",
          created_by: profile.uid,
          created_by_name: profile.full_name,
          created_at: firebase.firestore.FieldValue.serverTimestamp(),
        });
        const newPaid = (order.paid_amount || 0) + amount;
        await orderRef.update({
          paid_amount: newPaid,
          status_bayar: computeStatusBayar(order.total, newPaid),
        });
        showToast("Pembayaran tercatat.", "success");
        const updated = { ...order, paid_amount: newPaid, status_bayar: computeStatusBayar(order.total, newPaid) };
        renderDetailModal(updated);
      } catch (err) {
        showToast(friendlyFirebaseError(err), "error");
      }
    });
  }
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
