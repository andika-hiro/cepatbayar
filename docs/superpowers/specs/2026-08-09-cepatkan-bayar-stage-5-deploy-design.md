# Tahap 5: Deploy ke cPanel — Design

**Status:** Disetujui
**Sumber kebenaran:** `docs/superpowers/specs/2026-08-08-cepatkan-bayar-architecture-and-stage-1-design.md` §7-8 (keputusan hosting awal), eksplorasi langsung ke akun cPanel produksi (lihat §2).

## 1. Cakupan

Deploy Cepatkan Bayar (server + client) ke hosting cPanel (Nyan Hosting) sebagai satu Passenger Node app, dengan MySQL production dan subdomain sendiri. Di luar cakupan: CI/CD otomatis (deploy tetap dijalankan manual lewat script dari laptop), monitoring/alerting, custom domain selain subdomain yang sudah dipilih.

## 2. Fakta akun hosting (dikonfirmasi langsung via SSH, bukan asumsi)

| Item | Nilai |
|---|---|
| Host / Port / User | `103.59.160.21` / `22` / `andikah1` |
| SSH key | `~/.ssh/id_ed25519_nyanhosting` (lokal, tidak pernah masuk repo) |
| Domain utama | `andikahiro.my.id` |
| Subdomain project ini | `cb.andikahiro.my.id` |
| MySQL | 8.0.34, tersedia via `uapi Mysql` |
| Node.js via Passenger | Tersedia — dikonfirmasi ada 2 app Node lain yang sudah jalan di akun ini (`rekber`, `api-rekber`), plus `scl -l` menunjukkan Node 6–24 tersedia di `/opt/alt/alt-nodejs*` |
| Otomasi `uapi` | Tersedia: modul `PassengerApps` (register/edit/enable/disable/unregister), `Mysql` (create_database/create_user/setup_db_and_user), `SubDomain` (addsubdomain) — semua bisa dijalankan lewat SSH tanpa klik UI cPanel |

**Temuan penting dari eksplorasi:** cPanel's env-var UI (`envvar_name`/`envvar_value` di `register_application`) menulis nilai ke `.htaccess` dalam bentuk plain text `SetEnv`. Ini dikonfirmasi langsung dengan melihat `.htaccess` project lain di akun yang sama (password DB-nya kelihatan plain text di situ). **Keputusan: JANGAN pakai mekanisme ini buat Cepatkan Bayar.** Semua secret production ditaruh di file `.env` di root app (permission `600`), yang sudah otomatis ke-load oleh `import 'dotenv/config'` di `server/src/index.ts` — mekanisme yang sama persis dengan dev lokal, tidak perlu kode baru.

## 3. Arsitektur deploy

Satu Passenger Node app, sesuai keputusan arsitektur Tahap 1 (§7 spec arsitektur): satu proses Express yang melayani `/api/*` **dan** menyajikan hasil build React (SPA fallback), bukan dua app terpisah.

```
/home/andikah1/cb.andikahiro.my.id/     <- PassengerAppRoot
  dist/                                  <- hasil `tsc` dari server/ (entry: dist/index.js)
  public/                                <- hasil `vite build` dari client/ (di-copy ke sini)
  node_modules/                          <- `npm install --omit=dev` dijalankan di server (bukan di-upload)
  package.json
  .env                                   <- chmod 600, TIDAK pernah masuk git
  .htaccess                              <- di-generate oleh `uapi PassengerApps register_application`
```

Node version: **22** — dipilih karena sudah terbukti jalan di akun ini untuk 2 app lain, bukan versi tercanggih (24) yang belum pernah dicoba di akun ini.

`server/src/app.ts` sudah membaca `path.join(__dirname, '../public')` sebagai lokasi static file — ini menentukan struktur folder di atas, bukan dipilih sembarangan.

## 4. Provisioning (sekali jalan, sebelum deploy pertama)

Dijalankan lewat `uapi` via SSH, bukan klik UI cPanel manual (sesuai keputusan user):

1. `uapi SubDomain addsubdomain` — buat `cb.andikahiro.my.id`, document root default (tidak dipakai langsung, Passenger yang akan override lewat `PassengerAppRoot`).
2. `uapi Mysql create_database` + `create_user` + `set_privileges_on_database` (atau `setup_db_and_user` sekali panggil) — buat database & user MySQL baru khusus project ini, terpisah total dari `andikah1_rekber`.
3. `uapi PassengerApps register_application` — daftarkan app Node dengan `domain`, `name`, `path` (relatif ke home dir), `deployment_mode=production`. Parameter startup-file/node-version yang belum terkonfirmasi lengkap dari dokumentasi resmi **akan diverifikasi empiris**: jalankan registrasi, baca hasil `.htaccess` yang di-generate, koreksi lewat `uapi PassengerApps edit_application` kalau ada field yang belum sesuai (mis. `PassengerStartupFile` perlu diarahkan ke `dist/index.js`). `uapi PassengerApps unregister_application` tersedia sebagai jalan mundur kalau registrasi awal perlu diulang dari nol.

Provisioning ini idempotent secara konsep tapi bukan didesain untuk dijalankan berkali-kali tanpa pengecekan — dijalankan sekali, hasilnya diperiksa sebelum lanjut ke deploy kode.

## 5. Build & deploy pipeline (tiap kali deploy ulang)

Dijalankan dari laptop (bukan di server), lewat `scripts/deploy.sh`:

1. `cd client && npm run build` → hasil di `client/dist/`
2. `cd server && npm run build` → hasil di `server/dist/`
3. Susun folder staging lokal: copy `server/dist/`, `server/package.json`, isi `client/dist/*` ke `public/`
4. `scp -r` folder staging ke `/home/andikah1/cb.andikahiro.my.id/` (bukan `rsync` — sudah dikonfirmasi tidak tersedia di server ini, sesuai catatan di playbook umum)
5. Via SSH: `npm install --omit=dev` di server (bukan upload `node_modules` dari laptop — beda OS/arch berisiko native-binding mismatch, meskipun Drizzle sendiri tidak butuh native binding, `mysql2` juga pure-JS, jadi risikonya kecil tapi tetap lebih aman install di server)
6. Via SSH: restart app (`uapi PassengerApps edit_application ... enabled=1` atau `touch tmp/restart.txt` sesuai konvensi Passenger)
7. Verifikasi: `curl -sI https://cb.andikahiro.my.id/api/health` harus `200` dengan body `{"status":"ok"}`, dan `curl -sI https://cb.andikahiro.my.id/` harus `200` (SPA `index.html`).

`.env` di server **tidak pernah ditimpa** oleh `scripts/deploy.sh` — dibuat sekali secara manual/terpisah saat provisioning (langkah §6), lalu dibiarkan, supaya deploy ulang tidak berisiko menghapus secret production.

## 6. Environment variables production

Ditulis langsung ke `.env` di server (bukan lewat cPanel UI, bukan lewat `uapi` envvar, alasan sudah dijelaskan di §2):

| Variable | Sumber nilai |
|---|---|
| `PORT` | Tetap (Passenger yang mengatur port sebenarnya lewat proxy, `PORT` di `.env` cuma dipakai internal) |
| `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` | Hasil provisioning §4 langkah 2 |
| `JWT_SECRET` | Digenerate acak (`openssl rand -base64 48`) langsung di server saat setup — user tidak perlu tahu/simpan nilainya secara manual |
| `APP_URL` | `https://cb.andikahiro.my.id` |
| `CLIENT_URL` | Sama seperti `APP_URL` (satu app, tidak ada origin terpisah di production) |
| `SMTP_*` | **Perlu keputusan user**: pakai mailbox cPanel yang sudah ada di `andikahiro.my.id`, atau buat mailbox baru khusus project ini? Kalau belum ada, magic link tetap fallback ke console-log seperti dev (sudah ada dari Tahap 1) — TIDAK memblokir deploy, cuma fitur emailnya belum aktif sampai SMTP diisi. |
| `VISION_LLM_API_KEY` | User isi manual sendiri langsung di server setelah deploy (tidak dikirim/dipegang oleh AI sama sekali) |

## 7. Skema database production

Dijalankan sekali dari SSH (bukan dari laptop) setelah `.env` production siap: `npx drizzle-kit push` di dalam direktori app di server, supaya tidak perlu expose MySQL port ke luar server (default MySQL di shared hosting biasanya cuma listen ke localhost/akun sendiri).

## 8. Testing & verifikasi

- Sebelum upload: pastikan `npm run build` (server & client) sukses lokal, dan `npx vitest run` + `npx tsc --noEmit` kedua package tetap hijau (regresi biasa, bukan test baru khusus deploy).
- Setelah deploy: verifikasi manual lewat `curl` (§5 langkah 7) plus satu smoke test manual di browser asli (buat trip, cek magic link muncul di log kalau SMTP belum diisi) — bukan test otomatis baru, cukup jalur `curl` + manual check karena ini infra, bukan logic aplikasi.

## 9. Yang sengaja belum dibangun di tahap ini

- CI/CD otomatis (GitHub Actions dsb.) — deploy tetap manual dari laptop lewat `scripts/deploy.sh`, sesuai skala project (personal, dipakai sendiri).
- Backup otomatis database production — di luar cakupan, bisa jadi follow-up terpisah.
- Custom domain di luar subdomain `cb.andikahiro.my.id` yang sudah dipilih.
