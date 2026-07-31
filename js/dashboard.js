let dashOrders = [];
let dashProducts = [];
let allCabangDash = [];
let chartProduk = null;
let chartAlamat = null;
let chartWaktu = null;
let dashGranularitas = "harian";

// Tombol Filter di sebelah judul halaman -- filter tersembunyi secara
// default (di semua ukuran layar) dan baru muncul saat tombol ini diklik.
function toggleDashFilterVisibility() {
  const toolbar = document.getElementById("dash-filter-toolbar");
  const btn = document.getElementById("dash-filter-toggle-btn");
  const hidden = toolbar.style.display === "none";
  toolbar.style.display = hidden ? "" : "none";
  btn.className = hidden ? "btn-primary btn-sm" : "btn-secondary btn-sm";
  btn.innerHTML = hidden
    ? '<i class="ph-bold ph-x"></i> Tutup Filter'
    : '<i class="ph-bold ph-funnel"></i> Filter';
}

function resolveWaveLabel(item) {
  const product = dashProducts.find((p) => p.id === item.product_id);
  const wave = product ? (product.waves || []).find((w) => w.id === item.wave_id) : null;
  return wave ? wave.label : item.wave_label;
}

// Format teks jadi "Huruf Kapital Di Awal Tiap Kata" -- dipakai supaya nama
// alamat yang diketik beda-beda (SUKORAME / sukorame / Sukorame) tampil
// konsisten satu gaya di grafik "Jumlah Unit Terjual per Alamat".
function toTitleCase(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/(^|\s|[-/])\S/g, (c) => c.toUpperCase());
}

function updateGelombangFilterOptionsDash() {
  const gelSelect = document.getElementById("filter-gelombang-dash");
  const currentValue = gelSelect.value;
  const labels = new Set();
  dashProducts.forEach((p) => (p.waves || []).forEach((w) => labels.add(w.label)));
  gelSelect.innerHTML = '<option value="">Semua Gelombang</option>';
  labels.forEach((label) => {
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = label;
    gelSelect.appendChild(opt);
  });
  if (labels.has(currentValue)) gelSelect.value = currentValue;
}

function updateCabangFilterOptionsDash(profile) {
  const select = document.getElementById("filter-cabang-dash");
  // Karyawan cabang cuma bisa lihat cabangnya sendiri (query juga sudah
  // dibatasi ke cabang itu) -- filter ini tidak relevan buat mereka, jadi
  // disembunyikan saja daripada nampilkan dropdown isi 1 pilihan doang.
  if (!canAccessAllBranches(profile)) {
    select.style.display = "none";
    return;
  }
  const currentValue = select.value;
  select.innerHTML = '<option value="">Semua Cabang</option>';
  allCabangDash
    .filter((c) => c.is_active !== false)
    .forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.nama;
      select.appendChild(opt);
    });
  if (Array.from(select.options).some((o) => o.value === currentValue)) select.value = currentValue;
}

function cabangNamaDash(cabangId) {
  const c = allCabangDash.find((x) => x.id === cabangId);
  return c ? c.nama : "Belum Ada Cabang";
}

window.onAuthReady = async function (profile) {
  let ordersLoaded = false;
  let productsLoaded = false;
  let cabangLoaded = false;

  function tryRender() {
    if (!ordersLoaded || !productsLoaded || !cabangLoaded) return;
    updateGelombangFilterOptionsDash();
    updateCabangFilterOptionsDash(profile);
    renderDashboard();
  }

  // Karyawan cabang: query WAJIB dibatasi where('cabang_id', '==', ...), kalau
  // tidak Firestore rules akan menolak query ini sepenuhnya (bukan cuma
  // menyaring hasilnya) karena berpotensi mengembalikan data cabang lain.
  let ordersQuery = db.collection("orders");
  if (!canAccessAllBranches(profile) && profile.cabang_id) {
    ordersQuery = ordersQuery.where("cabang_id", "==", profile.cabang_id);
  }
  ordersQuery.onSnapshot(
    (snap) => {
      dashOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      ordersLoaded = true;
      tryRender();
    },
    (err) => {
      document.getElementById("dashboard-content").innerHTML = `<div class="alert alert-error">${friendlyFirebaseError(err)}</div>`;
    }
  );

  db.collection("products")
    .orderBy("nama")
    .onSnapshot(
      (snap) => {
        dashProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        productsLoaded = true;
        tryRender();
      },
      (err) => {
        document.getElementById("dashboard-content").innerHTML = `<div class="alert alert-error">${friendlyFirebaseError(err)}</div>`;
      }
    );

  db.collection("cabang")
    .orderBy("nama")
    .onSnapshot(
      (snap) => {
        allCabangDash = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        cabangLoaded = true;
        tryRender();
      },
      (err) => {
        document.getElementById("dashboard-content").innerHTML = `<div class="alert alert-error">${friendlyFirebaseError(err)}</div>`;
      }
    );

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
  document.getElementById("filter-cabang-dash").addEventListener("change", renderDashboard);
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
  const cabangFilter = document.getElementById("filter-cabang-dash").value;
  return dashOrders.filter((o) => {
    const tgl = o.tanggal && o.tanggal.toDate ? o.tanggal.toDate() : new Date(o.tanggal);
    if (from && tgl < from) return false;
    if (to && tgl > to) return false;
    if (gelombang && !(o.items || []).some((it) => resolveWaveLabel(it) === gelombang)) return false;
    if (cabangFilter && o.cabang_id !== cabangFilter) return false;
    return true;
  });
}

// Kelompokkan pesanan berdasarkan tanggal jadi titik-titik data harian/mingguan/bulanan
// untuk grafik tren "Pesanan Masuk". Rentang tanggalnya sendiri sudah diatur lewat
// filter Semua Waktu/Hari Ini/7 Hari Terakhir/Bulan Ini/Rentang Tanggal di atas.
function buildTimeSeries(orders, granularitas) {
  const buckets = {};
  orders.forEach((o) => {
    const d = o.tanggal && o.tanggal.toDate ? o.tanggal.toDate() : new Date(o.tanggal);
    if (isNaN(d)) return;
    let key, label;
    if (granularitas === "bulanan") {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      label = d.toLocaleDateString("id-ID", { month: "short", year: "numeric" });
    } else if (granularitas === "mingguan") {
      const monday = new Date(d);
      const offset = (monday.getDay() + 6) % 7; // 0 = Senin
      monday.setDate(monday.getDate() - offset);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      key = monday.toISOString().slice(0, 10);
      label = `${monday.getDate()}/${monday.getMonth() + 1}-${sunday.getDate()}/${sunday.getMonth() + 1}`;
    } else {
      key = d.toISOString().slice(0, 10);
      label = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
    }
    if (!buckets[key]) buckets[key] = { label, count: 0, perProduk: {} };
    (o.items || []).forEach((it) => {
      const qty = Number(it.jumlah) || 0;
      buckets[key].count += qty;
      buckets[key].perProduk[it.product_name] = (buckets[key].perProduk[it.product_name] || 0) + qty;
    });
  });
  return Object.keys(buckets)
    .sort()
    .map((key) => buckets[key]);
}

// Warna tetap untuk produk tertentu (biru untuk MAPAN, oren keemasan untuk NINGRAT),
// produk lain otomatis dapat warna berbeda dari palet cadangan biar tetap konsisten
// walau nanti ada produk baru.
function buildProductColorMap(names) {
  const palette = ["#9333ea", "#db2777", "#0891b2", "#65a30d", "#dc2626", "#0f766e", "#4338ca"];
  const map = {};
  let paletteIdx = 0;
  names.forEach((name) => {
    const upper = (name || "").toUpperCase();
    if (upper.includes("MAPAN")) {
      map[name] = "#2563eb"; // biru
    } else if (upper.includes("NINGRAT")) {
      map[name] = "#d97706"; // oren keemasan
    } else {
      map[name] = palette[paletteIdx % palette.length];
      paletteIdx++;
    }
  });
  return map;
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
  const perProdukPerCabang = {};
  const perAlamat = {};
  orders.forEach((o) => {
    const cabangKey = o.cabang_id || "__tanpa_cabang__";
    (o.items || []).forEach((it) => {
      perProduk[it.product_name] = (perProduk[it.product_name] || 0) + it.jumlah;
      if (!perProdukPerCabang[it.product_name]) perProdukPerCabang[it.product_name] = {};
      perProdukPerCabang[it.product_name][cabangKey] =
        (perProdukPerCabang[it.product_name][cabangKey] || 0) + (Number(it.jumlah) || 0);
    });
    const alamatRaw = (o.alamat || "Tanpa Alamat").trim() || "Tanpa Alamat";
    const alamatKey = toTitleCase(alamatRaw);
    const orderQty = (o.items || []).reduce((s, it) => s + (Number(it.jumlah) || 0), 0);
    perAlamat[alamatKey] = (perAlamat[alamatKey] || 0) + orderQty;
  });

  // Kolom cabang di tabel "Detail Total per Produk": semua cabang aktif yang
  // terdaftar (walau belum ada pesanannya di rentang filter ini, tetap
  // ditampilkan sebagai kolom 0), plus kolom tambahan "Tanpa Cabang" HANYA
  // kalau memang ada pesanan lama yang belum dimigrasi ke cabang manapun.
  const cabangColumns = allCabangDash.filter((c) => c.is_active !== false).map((c) => ({ id: c.id, nama: c.nama }));
  const adaTanpaCabang = orders.some((o) => !o.cabang_id);
  if (adaTanpaCabang) cabangColumns.push({ id: "__tanpa_cabang__", nama: "Tanpa Cabang" });

  const container = document.getElementById("dashboard-content");
  container.innerHTML = `
    <div class="grid grid-5" style="margin-bottom:20px;">
      <div class="stat-card brand">
        <div class="stat-icon"><i class="ph-bold ph-users-three"></i></div>
        <div class="stat-body"><div class="stat-label">Jumlah Pembeli</div><div class="stat-value">${pembeliUnik}</div></div>
      </div>
      <div class="stat-card brand">
        <div class="stat-icon"><i class="ph-bold ph-package"></i></div>
        <div class="stat-body"><div class="stat-label">Total Pesanan (Unit Produk)</div><div class="stat-value">${totalUnitProduk}</div><div style="font-size:11px; color:var(--brand-100); margin-top:2px;">dari ${jumlahNota} nota</div></div>
      </div>
      <div class="stat-card brand">
        <div class="stat-icon"><i class="ph-bold ph-wallet"></i></div>
        <div class="stat-body"><div class="stat-label">Total Uang</div><div class="stat-value" style="font-size:16px;">${formatRupiah(totalUang)}</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ph-bold ph-check-circle"></i></div>
        <div class="stat-body"><div class="stat-label">Lunas / Belum Lunas</div><div class="stat-value" style="font-size:16px;"><span style="color:var(--brand-700);">${jumlahLunas}</span> / <span style="color:var(--red-600);">${jumlahBelumLunas}</span></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ph-bold ph-basket"></i></div>
        <div class="stat-body"><div class="stat-label">Sudah Diambil / Belum Diambil</div><div class="stat-value" style="font-size:16px;"><span style="color:var(--brand-700);">${jumlahDiambil}</span> / <span style="color:var(--red-600);">${jumlahBelumDiambil}</span></div></div>
      </div>
    </div>

    <div class="card" style="margin-top:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
        <div class="card-heading"><span class="card-heading-icon"><i class="ph-bold ph-trend-up"></i></span><h3>Pesanan Masuk</h3></div>
        <select id="chart-granularitas" style="width:auto; min-width:140px;">
          <option value="harian" ${dashGranularitas === "harian" ? "selected" : ""}>Harian</option>
          <option value="mingguan" ${dashGranularitas === "mingguan" ? "selected" : ""}>Mingguan</option>
          <option value="bulanan" ${dashGranularitas === "bulanan" ? "selected" : ""}>Bulanan</option>
        </select>
      </div>
      <p style="font-size:12px; color:var(--gray-400); margin:-4px 0 12px;">Tips: pakai filter "Rentang Tanggal..." di atas untuk atur sendiri periode yang ditampilkan.</p>
      <div class="chart-box chart-box-waktu">
        <canvas id="chart-waktu"></canvas>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:20px;">
      <div class="card">
        <div class="card-heading" style="margin-bottom:14px;"><span class="card-heading-icon"><i class="ph-bold ph-chart-bar"></i></span><h3>Jumlah Pesanan per Produk</h3></div>
        <div class="chart-box"><canvas id="chart-produk"></canvas></div>
      </div>
      <div class="card">
        <div class="card-heading" style="margin-bottom:14px;"><span class="card-heading-icon"><i class="ph-bold ph-map-pin"></i></span><h3>Jumlah Unit Terjual per Alamat (Top 10)</h3></div>
        <div class="chart-box" style="height:280px;"><canvas id="chart-alamat"></canvas></div>
      </div>
    </div>

    <div class="card" style="margin-top:20px;">
      <div class="card-heading" style="margin-bottom:14px;"><span class="card-heading-icon"><i class="ph-bold ph-list-numbers"></i></span><h3>Detail Total per Produk${cabangColumns.length > 1 ? " per Cabang" : ""}</h3></div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Produk</th>
              ${cabangColumns.map((c) => `<th style="text-align:center;">${escapeHtml(c.nama)}</th>`).join("")}
              <th style="text-align:center;">Total Semua Cabang</th>
            </tr>
          </thead>
          <tbody>
            ${
              Object.keys(perProduk).length === 0
                ? `<tr><td colspan="${cabangColumns.length + 2}" style="color:var(--gray-400);">Belum ada data.</td></tr>`
                : Object.keys(perProduk)
                    .sort((a, b) => perProduk[b] - perProduk[a])
                    .map(
                      (nama, idx) => `
                    <tr>
                      <td>${escapeHtml(nama)}${idx === 0 ? '<span class="rank-badge"><i class="ph-bold ph-trophy"></i> Terlaris</span>' : ""}</td>
                      ${cabangColumns.map((c) => `<td style="text-align:center;">${(perProdukPerCabang[nama] && perProdukPerCabang[nama][c.id]) || 0}</td>`).join("")}
                      <td style="text-align:center; font-weight:700;">${perProduk[nama]}</td>
                    </tr>`
                    )
                    .join("")
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  const produkNamesUrut = Object.keys(perProduk).sort();
  const produkColorMap = buildProductColorMap(produkNamesUrut);
  drawTimeSeriesChart("chart-waktu", buildTimeSeries(orders, dashGranularitas), produkNamesUrut, produkColorMap);
  document.getElementById("chart-granularitas").addEventListener("change", (e) => {
    dashGranularitas = e.target.value;
    renderDashboard();
  });

  drawBarChart("chart-produk", perProduk, "chartProduk", "#16a34a");
  const topAlamat = Object.entries(perAlamat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .reverse();
  drawBarChart("chart-alamat", Object.fromEntries(topAlamat), "chartAlamat", "#0ea5e9", true);
}

function drawTimeSeriesChart(canvasId, timeSeries, produkNames, produkColorMap) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (chartWaktu) chartWaktu.destroy();

  if (timeSeries.length === 0) {
    ctx.parentElement.insertAdjacentHTML("beforeend", '<p style="color:var(--gray-400); font-size:13px;">Belum ada data.</p>');
    return;
  }

  const datasets = [
    {
      label: "Total Unit",
      data: timeSeries.map((t) => t.count),
      borderColor: "#16a34a",
      backgroundColor: "rgba(22, 163, 74, 0.12)",
      fill: true,
      tension: 0.3,
      pointRadius: 3,
      pointBackgroundColor: "#16a34a",
    },
    ...produkNames.map((nama) => ({
      label: nama,
      data: timeSeries.map((t) => t.perProduk[nama] || 0),
      borderColor: produkColorMap[nama],
      backgroundColor: "transparent",
      fill: false,
      tension: 0.3,
      borderWidth: 2,
      pointRadius: 2,
      pointBackgroundColor: produkColorMap[nama],
    })),
  ];

  chartWaktu = new Chart(ctx, {
    type: "line",
    data: {
      labels: timeSeries.map((t) => t.label),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function drawBarChart(canvasId, dataObj, varName, color, horizontal) {
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
      indexAxis: horizontal ? "y" : "x",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: horizontal
        ? { x: { beginAtZero: true, ticks: { precision: 0 } } }
        : { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}
