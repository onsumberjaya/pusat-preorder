# Panduan Setup — Aplikasi Manajemen Pesanan Benih (Versi Web Gratis)

Aplikasi ini murni HTML/CSS/JavaScript — **tidak perlu install Python, Node, atau server apapun**
di komputer Anda. Database dan login memakai **Firebase** (gratis dari Google, tanpa kartu kredit).
Hosting online memakai **GitHub Pages** (gratis).

Ikuti langkah-langkah ini secara berurutan.

---

## BAGIAN 1 — Buat Project Firebase (gratis, ±10 menit)

1. Buka https://console.firebase.google.com, login pakai akun Google Anda.
2. Klik **Add project** / **Tambahkan project**.
3. Beri nama, misalnya `preorder-benih`. Klik **Continue**.
4. Kalau ditawari Google Analytics, boleh **dimatikan saja** (tidak perlu). Klik **Create project**.
5. Tunggu sampai selesai, klik **Continue**.

### 1a. Aktifkan Authentication (untuk login)
1. Di menu kiri, klik **Build → Authentication**.
2. Klik **Get started**.
3. Pilih tab **Sign-in method** → klik **Email/Password** → aktifkan toggle-nya → **Save**.

### 1b. Aktifkan Firestore Database (untuk data)
1. Di menu kiri, klik **Build → Firestore Database**.
2. Klik **Create database**.
3. Pilih lokasi server, misalnya `asia-southeast2 (Jakarta)` atau `asia-southeast1 (Singapore)` — pilih yang terdekat.
4. Pilih mode **Start in production mode** → **Enable**.

### 1c. Pasang Aturan Keamanan
1. Masih di halaman Firestore, klik tab **Rules**.
2. **Hapus semua isi kotak teks itu**, lalu buka file `firestore.rules` yang ada di folder project ini,
   **copy semua isinya**, dan **paste** ke kotak tadi.
3. Klik **Publish**.

### 1d. Ambil Firebase Config (kunci penghubung)
1. Klik ikon **gerigi (⚙️)** di pojok kiri atas → **Project settings**.
2. Scroll ke bawah ke bagian **Your apps**. Klik ikon **`</>`** (Web).
3. Beri nama app, misalnya `preorder-benih-web` → klik **Register app**.
4. Akan muncul kode seperti ini — **copy bagian `firebaseConfig` saja**:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "preorder-benih.firebaseapp.com",
     projectId: "preorder-benih",
     storageBucket: "preorder-benih.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef123456"
   };
   ```
5. Buka file `js/firebase-config.js` di folder project ini pakai Notepad.
6. Ganti bagian `firebaseConfig` di file itu dengan yang baru saja Anda copy. Simpan file.

---

## BAGIAN 2 — Buat Akun Owner Pertama (manual, sekali saja)

Karena ini akun **pertama**, harus dibuat manual lewat Firebase Console (setelah itu, akun baru bisa
dibuat langsung dari dalam aplikasi lewat menu **Akun Pengguna**).

### 2a. Buat akun login-nya
1. Firebase Console → **Authentication** → tab **Users** → klik **Add user**.
2. **Email**: ketik `admin@benihpreorder.local`
   *(catatan: "benihpreorder.local" harus SAMA PERSIS dengan `FAKE_EMAIL_DOMAIN` di file `js/firebase-config.js` — defaultnya sudah sama, tidak perlu diubah kalau Anda belum mengubah file itu)*
3. **Password**: buat password, misalnya `admin123` (nanti bisa diganti dari dalam aplikasi).
4. Klik **Add user**.
5. Setelah user muncul di daftar, **klik usernya**, lalu **copy "User UID"** yang muncul (contoh: `aB3dEfGh...`).

### 2b. Buat profil datanya di Firestore
1. Firebase Console → **Firestore Database** → tab **Data**.
2. Klik **Start collection**. Collection ID: `users` → **Next**.
3. **Document ID**: paste User UID yang Anda copy tadi (JANGAN pakai "Auto-ID").
4. Tambahkan field-field berikut (klik **Add field** untuk masing-masing):
   | Field | Type | Value |
   |---|---|---|
   | username | string | admin |
   | full_name | string | Owner |
   | role | string | owner |
   | is_active | boolean | true |
5. Klik **Save**.

Selesai! Akun pertama Anda: **username `admin`, password `admin123`**.

---

## BAGIAN 3 — Coba Dulu di Komputer (tanpa install apapun)

Karena file-nya HTML biasa, Anda bisa buka langsung:
1. Buka folder project ini di File Explorer.
2. Klik dua kali file `index.html` — akan terbuka di browser.
3. Login dengan `admin` / `admin123`.

> Catatan: sebagian browser membatasi fitur tertentu saat membuka file HTML langsung (`file://`).
> Kalau ada kejanggalan, lanjut saja ke Bagian 4 (hosting online) — di sana semua akan berjalan normal.

Setelah login, langsung isi dulu:
- **Profil Toko** — nama, alamat, no HP toko Anda
- **Produk & Gelombang** — tambahkan produk dan harga per gelombang
- **Akun Pengguna** — buat akun untuk karyawan Anda

---

## BAGIAN 4 — Online-kan Gratis lewat GitHub Pages

### 4a. Upload ke GitHub
1. Buat akun gratis di https://github.com kalau belum punya.
2. Install **GitHub Desktop** (https://desktop.github.com/), login dengan akun GitHub Anda.
3. Buat repository baru di GitHub Desktop:
   - **File → New Repository**
   - Name: `preorder-benih-web`
   - Local Path: pilih folder project ini
   - Klik **Create Repository**
4. Klik **Publish repository** (pastikan **tidak dicentang** "Keep this code private" kalau ingin akses gratis penuh dari GitHub Pages — repo publik tidak masalah karena `firebaseConfig` memang aman untuk terbuka, keamanan sesungguhnya ada di Firestore Rules yang sudah kita pasang).

### 4b. Aktifkan GitHub Pages
1. Buka repository Anda di browser (github.com).
2. Klik tab **Settings** → menu kiri **Pages**.
3. Di bagian **Build and deployment → Source**, pilih **Deploy from a branch**.
4. **Branch**: pilih `main`, folder `/ (root)` → **Save**.
5. Tunggu 1-2 menit, refresh halaman itu — akan muncul URL seperti:
   ```
   https://namaanda.github.io/preorder-benih-web/
   ```
   Itu alamat aplikasi Anda yang sudah online dan bisa diakses dari mana saja (HP, komputer lain, dll).

### 4c. Update ke depannya
Setiap kali Anda edit file (misalnya minta saya tambah fitur lagi), tinggal:
1. Buka GitHub Desktop
2. Akan muncul daftar perubahan file
3. Isi ringkasan singkat di kolom bawah kiri, klik **Commit to main**
4. Klik **Push origin**
5. Tunggu ±1 menit, situs online otomatis ter-update

---

## Batasan yang Perlu Diketahui

- **Ganti password**: Owner tidak bisa langsung mengatur ulang password akun karyawan lain (batasan
  keamanan Firebase tanpa server backend). Tiap orang ganti password sendiri lewat menu
  "Ganti Password Saya" di sidebar. Kalau karyawan lupa password, solusinya: nonaktifkan akun lama,
  buat akun baru untuknya.
- **Domain**: alamat `namaanda.github.io/...` gratis selamanya. Kalau nanti ingin domain sendiri
  seperti `tokobenih.com`, itu perlu beli domain (~Rp150rb/tahun) lalu dihubungkan ke GitHub Pages
  (saya bisa bantu kalau saatnya tiba).
- **Batas gratis Firebase**: sangat longgar untuk toko kecil-menengah (50.000 baca data per hari,
  20.000 tulis per hari) — kemungkinan besar tidak akan pernah tersentuh untuk pemakaian normal.
