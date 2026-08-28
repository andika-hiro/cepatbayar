import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type SettledDebtItem } from '../lib/api';
import { formatRupiah } from '../lib/format';
import ProofPreviewModal, { type RelatedSettledDebt } from '../components/ProofPreviewModal';

interface GroupedSettlement {
  key: string;
  isBatch: boolean;
  debtorName: string;
  creditorName: string;
  totalAmount: number;
  settledAt: string;
  settledByMemberName?: string | null;
  proofImage?: string | null;
  debts: SettledDebtItem[];
}

export default function RiwayatPelunasanScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [settledDebts, setSettledDebts] = useState<SettledDebtItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{
    proofImage: string;
    relatedDebts: RelatedSettledDebt[];
  } | null>(null);

  useEffect(() => {
    if (!publicId) return;
    api
      .getSettledDebts(publicId)
      .then(setSettledDebts)
      .catch(() => setError('Gagal memuat riwayat pelunasan.'));
  }, [publicId]);

  // Group debts that share the same non-empty proofImage and debtor/creditor
  const groupedSettlements = useMemo<GroupedSettlement[]>(() => {
    if (!settledDebts) return [];

    const result: GroupedSettlement[] = [];
    const processedDebtIds = new Set<number>();

    for (const item of settledDebts) {
      if (processedDebtIds.has(item.id)) continue;

      if (item.proofImage) {
        // Find all debts with the same proofImage
        const sameProofDebts = settledDebts.filter(
          (d) => d.proofImage === item.proofImage && d.debtorId === item.debtorId && d.creditorId === item.creditorId
        );

        if (sameProofDebts.length > 1) {
          sameProofDebts.forEach((d) => processedDebtIds.add(d.id));
          result.push({
            key: `proof-${item.proofImage}`,
            isBatch: true,
            debtorName: item.debtorName,
            creditorName: item.creditorName,
            totalAmount: sameProofDebts.reduce((sum, d) => sum + d.amount, 0),
            settledAt: item.settledAt,
            settledByMemberName: item.settledByMemberName,
            proofImage: item.proofImage,
            debts: sameProofDebts,
          });
          continue;
        }
      }

      // Single settlement
      processedDebtIds.add(item.id);
      result.push({
        key: `single-${item.id}`,
        isBatch: false,
        debtorName: item.debtorName,
        creditorName: item.creditorName,
        totalAmount: item.amount,
        settledAt: item.settledAt,
        settledByMemberName: item.settledByMemberName,
        proofImage: item.proofImage,
        debts: [item],
      });
    }

    return result;
  }, [settledDebts]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
        <div className="font-inter text-[13px] text-neg">{error}</div>
      </div>
    );
  }

  if (!settledDebts || !publicId) return null;

  return (
    <div className="flex min-h-screen flex-col gap-5 px-5 pb-10 pt-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/t/${publicId}/saldo`)}
          className="font-inter text-xs font-semibold text-accent"
        >
          ← Saldo & deposit
        </button>
        <div className="font-manrope text-[17px] font-extrabold text-text">Riwayat Pelunasan</div>
        <div className="w-[60px]" />
      </div>

      {groupedSettlements.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sub font-inter text-xs">
          Belum ada riwayat pelunasan.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groupedSettlements.map((group) => {
            if (group.isBatch) {
              return (
                <div
                  key={group.key}
                  className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5 font-inter text-xs font-bold text-accent">
                        <span>⚡</span>
                        <span>Pelunasan Gabungan ({group.debts.length} tagihan)</span>
                      </div>
                      <span className="font-inter text-xs font-semibold text-text mt-0.5">
                        {group.debtorName} → {group.creditorName}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-sm font-extrabold text-pos">
                        ✓ {formatRupiah(group.totalAmount)}
                      </span>
                      <span className="font-inter text-[10.5px] text-sub">
                        {group.settledAt ? group.settledAt.substring(0, 10) : 'Lunas'}
                      </span>
                    </div>
                  </div>

                  {/* Sub-trips breakdown list */}
                  <div className="flex flex-col gap-1.5 py-1">
                    {group.debts.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between font-inter text-xs text-sub pl-2 border-l-2 border-accent/40"
                      >
                        <span className="font-medium text-text">{d.subTripName}</span>
                        <span className="font-mono text-xs font-semibold">
                          {formatRupiah(d.amount)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {group.proofImage && (
                    <div className="pt-1 border-t border-border/40">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewTarget({
                            proofImage: group.proofImage!,
                            relatedDebts: group.debts.map((d) => ({
                              id: d.id,
                              subTripName: d.subTripName,
                              debtorName: d.debtorName,
                              creditorName: d.creditorName,
                              amount: d.amount,
                              settledAt: d.settledAt,
                            })),
                          })
                        }
                        className="font-inter text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
                      >
                        <span>📸</span>
                        <span>Lihat Bukti Transfer ({formatRupiah(group.totalAmount)})</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            // Single Debt Item
            const item = group.debts[0];
            return (
              <div
                key={group.key}
                className="flex items-center justify-between rounded-card border border-border bg-surface p-3.5 shadow-sm"
              >
                <div className="flex flex-col font-inter text-xs">
                  <span className="font-semibold text-text">{item.subTripName}</span>
                  <span className="text-sub">
                    {item.debtorName} → {item.creditorName}
                  </span>
                  {item.settledByMemberName && (
                    <span className="font-inter text-[10.5px] text-accent font-medium mt-0.5">
                      Dilunaskan oleh {item.settledByMemberName}
                    </span>
                  )}
                  {item.proofImage && (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewTarget({
                          proofImage: item.proofImage!,
                          relatedDebts: [
                            {
                              id: item.id,
                              subTripName: item.subTripName,
                              debtorName: item.debtorName,
                              creditorName: item.creditorName,
                              amount: item.amount,
                              settledAt: item.settledAt,
                            },
                          ],
                        })
                      }
                      className="mt-1 text-left font-inter text-[10.5px] font-bold text-teal-600 dark:text-teal-400 hover:underline"
                    >
                      📸 Lihat Bukti Transfer
                    </button>
                  )}
                </div>
                <div className="flex flex-col items-end">
                  <span className="font-mono text-sm font-bold text-pos">
                    ✓ {formatRupiah(item.amount)}
                  </span>
                  <span className="font-inter text-[10px] text-sub">
                    {item.settledAt ? item.settledAt.substring(0, 10) : 'Lunas'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Proof Preview Modal */}
      {previewTarget && (
        <ProofPreviewModal
          isOpen={Boolean(previewTarget)}
          onClose={() => setPreviewTarget(null)}
          proofImage={previewTarget.proofImage}
          relatedDebts={previewTarget.relatedDebts}
        />
      )}
    </div>
  );
}
