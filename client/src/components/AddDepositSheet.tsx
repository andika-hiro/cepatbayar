import { useState } from 'react';
import type { TripMember } from '../lib/api';

interface AddDepositSheetProps {
  isOpen: boolean;
  members: TripMember[];
  currentMemberId: number;
  onClose: () => void;
  onSave: (input: { fromMemberId: number; toMemberId: number; amount: number; proofNote?: string }) => Promise<void> | void;
}

export default function AddDepositSheet({
  isOpen,
  members,
  currentMemberId,
  onClose,
  onSave,
}: AddDepositSheetProps) {
  const defaultToMember = members.find((m) => m.id !== currentMemberId)?.id || members[0]?.id || 0;
  const [fromMemberId, setFromMemberId] = useState(currentMemberId);
  const [toMemberId, setToMemberId] = useState(defaultToMember);
  const [amount, setAmount] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const numAmount = parseInt(amount.replace(/[^0-9]/g, ''), 10);
    if (!numAmount || numAmount <= 0) {
      setError('Nominal deposit harus lebih dari 0.');
      return;
    }
    if (fromMemberId === toMemberId) {
      setError('Pilih anggota yang berbeda untuk penerima deposit.');
      return;
    }

    try {
      setSubmitting(true);
      await onSave({
        fromMemberId,
        toMemberId,
        amount: numAmount,
        proofNote: proofNote.trim() || undefined,
      });
    } catch {
      setError('Gagal menyimpan deposit.');
      setSubmitting(false);
    }
  }

  function handleAmountChange(val: string) {
    const digits = val.replace(/[^0-9]/g, '');
    if (!digits) {
      setAmount('');
      return;
    }
    setAmount(parseInt(digits, 10).toLocaleString('en-US'));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/45">
      <div className="flex max-h-[90vh] flex-col gap-4 rounded-t-[20px] bg-surface p-5 transition-transform duration-300">
        <div className="flex items-center justify-between">
          <div className="font-manrope text-[17px] font-bold text-text">Catat deposit baru</div>
          <button onClick={onClose} className="font-inter text-xs font-semibold text-sub">
            Batal
          </button>
        </div>

        {error && <div className="font-inter text-xs text-neg">{error}</div>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="from-member-select" className="font-inter text-xs font-semibold text-sub">Dari (yang deposit)</label>
            <select
              id="from-member-select"
              value={fromMemberId}
              onChange={(e) => setFromMemberId(Number(e.target.value))}
              className="rounded-input border border-border bg-surface px-3 py-2.5 font-inter text-sm text-text"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.id === currentMemberId ? '(Kamu)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="to-member-select" className="font-inter text-xs font-semibold text-sub">Deposit ke (penerima)</label>
            <select
              id="to-member-select"
              value={toMemberId}
              onChange={(e) => setToMemberId(Number(e.target.value))}
              className="rounded-input border border-border bg-surface px-3 py-2.5 font-inter text-sm text-text"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="deposit-amount-input" className="font-inter text-xs font-semibold text-sub">Jumlah (Rp)</label>
            <input
              id="deposit-amount-input"
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0"
              className="rounded-input border border-border bg-surface px-3 py-2.5 font-mono text-sm text-text"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="proof-note-input" className="font-inter text-xs font-semibold text-sub">Catatan / Bukti transfer (opsional)</label>
            <input
              id="proof-note-input"
              type="text"
              value={proofNote}
              onChange={(e) => setProofNote(e.target.value)}
              placeholder="misal: Transfer via BCA"
              className="rounded-input border border-border bg-surface px-3 py-2.5 font-inter text-sm text-text"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-input bg-accent py-3 font-inter text-sm font-bold text-onAccent disabled:opacity-50"
          >
            {submitting ? 'Menyimpan...' : 'Simpan deposit'}
          </button>
        </form>
      </div>
    </div>
  );
}
