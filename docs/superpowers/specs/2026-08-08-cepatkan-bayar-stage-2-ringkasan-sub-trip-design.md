# Tahap 2 (bagian 1): Ringkasan & Sub Trip (mode jumlah total) — Design

**Status:** Menunggu review tertulis
**Sumber kebenaran:** `context/prd-patungan-trip.md` §5.2, §5.5, §5.6 (logic), `context/Cepat Bayarkan.dc.html` + `context/handoff.md` layar Ringkasan/Riwayat/Sub trip detail/Add Expense (visual). Arsitektur & konvensi mengikuti `docs/superpowers/specs/2026-08-08-cepatkan-bayar-architecture-and-stage-1-design.md`.

## 1. Cakupan

Bagian dari Tahap 2 yang dibangun sekarang: **Ringkasan asli** (rollup saldo, list saldo anggota), **Riwayat** (list sub trip), **Sub trip detail** (tagihan per orang + tandai lunas), **Tambah/Edit/Hapus sub trip** — **mode "Jumlah total" saja** (nominal + centang peserta, dibagi rata).

**Sengaja di luar cakupan ini** (keputusan diambil, alasan di bawah):
- **Rincian per item + pajak makanan/service charge + Tagihkan ke** → dipecah jadi Tahap 2b, spec/plan terpisah setelah bagian ini selesai. Alasan: user secara eksplisit minta urutan "jumlah total dulu, baru rincian per item + pajak + tagihkan ke" — dan itu memang unit kerja yang jauh lebih kompleks (item-level splitting, dua jenis pajak, reassignment).
- **Foto struk (lampiran) & OCR** → digabung ke Tahap 4. Alasan: keduanya butuh infra yang sama (upload file, storage di server/cPanel), lebih efisien dibangun sekali di Tahap 4 bareng OCR daripada dicicil.
- **Saldo & deposit** (layar terpisah, semua tagihan lintas sub trip + deposit) → tetap Tahap 3 sesuai roadmap. Tombol CTA "Lihat semua tagihan per sub trip →" di Ringkasan diarahkan ke **Riwayat** (bukan placeholder), karena tandai-lunas per sub trip sudah fungsional lewat Sub trip detail di tahap ini.
- **Install banner PWA** di Ringkasan → tetap Tahap 4 (manifest/install prompt belum ada).

## 2. Model otorisasi edit/hapus sub trip (penting, sudah dikonfirmasi)

PRD §4: "Edit/hapus sub trip dibatasi: hanya orang yang menambahkan entri itu, atau pembuat trip, yang boleh." Karena anggota biasa tidak punya auth asli (§3.1 spec Tahap 1 — identitas cuma local per device), ini diimplementasikan sebagai:
- **Pembuat trip**: dicek beneran di server via JWT session (`requireAuth` + `trip.creatorUserId === req.userId`) — valid secara kriptografis.
- **"Penambah entri"**: server percaya `memberId` yang dikirim client (header `X-Member-Id`, diisi dari localStorage identity Tahap 1) dibandingkan dengan `sub_trips.created_by_member_id`. Ini **bukan security boundary sungguhan** (siapa pun bisa ganti localStorage-nya dan klaim jadi member lain) — konsisten dengan PRD §3 yang eksplisit bilang "belum ada verifikasi dari penerima" sebagai non-tujuan, dan dengan model akses "siapa punya link trip, lihat & bisa ngapa-ngapain" yang sudah berlaku sejak Tahap 1. Tombol Edit/Hapus disembunyikan di UI kalau tidak memenuhi salah satu syarat di atas, dan server tetap menolak (403) kalau permintaan lolos dari UI tapi gak memenuhi syarat — jadi ini "soft guard", bukan proteksi kuat.

## 3. Model data

```
sub_trips     id, trip_id → trips, name, category (enum: makan|transport|nginap|tiket_wisata|lainnya),
              date, payer_member_id → trip_members, amount, created_by_member_id → trip_members,
              created_at, updated_by_member_id → trip_members (nullable), updated_at
debts         id, sub_trip_id → sub_trips, member_id → trip_members (penanggung), amount,
              settled (bool, default false), settled_at (nullable), created_at
```

**Aturan pembentukan `debts` saat sub trip dibuat/diedit (mode jumlah total):**
- `share = Math.ceil(amount / jumlahPesertaTercentang)` — presisi penuh, cuma pecahan di bawah Rp1 dibulatkan ke atas (PRD §5.2), sehingga total nominal debt bisa sedikit lebih besar dari `amount` kalau pembagian gak bulat (selisih beberapa Rupiah, wajar di semua app split-bill).
- Debt **tidak dibuat untuk pembayar sendiri** — kalau pembayar ikut tercentang sebagai peserta, dia otomatis dianggap sudah "bayar duluan" bagiannya sendiri lewat proses nalangin; tidak ada baris debt `payer → payer`.
- Kalau ada peserta baru ditambahkan/dihapus saat edit, baris `debts` yang sudah lunas tapi pesertanya dihapus dari centang **dihapus** (bukan dibiarkan nyantol); baris baru dibuat untuk peserta baru; baris existing yang pesertanya tetap ada, nominalnya di-update ke share terbaru, status lunas-nya **tetap dipertahankan** (tidak direset ke belum-lunas hanya karena nominal berubah — ini keputusan desain: mengedit sub trip yang sebagian tagihannya sudah lunas adalah kasus tepi yang jarang, dan mereset ke belum-lunas berisiko bikin orang nagih ulang yang udah beres; kalau nominal berubah signifikan, itu tanggung jawab pengedit buat komunikasi manual — di luar cakupan otomatisasi Tahap 2).

## 4. Rollup saldo (PRD §5.5, tidak berubah dari definisi PRD)

Untuk anggota M di trip T:
```
diterima   = Σ debts.amount WHERE debts.settled = false AND debts.subTrip.payerMemberId = M
ditanggung = Σ debts.amount WHERE debts.settled = false AND debts.memberId = M
rollup     = diterima − ditanggung
```
Status tampilan: `rollup > 0` → "Dilunasin" (hijau/pos), `rollup < 0` → "Ngutang" (merah/neg), `rollup === 0` → "Lunas" (`sub`/netral). **Tidak pernah dipakai buat saran transfer gabungan** — murni informasional (PRD §5.5).

## 5. API

Semua endpoint di bawah `/api/trips/:publicId/subtrips*` dan `/api/trips/:publicId/summary`. Header `X-Member-Id` (opsional, string angka) dikirim client dari localStorage identity Tahap 1 untuk endpoint yang butuh soft-auth (edit/hapus).

- `GET /api/trips/:publicId/summary` — publik (samasekali gak perlu auth, konsisten dgn Tahap 1). Balikin `{ members: [{memberId, name, rollup, status}], tripTotal }`.
- `GET /api/trips/:publicId/subtrips` — publik. List sub trip (untuk Riwayat), tiap item: `{id, name, category, date, payerMemberId, payerName, amount, unsettledCount}`.
- `POST /api/trips/:publicId/subtrips` — publik (siapa pun yang di trip boleh nambah, PRD §4). Body: `{name, category, date, payerMemberId, amount, participantMemberIds: number[], createdByMemberId}`. Validasi: `participantMemberIds` minimal 1, semua id (termasuk payer, createdBy) harus member trip ini (validasi scoping — lihat keputusan §9 spec Tahap 1). Insert `sub_trips` + `debts` (transaksional, ikuti pola `db.transaction()` dari Tahap 1).
- `GET /api/trips/:publicId/subtrips/:subTripId` — publik. Detail + `debts: [{id, memberId, name, amount, settled}]`.
- `PATCH /api/trips/:publicId/subtrips/:subTripId` — body sama seperti POST. Otorisasi: kalau ada cookie sesi valid & `trip.creatorUserId === req.userId` → boleh **atau** `X-Member-Id` cocok dengan `sub_trips.created_by_member_id` → boleh; selain itu 403. (Catatan implementasi: ini butuh middleware baru yang beda dari `requireAuth` Tahap 1 — `requireAuth` selalu 401 kalau gak ada sesi, padahal endpoint ini harus tetap bisa diakses tanpa sesi selama `X-Member-Id`-nya cocok. Perlu `attachUserIfPresent` — baca cookie sesi kalau ada, isi `req.userId` kalau valid, **tidak pernah** 401 sendiri; keputusan izin/tolak dilakukan di handler route, bukan di middleware.)
- `DELETE /api/trips/:publicId/subtrips/:subTripId` — otorisasi sama seperti PATCH (pakai `attachUserIfPresent` juga).
- `PATCH /api/trips/:publicId/subtrips/:subTripId/debts/:debtId` — body `{settled: boolean}`. **Tidak ada pembatasan otorisasi** (PRD §5.6: siapa transfer, dia sendiri yang tandai lunas, honor system) — publik, siapa pun di trip boleh toggle.

## 6. Layar & routing

| Route | Layar | Catatan |
|---|---|---|
| `/t/:publicId/ringkasan` | **Ringkasan (real)**, ganti placeholder | Empty state kalau belum ada sub trip (layar #4 handoff), balance card + list saldo anggota kalau ada. |
| `/t/:publicId/riwayat` | **Riwayat** (baru) | List sub trip, tap → detail. |
| `/t/:publicId/subtrip/:subTripId` | **Sub trip detail** (baru) | Tagihan per orang + toggle lunas, Edit/Hapus kondisional. |

Sheet **Tambah/Edit pengeluaran** **bukan route URL terpisah** — dikontrol lewat state komponen (overlay full-screen), dibuka dari: FAB di bottom nav trip-level, tombol "+ Tambah pengeluaran pertama" di empty state, atau tombol "Edit" di Sub trip detail (mode edit, pre-filled). Alasan: sesuai mental model "sheet" di desain asli (slide-up di atas layar saat ini, ditutup dengan Batal/swipe-down), bukan navigasi halaman baru — lebih sederhana daripada sinkronisasi state form lewat URL.

`BottomNavTripLevel` yang sudah ada dari Tahap 1 dipakai apa adanya; `active="riwayat"` sekarang benar-benar menuju `/riwayat` (bukan fallback ke Ringkasan lagi seperti placeholder Tahap 1).

## 7. Fidelity visual

Sama seperti Tahap 1: warna OKLCH, Manrope/Inter/IBM Plex Mono, radius, spacing dari `handoff.md`, direkreasi presisi dari layar Ringkasan/Riwayat/Sub trip detail/Add Expense di `Cepat Bayarkan.dc.html`. Nominal uang selalu pakai `font-mono` (IBM Plex Mono). Kategori pill chips: Makan, Transport, Nginap, Tiket wisata, Lainnya (copy persis).

## 8. Yang sengaja belum dibangun di bagian ini
- Mode "Rincian per item", pajak makanan/service charge, "Tagihkan ke" — Tahap 2b.
- Lampiran/preview foto struk, OCR — Tahap 4.
- Layar "Saldo & deposit" (agregat lintas sub trip + deposit antar-anggota) — Tahap 3.
- Riwayat perubahan detail (changelog field-per-field) — cuma disimpan `created_by`/`updated_by`/timestamp, bukan log tiap perubahan, karena tidak ada layar di desain yang menampilkan itu.
