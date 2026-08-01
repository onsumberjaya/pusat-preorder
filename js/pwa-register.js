// Daftarkan service worker (js/sw.js sengaja diletakkan di ROOT, bukan di
// folder js/, supaya scope-nya mencakup seluruh situs -- scope default SW
// mengikuti lokasi foldernya sendiri). Dibungkus pengecekan
// "serviceWorker" in navigator supaya aman di browser lama yang belum
// dukung PWA -- gagal diam-diam, tidak mengganggu jalannya aplikasi.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Registrasi gagal (mis. dibuka lewat file:// atau http:// non-localhost
      // yang tidak didukung SW) -- aplikasi tetap jalan normal seperti biasa
      // tanpa fitur PWA, jadi sengaja tidak perlu ditampilkan sebagai error.
    });
  });
}
