# Tahap 4: OCR Struk, Reminder WhatsApp & PWA Setup — Design Spec

**Status:** Menunggu Review & Keputusan User (Checkpoint Wajib)
**Sumber kebenaran:** `context/prd-patungan-trip.md` §5.3, §5.7, §6, `context/Cepat Bayarkan.dc.html` + `context/handoff.md` (layar #10 WA Preview, #15 OCR Struk, #17 Install PWA).

---

## 1. Ringkasan & Cakupan Tahap 4

Tahap 4 melengkapi aplikasi **Cepat Bayarkan** dengan 3 kapabilitas utama:
1. **OCR Struk Struk Otomatis (LLM Vision):** Membaca foto struk pengeluaran via LLM Vision (Claude / GPT-4o), mengekstrak daftar item, nominal, pajak makanan, service charge, dan total, yang kemudian ditampilkan sebagai draft yang dapat diedit sebelum dimasukkan ke form pengeluaran.
2. **Mekanisme Reminder & Share WhatsApp:** Menyusun pesan rekap per sub trip (tanpa netting) dan reminder personal saldo deposit, serta menyediakan tombol kirim ke WhatsApp.
3. **PWA Setup (Progressive Web App):** Menambahkan Web App Manifest, Service Worker untuk offline caching, serta Install Banner & Sheet panduan "Add to Home Screen".

---

## 2. Fitur 1: OCR Struk Otomatis (LLM Vision)

### Kebijakan Arsitektur & Provider
- **Provider:** Menggunakan API LLM Vision (Anthropic Claude 3.5 Sonnet atau OpenAI GPT-4o). OCR berbasis tradisional (Tesseract/OpenCV) sengaja ditiadakan sesuai keputusan project.
- **Kredensial & Env Vars:** API key tidak boleh di-hardcode. Konfigurasi disimpan via env vars di `.env.example`:
  ```env
  VISION_LLM_PROVIDER=claude # 'claude' | 'openai'
  VISION_LLM_API_KEY=
  ```
  *(Catatan: Pengujian dengan API key asli butuh input kredensial dari user. Saat pengujian otomatis/unit test, backend akan menggunakan mock/stub response).*

### Alur 3 Tahap UI (Handoff Screen #15 & PRD §5.3)
1. **Capture / Upload:** Form/Sheet pembaca struk menampilkan area preview foto/kamera + tombol shutter / pilih file image dari galeri.
2. **Processing (Loading):** Loading spinner dengan teks *"Membaca struk..."* (mengirim foto base64 ke endpoint `POST /api/ocr/scan`).
3. **Draft Hasil Scan (Editable):**
   - Menampilkan receipt-style card yang berisi:
     - List item hasil ekstraksi (nama item & harga).
     - Persentase & nominal **Pajak makanan** (tax).
     - Persentase & nominal **Service charge**.
     - **TOTAL** hasil hitung vs TOTAL di struk.
   - **Wajib Fungsional & Editable:** User dapat mengedit nama item, menambah/menghapus item, dan menyesuaikan pajak/service charge di layar draft sebelum menekan tombol *"Pakai hasil ini"*.
   - Saat tombol *"Pakai hasil ini"* ditekan, form Tambah/Edit Pengeluaran otomatis terisi dengan data mode `per_item` tersebut.

---

## 3. Fitur 2: Mekanisme Reminder WhatsApp (CHECKPOINT KEPUTUSAN USER)

> [!IMPORTANT]
> **Pilihan Mekanisme WhatsApp membutuhkan keputusan dari Anda.** Di bawah ini disajikan perbandingan 2 opsi teknis beserta dampaknya:

### Perbandingan Opsi Mekanisme WhatsApp

| Dimensi | Opsi A: Deep-link `wa.me` (Rekomendasi) | Opsi B: Official WhatsApp Business API |
|---|---|---|
| **Biaya** | 100% Gratis (tanpa biaya berlangganan/per pesan) | Berbayar (biaya percakapan Meta + provider Twilio/MessageBird) |
| **Prasyarat & Approval** | Tanpa approval Meta, tanpa akun bisnis, tanpa verifikasi domain | Wajib verifikasi bisnis Meta, approval template pesan, perjanjian API |
| **Pengalaman Pengguna** | User menekan tombol "Buka WhatsApp", lalu menekan tombol **Kirim** manual di aplikasi WA | Otomatis terkirim dari nomor bot tanpa sentuhan user |
| **Kompleksitas Kode** | Sangat sederhana (generate URL `https://wa.me/?text=...` di frontend) | Sangat tinggi (webhook handler, OAuth, template management, token storage) |
| **Kepatuhan Kebijakan WA** | 100% Sesuai standar resmi WhatsApp Web/Mobile link API | Memerlukan template resmi yang disetujui Meta |

### Rekomendasi Tim & Detail Implementasi Opsi A (Deep-link `wa.me`)
Kami merekomendasikan **Opsi A (`wa.me`)** karena selaras dengan kebutuhan aplikasi pribadi/kelompok gratis tanpa biaya operasional.

#### Komponen Layar Preview Rekap WA (`/t/:publicId/wa-preview`):
1. **Rekap Grup (Monospace Struk Style):**
   - Mengelompokkan tagihan **per sub trip** (TIDAK di-netting/disederhanakan).
   - Format teks yang digenerate:
     ```text
     🧾 REKAP PATUNGAN: Jogja Trip
     --------------------------------
     📍 Makan Gudeg Bu Tjitro (01/08)
     • Budi: Rp20.000 (BCA: 123456789 a.n. Adit)
     --------------------------------
     📍 Bensin Pertamina (02/08)
     • Charlie: Rp30.000 (GoPay: 08123456789 a.n. Budi)
     --------------------------------
     Total belum lunas: Rp50.000
     ```
   - Tombol **"Buka WhatsApp & pilih grup"** mengarahkan ke `https://wa.me/?text=...`.
   - Menampilkan info disclaimer: *"Tap 'Kirim' manual di WhatsApp adalah keterbatasan platform WhatsApp, bukan bug."*

2. **Reminder Personal (Kartu Per Anggota):**
   - Menampilkan kartu untuk anggota yang memiliki saldo deposit menipis/habis atau tagihan tertunggak.
   - Tombol **"Kirim WA"** personal mengarahkan ke `https://wa.me/<nomor_wa>?text=...`.

---

## 4. Fitur 3: PWA Setup (Progressive Web App)

PWA setup dikerjakan secara penuh & otomatis meliputi:
1. `client/public/manifest.webmanifest`:
   - `name`: `"Cepat Bayarkan — Patungan Trip"`
   - `short_name`: `"Cepat Bayar"`
   - `start_url`: `"/"`
   - `display`: `"standalone"`
   - `theme_color`: `"#005f73"` (oklch accent)
   - `background_color`: `"#f5f6f7"`
   - Icons: `192x192` & `512x512` PNG.
2. **Service Worker (`sw.js`):**
   - Caching static assets (HTML, CSS, JS, fonts) untuk performa loading cepat & kerja offline dasar.
3. **Dismissible PWA Install Banner (di Layar Ringkasan):**
   - Banner yang dapat ditutup (dismissible): *"Install biar gampang dibuka pas jalan-jalan"* + tombol **Instal**.
4. **Install PWA Sheet (Bottom Sheet 3-Step):**
   - Panduan visual 3 langkah bagi pengguna iOS/Android:
     1. Tap tombol Share / Menu browser.
     2. Pilih "Add to Home Screen" / "Tambahkan ke Utama".
     3. Buka aplikasi langsung dari ikon homescreen.

---

## 5. Pertanyaan Checkpoint untuk User

Mohon konfirmasi Anda terhadap spesifikasi Tahap 4 di atas:
1. **Apakah Anda menyetujui rekomendasi Opsi A (Deep-link `wa.me`) untuk mekanisme reminder WhatsApp?**
2. **Apakah struktur spec Tahap 4 (OCR LLM Vision + WA Preview + PWA Setup) sudah sesuai untuk dilanjutkan ke tahap pembuatan Implementation Plan & Eksekusi?**
