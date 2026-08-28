import { useState, useEffect } from 'react';
import { formatRupiah } from '../lib/format';

export interface SettleDebtTarget {
  subTripId: number;
  debtId: number;
  subTripName: string;
  debtorName: string;
  creditorName?: string;
  amount: number;
}

interface SettleDebtModalProps {
  isOpen: boolean;
  debt: SettleDebtTarget | null;
  onClose: () => void;
  onConfirm: (proofImage?: string | null) => Promise<void> | void;
}

export default function SettleDebtModal({
  isOpen,
  debt,
  onClose,
  onConfirm,
}: SettleDebtModalProps) {
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Reset proof image when modal opens for a new debt
  useEffect(() => {
    if (isOpen) {
      setProofImage(null);
      setSubmitting(false);
      setCopiedNotification(false);
    }
  }, [isOpen, debt?.debtId]);

  // Global & modal clipboard paste listener (Ctrl+V / Cmd+V)
  useEffect(() => {
    if (!isOpen) return;

    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = () => {
              setProofImage(reader.result as string);
              setCopiedNotification(true);
              setTimeout(() => setCopiedNotification(false), 3000);
            };
            reader.readAsDataURL(blob);
            break;
          }
        }
      }
    }

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  async function handlePasteFromClipboard() {
    try {
      if (!navigator.clipboard?.read) {
        alert('Gunakan pintasan keyboard Ctrl+V atau Cmd+V untuk menempel screenshot langsung.');
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onload = () => {
            setProofImage(reader.result as string);
            setCopiedNotification(true);
            setTimeout(() => setCopiedNotification(false), 3000);
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
      alert('Tidak ada gambar di clipboard. Silakan copy atau screenshot terlebih dahulu.');
    } catch {
      alert('Gunakan pintasan keyboard Ctrl+V atau Cmd+V untuk menempel screenshot langsung.');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setProofImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm(proofImage);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen || !debt) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-4 rounded-card bg-surface p-5 shadow-xl border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="font-manrope text-base font-bold text-text">Konfirmasi Pelunasan</div>
          <button
            type="button"
            onClick={onClose}
            className="font-inter text-xs font-semibold text-sub hover:text-text"
          >
            ✕
          </button>
        </div>

        {/* Debt summary */}
        <div className="flex flex-col gap-1 rounded-lg bg-surfaceAlt p-3">
          <div className="flex items-center justify-between font-inter text-xs text-sub">
            <span className="font-semibold text-text">{debt.subTripName}</span>
            <span>
              {debt.debtorName} {debt.creditorName ? `→ ${debt.creditorName}` : ''}
            </span>
          </div>
          <div className="font-mono text-lg font-bold text-pos">
            {formatRupiah(debt.amount)}
          </div>
        </div>

        {/* Bukti Transfer Upload / Paste */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-inter text-xs font-semibold text-text">
              Bukti Transfer (Opsional)
            </span>
            <span className="font-inter text-[11px] text-sub">Bisa tempel / paste</span>
          </div>

          {proofImage ? (
            <div className="relative flex flex-col items-center gap-2 rounded-lg border border-border bg-bg p-2">
              <img
                src={proofImage}
                alt="Preview Bukti Transfer"
                className="max-h-48 w-full rounded object-contain bg-black/5"
              />
              <button
                type="button"
                onClick={() => setProofImage(null)}
                className="font-inter text-xs font-semibold text-neg hover:underline"
              >
                🗑️ Hapus Bukti
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 rounded-lg border border-dashed border-border bg-bg p-4 text-center">
              <div className="font-inter text-xs text-sub leading-relaxed">
                Tangkapan layar/bukti transfer bisa langsung ditempel (<strong>Ctrl+V</strong> / <strong>Cmd+V</strong>) tanpa perlu simpan ke galeri.
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="rounded-pill bg-surfaceAlt border border-border px-3 py-1.5 font-inter text-xs font-semibold text-text hover:bg-border/50 active:scale-95 transition-all"
                >
                  📋 Tempel Screenshot
                </button>
                <label className="cursor-pointer rounded-pill bg-surfaceAlt border border-border px-3 py-1.5 font-inter text-xs font-semibold text-text hover:bg-border/50 active:scale-95 transition-all">
                  📁 Pilih File
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>
              {copiedNotification && (
                <div className="font-inter text-xs text-pos font-semibold">
                  ✓ Gambar berhasil ditempel!
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-pill border border-border px-4 py-2 font-inter text-xs font-semibold text-sub hover:text-text"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-pill bg-pos px-5 py-2 font-inter text-xs font-bold text-white hover:opacity-90 active:scale-95 transition-all shadow-sm"
          >
            {submitting ? 'Memproses...' : '✓ Tandai Lunas'}
          </button>
        </div>
      </div>
    </div>
  );
}
