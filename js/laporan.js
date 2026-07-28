let lapOrders = [];
let lapToko = { nama: "Toko Benih" };
let lapFiltered = [];

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
      const opt = document.createElement("option");
      opt.value = d.data().nama;
      opt.textContent = d.data().nama;
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

  document.getElementById("laporan-summary").innerHTML = `
    <div class="grid grid-3">
      <div class="stat-card"><div class="stat-label">Jumlah Pesanan</div><div class="stat-value">${lapFiltered.length}</div></div>
      <div class="stat-card brand"><div class="stat-label">Total Nilai Pesanan</div><div class="stat-value" style="font-size:16px;">${formatRupiah(totalUang)}</div></div>
      <div class="stat-card brand"><div class="stat-label">Total Sudah Terbayar</div><div class="stat-value" style="font-size:16px;">${formatRupiah(totalTerbayar)}</div></div>
    </div>`;

  const rows = lapFiltered
    .map(
      (o) => `
    <tr>
      <td>#${o.order_no}</td>
      <td>${formatTanggal(o.tanggal)}</td>
      <td>${escapeHtml(o.nama_pembeli)}</td>
      <td>${escapeHtml((o.items || []).map((it) => it.product_name).join(", "))}</td>
      <td>${escapeHtml([...new Set((o.items || []).map((it) => it.wave_label))].join(", "))}</td>
      <td style="text-align:right;">${formatRupiah(o.total)}</td>
      <td>${STATUS_BAYAR_LABEL[o.status_bayar]}</td>
      <td>${o.is_diambil ? "Sudah" : "Belum"}</td>
    </tr>`
    )
    .join("");

  document.getElementById("laporan-table").innerHTML = `
    <div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>No</th><th>Tanggal</th><th>Nama</th><th>Produk</th><th>Gelombang</th><th>Total</th><th>Bayar</th><th>Ambil</th></tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="8" style="text-align:center; color:var(--gray-400);">Tidak ada data</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

function exportExcel() {
  if (lapFiltered.length === 0) {
    showToast("Tidak ada data untuk diekspor.", "error");
    return;
  }
  const data = lapFiltered.map((o) => ({
    "No Pesanan": o.order_no,
    Tanggal: formatTanggal(o.tanggal),
    Nama: o.nama_pembeli,
    Alamat: o.alamat || "",
    "No HP": o.no_hp || "",
    Produk: (o.items || []).map((it) => it.product_name).join(", "),
    Gelombang: [...new Set((o.items || []).map((it) => it.wave_label))].join(", "),
    Jumlah: (o.items || []).reduce((s, it) => s + it.jumlah, 0),
    Total: o.total,
    "Sudah Dibayar": o.paid_amount || 0,
    "Status Bayar": STATUS_BAYAR_LABEL[o.status_bayar],
    "Status Ambil": o.is_diambil ? "Sudah" : "Belum",
  }));
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
    "#" + o.order_no,
    formatTanggal(o.tanggal),
    o.nama_pembeli,
    (o.items || []).map((it) => it.product_name).join(", "),
    [...new Set((o.items || []).map((it) => it.wave_label))].join(", "),
    formatRupiah(o.total),
    STATUS_BAYAR_LABEL[o.status_bayar],
    o.is_diambil ? "Sudah" : "Belum",
  ]);

  doc.autoTable({
    startY: 27,
    head: [["No", "Tanggal", "Nama", "Produk", "Gelombang", "Total", "Bayar", "Ambil"]],
    body,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [22, 163, 74] },
  });

  doc.save(`laporan-pesanan-${todayInputValue()}.pdf`);
}
