# Deploy — Cepatkan Bayar

Live at: **https://cb.andikahiro.my.id**

Ini project Node.js (Express API + Passenger), bukan static site — playbook umum di `~/.claude/DEPLOY-PLAYBOOK.md` (yang polanya `scp` folder `dist/` static) **tidak berlaku langsung** di sini. Baca file ini, bukan playbook itu, untuk deploy ulang project ini.

## Arsitektur deploy

Satu app Node (Passenger) yang melayani REST API (`/api/*`) sekaligus static hasil build React (SPA fallback) — lihat `docs/superpowers/specs/2026-08-09-cepatkan-bayar-stage-5-deploy-design.md` untuk desain lengkap & rasionalnya.

| Item | Nilai |
|---|---|
| Domain | `cb.andikahiro.my.id` |
| App root (server) | `/home/andikah1/cb.andikahiro.my.id/` |
| Node version | 22 (nodevenv: `~/nodevenv/cb.andikahiro.my.id/22/`) |
| Database | MySQL `andikah1_cb`, user `andikah1_cb` |
| Host/Port/User/Key | sama seperti playbook umum: `103.59.160.21` / `22` / `andikah1` / `~/.ssh/id_ed25519_nyanhosting` |

## Deploy ulang (setelah provisioning pertama sudah selesai)

```bash
npm run deploy
```

Ini menjalankan `scripts/deploy.sh`: build client+server (`npm run build` di root), upload lewat `scp` (bukan `rsync` — tidak tersedia di host ini), install dependency production di server, restart Passenger (`touch tmp/restart.txt`), lalu verifikasi `curl` ke `/api/health` dan `/`.

**Yang TIDAK pernah disentuh oleh `npm run deploy`:** file `.env` di server — dibuat sekali saat provisioning, dibiarkan selamanya, supaya deploy ulang tidak pernah berisiko menghapus secret production.

## Provisioning pertama kali (sekali saja, sudah dilakukan 2026-08-09)

```bash
npm run provision
```

Menjalankan `scripts/provision.sh` — buat subdomain, app Node (via `cloudlinux-selector`, BUKAN `uapi PassengerApps` yang generic dan tidak benar-benar bekerja untuk Node — lihat komentar di script), database, user database, dan `.env` dengan secret yang digenerate acak di server (tidak pernah lewat laptop/chat).

Setelah provisioning, jalankan sekali (dari server, lewat SSH, supaya tidak perlu expose MySQL ke luar):
```bash
ssh -i ~/.ssh/id_ed25519_nyanhosting andikah1@103.59.160.21
cd cb.andikahiro.my.id && source ~/nodevenv/cb.andikahiro.my.id/22/bin/activate
npx drizzle-kit push
deactivate
```

## Yang masih perlu diisi manual di server (tidak dikerjakan otomatis — sengaja)

Edit `~/cb.andikahiro.my.id/.env` langsung di server (`nano` lewat SSH, atau File Manager cPanel):
- `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM` — kalau kosong, magic link tetap jalan tapi cuma ke-log di `stderr.log`, tidak benar-benar terkirim lewat email.
- `VISION_LLM_API_KEY` — kalau kosong, fitur OCR struk pakai mock data (fallback yang sudah ada dari Tahap 4), bukan LLM vision beneran.

Setelah mengedit `.env`, restart app: `touch ~/cb.andikahiro.my.id/tmp/restart.txt`.

## Verifikasi manual

```bash
curl -sI https://cb.andikahiro.my.id/api/health
curl -sI https://cb.andikahiro.my.id/
```
Keduanya harus `HTTP/2 200`.

## Kalau ada masalah

Log error ada di `~/cb.andikahiro.my.id/stderr.log` di server (sama seperti project Node lain di akun ini).

### Known issue: `npm install` bisa crash di server ini

Ketemu 2x (2026-08-09): `npm install` di server crash dengan `Aborted (core dumped)` /
`pthread_create: Resource temporarily unavailable` — dikonfirmasi ini masalah host-level
(limit proses/thread per akun dari CloudLinux LVE), bukan masalah di project ini — bahkan
`npm --version` di app lain yang sudah jalan lama (`rekber`) ikut crash pas dicoba di
waktu yang sama.

`scripts/deploy.sh` sekarang otomatis skip `npm install` kalau `package-lock.json` tidak
berubah dari deploy sebelumnya (paling sering terjadi — kebanyakan perubahan cuma logic,
bukan dependency baru), jadi biasanya tidak kena masalah ini sama sekali. Kalau memang ada
dependency baru DAN `npm install` crash: deploy tetap lanjut jalan pakai `node_modules`
yang lama (basi kalau dependency-nya benar-benar dipakai kodenya), lalu install manual
belakangan setelah masalah host-nya reda:
```bash
ssh -i ~/.ssh/id_ed25519_nyanhosting andikah1@103.59.160.21
cd cb.andikahiro.my.id && source ~/nodevenv/cb.andikahiro.my.id/22/bin/activate
npm install --omit=dev
deactivate
touch tmp/restart.txt
```
