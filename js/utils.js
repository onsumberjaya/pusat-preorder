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

// Menghasilkan nomor pesanan (global, untuk urutan data) SEKALIGUS nomor urut
// nota per tahun (untuk kode PO-YYNNNN, reset ke 1 tiap tahun baru), sekaligus
// dalam satu transaksi Firestore supaya konsisten walau 2 orang input bersamaan.
async function getNextOrderIdentifiers() {
  const year = new Date().getFullYear();
  const globalRef = db.collection("counters").doc("orders");
  const yearRef = db.collection("counters").doc("nota-" + year);
  return db.runTransaction(async (tx) => {
    const [globalDoc, yearDoc] = await Promise.all([tx.get(globalRef), tx.get(yearRef)]);
    const nextGlobal = (globalDoc.exists ? globalDoc.data().seq || 0 : 0) + 1;
    const nextYear = (yearDoc.exists ? yearDoc.data().seq || 0 : 0) + 1;
    tx.set(globalRef, { seq: nextGlobal }, { merge: true });
    tx.set(yearRef, { seq: nextYear }, { merge: true });
    return { order_no: nextGlobal, nota_tahun: year, nota_seq: nextYear };
  });
}

// Sama seperti bagian nota_seq di getNextOrderIdentifiers() di atas, tapi
// BERDIRI SENDIRI (tidak ikut menaikkan counter order_no global) -- dipakai
// khusus untuk menomori ulang pesanan LAMA yang belum punya nota_seq, supaya
// tidak memboroskan nomor urut global yang sebenarnya tidak perlu berubah.
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
