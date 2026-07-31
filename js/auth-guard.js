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
  } catch (err) {
    console.error(err);
    showToast("Gagal memuat profil pengguna.", "error");
  }
});

function logout() {
  if (!confirm("Keluar dari aplikasi?")) return;
  auth.signOut().then(() => (window.location.href = "index.html"));
}
