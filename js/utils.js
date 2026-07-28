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

// Menghasilkan nomor pesanan berurutan secara aman memakai transaksi Firestore.
async function getNextOrderNumber() {
  const counterRef = db.collection("counters").doc("orders");
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? doc.data().seq || 0 : 0;
    const next = current + 1;
    tx.set(counterRef, { seq: next }, { merge: true });
    return next;
  });
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
