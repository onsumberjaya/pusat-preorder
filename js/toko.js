window.onAuthReady = async function () {
  try {
    const doc = await db.collection("config").doc("toko").get();
    if (doc.exists) {
      const data = doc.data();
      document.getElementById("toko-nama").value = data.nama || "";
      document.getElementById("toko-alamat").value = data.alamat || "";
      document.getElementById("toko-nohp").value = data.no_hp || "";
    }
  } catch (err) {
    showToast(friendlyFirebaseError(err), "error");
  }
};

document.getElementById("toko-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("toko-submit");
  const alertBox = document.getElementById("toko-alert");
  alertBox.innerHTML = "";
  btn.disabled = true;
  try {
    await db.collection("config").doc("toko").set({
      nama: document.getElementById("toko-nama").value.trim(),
      alamat: document.getElementById("toko-alamat").value.trim(),
      no_hp: document.getElementById("toko-nohp").value.trim(),
    });
    showToast("Profil toko tersimpan.", "success");
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${friendlyFirebaseError(err)}</div>`;
  } finally {
    btn.disabled = false;
  }
});

// Fungsi dipanggil oleh nav.js setelah auth siap, tapi form listener perlu
// dipasang meski elemen belum tentu ada saat script dieksekusi lebih dulu.
// Karena script ini dimuat setelah body, elemen sudah tersedia.
