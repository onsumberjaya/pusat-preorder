const NAV_ITEMS = [
  { href: "pesanan.html", icon: "📋", label: "Daftar Pesanan", ownerOnly: false },
  { href: "input-pesanan.html", icon: "➕", label: "Input Pesanan", ownerOnly: false },
  { href: "dashboard.html", icon: "📊", label: "Dashboard", ownerOnly: false },
  { href: "produk.html", icon: "🌱", label: "Produk & Gelombang", ownerOnly: true },
  { href: "pengguna.html", icon: "👥", label: "Akun Pengguna", ownerOnly: true },
  { href: "toko.html", icon: "🏪", label: "Profil Toko", ownerOnly: true },
  { href: "laporan.html", icon: "📈", label: "Laporan & Export", ownerOnly: true },
];

function renderSidebar(profile) {
  const currentPage = location.pathname.split("/").pop() || "pesanan.html";

  const navHtml = NAV_ITEMS.filter((item) => !item.ownerOnly || profile.role === "owner")
    .map(
      (item) => `
      <a class="nav-item ${item.href === currentPage ? "active" : ""}" href="${item.href}">
        <span>${item.icon}</span><span>${item.label}</span>
      </a>`
    )
    .join("");

  const sidebar = document.getElementById("sidebar");
  if (sidebar) {
    sidebar.innerHTML = `
      <div class="sidebar-brand">
        <span class="logo">🌾</span>
        <div>
          <h1>Benih Preorder</h1>
          <p>Sistem Pesanan</p>
        </div>
      </div>
      <div class="sidebar-nav">${navHtml}</div>
    `;
  }

  renderPageTopbar(profile);
  ensureChangePasswordModal();

  const topbar = document.getElementById("mobile-topbar");
  if (topbar) {
    topbar.innerHTML = `
      <span class="logo">🌾 Benih Preorder</span>
      <button onclick="toggleSidebar()">☰</button>
    `;
  }

  const overlay = document.getElementById("sidebar-overlay");
  if (overlay) overlay.onclick = () => toggleSidebar(false);

  if (localStorage.getItem("sidebarHidden") === "1") {
    document.body.classList.add("sidebar-hidden");
  }
}

function renderPageTopbar(profile) {
  const main = document.querySelector("main.content");
  if (!main) return;

  const roleLabel = profile.role === "owner" ? "Owner" : "Karyawan";
  const displayName = escapeHtml(profile.full_name || profile.username || "");

  let bar = document.getElementById("page-topbar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "page-topbar";
    bar.className = "page-topbar";
    main.prepend(bar);
  }
  bar.innerHTML = `
    <button type="button" class="sidebar-toggle-btn" onclick="toggleDesktopSidebar()" title="Sembunyikan/Tampilkan menu">☰</button>
    <div class="account-menu">
      <button type="button" class="account-menu-btn" onclick="toggleAccountMenu(event)">
        <span>Akun</span><span style="color:var(--gray-400);">›</span><span>${roleLabel}${displayName ? " / " + displayName : ""}</span>
        <span style="color:var(--gray-400); font-size:11px;">▼</span>
      </button>
      <div class="account-menu-panel" id="account-menu-panel">
        <button type="button" onclick="closeAccountMenu(); openChangePasswordModal();">🔑 Ganti Password Saya</button>
        <button type="button" onclick="closeAccountMenu(); logout();">🚪 Keluar</button>
      </div>
    </div>
  `;
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
