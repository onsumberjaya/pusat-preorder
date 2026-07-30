const NAV_ITEMS = [
  { href: "toko.html", icon: "ph-storefront", label: "Profil Toko", ownerOnly: true },
  { href: "cabang.html", icon: "ph-git-branch", label: "Kelola Cabang", ownerOnly: true },
  { href: "pengguna.html", icon: "ph-users-three", label: "Akun Pengguna", ownerOnly: true },
  { href: "dashboard.html", icon: "ph-chart-line-up", label: "Dashboard", ownerOnly: false },
  { href: "input-pesanan.html", icon: "ph-plus-circle", label: "Input Pesanan", ownerOnly: false },
  { href: "pesanan.html", icon: "ph-clipboard-text", label: "Daftar Pesanan", ownerOnly: false },
  { href: "produk.html", icon: "ph-plant", label: "Produk & Batch", ownerOnly: true },
  { href: "laporan.html", icon: "ph-file-arrow-down", label: "Laporan & Export", ownerOnly: false },
];

function renderSidebar(profile) {
  const currentPage = location.pathname.split("/").pop() || "pesanan.html";

  const navHtml = NAV_ITEMS.filter((item) => !item.ownerOnly || profile.role === "owner")
    .map(
      (item) => `
      <a class="nav-item ${item.href === currentPage ? "active" : ""}" href="${item.href}">
        <i class="ph-bold ${item.icon}"></i><span>${item.label}</span>
      </a>`
    )
    .join("");

  const sidebar = document.getElementById("sidebar");
  if (sidebar) {
    sidebar.innerHTML = `
      <div class="sidebar-brand">
        <div class="logo"><i class="ph-bold ph-plant"></i></div>
        <div>
          <h1>TOKO SUMBER JAYA</h1>
          <p class="app-meta">Sistem Manajemen Pesanan Preorder <span class="app-version">v1.26.7</span></p>
        </div>
      </div>
      <div class="sidebar-nav">${navHtml}</div>
    `;
  }

  renderTopbar(profile);
  fillTopbarCabangName(profile);
  ensureChangePasswordModal();

  const overlay = document.getElementById("sidebar-overlay");
  if (overlay) overlay.onclick = () => toggleSidebar(false);

  if (localStorage.getItem("sidebarHidden") === "1") {
    document.body.classList.add("sidebar-hidden");
  }
}

function renderTopbar(profile) {
  const topbar = document.getElementById("mobile-topbar");
  if (!topbar) return;

  const displayName = escapeHtml(profile.full_name || profile.username || "");
  const initials = (profile.full_name || profile.username || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

  topbar.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px;">
      <button class="topbar-toggle-btn" onclick="toggleMenu()" title="Sembunyikan/Tampilkan menu"><i class="ph-bold ph-list"></i></button>
      <span class="logo"><span class="logo-icon"><i class="ph-bold ph-plant"></i></span>Benih Preorder</span>
    </div>
    <div class="account-menu">
      <button type="button" class="account-menu-btn" onclick="toggleAccountMenu(event)">
        <span class="avatar">${escapeHtml(initials)}</span>
        <span>${displayName || "Akun"}</span>
        <i class="ph ph-caret-down" style="color:var(--gray-400); font-size:11px;"></i>
      </button>
      <div class="account-menu-panel" id="account-menu-panel">
        <div style="padding:8px 12px; font-size:12px; color:var(--gray-500); border-bottom:1px solid var(--gray-100); margin-bottom:4px;">
          <span id="topbar-role-text">${escapeHtml(roleLabel(profile.role))}</span>${displayName ? " · " + displayName : ""}
        </div>
        <button type="button" onclick="closeAccountMenu(); openChangePasswordModal();"><i class="ph ph-key"></i> Ganti Password </button>
        <button type="button" onclick="closeAccountMenu(); logout();"><i class="ph ph-sign-out"></i> Keluar</button>
      </div>
    </div>
  `;
}

// Isi nama cabang di sebelah label role (kalau user ini Karyawan cabang),
// dilakukan async terpisah dari renderTopbar supaya render awal tidak perlu
// menunggu 1 kali baca dokumen cabang lagi.
async function fillTopbarCabangName(profile) {
  if (profile.role !== "karyawan" || !profile.cabang_id) return;
  try {
    const doc = await db.collection("cabang").doc(profile.cabang_id).get();
    const el = document.getElementById("topbar-role-text");
    if (doc.exists && el) {
      el.textContent = `${roleLabel(profile.role)} · ${doc.data().nama}`;
    }
  } catch (err) {
    // Diamkan saja -- ini cuma teks pelengkap di topbar, bukan hal kritis.
  }
}

function toggleMenu() {
  const isMobile = window.matchMedia("(max-width: 860px)").matches;
  if (isMobile) {
    toggleSidebar();
  } else {
    toggleDesktopSidebar();
  }
}

function toggleDesktopSidebar() {
  const hidden = document.body.classList.toggle("sidebar-hidden");
  localStorage.setItem("sidebarHidden", hidden ? "1" : "0");
}

function toggleAccountMenu(e) {
  if (e) e.stopPropagation();
  const panel = document.getElementById("account-menu-panel");
  if (panel) panel.classList.toggle("open");
}
function closeAccountMenu() {
  const panel = document.getElementById("account-menu-panel");
  if (panel) panel.classList.remove("open");
}
document.addEventListener("click", closeAccountMenu);

function toggleSidebar(forceState) {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const isOpen = forceState !== undefined ? forceState : !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", isOpen);
  if (overlay) overlay.classList.toggle("open", isOpen);
}

function ensureChangePasswordModal() {
  if (document.getElementById("change-password-modal")) return;
  const div = document.createElement("div");
  div.innerHTML = `
    <div class="modal-backdrop" id="change-password-modal" style="display:none;">
      <div class="modal-box">
        <h3 style="margin-top:0;">Ganti Password Saya</h3>
        <form id="change-password-form">
          <div class="field">
            <label>Password Saat Ini *</label>
            <input type="password" id="cp-current" required />
          </div>
          <div class="field">
            <label>Password Baru * (minimal 6 karakter)</label>
            <input type="password" id="cp-new" required minlength="6" />
          </div>
          <div id="cp-alert"></div>
          <div style="display:flex; gap:10px; margin-top:18px;">
            <button type="submit" class="btn-primary" style="flex:1; justify-content:center;" id="cp-submit">Simpan</button>
            <button type="button" class="btn-secondary" onclick="closeChangePasswordModal()">Batal</button>
          </div>
        </form>
      </div>
    </div>`;
  document.body.appendChild(div.firstElementChild);

  document.getElementById("change-password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById("cp-current").value;
    const newPassword = document.getElementById("cp-new").value;
    const alertBox = document.getElementById("cp-alert");
    const btn = document.getElementById("cp-submit");
    alertBox.innerHTML = "";
    btn.disabled = true;
    try {
      const user = auth.currentUser;
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(newPassword);
      showToast("Password berhasil diganti.", "success");
      closeChangePasswordModal();
    } catch (err) {
      alertBox.innerHTML = `<div class="alert alert-error">${friendlyFirebaseError(err)}</div>`;
    } finally {
      btn.disabled = false;
    }
  });
}

function openChangePasswordModal() {
  document.getElementById("change-password-form").reset();
  document.getElementById("cp-alert").innerHTML = "";
  document.getElementById("change-password-modal").style.display = "flex";
}
function closeChangePasswordModal() {
  document.getElementById("change-password-modal").style.display = "none";
}
