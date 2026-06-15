# Ndelok.me - Dashboard Infrastruktur Terintegrasi (v1.15.2)

**Ndelok.me** adalah dashboard manajemen infrastruktur real-time dengan performa tinggi yang dirancang untuk pengembangan lokal dan lingkungan produksi skala kecil. Platform ini menyediakan antarmuka terpadu untuk memantau kesehatan sistem, mengelola penyebaran proyek, menganalisis log server secara real-time, serta mengontrol resource sistem melalui AI Copilot maupun panel kontrol native.

![Project Banner](docs/images/dashboard.png)

---

## 🚀 Fitur Utama

- **Pemantauan Real-time**: Statistik OS (CPU, RAM, Disk, Network Speed) langsung via Socket.IO
- **🤖 AI Copilot — Aira**: Asisten IT Support berbasis OpenCode Zen AI (gratis, tanpa API key), mampu mendiagnosis masalah, mengontrol proyek, membaca file, dan mengeksekusi perintah terminal
- **⚡ Resource Optimizer**: Panel kontrol native untuk Optimize CPU, Free Memory, dan Clean Storage tanpa perlu AI
- **Manajemen Proyek**: Start, Stop, Restart, Edit, Hapus layanan dengan sekali klik
- **Deployment Cerdas**: Kloning Git otomatis atau upload file lokal langsung dari browser
- **File Manager Terintegrasi**: Monaco Editor, CRUD file/folder, upload, download ZIP streaming
- **Tmux Session Manager**: Terminal yang tetap hidup di background server meski browser ditutup
- **ZeroTier VPN Plugin**: Join/leave network mesh VPN, toggle service, dari dalam dashboard
- **Cloudflare Tunnel Plugin**: Expose dashboard ke internet secara aman (quick tunnel / custom token)
- **Real Terminal**: PowerShell/Bash interaktif langsung di browser via xterm.js + node-pty
- **System Power Control**: Shutdown & Reboot server (owner only) dengan verifikasi password
- **Audit Trail**: Log terkategori persisten dengan filter level, kategori, dan inisiator

---

## 📸 Tangkapan Layar

| Dashboard | Proyek |
|-----------|--------|
| ![Dashboard](docs/images/dashboard.png) | ![Projects](docs/images/projects.png) |

| Server | Log Audit |
|--------|-----------|
| ![Servers](docs/images/servers.png) | ![Logs](docs/images/logs.png) |

---

## 🛠️ Teknologi yang Digunakan

- **Frontend**: React 18 + Vite (HMR untuk development)
- **Styling**: Tailwind CSS (Tema Gelap Premium)
- **Komunikasi**: Socket.IO (Telemetri real-time & streaming log)
- **Backend (Dev)**: `vite.config.js` — API & Socket.IO berjalan dalam proses Vite
- **Backend (Production)**: `server.js` — Node.js HTTP server native, serve `dist/`
- **AI**: OpenCode Zen API (gratis — model `deepseek-v4-flash-free`, support function calling)
- **Terminal**: xterm.js + node-pty (PTY real shell)
- **Database**: File-based persistence (JSON di `src/database/`)

---

## ⚡ Memulai

### Prasyarat
- Node.js (v18+)
- npm (v9+)
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

3. **Salin dan isi file environment**:
   ```bash
   cp .env.example .env
   # Edit .env — isi NDELOK_JWT_SECRET dengan string acak minimal 32 karakter
   ```

---

## 🖥️ Mode Development

```bash
npm run dev
```

Akses di: **http://localhost:1234**

> Backend API + Socket.IO berjalan sebagai Vite middleware dalam proses yang sama. Tidak perlu menjalankan server terpisah.

---

## 🚀 Mode Production

**1. Build frontend:**
```bash
npm run build
```

**2. Jalankan production server:**
```bash
npm start
# atau: node server.js
```

Akses di: **http://0.0.0.0:1234**

### Dengan PM2 (rekomendasi untuk VPS):

```bash
npm install pm2 -g
npm run build
pm2 start npm --name "ndelok" -- start
pm2 save && pm2 startup
```

### Dengan install.sh (otomatis, Linux/VPS):

```bash
chmod +x install.sh
./install.sh
```

> **Catatan:** Jalankan sebagai `root` di server Linux.

---

## 🤖 AI Copilot — Aira

Aira adalah asisten IT Support berbasis **OpenCode Zen AI** yang terintegrasi dalam aplikasi. **Gratis, tanpa perlu API key.**

Cukup klik ikon chat di pojok kanan bawah aplikasi untuk mulai menggunakan.

**Kemampuan Aira:**
- Mendiagnosis masalah jaringan, software, dan hardware
- Mengecek status CPU, RAM, dan penyimpanan sistem
- Mengontrol proyek (start/stop/restart)
- Membaca dan menulis file di workspace
- Mengeksekusi perintah terminal
- Merespons dalam Bahasa Indonesia

### Model AI Gratis Tersedia
- `deepseek-v4-flash-free` (default) — 200K context, support tool calling
- `north-mini-code-free` — 128K context
- `nemotron-3-ultra-free` — 128K context
- `mimo-v2.5-free` — 131K context

> Semua model gratis tanpa biaya (`cost: 0`). Powered by [OpenCode Zen API](https://opencode.ai/zen).

---

## ⚡ Resource Optimizer

Panel kontrol resource native tersedia di halaman **Servers → Plugins** tanpa memerlukan API key:

| Tombol | Fungsi |
|--------|--------|
| **Optimize CPU** | Membersihkan proses zombie (Failed/Stopped) |
| **Free Memory** | Membebaskan buffer cache RAM |
| **Clean Storage** | Rotasi log sistem, membebaskan ruang disk |

Bar progres real-time menampilkan penggunaan CPU, RAM, dan Disk yang diperbarui setiap 2 detik.

---

## 🔐 Login Default

| Username | Password | Role |
|----------|----------|------|
| `ibnu` | `admin123` | owner |
| `admin` | `admin123` | admin |

> **Penting:** Ganti password default segera setelah login pertama melalui **Settings → Users**.

---

## 🔒 Tips Keamanan Production

- Isi `NDELOK_JWT_SECRET` dengan string acak yang kuat (min. 32 karakter)
- Buka port firewall: `ufw allow 1234`
- Untuk HTTPS, gunakan Nginx sebagai reverse proxy:
  ```nginx
  server {
      listen 80;
      server_name yourdomain.com;
      location / {
          proxy_pass http://localhost:1234;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection "upgrade";
          proxy_set_header Host $host;
      }
  }
  ```

---

## 📖 Panduan Penggunaan

### 1. Dashboard
Memantau telemetri real-time: CPU, RAM, Disk, Network Speed, dan aktivitas terbaru sistem.

### 2. Deploy Proyek Baru
Buka **Provision Workspace**:
- **GitHub**: Masukkan URL repo + branch, tentukan install & run command
- **Upload File**: Upload folder project langsung dari komputer

### 3. Mengelola Layanan
**Project Registry** — Stop, Edit, Restart, Delete, atau buka File Manager/Logs proyek.

### 4. Servers & Plugins
- Monitoring node server aktif (IP, OS, Uptime)
- **ZeroTier**: Join/leave VPN mesh network
- **Tmux**: Buat sesi terminal background yang persist
- **Resource Optimizer**: Kontrol CPU, RAM, Disk secara manual

### 5. AI Copilot (Aira)
Klik ikon chat di pojok kanan bawah untuk membuka AI Support. Aira bisa membantu troubleshoot, cek resource, atau mengontrol proyek dengan perintah bahasa alami.

---

## 🛡️ Lisensi
Lisensi MIT.

---

## 📋 Changelog

### v1.15.2 — 15 Juni 2026

#### ✨ Fitur Baru

- **OpenCode Zen AI (Gratis)** — Migrasi dari Google Gemini API ke OpenCode Zen API:
  - Tidak perlu API Key — gratis untuk semua pengguna
  - Model default: `deepseek-v4-flash-free` (200K context, support tool calling)
  - Alternatif model gratis: `north-mini-code-free`, `nemotron-3-ultra-free`, `mimo-v2.5-free`
  - Format API: OpenAI Chat Completions (kompatibel dengan ecosystem luas)

#### 🔧 Perbaikan

- Hapus panel konfigurasi API Key di Settings dan AI Chat popup
- Hapus banner peringatan "Gemini API Key Required"
- Semua referensi "Gemini" diganti menjadi "OpenCode AI"
- Bersihkan kode yang tidak terpakai terkait konfigurasi API key

---

### v1.15.1 — 15 Juni 2026

#### ✨ Fitur Baru

- **Resource Optimizer Plugin** — Card baru di halaman Servers menampilkan bar progres CPU, RAM, dan Disk secara real-time. Tiga tombol aksi:
  - **Optimize CPU** — membersihkan proses zombie (`POST /api/system/optimize-cpu`)
  - **Free Memory** — membebaskan buffer cache RAM (`POST /api/system/clean-ram`)
  - **Clean Storage** — rotasi log sistem (`POST /api/system/clean-storage`)
- **Graceful Gemini Error Handling** — Error API Gemini kini ditangkap dengan pesan Bahasa Indonesia yang ramah:
  - **401 UNAUTHENTICATED** → Panduan mendapatkan API Key yang benar dari AI Studio
  - **429 RESOURCE_EXHAUSTED** → Pesan kuota habis + arahan ke panel Resource Optimizer native

#### 🔧 Perbaikan

- Endpoint kontrol resource tersinkronisasi di `server.js` (production) dan `vite.config.js` (development)
- Error handler AI tidak lagi menampilkan raw stack trace ke pengguna

---

### v1.8.0 — 15 Juni 2026

#### ✨ Fitur Baru

- **AI Copilot Aira** — Persona AI Aira (Lead IT Support Specialist) dikonfigurasi via `systemInstruction` Gemini API. Merespons dalam Bahasa Indonesia dengan tone ramah, efisien, dan terstruktur
- **Project Profile Database** — `src/database/project-profile.json` berisi dokumentasi lengkap arsitektur, API routes, Socket.IO events, dan panduan penggunaan untuk referensi Aira
- **Tmux Session Manager** — Sesi terminal background yang tetap hidup meski browser ditutup
- **Auto-start Cloudflare Tunnel** — Dev mode otomatis memulai tunnel saat startup

---

### v1.7.0 — 27 Mei 2026

#### ✨ Fitur Baru

- **Production Server (`server.js`)** — Backend dipisah dari Vite plugin menjadi server Node.js mandiri
- **Script `npm start`** — Menjalankan production server dari `package.json`
- **SPA Fallback** — Route tidak dikenal diarahkan ke `index.html` untuk React Router
- **Static Asset Caching** — File dengan hash di-cache dengan `Cache-Control: immutable`

#### 🔧 Perbaikan

- `install.sh` diperbarui untuk `npm start` production mode
- `index.html` ditambah `translate="no"` agar icon tidak diterjemahkan

---

### v1.6.0 — 22 Mei 2026

#### ✨ Fitur Baru

- **Halaman Servers & Plugins Terpadu** — Server table dan section Plugins digabung
- **Plugin ZeroTier** — Join/leave VPN mesh network dengan toggle service neo-skeuomorphic
- **State Lokal ZeroTier** — Network dicatat di `src/database/zerotier.json`
- **Reusable PasswordInput Component** — Input password dengan tombol show/hide di seluruh app

---

### v1.5.0 — 21 Mei 2026

#### ✨ Fitur Baru

- **ZeroTier Leave Network** dengan verifikasi password
- **Auto-Restart Project** saat server reboot (jika sebelumnya Running)
- **Live Process Output** — Terminal real-time via xterm.js + node-pty
- **Port/Domain Access Type** — Pilih akses via port atau custom domain
- **Smart Port Link** — Link port mengikuti hostname yang digunakan user

---

### v1.4.1 — 21 Mei 2026

#### ✨ Fitur Baru

- **Real Terminal** (xterm.js + node-pty) — PowerShell/Bash interaktif di browser
- **ZeroTier VPN Control** — Join, toggle service, status real-time
- **System Power Control** — Shutdown & Reboot (owner only) dengan verifikasi password
- **Network Speed Monitor** — Card download/upload speed real-time

---

### v1.4.0 — 20 Mei 2026

#### ✨ Fitur Baru

- **Dual Upload Mode** — GitHub clone atau upload file lokal
- **File Manager Terintegrasi** — CRUD, Monaco Editor (Ctrl+S), ZIP download streaming

---

### v1.3.0

- Rilis awal: dashboard, project management, deployment via GitHub, audit log, monitoring real-time.

---

*Dikembangkan dengan ❤️ oleh dikobokobok*
