function formatRupiah(n) {
  n = Number(n) || 0;
  return "Rp " + n.toLocaleString("id-ID");
}

function formatTanggal(dateLike) {
  if (!dateLike) return "-";
  const d = dateLike.toDate ? dateLike.toDate() : new Date(dateLike);
  if (isNaN(d)) return "-";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTanggalWaktu(dateLike) {
  if (!dateLike) return "-";
  const d = dateLike.toDate ? dateLike.toDate() : new Date(dateLike);
  if (isNaN(d)) return "-";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

// Kode nota: PO-<2 digit tahun><4 digit nomor urut TAHUN ITU>, reset ke 0001
// tiap tahun baru. Contoh: pesanan ke-14 di tahun 2026 -> "PO-260014"; pesanan
// pertama di tahun 2027 -> "PO-270001".
// Untuk pesanan lama (dibuat sebelum fitur ini ada, belum punya nota_seq/nota_tahun),
// dipakai fallback: tahun dari field tanggal + nomor urut global (order_no).
function formatOrderNo(order) {
  if (order.nota_tahun && order.nota_seq) {
    return `PO-${String(order.nota_tahun).slice(-2)}${String(order.nota_seq).padStart(4, "0")}`;
  }
  const seq = String(order.order_no || 0).padStart(4, "0");
  let yy = new Date().getFullYear().toString().slice(-2);
  if (order.tanggal) {
    const d = order.tanggal.toDate ? order.tanggal.toDate() : new Date(order.tanggal);
    if (!isNaN(d)) yy = String(d.getFullYear()).slice(-2);
  }
  return `PO-${yy}${seq}`;
}

function todayInputValue() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(message, type) {
  type = type || "info";
  let el = document.getElementById("app-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "app-toast";
    el.style.position = "fixed";
    el.style.bottom = "20px";
    el.style.left = "50%";
    el.style.transform = "translateX(-50%)";
    el.style.zIndex = "999";
    el.style.maxWidth = "90vw";
    document.body.appendChild(el);
  }
  const colors = {
    info: "#1f2937",
    success: "#15803d",
    error: "#dc2626",
  };
  el.textContent = message;
  el.style.background = colors[type] || colors.info;
  el.style.color = "#fff";
  el.style.padding = "12px 20px";
  el.style.borderRadius = "10px";
  el.style.fontSize = "14px";
  el.style.boxShadow = "0 4px 14px rgba(0,0,0,0.2)";
  el.style.opacity = "1";
  el.style.transition = "opacity 0.4s ease";
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.style.opacity = "0";
  }, 2800);
}

function friendlyFirebaseError(err) {
  const code = err && err.code;
  const map = {
    "auth/wrong-password": "Password salah.",
    "auth/user-not-found": "Username tidak ditemukan.",
    "auth/invalid-credential": "Username atau password salah.",
    "auth/invalid-login-credentials": "Username atau password salah.",
    "auth/too-many-requests": "Terlalu banyak percobaan gagal. Coba lagi beberapa saat lagi.",
    "auth/network-request-failed": "Gagal terhubung ke server. Cek koneksi internet Anda.",
    "auth/weak-password": "Password terlalu pendek (minimal 6 karakter).",
    "auth/email-already-in-use": "Username sudah dipakai, pilih username lain.",
    "permission-denied": "Anda tidak punya izin untuk melakukan aksi ini.",
  };
  return map[code] || (err && err.message) || "Terjadi kesalahan, silakan coba lagi.";
}

// Dipakai khusus untuk menomori ulang pesanan LAMA yang belum punya
// nota_seq (lihat fixDuplicateNotaNumbers() di js/laporan.js) -- BERDIRI
// SENDIRI, tidak ikut menaikkan counter order_no global, supaya tidak
// memboroskan nomor urut global yang sebenarnya tidak perlu berubah.
// (Penomoran untuk pesanan BARU dilakukan langsung di dalam transaksi
// penyimpanan pesanan di js/input-pesanan.js, bukan lewat fungsi terpisah,
// supaya penomoran & penyimpanan pesanan atomik dalam 1 transaksi yang sama.)
async function getNextNotaSeq(year) {
  const yearRef = db.collection("counters").doc("nota-" + year);
  return db.runTransaction(async (tx) => {
    const yearDoc = await tx.get(yearRef);
    const nextYear = (yearDoc.exists ? yearDoc.data().seq || 0 : 0) + 1;
    tx.set(yearRef, { seq: nextYear }, { merge: true });
    return { nota_tahun: year, nota_seq: nextYear };
  });
}

// Label & helper role: "karyawan" lama (sebelum fitur cabang) sudah dipakai
// ulang jadi "Admin Kasir"; "karyawan" yang baru sekarang berarti karyawan
// per-cabang (dibedakan lewat ADA-TIDAKNYA field cabang_id, bukan dari role
// string-nya saja -- lihat fungsi migrasi di js/cabang.js).
const ROLE_LABEL = {
  owner: "Owner",
  admin_kasir: "Admin Kasir",
  karyawan: "Karyawan",
};

function roleLabel(role) {
  return ROLE_LABEL[role] || "Karyawan";
}

// Owner & Admin Kasir bebas akses semua cabang; Karyawan (cabang) terkunci ke
// cabang_id akunnya sendiri. Dipakai berulang di pesanan.js/laporan.js/
// input-pesanan.js/dashboard.js untuk menyesuaikan query & tampilan per role.
function canAccessAllBranches(profile) {
  return !!profile && (profile.role === "owner" || profile.role === "admin_kasir");
}

const STATUS_BAYAR_LABEL = {
  lunas: "Lunas",
  cicilan: "Bayar Sebagian",
  belum_bayar: "Belum Bayar",
};
const STATUS_BAYAR_BADGE = {
  lunas: "badge-green",
  cicilan: "badge-yellow",
  belum_bayar: "badge-red",
};

function computeStatusBayar(total, paid) {
  if (paid <= 0) return "belum_bayar";
  if (paid >= total) return "lunas";
  return "cicilan";
}

// Cari nama gelombang (wave label) sebuah item pesanan dari data produk yang
// berlaku SEKARANG. Kalau produk/gelombangnya sudah dihapus, pakai label
// yang tersimpan di pesanan sebagai fallback.
function resolveWaveLabel(item, productsMap) {
  const product = productsMap[item.product_id];
  const wave = product ? (product.waves || []).find((w) => w.id === item.wave_id) : null;
  return wave ? wave.label : item.wave_label;
}

// Deteksi (BUKAN mencegah -- itu keterbatasan Firestore Rules yang tidak
// bisa menjumlahkan list dengan panjang dinamis, lihat catatan di
// firestore.rules) kejanggalan pada sebuah pesanan, dari 3 sisi:
//  1. Harga satuan item beda dari harga gelombang yang berlaku SEKARANG di
//     data produk (bisa juga wajar kalau harga produk memang berubah SETELAH
//     pesanan dibuat -- bukan otomatis berarti kecurangan, tapi layak dicek).
//  2. Subtotal item tidak sama dengan harga_satuan x jumlah (mengindikasikan
//     data dikirim langsung lewat API/console, bukan lewat form aplikasi).
//  3. Total pesanan tidak sama dengan jumlah seluruh subtotal item.
// Kalau produk/gelombangnya sudah dihapus, pengecekan #1 dilewati untuk item
// itu (dianggap tidak bisa dicek, bukan otomatis aman/janggal).
function hasOrderAnomaly(order, productsMap) {
  const items = order.items || [];
  let sumSubtotal = 0;
  let anomaly = false;

  items.forEach((it) => {
    const hargaSatuan = Number(it.harga_satuan) || 0;
    const jumlah = Number(it.jumlah) || 0;
    const subtotal = Number(it.subtotal) || 0;
    sumSubtotal += subtotal;

    if (subtotal !== hargaSatuan * jumlah) anomaly = true;

    const product = productsMap[it.product_id];
    if (product) {
      const wave = (product.waves || []).find((w) => w.id === it.wave_id);
      if (wave && hargaSatuan !== Number(wave.harga)) anomaly = true;
    }
  });

  if (Number(order.total) !== sumSubtotal) anomaly = true;

  return anomaly;
}

// Kontrol paginasi bergaya sama, dipakai bersama oleh Daftar Pesanan &
// Laporan & Export. gotoFnName adalah NAMA fungsi (string) yang sudah
// didefinisikan global di halaman masing-masing (mis. "goToPage" di
// pesanan.js, "goToLapPage" di laporan.js) -- dipanggil lewat onclick, jadi
// tiap halaman bebas menyimpan state currentPage/pageSize-nya sendiri.
function renderPaginationControls(currentPage, pageSize, totalItems, gotoFnName) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) {
    return `<p style="text-align:center; font-size:12.5px; color:var(--gray-400); margin-top:10px;">${totalItems} data</p>`;
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, start + 4);
  start = Math.max(1, end - 4);
  const pageNumbers = [];
  for (let p = start; p <= end; p++) pageNumbers.push(p);

  return `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:14px;">
      <span style="font-size:12.5px; color:var(--gray-500);">Menampilkan ${startItem}–${endItem} dari ${totalItems} data</span>
      <div style="display:flex; gap:6px; align-items:center;">
        <button class="btn-secondary btn-sm" onclick="${gotoFnName}(${currentPage - 1})" ${currentPage === 1 ? "disabled" : ""}><i class="ph-bold ph-caret-left"></i></button>
        ${start > 1 ? `<button class="btn-secondary btn-sm" onclick="${gotoFnName}(1)">1</button>${start > 2 ? '<span style="color:var(--gray-400);">…</span>' : ""}` : ""}
        ${pageNumbers
          .map(
            (p) =>
              `<button class="btn-sm" style="min-width:32px; ${p === currentPage ? "background:var(--brand-600); color:#fff; border-color:var(--brand-600);" : "background:#fff; border:1px solid var(--gray-200); color:var(--gray-700);"}" onclick="${gotoFnName}(${p})">${p}</button>`
          )
          .join("")}
        ${end < totalPages ? `${end < totalPages - 1 ? '<span style="color:var(--gray-400);">…</span>' : ""}<button class="btn-secondary btn-sm" onclick="${gotoFnName}(${totalPages})">${totalPages}</button>` : ""}
        <button class="btn-secondary btn-sm" onclick="${gotoFnName}(${currentPage + 1})" ${currentPage === totalPages ? "disabled" : ""}><i class="ph-bold ph-caret-right"></i></button>
      </div>
    </div>
  `;
}

// Dipakai saat menyimpan pesanan (baru maupun edit) di js/input-pesanan.js,
// supaya format Nama & Alamat konsisten di SEMUA tampilan (Daftar Pesanan,
// Laporan, Nota, Dashboard, export Excel/PDF) -- karena semuanya menampilkan
// nilai field ini apa adanya dari database, cukup diformat sekali saat
// disimpan, tidak perlu diformat ulang di tiap halaman yang menampilkannya.
function formatNamaPembeli(str) {
  return (str || "").trim().toUpperCase();
}

function formatAlamat(str) {
  return (str || "")
    .trim()
    .toLowerCase()
    .replace(/(^|\s)([a-zà-ÿ])/g, (m, sep, ch) => sep + ch.toUpperCase());
}
