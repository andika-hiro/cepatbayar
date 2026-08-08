# Tahap 2b: Rincian per item, pajak, Tagihkan ke — Design

**Status:** Menunggu review tertulis
**Sumber kebenaran:** `context/prd-patungan-trip.md` §5.2, §5.4 (logic), `context/Cepat Bayarkan.dc.html` + `context/handoff.md` layar Add Expense (visual). Melanjutkan `docs/superpowers/specs/2026-08-08-cepatkan-bayar-stage-2-ringkasan-sub-trip-design.md` (Tahap 2 bagian 1, sudah di-merge).

## 1. Cakupan

Menambah mode kedua di form Tambah/Edit pengeluaran: **"Rincian per item"** (alternatif dari "Jumlah total" yang sudah ada), lengkap dengan pajak makanan per item, service charge rata, dan pengalihan tagihan ("Tagihkan ke"). Di luar cakupan ini: foto struk/OCR (Tahap 4), Saldo & deposit (Tahap 3).

**Kabar baik arsitektur:** tabel `debts` dan logic settle/reconcile dari Tahap 2a **tidak berubah sama sekali** — cuma cara menghitung isi `debts` yang beda per mode. Ini karena `debts` sudah dirancang sebagai "buku besar hasil hitung", bukan tempat nyimpen rincian item.

## 2. Keputusan desain (sudah dikonfirmasi)

1. **"Tagihkan ke" per (item, penanggung).** Tiap baris penanggung di tiap item punya opsi alihkan sendiri-sendiri — sesuai teks PRD "per item/penanggung". Yang berpindah cuma siapa yang **berutang** untuk item itu; penerima uang tetap pembayar sub trip (tidak berubah).
2. **Service charge tidak ikut teralihkan.** Orang yang tagihan itemnya dialihkan tetap kena bagian service charge atas namanya sendiri — PRD cuma menjamin dia "tetap dihitung ikut" sebagai pembagi (denominator), bukan berarti utang service charge-nya juga pindah.
3. **Mode dikunci saat edit.** Toggle "Jumlah total" ↔ "Rincian per item" cuma aktif saat **membuat** sub trip baru. Saat edit, mode yang sudah dipilih di awal tidak bisa diganti (field mode disabled/read-only di form edit).

## 3. Model data

**Tabel baru:**
```
sub_trip_items              id, sub_trip_id → sub_trips, name, price (int, Rupiah)
sub_trip_item_participants  id, item_id → sub_trip_items, member_id → trip_members (penanggung asli),
                             billed_to_member_id → trip_members (nullable, hasil "Tagihkan ke")
```

**Kolom baru di `sub_trips`:**
```
split_mode      enum('total', 'per_item'), notNull, default 'total'
tax_percent     decimal(5,2), notNull, default 0   -- pajak makanan per item, %
service_percent decimal(5,2), notNull, default 0   -- service charge, %
```
`amount` tetap kolom yang sama seperti Tahap 2a, tapi di mode `per_item` nilainya **hasil hitung server** (subtotal item + pajak + service charge), bukan input manual — ini menjaga semua kode yang sudah baca `subTrips.amount` (rollup, Ringkasan total trip, kartu Riwayat) tetap jalan tanpa modifikasi.

`debts` **tidak berubah** — tetap satu baris per (sub trip, penanggung akhir), tetap satu-satunya sumber kebenaran buat status lunas & rollup.

## 4. Aturan perhitungan (mode `per_item`)

Untuk tiap item *i* dengan peserta (penanggung) *p₁...pₙ*:
```
pajak_i   = ceil(harga_i × taxPercent / 100)
total_i   = harga_i + pajak_i
share_i   = ceil(total_i / n)   -- n = jumlah penanggung item itu
```
Tiap penanggung *pⱼ* dibebani `share_i`, tapi **ditagihkan** ke `billedToMemberId ?? memberId` (kalau ada pengalihan, ke situ; kalau tidak, ke dirinya sendiri).

Untuk service charge (dihitung sekali per sub trip, bukan per item):
```
subtotal      = Σ harga_i (semua item, sebelum pajak)
serviceCharge = ceil(subtotal × servicePercent / 100)
pesertaUnik   = union semua memberId (penanggung asli, BUKAN hasil pengalihan) di seluruh item sub trip ini
shareService  = ceil(serviceCharge / |pesertaUnik|)
```
Tiap anggota di `pesertaUnik` dibebani `shareService`, ditagihkan **ke dirinya sendiri** (tidak kena pengalihan — lihat keputusan §2.2).

**Agregasi akhir:** semua beban (item shares + service share) untuk penanggung yang sama dijumlahkan jadi **satu** baris `debts` per (sub trip, penanggung akhir) — persis pola yang sudah ada di Tahap 2a. Penanggung yang hasil agregasinya jatuh ke pembayar sub trip sendiri **tidak** menghasilkan baris debt (aturan "tidak ada utang ke diri sendiri" dari Tahap 2a tetap berlaku).

**Total sub trip** (disimpan di `subTrips.amount`):
```
amount = subtotal + Σ pajak_i (semua item) + serviceCharge
```

**Pembulatan:** presisi penuh, cuma pecahan di bawah Rp1 yang dibulatkan ke atas — `Math.ceil` di setiap langkah (pajak per item, share per item, share service), sama seperti aturan Tahap 2a.

## 5. Edit sub trip mode `per_item`

Karena item bukan entitas yang punya status sendiri (beda dari `debts` yang punya `settled`), edit di mode ini **mengganti seluruh daftar item** (hapus semua `sub_trip_items` lama beserta partisipannya, insert ulang yang baru) — bukan di-diff seperti `debts`. Yang tetap di-diff/reconcile dengan hati-hati (preserve `settled`) hanya `debts`-nya, memakai `reconcileDebts` yang **sudah ada** dari Tahap 2a — fungsi itu tidak peduli bagaimana `Map<memberId, amount>` barunya dihitung, jadi dipakai ulang tanpa perubahan.

## 6. API (perluasan endpoint Tahap 2a, bukan endpoint baru)

`POST /api/trips/:publicId/subtrips` dan `PATCH .../subtrips/:subTripId` menerima body yang lebih kaya:
```
{
  name, category, date, payerMemberId, createdByMemberId,   // sama seperti sebelumnya
  splitMode: 'total' | 'per_item',
  // mode 'total' (default): field sama seperti Tahap 2a — amount, participantMemberIds
  // mode 'per_item':
  taxPercent?: number, servicePercent?: number,
  items?: [{ name, price, participants: [{ memberId, billedToMemberId? }] }]
}
```
Validasi tambahan: di mode `per_item`, `items` minimal 1, tiap item minimal 1 partisipan, `price` & `taxPercent`/`servicePercent` non-negatif. Semua `memberId` **dan** `billedToMemberId` di seluruh item divalidasi lewat `memberIdsBelongToTrip` yang sudah ada (scoping ke trip, bukan trip lain) — sama disiplin dengan Tahap 2a §9 keputusan Tahap 1.

`GET .../subtrips/:subTripId` menambah field di response: `splitMode`, `taxPercent`, `servicePercent`, `items: [{id, name, price, participants: [{memberId, name, billedToMemberId, billedToName}]}]` (array kosong buat sub trip mode `total`).

## 7. Layar & komponen

**AddEditSubTripSheet** dapat bagian baru **"Opsi lanjutan"** (collapsible, tertutup secara default — sesuai PRD "di balik toggle 'Opsi lanjutan', bukan langsung kelihatan"):
- Segmented toggle "Jumlah total" / "Rincian per item" — **hanya interaktif saat mode create**; saat edit, tampil sebagai indikator non-aktif sesuai mode yang tersimpan.
- Kalau "Rincian per item" dipilih: field "Nominal" di level atas disembunyikan (digantikan oleh daftar item), tiap baris item punya: nama, harga (Rp), daftar partisipan (checkbox + "Pilih semua" + search anggota — pola yang sama dipakai ulang dari "Dibagi ke" Tahap 2a), dan per partisipan ada link "Tagihkan ke →" yang membuka picker anggota lain (opsional, default kosong). Tombol "+ Tambah item" menambah baris kosong baru.
- Di bawah daftar item: input persen "Pajak makanan (per item)" dan "Service charge (rata)", dengan copy penjelas persis PRD: pajak dihitung per item dan dibebankan ke penanggungnya; service charge dibagi rata ke semua peserta sub trip itu tanpa peduli besar-kecil pesanannya masing-masing.

**SubTripDetailScreen** dapat bagian baru **"Rincian item"** (cuma muncul kalau `splitMode === 'per_item'`) — daftar item read-only (nama, harga, siapa nanggung, tanda kalau ada pengalihan) di atas bagian "Tagihan per orang" yang sudah ada (yang tetap menampilkan hasil agregasi per penanggung akhir, tidak berubah dari Tahap 2a).

## 8. Fidelity visual
Sama seperti tahap-tahap sebelumnya: warna OKLCH, Manrope/Inter/IBM Plex Mono, radius, spacing dari `handoff.md`. Karena file desain menyebut field-field ini di layar Add Expense yang sama, styling-nya konsisten dengan komponen yang sudah ada di `AddEditSubTripSheet` (chip kategori, input Rp, checkbox list) — bukan pola visual baru.

## 9. Yang sengaja belum dibangun di tahap ini
- Live preview total saat mengisi item (baru tahu total setelah simpan, seperti mode jumlah total juga tidak preview) — bisa ditambah nanti kalau dirasa perlu, bukan diminta PRD.
- Isi otomatis dari hasil OCR (Tahap 4).
- Duplikasi baris item (copy item) — tidak diminta PRD, tiap item diisi manual dari nol.
