# Cepatkan Bayar — Arsitektur Keseluruhan & Desain Tahap 1

**Status:** Disetujui secara konseptual, menunggu review tertulis
**Sumber kebenaran:** `context/prd-patungan-trip.md` (logic bisnis), `context/Cepat Bayarkan.dc.html` + `context/handoff.md` (desain/UI/copy). Kalau bentrok, PRD menang untuk logic, desain menang untuk tampilan/interaksi.

## 1. Konteks & keputusan yang sudah diambil

Aplikasi patungan biaya trip grup, mobile-first, terasa seperti PWA. Dibangun bertahap:

1. **Tahap 1** (spec ini): struktur navigasi + Daftar Trip + Buat Trip Baru + Pilih Identitas.
2. Tahap 2: Ringkasan + catat sub trip (jumlah total → rincian per item + pajak + tagihkan ke).
3. Tahap 3: deposit & saldo.
4. Tahap 4: OCR, reminder WA, PWA setup (manifest, install prompt).
5. Tahap 5: deploy ke URL live.

Tahap 2–5 akan di-brainstorm & di-spec ulang secara lebih rinci sebelum masing-masing mulai dikerjakan — bagian 7 di sini cuma garis besar supaya keputusan Tahap 1 konsisten ke depan.

Keputusan arsitektur (dari diskusi sebelumnya):
- **Hosting**: cPanel Nyan Hosting milik user, support **Node.js via Passenger**, database **MySQL/MariaDB**.
- **Update data antar anggota**: polling ringan (bukan WebSocket) — shared hosting/Passenger tidak reliable untuk koneksi persisten.
- **Login pembuat trip**: email magic link (anggota lain tetap tanpa akun, cuma pilih identitas).
- **OCR (Tahap 4)**: LLM vision (Claude), bukan Cloud Vision API atau SaaS OCR khusus struk.

## 2. Stack

| Layer | Pilihan | Alasan |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind + React Router | TypeScript krusial buat logic uang/status lunas yang gampang salah kalau tipe longgar. Vite ringan & build cepat, cocok di-deploy sebagai static output. |
| Backend | Node.js + Express + TypeScript, satu Passenger app | Satu proses melayani REST API di `/api/*` **dan** menyajikan hasil build React (SPA fallback ke `index.html`) — cuma butuh 1 app Node di cPanel. |
| Database | MySQL/MariaDB via **Drizzle ORM** | Drizzle tidak butuh native binary engine (beda dari Prisma) — lebih aman di shared hosting yang environment-nya terbatas. Relasional cocok buat query gabungan debt/deposit yang kompleks. |
| Auth | JWT di httpOnly cookie, stateless (tanpa tabel session) | Magic link email lewat `nodemailer` + SMTP domain cPanel. Token magic link sekali pakai, expired ~15 menit. |
| Data fetching | Polling ringan (refetch interval + refetch setelah aksi) | Sesuai keputusan; cukup buat "shared, real-time-ish" tanpa WebSocket. |

## 3. Mekanisme lintas-tahap yang penting

### 3.1 Identitas anggota tanpa akun
Setelah memilih nama di Pilih Identitas, `{tripPublicId → memberId}` disimpan di `localStorage` perangkat itu. Tidak ada login untuk anggota biasa (sesuai PRD bagian 4).

### 3.2 "Trip yang saya ikuti" di Daftar Trip
Anggota non-pembuat tidak punya akun, jadi aplikasi perlu tahu trip mana yang pernah diakses dari perangkat itu:
- Browser menyimpan array `tripPublicId` yang pernah dimasuki (localStorage), ditambahkan tiap kali user menyelesaikan Pilih Identitas untuk suatu trip.
- Daftar Trip menggabungkan: (a) trip yang dibuat oleh akun yang sedang login (kalau ada sesi), dan (b) ringkasan trip dari daftar `tripPublicId` lokal tadi — dedup by id.
- **Catatan (diserahkan ke user sebelumnya)**: daftar ini device-local, bukan cross-device. Kalau nanti user ganti HP, trip yang cuma diikuti (bukan dibuat) tidak otomatis muncul kecuali klik ulang link share-nya.

### 3.3 Keamanan link share
Trip tidak punya password — siapa pun yang tahu link bisa akses (sesuai PRD: privasi terbuka di dalam trip). Supaya link tidak gampang ditebak, tiap trip punya `publicId` acak (nanoid ~16 karakter) dipakai di URL & share link, terpisah dari primary key internal auto-increment.

### 3.4 `viaShareLink` flag
Menentukan apakah tombol "← Daftar trip" muncul di Pilih Identitas. `true` kalau layar itu adalah entry point sesi (direct load/refresh ke `/t/:publicId`, termasuk dari link WA); `false` kalau navigasi terjadi dari dalam app (klik kartu trip di Daftar Trip, atau habis submit Buat Trip Baru) — dikirim lewat router state, bukan disimpan permanen.

## 4. Model data (tabel Tahap 1)

```
users            id, email (unique), created_at
auth_tokens      id, user_id → users, token_hash, expires_at, used_at, created_at
trips            id, public_id (unique, random), name, destination,
                 start_date, end_date, creator_user_id → users, created_at, updated_at
trip_members     id, trip_id → trips, name, created_at
```

Catatan: `initial` avatar (huruf depan nama) dihitung di frontend dari `name`, tidak disimpan sebagai kolom. Tabel `accounts` (rekening/e-wallet) dan tabel debt/deposit ditambahkan di Tahap 2–3, tidak dibuat sekarang (YAGNI — belum ada fitur yang memakainya).

## 5. API (Tahap 1)

**Auth**
- `POST /api/auth/request-link { email }` — selalu balas 200 (tidak bocorin apakah email terdaftar), kirim email berisi link magic ke `/api/auth/verify?token=...&redirect=...`.
- `GET /api/auth/verify` — validasi token, set cookie sesi (JWT httpOnly), redirect ke `redirect` param (default `/`).
- `POST /api/auth/logout` — hapus cookie.
- `GET /api/auth/me` — user aktif atau 401.

**Trips**
- `POST /api/trips { name, destination, startDate, endDate, members: string[] }` — butuh sesi aktif (creator). Kalau belum login, frontend tampilkan gate email dulu (lihat 6.2). Buat trip + members, balikin `publicId`.
- `GET /api/trips/mine` — trip yang dibuat akun aktif (butuh sesi).
- `POST /api/trips/summary { publicIds: string[] }` — publik (tanpa auth), balikin ringkasan (nama, destinasi, tanggal, jumlah anggota, status lunas — Tahap 1 selalu "Semua lunas" karena belum ada sub trip) untuk daftar `publicId` yang dikirim. Dipakai buat gabungan "trip yang saya ikuti" dari localStorage.
- `GET /api/trips/:publicId` — detail trip + daftar member, publik (siapa pun yang punya link boleh akses, sesuai PRD).

Tidak ada endpoint terpisah untuk "pilih identitas" — itu murni state client (localStorage), tidak menyentuh server.

## 6. Layar & routing (Tahap 1)

| Route | Layar | Catatan |
|---|---|---|
| `/` | Daftar Trip | Search, tombol "+ Buat Trip Baru", list kartu trip, bottom nav Beranda(aktif)/Profil. |
| `/trip/new` | Buat Trip Baru | Lihat 6.2 soal gate login. |
| `/t/:publicId` | Pilih Identitas | List member, tombol back kondisional (3.4). |
| `/t/:publicId/ringkasan` | **Placeholder** Ringkasan | Shell bottom nav trip (Ringkasan aktif/Riwayat/FAB/Saldo/Profil) + pesan "Fitur ini dibangun di Tahap 2". Dibangun supaya struktur navigasi Tahap 1 terasa utuh; kontennya diganti penuh di Tahap 2. |
| `/profil` | **Placeholder** Pengaturan | Sama, diganti penuh saat Pengaturan dibangun. |

### 6.1 Fidelity visual
Semua layar yang bukan placeholder (Daftar Trip, Buat Trip Baru, Pilih Identitas) direkreasi presisi dari `Cepat Bayarkan.dc.html`: warna OKLCH, Manrope/Inter/IBM Plex Mono, radius, spacing sesuai `handoff.md` bagian Design Tokens. Semua teks "Cepat Bayarkan" di UI diganti "Cepatkan Bayar" (nama file desain tetap dirujuk apa adanya, isinya yang diganti).

### 6.2 Gate login di Buat Trip Baru
Kalau belum ada sesi aktif saat masuk `/trip/new`: tampilkan step email dulu ("Masukin email buat bikin & ngatur trip kamu" → kirim magic link → "Cek email kamu, klik link buat lanjut"). Setelah verifikasi via link di email, browser redirect balik ke `/trip/new` dengan sesi aktif, form trip langsung terisi ulang siap diisi. Sesi ini persisten (cookie), jadi gate ini biasanya cuma muncul sekali per browser.

Alur submit: isi form → `POST /api/trips` → redirect ke `/t/:publicId` (Pilih Identitas untuk trip baru itu, `viaShareLink=false`).

## 7. Garis besar Tahap 2–5 (belum final, buat konteks arah)

- **Tahap 2**: Ringkasan asli (saldo rollup, list saldo anggota), tambah/edit/hapus sub trip (mode total & rincian per item, pajak makanan vs service charge, tagihkan ke), Riwayat (list sub trip), Sub trip detail. Butuh tabel `sub_trips`, `sub_trip_items`, `debts`.
- **Tahap 3**: Saldo & deposit (semua tagihan per sub trip apa adanya, tanpa netting), form deposit, logic auto-apply deposit ke tagihan pertama yang belum lunas (dihitung ulang dinamis), Riwayat pelunasan. Tabel `deposits`.
- **Tahap 4**: OCR struk (capture → loading → draft **editable**) via LLM vision, reminder WA (`wa.me` link personal & broadcast), PWA manifest + install prompt banner.
- **Tahap 5**: Build & deploy ke cPanel (Passenger Node app + MySQL), setup environment variable di cPanel (bukan commit ke repo: `JWT_SECRET`, SMTP credentials, LLM API key, DB credentials), kasih URL live.

## 8. Yang sengaja belum dibangun di Tahap 1
- Kelola anggota & rekening (nambah anggota setelah trip dibuat, akun/e-wallet) — anggota awal cuma bisa diisi pas Buat Trip Baru untuk sekarang.
- Ringkasan, Riwayat, Saldo, Profil/Pengaturan asli — masih placeholder.
- PWA manifest/service worker — ditunda ke Tahap 4 sesuai urutan yang diminta.

## 9. Keputusan pasca-Tahap 1 (dari final review)

**Member ID tetap auto-increment int global** (bukan diganti ke random/scoped-per-trip). Final review Tahap 1 menandai ini sebagai hal yang perlu diputuskan sebelum Tahap 2 mulai mengirim identitas anggota ke server buat atribusi pengeluaran (debt), karena ID yang berurutan & global gampang ditebak.

Keputusan: **tetap pakai int biasa**, dengan syarat yang wajib dipegang di Tahap 2 dan seterusnya — **setiap endpoint yang menerima `memberId` wajib divalidasi bahwa member itu benar milik `tripId` yang sama** (never trust `memberId` sendirian tanpa scoping ke trip). Alasan: model keamanan aplikasi ini dari awal memang "unguessable trip link = kontrol akses" (lihat §3.3), bukan "unguessable resource ID" di tiap level — begitu satu trip diakses, semua datanya memang sengaja terbuka buat semua anggota (§4 PRD: privasi terbuka di dalam trip). Random ID di level member cuma nambah kerumitan tanpa nambah proteksi nyata, selama validasi scoping-nya konsisten. Ini prinsip desain buat dibawa ke brainstorming Tahap 2, bukan perubahan skema sekarang.
