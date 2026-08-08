# Tahap 3: Saldo & Deposit, Kelola Anggota & Rekening — Design Spec

**Status:** Draft — Siap diimplementasikan
**Sumber kebenaran:** `context/prd-patungan-trip.md` §5.1, §5.5, §5.6, §5.8, §5.9, `context/Cepat Bayarkan.dc.html` + `context/handoff.md` layar Saldo & deposit, Riwayat pelunasan, Kelola anggota, Rekening detail, Pengaturan.

## 1. Cakupan

Tahap 3 menyelesaikan seluruh fitur saldo, deposit, pelunasan, serta pengelolaan anggota & rekening trip:
1. **Layar Saldo & deposit** (`/t/:publicId/saldo`):
   - Balance rollup per anggota (murni informasional).
   - CTA ke WA Rekap (`/t/:publicId/wa-preview` atau launcher).
   - "Semua tagihan (per sub trip)": daftar setiap baris tagihan belum lunas across sub trips (dari → ke, nominal, nama sub trip), info rekening tujuan (dengan selector / fallback), tombol "Tandai sudah transfer" per baris.
   - Display note potong deposit otomatis (dinamis): e.g., *"Rp10.000 dipotong dari deposit Adit → Anton (sisa Rp0)"*.
   - "Deposit antar-anggota": daftar saldo deposit berjalan antar pasangan (dari → ke), indikator warning "menipis", tombol "+ Deposit".
   - Link ke "Riwayat pelunasan →".
2. **Layar Riwayat pelunasan** (`/t/:publicId/riwayat-pelunasan`):
   - Read-only history daftar tagihan yang sudah settled (dari → ke, sub trip, nominal hijau `pos`, tanggal lunas).
3. **Form Deposit (Bottom Sheet)**:
   - Form catat deposit baru (pilih dari, ke, nominal Rp, catatan/bukti transfer optional).
4. **Kelola Anggota & Rekening**:
   - Navigasi dari Pengaturan (`/t/:publicId/pengaturan/anggota`).
   - Layar **Kelola Anggota**: daftar anggota + badge jumlah rekening tersimpan, tombol "+ Tambah Anggota" untuk menambahkan peserta baru ke trip.
   - Layar **Rekening Detail** (`/t/:publicId/pengaturan/anggota/:memberId`): daftar rekening/e-wallet per anggota (label, nomor, badge Default), tombol set default, hapus, dan "+ Tambah Rekening".

---

## 2. Invarian Keras & Keputusan Desain

### Invarian Keras (TIDAK BOLEH DILANGGAR)
1. **Tanpa Netting/Penyederhanaan Utang:** `debts` tetap 1 baris per (sub trip, penanggung akhir). Tidak digabung antar sub trip maupun antar pembayar.
2. **Rollup Saldo Informasional:** Angka saldo rollup per anggota murni gambaran singkat, tidak pernah dipakai membuat saran transfer gabungan.
3. **Dynamic Auto-Apply Deposit:** Potongan deposit dihitung secara dinamis saat query GET dilakukan (tidak disimpan statis di DB agar tidak basi saat utang/deposit berubah).
4. **`trips.id` Tersembunyi:** Primary key internal `trips.id` TIDAK BOLEH pernah muncul di response API. HANYA `trips.publicId` dan child IDs (`member.id`, `subTrip.id`, `debt.id`, `deposit.id`, `account.id`) yang dikirim ke client.

### Keputusan Desain (Pencatatan Asumsi)
- **Deposit Running Credit:** Kumpulan entry deposit dari member A ke member B dijumlahkan menjadi `totalDeposit`. Saat tagihan A → B yang belum lunas diperiksa secara kronologis (`sub_trips.date` & `sub_trips.id`), deposit diterapkan seberapa pun yang tersisa.
- **Threshold Deposit Menipis:** Indikator deposit "menipis" (`low: true`) dipicu jika sisa saldo deposit `remainingBalance <= 0` atau sisa saldo `< 20%` dari akumulasi deposit.
- **Rekening Default & Scoping:** Tiap anggota bisa punya multiple `member_accounts`. Satu rekening bisa ditandai `isDefault: true`. Saat endpoint `GET /api/trips/:publicId/saldo` dipanggil, daftar rekening penerima disertakan dalam response agar UI bisa menampilkan rekening default dan dropdown pilihan rekening lain.

---

## 3. Model Data (Database Schema)

Tabel baru yang ditambahkan ke `server/src/db/schema.ts`:

```typescript
export const memberAccounts = mysqlTable('member_accounts', {
  id: int('id').autoincrement().primaryKey(),
  memberId: int('member_id').notNull().references(() => tripMembers.id),
  label: varchar('label', { length: 255 }).notNull(), // e.g. "BCA", "GoPay"
  accountNumber: varchar('account_number', { length: 255 }).notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const deposits = mysqlTable('deposits', {
  id: int('id').autoincrement().primaryKey(),
  tripId: int('trip_id').notNull().references(() => trips.id),
  fromMemberId: int('from_member_id').notNull().references(() => tripMembers.id),
  toMemberId: int('to_member_id').notNull().references(() => tripMembers.id),
  amount: int('amount').notNull(),
  proofNote: varchar('proof_note', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

---

## 4. Perhitungan Dinamis Auto-Apply Deposit

Fungsi helper di `server/src/lib/depositLogic.ts`:

1. Ambil semua `deposits` dalam trip, agregasi per pasangan `(fromMemberId, toMemberId)` menjadi `depositPoolsMap`.
2. Ambil semua `debts` belum lunas dalam trip, di-join dengan `sub_trips` dan `trip_members` (pembayar & penanggung), diurutkan kronologis (`sub_trips.date ASC, sub_trips.id ASC, debts.id ASC`).
3. Iterasi setiap debt `d`:
   - Penanggung `debtorId = d.memberId`, Pembayar `creditorId = d.subTrip.payerMemberId`.
   - Cek apakah `depositPoolsMap` memiliki sisa saldo untuk `(debtorId, creditorId)`.
   - Jika sisa saldo > 0:
     - `applied = min(d.amount, remainingBalance)`
     - `remainingBalance -= applied`
     - Tambahkan `depositNote`: `"Rp" + formatRp(applied) + " dipotong dari deposit " + debtorName + " → " + creditorName + " (sisa Rp" + formatRp(remainingBalance) + ")"`
4. Kembalikan array debts berhiaskan `depositNote` (jika ada) dan daftar deposit pasangan beserta status `remainingBalance` & `low`.

---

## 5. Spesifikasi API

Semua endpoint bertempat di `/api/trips/:publicId/...` dan divalidasi scoping-nya ke trip.

1. `GET /api/trips/:publicId/saldo`
   - Response:
     ```json
     {
       "rollupMembers": [{ "memberId": 1, "name": "Adit", "rollup": 50000, "status": "pos" }],
       "unsettledDebts": [
         {
           "id": 10,
           "subTripId": 3,
           "subTripName": "Makan Resto A",
           "date": "2026-08-08",
           "debtorMemberId": 2,
           "debtorName": "Budi",
           "creditorMemberId": 1,
           "creditorName": "Adit",
           "amount": 25000,
           "depositNote": "Rp10.000 dipotong dari deposit Budi → Adit (sisa Rp0)",
           "accounts": [
             { "id": 1, "label": "BCA", "accountNumber": "1234567890", "isDefault": true }
           ]
         }
       ],
       "deposits": [
         {
           "fromMemberId": 2,
           "fromName": "Budi",
           "toMemberId": 1,
           "toName": "Adit",
           "totalAmount": 10000,
           "remainingBalance": 0,
           "low": true
         }
       ]
     }
     ```

2. `GET /api/trips/:publicId/settled-debts`
   - Response: array tagihan yang `settled = true`, diurutkan `settledAt DESC`.

3. `POST /api/trips/:publicId/deposits`
   - Body: `{ fromMemberId: number, toMemberId: number, amount: number, proofNote?: string }`
   - Validasi: `fromMemberId != toMemberId`, keduanya anggota trip ini, `amount > 0`.

4. `POST /api/trips/:publicId/members`
   - Body: `{ name: string }`
   - Menambahkan anggota baru ke trip (`trip_members`).

5. `GET /api/trips/:publicId/members/:memberId/accounts`
   - Response: array `memberAccounts` milik anggota tersebut.

6. `POST /api/trips/:publicId/members/:memberId/accounts`
   - Body: `{ label: string, accountNumber: string, isDefault?: boolean }`
   - Tambah rekening baru. Jika `isDefault: true`, otomatis meng-un-set default rekening lain milik anggota tersebut.

7. `PATCH /api/trips/:publicId/members/:memberId/accounts/:accountId`
   - Body: `{ isDefault?: boolean }`
   - Ubah status default rekening.

8. `DELETE /api/trips/:publicId/members/:memberId/accounts/:accountId`
   - Hapus rekening.

---

## 6. Komponen & Navigation Frontend

1. Routing (`client/src/App.tsx`):
   - `/t/:publicId/saldo` → `SaldoScreen`
   - `/t/:publicId/riwayat-pelunasan` → `RiwayatPelunasanScreen`
   - `/t/:publicId/pengaturan` → `PengaturanScreen` (ditambahkan link Kelola Anggota)
   - `/t/:publicId/pengaturan/anggota` → `KelolaAnggotaScreen`
   - `/t/:publicId/pengaturan/anggota/:memberId` → `RekeningDetailScreen`

2. Form / Overlay Sheets:
   - `AddDepositSheet.tsx`: Bottom sheet untuk menambah deposit.
   - `AddMemberModal.tsx` / `AddAccountModal.tsx`: Modal tambah anggota & tambah rekening.

3. Bottom Nav:
   - `BottomNavTripLevel.tsx` sudah memiliki tab `saldo`. Mengarahkan ke `/t/:publicId/saldo`.

---

## 7. Plan Eksekusi & Verifikasi

1. DB Schema & Migration/Push.
2. Implementasi backend (`depositLogic.ts`, `routes/saldo.ts`, `routes/members.ts`).
3. Unit test backend (test dynamic deposit calculation, member & account endpoints, scoping validation).
4. Implementasi frontend (`SaldoScreen`, `RiwayatPelunasanScreen`, `KelolaAnggotaScreen`, `RekeningDetailScreen`, `AddDepositSheet`, modal forms).
5. Unit/integration test frontend.
6. Verification baseline test full suite.
