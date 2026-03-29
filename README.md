# Ndelok.me - Dashboard Infrastruktur Terintegrasi (v1.3)

**Ndelok.me** adalah dashboard manajemen infrastruktur real-time dengan performa tinggi yang dirancang untuk pengembangan lokal dan lingkungan produksi skala kecil. Platform ini menyediakan antarmuka terpadu untuk memantau kesehatan sistem, mengelola penyebaran proyek (deployment), dan menganalisis log server secara real-time dengan penyimpanan persisten.

![Project Banner](docs/images/dashboard.png)

## 🚀 Fitur Utama

- **Pemantauan Real-time**: Statistik OS secara langsung termasuk penggunaan CPU, RAM, dan Disk (per proyek) didukung oleh Socket.io.
- **Audit Trail & Keamanan**: Pencatatan otomatis setiap permintaan API yang mengubah status (POST/PATCH/DELETE) dengan pelacakan inisiator.
- **Manajemen Proyek**: Kendalikan layanan Anda (Mulai, Berhentikan, Restart, Edit, Hapus) dengan sekali klik.
- **Deployment Cerdas**: Proses kloning Git dan instalasi otomatis dengan dukungan branch/tag.
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

*Dikembangkan dengan ❤️ oleh dikobokobok*
