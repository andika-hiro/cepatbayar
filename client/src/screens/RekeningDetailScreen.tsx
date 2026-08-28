import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type TripDetail, type MemberAccount } from '../lib/api';

export default function RekeningDetailScreen() {
  const { publicId, memberId } = useParams<{ publicId: string; memberId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [accounts, setAccounts] = useState<MemberAccount[] | null>(null);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [qrisImage, setQrisImage] = useState<string | null>(null);
  const [previewQris, setPreviewQris] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsedMemberId = memberId ? parseInt(memberId, 10) : 0;

  async function load() {
    if (!publicId || !parsedMemberId) return;
    try {
      const [tripData, accs] = await Promise.all([
        api.tripDetail(publicId),
        api.getMemberAccounts(publicId, parsedMemberId),
      ]);
      setTrip(tripData);
      setAccounts(accs);
    } catch {
      setError('Gagal memuat detail rekening.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId, memberId]);

  function handleQrisFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setQrisImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  function handleCopy(accId: number, num: string) {
    navigator.clipboard.writeText(num);
    setCopiedId(accId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!publicId || !parsedMemberId || !label.trim() || !accountNumber.trim()) return;
    try {
      await api.addMemberAccount(publicId, parsedMemberId, {
        label: label.trim(),
        accountNumber: accountNumber.trim(),
        isDefault,
        qrisImage,
      });
      setLabel('');
      setAccountNumber('');
      setIsDefault(false);
      setQrisImage(null);
      setIsAddSheetOpen(false);
      load();
    } catch {
      alert('Gagal menambahkan rekening.');
    }
  }

  async function handleSetDefault(accountId: number) {
    if (!publicId || !parsedMemberId) return;
    try {
      await api.setDefaultAccount(publicId, parsedMemberId, accountId);
      load();
    } catch {
      alert('Gagal mengubah rekening default.');
    }
  }

  async function handleDelete(accountId: number) {
    if (!publicId || !parsedMemberId) return;
    if (!confirm('Apakah kamu yakin ingin menghapus rekening ini?')) return;
    try {
      await api.deleteMemberAccount(publicId, parsedMemberId, accountId);
      load();
    } catch {
      alert('Gagal menghapus rekening.');
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
        <div className="font-inter text-[13px] text-neg">{error}</div>
      </div>
    );
  }

  if (!trip || !accounts || !publicId) return null;

  const memberName = trip.members.find((m) => m.id === parsedMemberId)?.name || 'Anggota';

  return (
    <div className="flex min-h-screen flex-col gap-5 px-5 pb-10 pt-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/t/${publicId}/pengaturan/anggota`)}
          className="font-inter text-xs font-semibold text-accent"
        >
          ← Kelola anggota
        </button>
        <div className="font-manrope text-[17px] font-extrabold text-text">Rekening {memberName}</div>
        <div className="w-[60px]" />
      </div>

      {/* Account List */}
      <div className="flex flex-col gap-3">
        {accounts.length === 0 ? (
          <div className="rounded-card border border-border bg-surface px-4 py-6 text-center font-inter text-xs text-sub">
            Belum ada rekening/e-wallet tersimpan.
          </div>
        ) : (
          accounts.map((acc) => (
            <div key={acc.id} className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="font-inter text-sm font-bold text-text">{acc.label}</div>
                  {acc.isDefault && (
                    <span className="rounded bg-accent/15 px-2 py-0.5 font-inter text-[10px] font-bold text-accent">
                      Default
                    </span>
                  )}
                  {acc.qrisImage && (
                    <button
                      type="button"
                      onClick={() => setPreviewQris(acc.qrisImage!)}
                      className="rounded bg-teal-500/15 px-2 py-0.5 font-inter text-[10px] font-bold text-teal-600 dark:text-teal-400 hover:opacity-85"
                    >
                      📸 Lihat QRIS
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-text">{acc.accountNumber}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(acc.id, acc.accountNumber)}
                    className="rounded border border-border px-2 py-0.5 font-inter text-[11px] font-medium text-sub hover:bg-surfaceAlt active:scale-95 transition-all"
                    title="Salin nomor rekening"
                  >
                    {copiedId === acc.id ? '✓ Tersalin' : '📋 Salin'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-1 border-t border-border/50">
                {!acc.isDefault && (
                  <button
                    onClick={() => handleSetDefault(acc.id)}
                    className="font-inter text-xs font-semibold text-accent"
                  >
                    Jadikan Default
                  </button>
                )}
                <button
                  onClick={() => handleDelete(acc.id)}
                  className="font-inter text-xs font-semibold text-neg"
                >
                  Hapus
                </button>
              </div>
            </div>
          ))
        )}

        <button
          onClick={() => setIsAddSheetOpen(true)}
          className="rounded-card border border-dashed border-border p-4 text-center font-inter text-xs font-bold text-accent"
        >
          + Tambah rekening / QRIS
        </button>
      </div>

      {/* Add Account Sheet / Modal */}
      {isAddSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-5">
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-card bg-surface p-5">
            <div className="font-manrope text-base font-bold text-text">Tambah Rekening / QRIS</div>
            <form onSubmit={handleAddAccount} className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Bank / E-Wallet (misal: BCA, GoPay, QRIS BCA)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="rounded-input border border-border bg-surface px-3 py-2 font-inter text-sm text-text"
                autoFocus
                required
              />
              <input
                type="text"
                placeholder="Nomor rekening / HP"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="rounded-input border border-border bg-surface px-3 py-2 font-mono text-sm text-text"
                required
              />
              <div className="flex flex-col gap-1">
                <label className="font-inter text-xs font-medium text-sub">Upload Gambar QRIS (Opsional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleQrisFileChange}
                  className="font-inter text-xs text-text file:mr-2 file:rounded-pill file:border-0 file:bg-surfaceAlt file:px-3 file:py-1 file:font-inter file:text-xs file:font-semibold file:text-text hover:file:bg-surfaceAlt/80 cursor-pointer"
                />
                {qrisImage && (
                  <div className="mt-1 flex items-center gap-2">
                    <img src={qrisImage} alt="Preview QRIS" className="h-12 w-12 rounded border border-border object-contain" />
                    <button
                      type="button"
                      onClick={() => setQrisImage(null)}
                      className="font-inter text-[11px] text-neg underline"
                    >
                      Hapus gambar
                    </button>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 font-inter text-xs text-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="accent-accent"
                />
                <span>Jadikan rekening default</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddSheetOpen(false)}
                  className="rounded-pill border border-border px-4 py-1.5 font-inter text-xs font-semibold text-sub"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-pill bg-accent px-4 py-1.5 font-inter text-xs font-bold text-onAccent"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QRIS Full Preview Modal */}
      {previewQris && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5 cursor-pointer"
          onClick={() => setPreviewQris(null)}
        >
          <div className="relative flex flex-col items-center gap-3 rounded-card bg-surface p-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between w-full">
              <span className="font-manrope text-sm font-bold text-text">QRIS Pembayaran</span>
              <button
                type="button"
                onClick={() => setPreviewQris(null)}
                className="font-inter text-xs font-bold text-sub hover:text-text"
              >
                ✕ Tutup
              </button>
            </div>
            <img src={previewQris} alt="QRIS Code" className="w-full max-h-[350px] rounded-lg object-contain bg-white p-2" />
            <a
              href={previewQris}
              download="qris_cepatbayar.png"
              className="w-full text-center rounded-pill bg-accent py-2 font-inter text-xs font-bold text-onAccent shadow-sm"
            >
              ⬇️ Download QRIS
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
