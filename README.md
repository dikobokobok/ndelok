# Ndelok.me - Dashboard Infrastruktur Terintegrasi (v1.6.0)

**Ndelok.me** adalah dashboard manajemen infrastruktur real-time dengan performa tinggi yang dirancang untuk pengembangan lokal dan lingkungan produksi skala kecil. Platform ini menyediakan antarmuka terpadu untuk memantau kesehatan sistem, mengelola penyebaran proyek (deployment), dan menganalisis log server secara real-time dengan penyimpanan persisten.

![Project Banner](docs/images/dashboard.png)

## 🚀 Fitur Utama

- **Pemantauan Real-time**: Statistik OS secara langsung termasuk penggunaan CPU, RAM, dan Disk (per proyek) didukung oleh Socket.io.
- **Audit Trail & Keamanan**: Pencatatan otomatis setiap permintaan API yang mengubah status (POST/PATCH/DELETE) dengan pelacakan inisiator.
- **Manajemen Proyek**: Kendalikan layanan Anda (Mulai, Berhentikan, Restart, Edit, Hapus) dengan sekali klik.
- **Deployment Cerdas**: Proses kloning Git dan instalasi otomatis dengan dukungan branch/tag.
- **Upload File/Folder**: Deploy langsung dari file manager lokal tanpa perlu GitHub.
- **File Manager Terintegrasi**: Akses, edit, buat, hapus, rename, upload, dan download file/folder proyek langsung dari browser dengan Monaco Editor.
- **Log Aktivitas Terpusat**: Sistem pencatatan persisten dengan pemfilteran berbasis kategori (Keamanan, Deployment, Sistem, dll.).
- **Logika Shutdown Total**: Menjamin penghentian proses dan pembersihan port secara absolut saat menghentikan/menghapus proyek.
- **UI Modern**: Grid bergaya Bento, desain terinspirasi glassmorphism dengan grafik interaktif real-time.

---

## 📸 Tangkapan Layar

| Dashboard | Proyek |
|-----------|----------|
| ![Dashboard](docs/images/dashboard.png) | ![Projects](docs/images/projects.png) |

| Server | Log Audit |
|---------|------|
| ![Servers](docs/images/servers.png) | ![Logs](docs/images/logs.png) |

---

## 🛠️ Teknologi yang Digunakan

- **Frontend**: React + Vite (HMR diaktifkan)
- **Styling**: Tailwind CSS (Tema Gelap Premium)
- **Komunikasi**: Socket.io (Telemetri real-time & streaming log)
- **Layanan Backend**: Integrasi Vite Khusus (Middleware Bridge ke OS & Spawning Proses)
- **Database**: Persistensi berbasis file (`projects.json`, `system-logs.json`, `users.json`)

---

## ⚡ Memulai

### Prasyarat
- Node.js (v18+)
- Git terinstal di mesin host

### Instalasi

1. **Kloning repositori**:
   ```bash
   git clone https://github.com/dikobokobok/ndelok.git
   cd ndelok
   ```

2. **Instal dependensi**:
   ```bash
   npm install
   ```

3. **Jalankan dalam mode pengembangan**:
   ```bash
   npm run dev
   ```

4. **Akses dashboard**:
   Buka [http://localhost:5173](http://localhost:5173).

### Login Default

| Username | Password | Role |
|----------|----------|------|
| `ibnu` | `admin123` | owner |
| `admin` | `admin123` | admin |

---

## 📖 Panduan Penggunaan

### 1. Memantau Kesehatan Sistem
**Dashboard** menyediakan telemetri real-time dan widget **Aktivitas Terbaru** yang merangkum peristiwa sistem dan administratif terbaru.

### 2. Menyebarkan Proyek Baru
Buka halaman **Provision Workspace**.
- Pilih Pengenal Proyek yang unik.
- Berikan URL GitHub yang valid (mendukung tautan branch/tree).
- Tentukan perintah build dan runtime (misalnya, `npm install` dan `npm run dev`).

### 3. Mengelola Layanan
**Project Registry** memungkinkan Anda untuk:
- **Stop**: Mematikan pohon proses secara paksa dan membersihkan port.
- **Edit**: Memperbarui konfigurasi tanpa penyebaran ulang secara penuh.
- **Restart**: Mulai ulang dengan bersih melalui proses baru.

### 4. Pencatatan & Audit Terkategori
Bagian **Logs** menyediakan aliran terpadu dengan fitur-fitur canggih:
- **Filter Level**: Filter berdasarkan INFO, WARN, SUCCESS, atau ERROR.
- **Filter Kategori**: Isolasi log Keamanan, Deployment, Manajemen, atau Traffic.
- **Pelacakan Inisiator**: Lihat dengan tepat pengguna atau sistem mana yang memicu tindakan.
- **Kontrol Ekspor**: Simpan audit trail yang difilter ke dalam file `.txt` portabel.

---

## 🛡️ Lisensi
Lisensi MIT.

---

## 📋 Changelog

### v1.6.0 — 22 Mei 2026

#### ✨ Fitur Baru

- **Halaman Servers & Plugins Terpadu** — Server table dan section Plugins digabung dalam satu halaman terpusat untuk manajemen infrastruktur lebih ringkas.
- **Plugin ZeroTier dengan Workflow Pendaftaran** — Card ZeroTier dengan tiga state UI:
  - **Belum bergabung**: tombol Join Network dengan modal input Network ID (16 hex). Sistem mengeksekusi `sudo zerotier-cli join NETWORK_ID`.
  - **Sudah bergabung**: tampil info network (ID + tanggal join) dengan toggle service & tombol Leave.
  - **Toggle Service**: start → `sudo systemctl start zerotier-one`, stop → `sudo systemctl stop zerotier-one`. Pakai toggle switch bergaya neo-skeuomorphic (Uiverse).
  - **Leave Network**: tombol disabled jika service running. Wajib matikan service + verifikasi password sebelum eksekusi `sudo zerotier-cli leave NETWORK_ID`.
- **State Lokal ZeroTier** — Network yang didaftarkan via UI dicatat di `src/database/zerotier.json` agar tracking berbasis app, bukan auto-detect dari sistem.
- **Reusable PasswordInput Component** — Semua input password di seluruh app (Login, Settings, Servers, Projects, Sidebar) sekarang punya tombol mata 👁 untuk show/hide password. Komponen `<PasswordInput />` adalah drop-in replacement untuk `<input type="password" />`.

#### 🔧 Perbaikan

- **Auto-detect privilege ZeroTier** — Backend deteksi root vs non-root, skip `sudo` saat sudah root untuk hindari prompt password yang menggantung.
- **Path CLI Windows** — Auto-resolve path `C:\Program Files (x86)\ZeroTier\One\zerotier-cli.bat` di Windows.
- **Pesan error ZeroTier informatif** — Parse pola error umum (`connection failed`, `command not found`, `permission denied`) dengan saran perbaikan yang spesifik.
- **Idempotent service control** — Start/stop service tidak gagal jika status sudah sesuai (already running / already stopped).
- **Auto-start service sebelum join** — Daemon ZeroTier otomatis dipastikan running sebelum eksekusi `join`, dengan retry sekali jika gagal connection.

#### 🎨 UI/UX

- Card ZeroTier didesain ulang dengan layout flat single-card (tidak nested), header ringkas dengan dot indikator status (glow emerald saat online).
- Toggle switch service pakai style neo-skeuomorphic dengan thumb 12-dots glossy dan animasi slide halus.
- Tombol Leave berbentuk button solid merah (bukan outline lagi) — disabled saat service running.

---

### v1.5.0 — 21 Mei 2026

#### ✨ Fitur Baru

- **ZeroTier Leave Network** — Tombol untuk meninggalkan network ZeroTier dengan syarat:
  - Service wajib dalam kondisi OFF sebelum leave
  - Verifikasi password wajib sebelum eksekusi
  - Menjalankan `sudo zerotier-cli leave` dan reset config
- **Auto-Restart Project on Reboot** — Project yang statusnya "Running" sebelum server reboot akan otomatis jalan kembali. Project yang di-stop manual tetap mati.
- **Live Process Output (Project Logs)** — Halaman baru `/projects/:name/logs` menampilkan output stdout/stderr real-time dari proses project menggunakan xterm.js:
  - Output terminal asli dengan warna ANSI
  - Mode read-only (view only)
  - History buffer (500 entry terakhir)
  - Streaming real-time via Socket.io
  - Project di-spawn menggunakan PTY (node-pty) agar output identik dengan terminal asli
- **Port/Domain Access Type** — Saat deploy atau edit project, bisa memilih antara:
  - **Port** — Akses via `host:port` (mengikuti hostname yang digunakan user saat buka dashboard)
  - **Domain** — Akses via custom domain (misal `api.example.com`)
- **Smart Port Link** — Link port di project card sekarang menggunakan hostname yang sama dengan yang dipakai user membuka dashboard (localhost/IP lokal/IP publik)

#### 🔧 Perbaikan

- Project spawn menggunakan PTY (node-pty) menggantikan child_process.spawn — output lebih reliable dan mendukung warna ANSI
- Kill process diperbarui untuk kompatibel dengan PTY process

---

### v1.4.1 — 21 Mei 2026

#### ✨ Fitur Baru

- **Real Terminal (xterm.js + node-pty)** — Terminal yang identik dengan terminal OS asli (PowerShell di Windows, Bash di Linux). Support warna 256-color, cursor, interactive apps (vim, nano, top), tab completion, Ctrl+C, dan semua shortcut terminal.
- **ZeroTier VPN Control** — Kelola ZeroTier langsung dari dashboard (Settings → SSH & API Keys):
  - Join network dengan Network ID
  - Toggle on/off service via `systemctl` (Linux) atau `net start/stop` (Windows)
  - Status real-time (Online/Offline)
  - Config persisten di `zerotier.json`
- **System Power Control** — Tombol Shutdown & Reboot di sidebar (owner only) dengan verifikasi password, support Windows & Linux
- **Network Speed Monitor** — Card real-time di dashboard menampilkan download/upload speed (menggunakan systeminformation)
- **Dashboard Layout** — Resource cards (Storage, Memory, CPU, Network) dipindahkan ke atas, info cards (Health, Servers, Warnings, Offline) di bawah

#### 🔧 Perbaikan

- **Log sistem dibersihkan** — Hapus semua log fake/random (network connections, memory spike, traffic handling)
- **CPU warning di-throttle** — Hanya dicatat 1x per menit (sebelumnya setiap 2 detik), threshold WARN dinaikkan ke 75%
- **Audit log difilter** — Skip endpoint internal (verify-password, files/list, files/read, deploy-logs) agar tidak spam
- **Port diubah** ke 1234

#### 📦 Dependensi Baru

- `@xterm/xterm` — Terminal emulator di browser
- `@xterm/addon-fit` — Auto-resize terminal
- `@xterm/addon-web-links` — Clickable links di terminal
- `node-pty` — Pseudo-terminal backend (real shell session)

---

### v1.4.0 — 20 Mei 2026

#### ✨ Fitur Baru

- **Dual Upload Mode pada Deploy**
  - Opsi "Upload from GitHub" (hanya branch `main` yang didukung)
  - Opsi "Upload File" untuk upload langsung dari file manager lokal
  - Loading bar progress saat upload file/folder
  - Notifikasi sukses setelah upload selesai
  - Tampilan file/folder yang terupload mirip file manager (folder duluan, lalu file)

- **File Manager Terintegrasi** (`/projects/:name/files`)
  - Navigasi folder dengan breadcrumb
  - List view dengan kolom Name, Size, Modified, Actions
  - **CRUD lengkap**: Create file/folder, Read, Update (edit), Delete
  - **Monaco Editor** terintegrasi dengan syntax highlighting 20+ bahasa
  - Keyboard shortcut `Ctrl+S` untuk save
  - Right-click context menu (Open, Download, Rename, Delete)
  - Upload file ke direktori manapun
  - Download file individual
  - **Download folder sebagai ZIP** (streaming, tanpa file temp)
  - Tombol download ZIP di toolbar untuk current folder
  - Indikator "Unsaved" saat ada perubahan belum disimpan
  - Path traversal protection di backend

#### 🔧 Perbaikan

- Fix: File upload deploy sekarang mempertahankan struktur direktori (folder/subfolder)
- Fix: Validasi form deploy — mode file tidak lagi require GitHub URL
- Fix: Error "Deployment request rejected" saat upload file (endpoint baru `/api/project-deploy-upload`)

#### 📦 Dependensi Baru

- `busboy` — Multipart form parser untuk file upload
- `archiver` — ZIP streaming untuk download folder
- `@monaco-editor/react` — Code editor dengan syntax highlighting

---

### v1.3.0

- Rilis awal dengan dashboard, project management, deployment via GitHub, log audit, dan monitoring real-time.

---

*Dikembangkan dengan ❤️ oleh dikobokobok*
