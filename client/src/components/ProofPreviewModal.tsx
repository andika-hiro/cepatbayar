import { formatRupiah } from '../lib/format';

export interface RelatedSettledDebt {
  id?: number;
  subTripName: string;
  debtorName?: string;
  creditorName?: string;
  amount: number;
  settledAt?: string;
  settledByMemberName?: string | null;
}

interface ProofPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  proofImage: string | null;
  relatedDebts?: RelatedSettledDebt[];
}

export default function ProofPreviewModal({
  isOpen,
  onClose,
  proofImage,
  relatedDebts = [],
}: ProofPreviewModalProps) {
  if (!isOpen || !proofImage) return null;

  const isBatch = relatedDebts.length > 1;
  const totalAmount = relatedDebts.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-md flex-col gap-3 rounded-card bg-surface p-4 shadow-2xl border border-border overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="flex items-center gap-1.5 font-manrope text-sm font-bold text-text">
            {isBatch ? (
              <span className="flex items-center gap-1 text-accent">
                <span>⚡</span>
                <span>Bukti Pelunasan Gabungan</span>
              </span>
            ) : (
              <span>Bukti Transfer Pelunasan</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-surfaceAlt font-inter text-xs font-bold text-sub hover:text-text"
          >
            ✕
          </button>
        </div>

        {/* Breakdown Card if debts are passed */}
        {relatedDebts.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg bg-surfaceAlt p-3 border border-border/60">
            <div className="flex items-center justify-between text-xs font-semibold text-text">
              <span>{isBatch ? `Melunasi ${relatedDebts.length} Tagihan Sekaligus:` : 'Tagihan:'}</span>
              {isBatch && (
                <span className="font-mono font-bold text-pos">
                  Total {formatRupiah(totalAmount)}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              {relatedDebts.map((d, idx) => (
                <div
                  key={d.id ?? idx}
                  className="flex items-center justify-between font-inter text-xs text-sub border-b border-border/40 last:border-0 pb-1 last:pb-0"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-text">{d.subTripName}</span>
                    {d.debtorName && d.creditorName && (
                      <span className="text-[10.5px]">
                        {d.debtorName} → {d.creditorName}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs font-semibold text-text">
                    {formatRupiah(d.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Image Preview */}
        <div className="flex flex-col items-center justify-center rounded-lg bg-black/5 p-1 border border-border/40 overflow-hidden">
          <img
            src={proofImage}
            alt="Bukti Transfer"
            className="max-h-[360px] w-full rounded-md object-contain"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <a
            href={proofImage}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center rounded-pill border border-border bg-surfaceAlt py-2 font-inter text-xs font-semibold text-text hover:bg-border/40 active:scale-95 transition-all"
          >
            🔍 Buka Gambar Penuh
          </a>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-pill bg-accent py-2 font-inter text-xs font-bold text-onAccent hover:opacity-90 active:scale-95 transition-all shadow-sm"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
