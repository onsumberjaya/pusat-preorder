let notaOrder = null;
let notaToko = { nama: "Toko Benih", alamat: "", no_hp: "" };

window.onAuthReady = async function () {
  const params = new URLSearchParams(location.search);
  const orderId = params.get("id");
  if (!orderId) {
    document.getElementById("nota-container").innerHTML = `<div class="alert alert-error no-print" style="margin:20px;">ID pesanan tidak ditemukan di URL.</div>`;
    return;
  }
  try {
    const [orderDoc, tokoDoc] = await Promise.all([
      db.collection("orders").doc(orderId).get(),
      db.collection("config").doc("toko").get(),
    ]);
    if (!orderDoc.exists) {
      document.getElementById("nota-container").innerHTML = `<div class="alert alert-error no-print" style="margin:20px;">Pesanan tidak ditemukan.</div>`;
      return;
    }
    notaOrder = { id: orderDoc.id, ...orderDoc.data() };
    if (tokoDoc.exists) notaToko = tokoDoc.data();

    // Kop nota pakai ALAMAT & NO. HP dari CABANG tempat pesanan ini dibuat
    // (supaya pembeli di cabang dapat nota dengan alamat yang benar-benar
    // sesuai lokasi cabang itu) -- TAPI nama tokonya selalu pakai Profil
    // Toko utama untuk semua cabang (bukan nama cabangnya), supaya branding
    // di nota tetap konsisten "TOKO SUMBER JAYA" di mana pun pesanan dibuat.
    // Kalau pesanan belum punya cabang_id (data lama sebelum fitur cabang
    // ada) atau cabang-nya sudah dihapus, alamat/no.HP juga tetap pakai
    // Profil Toko utama seperti biasa (fallback aman).
    if (notaOrder.cabang_id) {
      try {
        const cabangDoc = await db.collection("cabang").doc(notaOrder.cabang_id).get();
        if (cabangDoc.exists) {
          const c = cabangDoc.data();
          notaToko = {
            nama: notaToko.nama,
            alamat: c.alamat || notaToko.alamat,
            no_hp: c.no_hp || notaToko.no_hp,
          };
        }
      } catch (err) {
        // Gagal ambil data cabang (mis. karena hak akses) tidak boleh
        // menggagalkan seluruh nota -- tetap tampil pakai Profil Toko utama.
      }
    }

    renderNota();
  } catch (err) {
    document.getElementById("nota-container").innerHTML = `<div class="alert alert-error no-print" style="margin:20px;">${friendlyFirebaseError(err)}</div>`;
  }
};

function renderNota() {
  const o = notaOrder;
  const items = o.items || [];
  const sisa = o.total - (o.paid_amount || 0);

  const itemRowsA4 = items
    .map(
      (it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(it.product_name)}</td>
      <td>${escapeHtml(it.wave_label)}</td>
      <td style="text-align:center;">${it.jumlah}</td>
      <td style="text-align:right;">${formatRupiah(it.harga_satuan)}</td>
      <td style="text-align:right;">${formatRupiah(it.subtotal)}</td>
    </tr>`
    )
    .join("");

  const itemRowsDm = items
    .map(
      (it) => `
    <tr>
      <td colspan="2">${escapeHtml(it.product_name)} (${escapeHtml(it.wave_label)})</td>
    </tr>
    <tr>
      <td>${it.jumlah} x ${formatRupiah(it.harga_satuan)}</td>
      <td style="text-align:right;">${formatRupiah(it.subtotal)}</td>
    </tr>`
    )
    .join("");

  document.getElementById("nota-container").innerHTML = `
    <div class="nota-a4">
      <div style="text-align:center; border-bottom:2px solid #000; padding-bottom:10px; margin-bottom:14px;">
        <h2 style="margin:0;">${escapeHtml(notaToko.nama || "Toko Benih")}</h2>
        <p style="margin:2px 0;">${escapeHtml(notaToko.alamat || "")}</p>
        <p style="margin:2px 0;">${escapeHtml(notaToko.no_hp || "")}</p>
        <p style="margin:6px 0 0; font-weight:700; letter-spacing:1px;">NOTA PREORDER</p>
      </div>
      <table style="width:100%; table-layout:fixed; border-collapse:collapse; margin-bottom:14px;">
        <tr>
          <td style="width:50%; vertical-align:top; padding:0;">
            <table style="border-collapse:collapse;">
              <tr><td style="font-weight:700; padding:1px 6px 1px 0; white-space:nowrap;">No. Nota</td><td style="padding:1px 0;">: ${formatOrderNo(o)}</td></tr>
              <tr><td style="font-weight:700; padding:1px 6px 1px 0; white-space:nowrap;">Nama</td><td style="padding:1px 0;">: ${escapeHtml(o.nama_pembeli)}</td></tr>
              <tr><td style="font-weight:700; padding:1px 6px 1px 0; white-space:nowrap; vertical-align:top;">Alamat</td><td style="padding:1px 0;">: ${escapeHtml(o.alamat || "-")}</td></tr>
              <tr><td style="font-weight:700; padding:1px 6px 1px 0; white-space:nowrap;">No. HP</td><td style="padding:1px 0;">: ${escapeHtml(o.no_hp || "-")}</td></tr>
            </table>
          </td>
          <td style="width:50%; vertical-align:top; text-align:right; padding:0;">
            <table style="border-collapse:collapse; margin-left:auto;">
              <tr><td style="font-weight:700; padding:1px 6px 1px 0; white-space:nowrap; text-align:left;">Tanggal</td><td style="padding:1px 0; text-align:left;">: ${formatTanggal(o.tanggal)}</td></tr>
              <tr><td style="font-weight:700; padding:1px 6px 1px 0; white-space:nowrap; text-align:left;">Status</td><td style="padding:1px 0; text-align:left;">: ${STATUS_BAYAR_LABEL[o.status_bayar]}</td></tr>
            </table>
          </td>
        </tr>
      </table>
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid #000;">
            <th style="text-align:left; padding:4px;">No</th>
            <th style="text-align:left; padding:4px;">Produk</th>
            <th style="text-align:left; padding:4px;">Gelombang</th>
            <th style="text-align:center; padding:4px;">Jml</th>
            <th style="text-align:right; padding:4px;">Harga</th>
            <th style="text-align:right; padding:4px;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemRowsA4}</tbody>
      </table>
      <div style="border-top:1px solid #000; margin-top:10px; padding-top:10px;">
        <div style="display:flex; justify-content:space-between;"><span>Total</span><strong>${formatRupiah(o.total)}</strong></div>
        <div style="display:flex; justify-content:space-between;"><span>Sudah Dibayar</span><span>${formatRupiah(o.paid_amount || 0)}</span></div>
        <div style="display:flex; justify-content:space-between; font-size:15px;"><strong>Sisa</strong><strong>${formatRupiah(sisa)}</strong></div>
      </div>
      <p style="text-align:center; margin-top:26px; color:#555;">Terima kasih atas pesanan Anda</p>
    </div>

    <div class="nota-dm">
      <div style="text-align:center;">
        <div><strong>${escapeHtml(notaToko.nama || "Toko Benih")}</strong></div>
        <div>${escapeHtml(notaToko.alamat || "")}</div>
        <div>${escapeHtml(notaToko.no_hp || "")}</div>
        <div style="font-weight:700;">*** PREORDER ***</div>
      </div>
      <hr />
      <table class="info-table">
        <tr><td>No</td><td>: ${formatOrderNo(o)}</td></tr>
        <tr><td>Tgl</td><td>: ${formatTanggal(o.tanggal)}</td></tr>
        <tr><td>Nama</td><td>: ${escapeHtml(o.nama_pembeli)}</td></tr>
        <tr><td>HP</td><td>: ${escapeHtml(o.no_hp || "-")}</td></tr>
      </table>
      <hr />
      <table>${itemRowsDm}</table>
      <hr />
      <table>
        <tr><td>Total</td><td style="text-align:right;">${formatRupiah(o.total)}</td></tr>
        <tr><td>Bayar</td><td style="text-align:right;">${formatRupiah(o.paid_amount || 0)}</td></tr>
        <tr><td><strong>Sisa</strong></td><td style="text-align:right;"><strong>${formatRupiah(sisa)}</strong></td></tr>
      </table>
      <hr />
      <div style="text-align:center;">Terima kasih</div>
    </div>
  `;
}

function doPrint(mode) {
  document.body.classList.remove("nota-mode-a4", "nota-mode-dm");
  document.body.classList.add(mode === "a4" ? "nota-mode-a4" : "nota-mode-dm");
  setTimeout(() => window.print(), 50);
}
