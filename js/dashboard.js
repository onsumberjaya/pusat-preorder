let dashOrders = [];
let dashProducts = [];
let chartProduk = null;
let chartAlamat = null;

window.onAuthReady = async function () {
  try {
    const [orderSnap, prodSnap] = await Promise.all([
      db.collection("orders").get(),
      db.collection("products").orderBy("nama").get(),
    ]);
    dashOrders = orderSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    dashProducts = prodSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const gelSelect = document.getElementById("filter-gelombang-dash");
    const labels = new Set();
    dashProducts.forEach((p) => (p.waves || []).forEach((w) => labels.add(w.label)));
    labels.forEach((label) => {
      const opt = document.createElement("option");
      opt.value = label;
      opt.textContent = label;
      gelSelect.appendChild(opt);
    });

    renderDashboard();
  } catch (err) {
    document.getElementById("dashboard-content").innerHTML = `<div class="alert alert-error">${friendlyFirebaseError(err)}</div>`;
  }

  document.getElementById("filter-periode").addEventListener("change", (e) => {
    const isCustom = e.target.value === "custom";
    document.getElementById("filter-dari").style.display = isCustom ? "block" : "none";
    document.getElementById("dash-to-label").style.display = isCustom ? "inline" : "none";
    document.getElementById("filter-sampai").style.display = isCustom ? "block" : "none";
    renderDashboard();
  });
  document.getElementById("filter-dari").addEventListener("change", renderDashboard);
  document.getElementById("filter-sampai").addEventListener("change", renderDashboard);
  document.getElementById("filter-gelombang-dash").addEventListener("change", renderDashboard);
};

function getDateRange() {
  const mode = document.getElementById("filter-periode").value;
  const now = new Date();
  let from = null;
  let to = null;
  if (mode === "harian") {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  } else if (mode === "mingguan") {
    from = new Date(now);
    from.setDate(now.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    to = now;
  } else if (mode === "bulanan") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else if (mode === "custom") {
    const dariVal = document.getElementById("filter-dari").value;
    const sampaiVal = document.getElementById("filter-sampai").value;
    from = dariVal ? new Date(dariVal + "T00:00:00") : null;
    to = sampaiVal ? new Date(sampaiVal + "T23:59:59") : null;
  }
  return { from, to };
}

function filteredDashOrders() {
  const { from, to } = getDateRange();
  const gelombang = document.getElementById("filter-gelombang-dash").value;
  return dashOrders.filter((o) => {
    const tgl = o.tanggal && o.tanggal.toDate ? o.tanggal.toDate() : new Date(o.tanggal);
    if (from && tgl < from) return false;
    if (to && tgl > to) return false;
    if (gelombang && !(o.items || []).some((it) => it.wave_label === gelombang)) return false;
    return true;
  });
}

function renderDashboard() {
  const orders = filteredDashOrders();
  const jumlahNota = orders.length;
  const totalUnitProduk = orders.reduce(
    (sum, o) => sum + (o.items || []).reduce((s, it) => s + (Number(it.jumlah) || 0), 0),
    0
  );
  const totalUang = orders.reduce((s, o) => s + o.total, 0);
  const jumlahLunas = orders.filter((o) => o.status_bayar === "lunas").length;
  const jumlahBelumLunas = jumlahNota - jumlahLunas;
  const jumlahDiambil = orders.filter((o) => o.is_diambil).length;
  const jumlahBelumDiambil = jumlahNota - jumlahDiambil;
  const pembeliUnik = new Set(orders.map((o) => (o.nama_pembeli || "").trim().toLowerCase())).size;

  const perProduk = {};
  const perProdukPesanan = {};
  const perAlamat = {};
  orders.forEach((o) => {
    (o.items || []).forEach((it) => {
      perProduk[it.product_name] = (perProduk[it.product_name] || 0) + it.jumlah;
      perProdukPesanan[it.product_name] = (perProdukPesanan[it.product_name] || 0) + 1;
    });
    const alamatKey = (o.alamat || "Tanpa Alamat").trim() || "Tanpa Alamat";
    perAlamat[alamatKey] = (perAlamat[alamatKey] || 0) + 1;
  });

  const container = document.getElementById("dashboard-content");
  container.innerHTML = `
    <div class="grid grid-4" style="margin-bottom:20px;">
      <div class="stat-card brand"><div class="stat-label">Jumlah Pembeli</div><div class="stat-value">${pembeliUnik}</div></div>
      <div class="stat-card brand"><div class="stat-label">Total Pesanan (Unit Produk)</div><div class="stat-value">${totalUnitProduk}</div><div style="font-size:11px; color:var(--gray-400); margin-top:2px;">dari ${jumlahNota} nota</div></div>
      <div class="stat-card brand"><div class="stat-label">Total Uang</div><div class="stat-value" style="font-size:16px;">${formatRupiah(totalUang)}</div></div>
      <div class="stat-card"><div class="stat-label">Lunas / Belum Lunas</div><div class="stat-value" style="font-size:16px;"><span style="color:var(--brand-700);">${jumlahLunas}</span> / <span style="color:var(--red-600);">${jumlahBelumLunas}</span></div></div>
      <div class="stat-card"><div class="stat-label">Sudah Diambil / Belum Diambil</div><div class="stat-value" style="font-size:16px;"><span style="color:var(--brand-700);">${jumlahDiambil}</span> / <span style="color:var(--red-600);">${jumlahBelumDiambil}</span></div></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h3 style="margin-top:0;">Jumlah Pesanan per Produk</h3>
        <canvas id="chart-produk" height="220"></canvas>
      </div>
      <div class="card">
        <h3 style="margin-top:0;">Jumlah Pesanan per Alamat (Top 10)</h3>
        <canvas id="chart-alamat" height="220"></canvas>
      </div>
    </div>

    <div class="card" style="margin-top:20px;">
      <h3 style="margin-top:0;">Detail Total per Produk</h3>
      <table class="table">
        <thead>
          <tr><th>Produk</th><th>Jumlah Pesanan</th><th>Jumlah Unit</th></tr>
        </thead>
        <tbody>
          ${
            Object.keys(perProduk).length === 0
              ? '<tr><td colspan="3" style="color:var(--gray-400);">Belum ada data.</td></tr>'
              : Object.keys(perProduk)
                  .sort((a, b) => perProduk[b] - perProduk[a])
                  .map(
                    (nama) => `
                    <tr>
                      <td>${escapeHtml(nama)}</td>
                      <td>${perProdukPesanan[nama]}</td>
                      <td>${perProduk[nama]}</td>
                    </tr>`
                  )
                  .join("")
          }
        </tbody>
      </table>
    </div>
  `;

  drawBarChart("chart-produk", perProduk, "chartProduk", "#16a34a");
  const topAlamat = Object.entries(perAlamat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  drawBarChart("chart-alamat", Object.fromEntries(topAlamat), "chartAlamat", "#0ea5e9");
}

function drawBarChart(canvasId, dataObj, varName, color) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const labels = Object.keys(dataObj);
  const values = Object.values(dataObj);

  if (window[varName]) window[varName].destroy();

  if (labels.length === 0) {
    ctx.parentElement.insertAdjacentHTML("beforeend", '<p style="color:var(--gray-400); font-size:13px;">Belum ada data.</p>');
    return;
  }

  window[varName] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Jumlah", data: values, backgroundColor: color, borderRadius: 6 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}
