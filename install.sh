#!/bin/bash

# ==============================================================================
# Script Installasi Otomatis & Manajemen Layanan dengan PM2 & ZeroTier
# ==============================================================================

# Hentikan script jika ada perintah yang gagal/error
set -e

# Warna untuk output log di terminal
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${GREEN}${BOLD}=== Memulai Proses Installasi & Setup ===${NC}\n"

# [TAMBAHAN] Cek apakah NPM sudah terinstal, jika belum maka instal Node.js v20 LTS
if ! command -v npm &> /dev/null; then
    echo -e "${YELLOW}[0/7] NPM tidak ditemukan. Menginstal Node.js & NPM terlebih dahulu...${NC}"
    apt-get update && apt-get install -y curl g++ make
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo -e "${GREEN}Node.js dan NPM berhasil terinstal!${NC}\n"
fi

# 1. Menginstal PM2 secara global
echo -e "${YELLOW}[1/7] Menginstal PM2 secara global...${NC}"
npm install pm2 -g

# 2. Menginstal ZeroTier
echo -e "\n${YELLOW}[2/7] Menginstal ZeroTier One...${NC}"
curl -s https://install.zerotier.com | bash

# 3. Menginstal local dependencies project
echo -e "\n${YELLOW}[3/7] Menginstal dependensi lokal (npm install)...${NC}"
if [ -f "package.json" ]; then
    npm install
else
    echo -e "${RED}Peringatan: file package.json tidak ditemukan di direktori ini!${NC}"
    echo -e "${YELLOW}Proses tetap dilanjutkan...${NC}"
fi

# 4. Membuat dan mengonfigurasi startup script PM2 untuk user root
echo -e "\n${YELLOW}[4/7] Mengonfigurasi PM2 Startup Systemd untuk user root...${NC}"
pm2 startup systemd -u root --hp /root

# 5. Menjalankan aplikasi dengan PM2
echo -e "\n${YELLOW}[5/7] Menjalankan aplikasi dengan PM2 ('ndelok-dev')...${NC}"
pm2 start npm --name "ndelok-dev" -- run dev

# 6. Menyimpan daftar proses PM2 agar otomatis berjalan setelah reboot
echo -e "\n${YELLOW}[6/7] Menyimpan konfigurasi proses PM2...${NC}"
pm2 save

# 7. Mengelola dan mengaktifkan service PM2 di tingkat sistem (systemd)
echo -e "\n${YELLOW}[7/7] Menjalankan dan mengaktifkan service pm2-root...${NC}"
systemctl daemon-reload
systemctl enable pm2-root
systemctl start pm2-root

# Verifikasi Akhir
echo -e "\n${GREEN}${BOLD}=== Memeriksa Status Akhir ===${NC}"
echo -e "${YELLOW}Status Service pm2-root:${NC}"
systemctl status pm2-root.service --no-pager

echo -e "\n${YELLOW}Daftar Aplikasi di PM2:${NC}"
pm2 list

echo -e "\n${GREEN}${BOLD}=== Installasi dan Konfigurasi Selesai! ===${NC}"
