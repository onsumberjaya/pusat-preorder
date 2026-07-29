let lapOrders = [];
let lapToko = { nama: "Toko Benih" };
let lapFiltered = [];
let lapProductsMap = {};

function resolveWaveLabel(item) {
  const product = lapProductsMap[item.product_id];
  const wave = product ? (product.waves || []).find((w) => w.id === item.wave_id) : null;
  return wave ? wave.label : item.wave_label;
}

// Sama seperti di Daftar Pesanan: deteksi (bukan cegah) kejanggalan harga
// dengan membandingkan ke harga gelombang yang berlaku sekarang.
function hasPriceMismatch(order) {
  return (order.items || []).some((it) => {
    const product = lapProductsMap[it.product_id];
    if (!product) return false;
    const wave = (product.waves || []).find((w) => w.id === it.wave_id);
    if (!wave) return false;
    return Number(it.harga_satuan) !== Number(wave.harga);
  });
}

window.onAuthReady = async function () {
  try {
    const [orderSnap, prodSnap, tokoDoc] = await Promise.all([
      db.collection("orders").orderBy("order_no", "desc").get(),
      db.collection("products").orderBy("nama").get(),
      db.collection("config").doc("toko").get(),
    ]);
    lapOrders = orderSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (tokoDoc.exists) lapToko = tokoDoc.data();

    const select = document.getElementById("lap-produk");
    prodSnap.docs.forEach((d) => {
      const p = { id: d.id, ...d.data() };
      lapProductsMap[p.id] = p;
      const opt = document.createElement("option");
      opt.value = p.nama;
      opt.textContent = p.nama;
      select.appendChild(opt);
    });

    applyReportFilter();
  } catch (err) {
    document.getElementById("laporan-table").innerHTML = `<div class="alert alert-error">${friendlyFirebaseError(err)}</div>`;
  }
};

function applyReportFilter() {
  const dari = document.getElementById("lap-dari").value;
  const sampai = document.getElementById("lap-sampai").value;
  const produk = document.getElementById("lap-produk").value;

  const fromDate = dari ? new Date(dari + "T00:00:00") : null;
  const toDate = sampai ? new Date(sampai + "T23:59:59") : null;

  lapFiltered = lapOrders.filter((o) => {
    const tgl = o.tanggal && o.tanggal.toDate ? o.tanggal.toDate() : new Date(o.tanggal);
    if (fromDate && tgl < fromDate) return false;
    if (toDate && tgl > toDate) return false;
    if (produk && !(o.items || []).some((it) => it.product_name === produk)) return false;
    return true;
  });

  renderReport();
}

function renderReport() {
  const totalUang = lapFiltered.reduce((s, o) => s + o.total, 0);
  const totalTerbayar = lapFiltered.reduce((s, o) => s + (o.paid_amount || 0), 0);
  const totalKekurangan = totalUang - totalTerbayar;
  const totalUnitProduk = lapFiltered.reduce(
    (sum, o) => sum + (o.items || []).reduce((s, it) => s + (Number(it.jumlah) || 0), 0),
    0
  );
  const jumlahJanggal = lapFiltered.filter((o) => hasPriceMismatch(o)).length;

  document.getElementById("laporan-summary").innerHTML = `
    <div class="grid grid-4">
      <div class="stat-card"><div class="stat-label">Jumlah Pesanan</div><div class="stat-value">${lapFiltered.length}</div></div>
      <div class="stat-card"><div class="stat-label">Jumlah Produk Dipesan (Unit)</div><div class="stat-value">${totalUnitProduk}</div></div>
      <div class="stat-card brand"><div class="stat-label">Total Uang</div><div class="stat-value" style="font-size:16px;">${formatRupiah(totalUang)}</div></div>
      <div class="stat-card brand"><div class="stat-label">Sudah Bayar / Kekurangan</div><div class="stat-value" style="font-size:15px; color:#fff;">${formatRupiah(totalTerbayar)} <span style="color:var(--brand-100); font-weight:600;">/</span> <span style="color:#fecaca;">${formatRupiah(totalKekurangan)}</span></div></div>
    </div>
    ${
      jumlahJanggal > 0
        ? `<div class="alert alert-error" style="margin-top:12px;">⚠️ ${jumlahJanggal} pesanan dalam rentang ini punya harga yang berbeda dari harga gelombang yang berlaku sekarang — cek kolom "Cek Harga" di tabel, lalu bandingkan manual ke Detail Pesanan kalau perlu.</div>`
        : ""
    }`;

  const rows = lapFiltered
    .map((o) => {
      const items = o.items || [];
      const janggal = hasPriceMismatch(o);
      const belumLunas = o.status_bayar !== "lunas";

      const produkCell = items
        .map(
          (it) => `
        <div class="order-item-line">
          <div class="item-produk">${escapeHtml(it.product_name)} <span style="color:var(--gray-400); font-weight:500;">x${it.jumlah}</span></div>
          <div class="item-gelombang">${escapeHtml(resolveWaveLabel(it))}</div>
        </div>`
        )
        .join("");

      const totalQty = items.reduce((s, it) => s + (Number(it.jumlah) || 0), 0);
      const kekurangan = o.total - (o.paid_amount || 0);

      return `
    <tr>
      <td>
        <div style="font-weight:700; color:var(--gray-900);">${formatOrderNo(o)} ${janggal ? '<span title="Harga di pesanan ini berbeda dari harga gelombang yang berlaku sekarang" style="color:var(--red-600);">⚠️</span>' : ""}</div>
        <div style="font-size:11.5px; color:var(--gray-400); margin-top:1px;">${formatTanggal(o.tanggal)}</div>
      </td>
      <td>
        <div style="font-weight:600;">${escapeHtml(o.nama_pembeli)}</div>
        <div style="font-size:11.5px; color:var(--gray-400); margin-top:1px;">${escapeHtml(o.no_hp || "-")}</div>
        ${o.alamat ? `<div style="font-size:11.5px; color:var(--gray-400);">${escapeHtml(o.alamat)}</div>` : ""}
      </td>
      <td style="min-width:170px;">${produkCell}</td>
      <td style="text-align:center;">${totalQty}</td>
      <td style="text-align:right; font-weight:700; color:var(--gray-900);">${formatRupiah(o.total)}</td>
      <td style="text-align:right;">${formatRupiah(o.paid_amount || 0)}</td>
      <td style="text-align:right; ${belumLunas ? "color:var(--red-600); font-weight:600;" : ""}">${formatRupiah(kekurangan)}</td>
      <td><span class="badge ${STATUS_BAYAR_BADGE[o.status_bayar]}">${STATUS_BAYAR_LABEL[o.status_bayar].toUpperCase()}</span></td>
      <td><span class="badge ${o.is_diambil ? "badge-green" : "badge-gray"}">${o.is_diambil ? "SUDAH" : "BELUM"}</span></td>
      <td>${janggal ? '<span class="badge badge-red">⚠️ JANGGAL</span>' : '<span class="badge badge-gray">OK</span>'}</td>
    </tr>`;
    })
    .join("");

  document.getElementById("laporan-table").innerHTML = `
    <div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nota / Tanggal</th>
              <th>Pemesan</th>
              <th>Produk & Gelombang</th>
              <th>Qty</th>
              <th style="text-align:right;">Total</th>
              <th style="text-align:right;">Dibayar</th>
              <th style="text-align:right;">Kekurangan</th>
              <th>Status Bayar</th>
              <th>Pengambilan</th>
              <th>Cek Harga</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="10" style="text-align:center; color:var(--gray-400);">Tidak ada data</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

function exportExcel() {
  if (lapFiltered.length === 0) {
    showToast("Tidak ada data untuk diekspor.", "error");
    return;
  }
  const data = [];
  lapFiltered.forEach((o) => {
    const items = o.items && o.items.length ? o.items : [null];
    items.forEach((it) => {
      data.push({
        "No Pesanan": formatOrderNo(o),
        Tanggal: formatTanggal(o.tanggal),
        Nama: o.nama_pembeli,
        "No HP": o.no_hp || "",
        Alamat: o.alamat || "",
        Produk: it ? it.product_name : "-",
        Gelombang: it ? resolveWaveLabel(it) : "-",
        Qty: it ? it.jumlah : "",
        "Harga Satuan": it ? it.harga_satuan : "",
        Subtotal: it ? it.subtotal : "",
        "Total Pesanan": o.total,
        Dibayar: o.paid_amount || 0,
        Kekurangan: o.total - (o.paid_amount || 0),
        "Status Bayar": STATUS_BAYAR_LABEL[o.status_bayar],
        Pengambilan: o.is_diambil ? "Sudah" : "Belum",
        "Cek Harga": hasPriceMismatch(o) ? "JANGGAL" : "OK",
        Catatan: o.catatan || "",
      });
    });
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Laporan Pesanan");
  XLSX.writeFile(wb, `laporan-pesanan-${todayInputValue()}.xlsx`);
}

function exportPdf() {
  if (lapFiltered.length === 0) {
    showToast("Tidak ada data untuk diekspor.", "error");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(lapToko.nama || "Toko Benih", 14, 15);
  doc.setFontSize(10);
  doc.text(`Laporan Pesanan - dicetak ${formatTanggal(new Date())}`, 14, 21);

  const body = lapFiltered.map((o) => [
    `${formatOrderNo(o)}\n${formatTanggal(o.tanggal)}`,
    `${o.nama_pembeli}\n${o.no_hp || "-"}${o.alamat ? "\n" + o.alamat : ""}`,
    (o.items || []).map((it) => `${it.product_name} x${it.jumlah}`).join("\n"),
    (o.items || []).map((it) => resolveWaveLabel(it)).join("\n"),
    (o.items || []).reduce((s, it) => s + (Number(it.jumlah) || 0), 0),
    formatRupiah(o.total),
    formatRupiah(o.paid_amount || 0),
    formatRupiah(o.total - (o.paid_amount || 0)),
    STATUS_BAYAR_LABEL[o.status_bayar],
    o.is_diambil ? "Sudah" : "Belum",
  ]);

  doc.autoTable({
    startY: 27,
    head: [["Nota / Tanggal", "Pemesan", "Produk", "Gelombang", "Qty", "Total", "Dibayar", "Kekurangan", "Status Bayar", "Pengambilan"]],
    body,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [22, 163, 74] },
  });

  doc.save(`laporan-pesanan-${todayInputValue()}.pdf`);
}
