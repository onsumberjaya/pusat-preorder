let allCabang = [];

window.onAuthReady = function () {
  listenCabang();
  checkMigrasiNeeded();
};

function listenCabang() {
  db.collection("cabang")
    .orderBy("nama")
    .onSnapshot(
      (snap) => {
        allCabang = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderCabang();
        fillMigrasiCabangOptions();
      },
      (err) => {
        showToast("Gagal memuat cabang: " + friendlyFirebaseError(err), "error");
      }
    );
}

function renderCabang() {
  const container = document.getElementById("cabang-list");
  if (allCabang.length === 0) {
    container.innerHTML = `<div class="card empty-state">Belum ada cabang. Tambahkan cabang pertama Anda (misalnya "Toko Pusat" untuk toko utama).</div>`;
    return;
  }
  container.innerHTML = `
    <div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nama Cabang</th><th>Alamat</th><th>No. HP</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${allCabang
              .map(
                (c) => `
              <tr>
                <td style="font-weight:600;">${escapeHtml(c.nama)}</td>
                <td style="color:var(--gray-500);">${escapeHtml(c.alamat || "-")}</td>
                <td style="color:var(--gray-500);">${escapeHtml(c.no_hp || "-")}</td>
                <td><span class="badge ${c.is_active !== false ? "badge-green" : "badge-red"}">${c.is_active !== false ? "Aktif" : "Nonaktif"}</span></td>
                <td style="text-align:right; white-space:nowrap;">
                  <button class="btn-secondary btn-sm" onclick="openCabangModal('${c.id}')">Edit</button>
                  <button class="btn-secondary btn-sm" onclick="toggleCabangActive('${c.id}', ${c.is_active === false})">
                    ${c.is_active === false ? "Aktifkan" : "Nonaktifkan"}
                  </button>
                </td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

function openCabangModal(id) {
  document.getElementById("cabang-form").reset();
  document.getElementById("cabang-form-alert").innerHTML = "";
  document.getElementById("cabang-id").value = "";
  document.getElementById("cabang-modal-title").textContent = "Tambah Cabang";
  if (id) {
    const c = allCabang.find((x) => x.id === id);
    if (!c) return;
    document.getElementById("cabang-id").value = c.id;
    document.getElementById("cabang-nama").value = c.nama || "";
    document.getElementById("cabang-alamat").value = c.alamat || "";
    document.getElementById("cabang-nohp").value = c.no_hp || "";
    document.getElementById("cabang-modal-title").textContent = "Edit Cabang";
  }
  document.getElementById("cabang-modal").style.display = "flex";
}
function closeCabangModal() {
  document.getElementById("cabang-modal").style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("cabang-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("cabang-id").value;
    const nama = document.getElementById("cabang-nama").value.trim();
    const alamat = document.getElementById("cabang-alamat").value.trim();
    const noHp = document.getElementById("cabang-nohp").value.trim();
    const alertBox = document.getElementById("cabang-form-alert");
    const btn = document.getElementById("cabang-submit-btn");
    alertBox.innerHTML = "";
    btn.disabled = true;
    try {
      if (id) {
        await db.collection("cabang").doc(id).update({ nama, alamat, no_hp: noHp });
      } else {
        await db.collection("cabang").add({
          nama,
          alamat,
          no_hp: noHp,
          is_active: true,
          created_at: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }
      showToast("Cabang tersimpan.", "success");
      closeCabangModal();
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${friendlyFirebaseError(err)}</div>`;
    } finally {
      btn.disabled = false;
    }
  });
});

async function toggleCabangActive(id, makeActive) {
  try {
    await db.collection("cabang").doc(id).update({ is_active: makeActive });
    showToast(makeActive ? "Cabang diaktifkan." : "Cabang dinonaktifkan.", "success");
  } catch (err) {
    showToast(friendlyFirebaseError(err), "error");
  }
}

// ---------- Migrasi data lama (sebelum fitur cabang ada) ----------
// Dua hal yang perlu dimigrasi sekali saja:
// 1) Pesanan lama yang belum punya field cabang_id -> diisi ke 1 cabang pilihan.
// 2) Akun "karyawan" lama (gaya lama, sebelum ada per-cabang) -> diubah jadi
//    role "admin_kasir". Dibedakan dari Karyawan cabang yang BARU lewat ada/
//    tidaknya field cabang_id (Karyawan cabang baru WAJIB punya cabang_id saat
//    dibuat), supaya migrasi ini aman dijalankan kapan saja tanpa salah ubah
//    akun Karyawan cabang yang baru dibuat setelah fitur ini ada.
let legacyOrdersCache = [];
let legacyUsersCache = [];

// Baca-ulang SELURUH koleksi "orders" & "users" cuma untuk mengecek data lama
// itu mahal (jumlah baca = jumlah dokumen) dan tidak perlu diulang tiap kali
// halaman ini dibuka -- begitu sudah dipastikan tidak ada data lama tersisa,
// simpan statusnya di config/migrasi_status supaya kunjungan berikutnya
// langsung skip pengecekan ini (cukup 1 baca, bukan baca seluruh koleksi).
async function checkMigrasiNeeded() {
  try {
    const statusDoc = await db.collection("config").doc("migrasi_status").get();
    if (statusDoc.exists && statusDoc.data().selesai === true) {
      return;
    }

    const [orderSnap, userSnap] = await Promise.all([
      db.collection("orders").get(),
      db.collection("users").get(),
    ]);
    legacyOrdersCache = orderSnap.docs.filter((d) => !d.data().cabang_id);
    legacyUsersCache = userSnap.docs.filter((d) => d.data().role === "karyawan" && !d.data().cabang_id);

    if (legacyOrdersCache.length === 0 && legacyUsersCache.length === 0) {
      // Tidak ada (atau sudah tidak ada) data lama -- tandai selesai supaya
      // halaman ini tidak perlu baca-ulang seluruh orders/users lagi ke depannya.
      await db.collection("config").doc("migrasi_status").set(
        { selesai: true, selesai_pada: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      return;
    }

    const card = document.getElementById("migrasi-card");
    const parts = [];
    if (legacyOrdersCache.length > 0) parts.push(`${legacyOrdersCache.length} pesanan lama belum punya cabang`);
    if (legacyUsersCache.length > 0) parts.push(`${legacyUsersCache.length} akun karyawan lama akan diubah jadi "Admin Kasir"`);
    document.getElementById("migrasi-desc").textContent =
      `Ditemukan: ${parts.join(" dan ")}. Pilih cabang tujuan untuk pesanan lama (biasanya "Toko Pusat"), lalu klik migrasikan. Aman diulang kapan saja -- data yang sudah dimigrasi tidak akan disentuh lagi.`;
    card.style.display = "block";
  } catch (err) {
    showToast("Gagal mengecek data migrasi: " + friendlyFirebaseError(err), "error");
  }
}

function fillMigrasiCabangOptions() {
  const select = document.getElementById("migrasi-cabang-target");
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = allCabang
    .filter((c) => c.is_active !== false)
    .map((c) => `<option value="${c.id}">${escapeHtml(c.nama)}</option>`)
    .join("");
  if (Array.from(select.options).some((o) => o.value === currentValue)) select.value = currentValue;
}

async function jalankanMigrasi() {
  const targetCabangId = document.getElementById("migrasi-cabang-target").value;
  if (legacyOrdersCache.length > 0 && !targetCabangId) {
    showToast("Pilih dulu cabang tujuan untuk pesanan lama.", "error");
    return;
  }
  const totalItem = legacyOrdersCache.length + legacyUsersCache.length;
  if (!confirm(`Migrasikan ${totalItem} data lama sekarang? Tindakan ini aman & tidak bisa mengganggu data yang sudah benar.`)) return;

  const btn = document.getElementById("migrasi-btn");
  btn.disabled = true;
  try {
    // Batch Firestore maksimal 500 operasi -- pecah jadi rombongan 400 supaya aman.
    const CHUNK = 400;
    for (let i = 0; i < legacyOrdersCache.length; i += CHUNK) {
      const batch = db.batch();
      legacyOrdersCache.slice(i, i + CHUNK).forEach((docSnap) => {
        batch.update(docSnap.ref, { cabang_id: targetCabangId });
      });
      await batch.commit();
    }
    for (let i = 0; i < legacyUsersCache.length; i += CHUNK) {
      const batch = db.batch();
      legacyUsersCache.slice(i, i + CHUNK).forEach((docSnap) => {
        batch.update(docSnap.ref, { role: "admin_kasir", cabang_id: null });
      });
      await batch.commit();
    }
    showToast("Migrasi selesai.", "success");
    document.getElementById("migrasi-card").style.display = "none";
    legacyOrdersCache = [];
    legacyUsersCache = [];
    await db.collection("config").doc("migrasi_status").set(
      { selesai: true, selesai_pada: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch (err) {
    showToast(friendlyFirebaseError(err), "error");
  } finally {
    btn.disabled = false;
  }
}
