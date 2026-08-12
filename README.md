# Cepatkan Bayar 💸

**Cepatkan Bayar** adalah aplikasi manajemen pengeluaran bersama (split bill), pencatatan hutang/piutang kelompok, dan deposit antar anggota berbasis web PWA (Progressive Web App). Dilengkapi dengan **OCR Scan Struk otomatis** bertenaga AI (Google Gemini Vision) dan ringkasan WhatsApp siap kirim.

---

## 🚀 Fitur Utama

- 📊 **Ringkasan Trip & Sub-Trip**: Pencatatan pengeluaran per kategori (Makan, Transport, Nginap, Wisata, dll).
- 🧮 **Split Bill Fleksibel**:
  - Bagi rata (Jumlah total).
  - Rincian per-item (*Per Item*) dengan dukungan pajak makanan & *service charge*.
  - Pemindahan penanggung tagihan (*Tagihkan ke anggota lain*).
- 📷 **OCR Scan Struk AI**: Foto atau upload struk belanja untuk membaca nama item & harga secara otomatis menggunakan AI Gemini 1.5 Flash Vision.
- 💳 **Saldo & Running Deposit Credit**: Fitur penyetoran deposit antar anggota. Tagihan pengeluaran otomatis memotong saldo deposit secara akurat.
- 📜 **Riwayat & Rekening Anggota**: Catatan riwayat pelunasan dan penyimpanan nomor rekening bank / e-wallet anggota.
- 💬 **Rekap WhatsApp Siap Kirim**: Generator pesan rekap pengeluaran format WhatsApp lengkap dengan tautan bayar.
- 🌓 **Tema Gelap & Terang**: Dukungan Dark Mode dan Light Mode.

---

## 🛠️ Teknologi (Tech Stack)

- **Frontend**: React 18, TypeScript, TailwindCSS, Vite, Lucide/SVG Icons.
- **Backend**: Node.js, Express, Drizzle ORM, MySQL (MariaDB).
- **AI & OCR**: Google Gemini Vision API (`gemini-1.5-flash`).
- **Testing**: Vitest, React Testing Library.

---

## ⚙️ Cara Menjalankan Lokal (Development)

### 1. Prasyarat
- Node.js >= v18
- MySQL / MariaDB Server

### 2. Instalasi & Setup DB
```bash
# Clone repository
git clone https://github.com/andika-hiro/cepatbayar.git
cd cepatbayar

# Install dependencies (root, client, server)
npm install
npm run install:all

# Setup env
cp server/.env.example server/.env
# Isi kredensial DB dan GEMINI_API_KEY di server/.env
```

### 3. Migrasi Database
```bash
npm run db:push --prefix server
```

### 4. Jalankan Dev Server
```bash
npm run dev
```
Aplikasi client berjalan di `http://localhost:5173` dan server API di `http://localhost:3000`.

---

## 🚀 Production Build & Deploy

```bash
# Build client & server
npm run build

# Deploy (Nyan Hosting / cPanel)
npm run deploy
```

---

## 📄 Lisensi

MIT License © 2026 Cepatkan Bayar.
