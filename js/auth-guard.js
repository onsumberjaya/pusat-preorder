// Dipasang di semua halaman KECUALI index.html (halaman login).
// Menunggu status login, mengambil profil (role) dari Firestore,
// lalu memanggil window.onAuthReady(profile) yang didefinisikan tiap halaman.
// Jika halaman punya <body data-owner-only="true">, karyawan otomatis
// diarahkan kembali ke pesanan.html.

window.currentUserProfile = null;

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  try {
    const doc = await db.collection("users").doc(user.uid).get();
    if (!doc.exists || doc.data().is_active === false) {
      showToast("Akun tidak aktif atau tidak ditemukan. Hubungi Owner.", "error");
      await auth.signOut();
      window.location.href = "index.html";
      return;
    }
    const profile = { uid: user.uid, ...doc.data() };
    window.currentUserProfile = profile;

    const ownerOnly = document.body.getAttribute("data-owner-only") === "true";
    if (ownerOnly && profile.role !== "owner") {
      window.location.href = "pesanan.html";
      return;
    }

    if (typeof renderSidebar === "function") renderSidebar(profile);
    if (typeof window.onAuthReady === "function") window.onAuthReady(profile);

    watchSingleSession(user.uid);
  } catch (err) {
    console.error(err);
    showToast("Gagal memuat profil pengguna.", "error");
  }
});

// Fitur "1 sesi login per perangkat". localStorage dibagi otomatis ke semua
// tab dalam browser yang sama di komputer yang sama -- jadi buka beberapa
// tab di 1 komputer tetap dianggap 1 sesi, tidak saling menendang.
let sessionKickHandled = false;
function watchSingleSession(uid) {
  const localSessionId = localStorage.getItem("device_session_id");

  if (!localSessionId) {
    // Sesi ini belum tercatat lokal -- kemungkinan besar login dari SEBELUM
    // fitur ini ada, atau localStorage sempat kepencet bersih. Daripada
    // langsung tendang paksa (bisa mengganggu semua orang begitu fitur ini
    // baru diaktifkan), anggap saja perangkat ini sah dan daftarkan sebagai
    // sesi aktif sekarang.
    const newId = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("device_session_id", newId);
    db.collection("users").doc(uid).update({ active_session_id: newId }).catch(() => {});
    return;
  }

  db.collection("users")
    .doc(uid)
    .onSnapshot((snap) => {
      if (sessionKickHandled || !snap.exists) return;
      const serverSessionId = snap.data().active_session_id;
      if (serverSessionId && serverSessionId !== localSessionId) {
        sessionKickHandled = true;
        localStorage.removeItem("device_session_id");
        alert("Sesi Anda diakhiri karena akun ini baru saja login dari perangkat lain.");
        auth.signOut().then(() => (window.location.href = "index.html"));
      }
    });
}

async function logout() {
  if (!confirm("Keluar dari aplikasi?")) return;
  const uid = auth.currentUser && auth.currentUser.uid;
  localStorage.removeItem("device_session_id");
  // Bersihkan juga active_session_id di server (bukan cuma lokal) -- harus
  // dilakukan SEBELUM signOut(), karena begitu signOut() selesai, request.auth
  // jadi null dan tidak lagi punya izin menulis ke dokumen users manapun.
  if (uid) {
    try {
      await db.collection("users").doc(uid).update({ active_session_id: firebase.firestore.FieldValue.delete() });
    } catch (e) {
      // Diamkan -- kalaupun gagal, tetap lanjut logout seperti biasa.
    }
  }
  auth.signOut().then(() => (window.location.href = "index.html"));
}
