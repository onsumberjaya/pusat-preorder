let allProducts = [];

window.onAuthReady = function () {
  listenProducts();
};

function listenProducts() {
  db.collection("products").orderBy("nama").onSnapshot(
    (snap) => {
      allProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderProducts();
    },
    (err) => {
      console.error(err);
      showToast("Gagal memuat produk: " + friendlyFirebaseError(err), "error");
    }
  );
}

function renderProducts() {
  const container = document.getElementById("product-list");
  if (allProducts.length === 0) {
    container.innerHTML = `<div class="card empty-state">Belum ada produk. Klik "Tambah Produk" untuk mulai.</div>`;
    return;
  }
  container.innerHTML = allProducts
    .map((p) => {
      const waves = p.waves || [];
      const waveRows = waves
        .map(
          (w) => `
        <tr>
          <td>${escapeHtml(w.label)} ${w.aktif ? '<span class="badge badge-green">Aktif</span>' : ""}</td>
          <td>${formatRupiah(w.harga)}</td>
          <td style="text-align:right; white-space:nowrap;">
            ${!w.aktif ? `<button class="btn-secondary btn-sm" onclick="setActiveWave('${p.id}','${w.id}')">Jadikan Aktif</button>` : ""}
            <button class="btn-secondary btn-sm" onclick='openWaveModal("${p.id}", ${JSON.stringify(w).replace(/'/g, "&#39;")})'>Edit</button>
            <button class="btn-danger btn-sm" onclick="deleteWave('${p.id}','${w.id}')">Hapus</button>
          </td>
        </tr>`
        )
        .join("");
      return `
      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
          <div>
            <h3 style="margin:0 0 4px;">${escapeHtml(p.nama)}</h3>
            <p style="margin:0; color:var(--gray-500); font-size:13.5px;">${escapeHtml(p.deskripsi || "")}</p>
            ${p.stok !== null && p.stok !== undefined ? `<p style="margin:4px 0 0; font-size:12.5px; color:var(--gray-500);">Stok: ${p.stok}</p>` : ""}
          </div>
          <div style="display:flex; gap:8px; flex-shrink:0;">
            <button class="btn-secondary btn-sm" onclick='openProductModal(${JSON.stringify(p).replace(/'/g, "&#39;")})'>Edit</button>
            <button class="btn-danger btn-sm" onclick="deleteProduct('${p.id}')">Hapus</button>
          </div>
        </div>
        <div class="table-wrap" style="margin-top:14px;">
          <table>
            <thead><tr><th>Gelombang</th><th>Harga</th><th></th></tr></thead>
            <tbody>${waveRows || '<tr><td colspan="3" style="color:var(--gray-400);">Belum ada gelombang harga</td></tr>'}</tbody>
          </table>
        </div>
        <button class="btn-secondary btn-sm" style="margin-top:10px;" onclick="openWaveModal('${p.id}')">+ Tambah Gelombang</button>
      </div>`;
    })
    .join("");
}

// ---------- Produk ----------
function openProductModal(product) {
  document.getElementById("product-modal-title").textContent = product ? "Edit Produk" : "Tambah Produk";
  document.getElementById("product-id").value = product ? product.id : "";
  document.getElementById("product-nama").value = product ? product.nama : "";
  document.getElementById("product-deskripsi").value = product ? product.deskripsi || "" : "";
  document.getElementById("product-stok").value = product && product.stok !== null && product.stok !== undefined ? product.stok : "";
  document.getElementById("product-modal").style.display = "flex";
}
function closeProductModal() {
  document.getElementById("product-modal").style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("product-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("product-id").value;
    const nama = document.getElementById("product-nama").value.trim();
    const deskripsi = document.getElementById("product-deskripsi").value.trim();
    const stokVal = document.getElementById("product-stok").value;
    const stok = stokVal === "" ? null : Number(stokVal);

    try {
      if (id) {
        await db.collection("products").doc(id).update({ nama, deskripsi, stok });
      } else {
        await db.collection("products").add({
          nama,
          deskripsi,
          stok,
          waves: [],
          created_at: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }
      showToast("Produk tersimpan.", "success");
      closeProductModal();
    } catch (err) {
      showToast(friendlyFirebaseError(err), "error");
    }
  });

  document.getElementById("wave-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const productId = document.getElementById("wave-product-id").value;
    const waveId = document.getElementById("wave-id").value;
    const label = document.getElementById("wave-label").value.trim();
    const harga = Number(document.getElementById("wave-harga").value);

    const product = allProducts.find((p) => p.id === productId);
    if (!product) return;
    let waves = [...(product.waves || [])];

    if (waveId) {
      waves = waves.map((w) => (w.id === waveId ? { ...w, label, harga } : w));
    } else {
      const newWave = {
        id: "w_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        label,
        harga,
        aktif: waves.length === 0, // gelombang pertama otomatis aktif
      };
      waves.push(newWave);
    }

    try {
      await db.collection("products").doc(productId).update({ waves });
      showToast("Gelombang tersimpan.", "success");
      closeWaveModal();
    } catch (err) {
      showToast(friendlyFirebaseError(err), "error");
    }
  });
});

async function deleteProduct(id) {
  if (!confirm("Hapus produk ini beserta semua gelombang harganya? Pesanan lama yang sudah ada tidak akan terhapus.")) return;
  try {
    await db.collection("products").doc(id).delete();
    showToast("Produk dihapus.", "success");
  } catch (err) {
    showToast(friendlyFirebaseError(err), "error");
  }
}

// ---------- Gelombang ----------
function openWaveModal(productId, wave) {
  document.getElementById("wave-modal-title").textContent = wave ? "Edit Gelombang" : "Tambah Gelombang";
  document.getElementById("wave-product-id").value = productId;
  document.getElementById("wave-id").value = wave ? wave.id : "";
  document.getElementById("wave-label").value = wave ? wave.label : "";
  document.getElementById("wave-harga").value = wave ? wave.harga : "";
  document.getElementById("wave-modal").style.display = "flex";
}
function closeWaveModal() {
  document.getElementById("wave-modal").style.display = "none";
}

async function setActiveWave(productId, waveId) {
  const product = allProducts.find((p) => p.id === productId);
  if (!product) return;
  const waves = (product.waves || []).map((w) => ({ ...w, aktif: w.id === waveId }));
  try {
    await db.collection("products").doc(productId).update({ waves });
    showToast("Gelombang aktif diperbarui.", "success");
  } catch (err) {
    showToast(friendlyFirebaseError(err), "error");
  }
}

async function deleteWave(productId, waveId) {
  if (!confirm("Hapus gelombang harga ini?")) return;
  const product = allProducts.find((p) => p.id === productId);
  if (!product) return;
  const waves = (product.waves || []).filter((w) => w.id !== waveId);
  try {
    await db.collection("products").doc(productId).update({ waves });
    showToast("Gelombang dihapus.", "success");
  } catch (err) {
    showToast(friendlyFirebaseError(err), "error");
  }
}
