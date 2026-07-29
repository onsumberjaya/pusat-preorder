let tokoOriginal = { nama: "", alamat: "", no_hp: "" };

window.onAuthReady = async function () {
  try {
    const doc = await db.collection("config").doc("toko").get();
    if (doc.exists) {
      const data = doc.data();
      tokoOriginal = { nama: data.nama || "", alamat: data.alamat || "", no_hp: data.no_hp || "" };
    }
    applyTokoValues();
  } catch (err) {
    showToast(friendlyFirebaseError(err), "error");
  }
};

function applyTokoValues() {
  document.getElementById("toko-nama").value = tokoOriginal.nama;
  document.getElementById("toko-alamat").value = tokoOriginal.alamat;
  document.getElementById("toko-nohp").value = tokoOriginal.no_hp;
}

function setTokoEditMode(isEditing) {
  ["toko-nama", "toko-alamat", "toko-nohp"].forEach((id) => {
    document.getElementById(id).disabled = !isEditing;
  });
  document.getElementById("toko-edit-btn").style.display = isEditing ? "none" : "";
  document.getElementById("toko-submit").style.display = isEditing ? "" : "none";
  document.getElementById("toko-cancel-btn").style.display = isEditing ? "" : "none";
}

function enableTokoEdit() {
  setTokoEditMode(true);
  document.getElementById("toko-nama").focus();
}

function cancelTokoEdit() {
  document.getElementById("toko-alert").innerHTML = "";
  applyTokoValues();
  setTokoEditMode(false);
}

document.getElementById("toko-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("toko-submit");
  const alertBox = document.getElementById("toko-alert");
  alertBox.innerHTML = "";
  btn.disabled = true;
  try {
    tokoOriginal = {
      nama: document.getElementById("toko-nama").value.trim(),
      alamat: document.getElementById("toko-alamat").value.trim(),
      no_hp: document.getElementById("toko-nohp").value.trim(),
    };
    await db.collection("config").doc("toko").set(tokoOriginal);
    showToast("Profil toko tersimpan.", "success");
    setTokoEditMode(false);
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-error">${friendlyFirebaseError(err)}</div>`;
  } finally {
    btn.disabled = false;
  }
});

// Fungsi dipanggil oleh nav.js setelah auth siap, tapi form listener perlu
// dipasang meski elemen belum tentu ada saat script dieksekusi lebih dulu.
// Karena script ini dimuat setelah body, elemen sudah tersedia.
