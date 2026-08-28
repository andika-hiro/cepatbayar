import { useState, useEffect, useMemo } from 'react';
import { formatRupiah } from '../lib/format';
import { compressImage } from '../lib/imageCompressor';

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
  debt: SettleDebtTarget | SettleDebtTarget[] | null;
  onClose: () => void;
  onConfirm: (selectedDebts: SettleDebtTarget[], proofImage?: string | null) => Promise<void> | void;
}

export default function SettleDebtModal({
  isOpen,
  debt,
  onClose,
  onConfirm,
}: SettleDebtModalProps) {
  const debtList = useMemo<SettleDebtTarget[]>(() => {
    if (!debt) return [];
    return Array.isArray(debt) ? debt : [debt];
  }, [debt]);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Reset states when modal opens
  useEffect(() => {
    if (isOpen && debtList.length > 0) {
      setSelectedIds(new Set(debtList.map((d) => d.debtId)));
      setProofImage(null);
      setSubmitting(false);
      setCopiedNotification(false);
    }
  }, [isOpen, debtList]);

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
            compressImage(blob).then((compressed) => {
              setProofImage(compressed);
              setCopiedNotification(true);
              setTimeout(() => setCopiedNotification(false), 3000);
            });
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
          const compressed = await compressImage(blob as File);
          setProofImage(compressed);
          setCopiedNotification(true);
          setTimeout(() => setCopiedNotification(false), 3000);
          return;
        }
      }
      alert('Tidak ada gambar di clipboard. Silakan copy atau screenshot terlebih dahulu.');
    } catch {
      alert('Gunakan pintasan keyboard Ctrl+V atau Cmd+V untuk menempel screenshot langsung.');
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setProofImage(compressed);
  }

  function toggleDebtSelection(debtId: number) {
    const next = new Set(selectedIds);
    if (next.has(debtId)) {
      if (next.size === 1) return; // keep at least 1 selected
      next.delete(debtId);
    } else {
      next.add(debtId);
    }
    setSelectedIds(next);
  }

  const selectedDebts = debtList.filter((d) => selectedIds.has(d.debtId));
  const totalAmount = selectedDebts.reduce((sum, d) => sum + d.amount, 0);

  async function handleConfirm() {
    if (selectedDebts.length === 0) return;
    setSubmitting(true);
    try {
      await onConfirm(selectedDebts, proofImage);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen || debtList.length === 0) return null;

  const isMultiple = debtList.length > 1;
  const commonDebtor = debtList[0]?.debtorName;
  const commonCreditor = debtList[0]?.creditorName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-4 rounded-card bg-surface p-5 shadow-xl border border-border max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="font-manrope text-base font-bold text-text">
            {isMultiple ? 'Pelunasan Gabungan' : 'Konfirmasi Pelunasan'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-inter text-xs font-semibold text-sub hover:text-text"
          >
            ✕
          </button>
        </div>

        {/* Debt itemized breakdown */}
        <div className="flex flex-col gap-2 rounded-lg bg-surfaceAlt p-3">
          <div className="flex items-center justify-between font-inter text-xs text-sub border-b border-border/60 pb-1.5">
            <span>
              {commonDebtor} {commonCreditor ? `→ ${commonCreditor}` : ''}
            </span>
            <span className="font-semibold">{selectedDebts.length} tagihan</span>
          </div>

          {isMultiple ? (
            <div className="flex flex-col gap-1.5 py-1">
              {debtList.map((d) => {
                const checked = selectedIds.has(d.debtId);
                return (
                  <label
                    key={d.debtId}
                    className="flex items-center justify-between gap-2 font-inter text-xs text-text cursor-pointer hover:opacity-85"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDebtSelection(d.debtId)}
                        className="accent-pos rounded"
                      />
                      <span className={checked ? 'font-medium' : 'text-sub line-through'}>
                        {d.subTripName}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-semibold">
                      {formatRupiah(d.amount)}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-between font-inter text-xs text-text py-0.5">
              <span className="font-medium">{debtList[0]?.subTripName}</span>
              <span className="font-mono font-semibold">{formatRupiah(debtList[0]?.amount ?? 0)}</span>
            </div>
          )}

          <div className="flex items-baseline justify-between border-t border-border/60 pt-2">
            <span className="font-inter text-xs font-bold text-text">Total Pelunasan</span>
            <span className="font-mono text-lg font-extrabold text-pos">
              {formatRupiah(totalAmount)}
            </span>
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
                className="max-h-44 w-full rounded object-contain bg-black/5"
              />
              <div className="flex items-center justify-between w-full px-1">
                <span className="font-inter text-[10.5px] text-pos font-semibold">
                  ✓ 1 Bukti untuk {selectedDebts.length} tagihan
                </span>
                <button
                  type="button"
                  onClick={() => setProofImage(null)}
                  className="font-inter text-xs font-semibold text-neg hover:underline"
                >
                  🗑️ Hapus Bukti
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 rounded-lg border border-dashed border-border bg-bg p-3.5 text-center">
              <div className="font-inter text-xs text-sub leading-relaxed">
                Tangkapan layar/bukti transfer bisa langsung ditempel (<strong>Ctrl+V</strong> / <strong>Cmd+V</strong>) tanpa simpan ke galeri.
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
            disabled={submitting || selectedDebts.length === 0}
            className="rounded-pill bg-pos px-5 py-2 font-inter text-xs font-bold text-white hover:opacity-90 active:scale-95 transition-all shadow-sm"
          >
            {submitting ? 'Memproses...' : `✓ Tandai Lunas (${formatRupiah(totalAmount)})`}
          </button>
        </div>
      </div>
    </div>
  );
}
