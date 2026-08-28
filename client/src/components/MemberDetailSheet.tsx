import { useEffect, useState } from 'react';
import { api, type SaldoData, type SettledDebtItem } from '../lib/api';
import { formatRupiah } from '../lib/format';
import { getCurrentMemberId } from '../lib/localTrips';
import SwipeToConfirm from './SwipeToConfirm';
import SettleDebtModal, { type SettleDebtTarget } from './SettleDebtModal';

interface MemberDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  publicId: string;
  memberId: number;
  memberName: string;
  saldoData: SaldoData | null;
  onRefresh?: () => void;
}

export default function MemberDetailSheet({
  isOpen,
  onClose,
  publicId,
  memberId,
  memberName,
  saldoData,
  onRefresh,
}: MemberDetailSheetProps) {
  const [settledDebts, setSettledDebts] = useState<SettledDebtItem[]>([]);
  const [loadingSettled, setLoadingSettled] = useState(false);
  const [previewProof, setPreviewProof] = useState<string | null>(null);
  const [settleTargetDebt, setSettleTargetDebt] = useState<SettleDebtTarget | SettleDebtTarget[] | null>(null);

  const currentMemberId = publicId ? getCurrentMemberId(publicId) : null;

  async function fetchSettled() {
    if (!publicId) return;
    setLoadingSettled(true);
    try {
      const data = await api.getSettledDebts(publicId);
      setSettledDebts(data);
    } catch {
      // ignore
    } finally {
      setLoadingSettled(false);
    }
  }

  async function handleConfirmSettlement(selectedDebts: SettleDebtTarget[], proofImage?: string | null) {
    if (!publicId || selectedDebts.length === 0) return;
    try {
      if (selectedDebts.length === 1) {
        await api.toggleDebtSettled(
          publicId,
          selectedDebts[0].subTripId,
          selectedDebts[0].debtId,
          true,
          currentMemberId,
          proofImage
        );
      } else {
        await api.batchSettleDebts(publicId, {
          debtIds: selectedDebts.map((d) => d.debtId),
          settled: true,
          settledByMemberId: currentMemberId,
          proofImage,
        });
      }
      setSettleTargetDebt(null);
      await fetchSettled();
      if (onRefresh) onRefresh();
    } catch {
      alert('Gagal memperbarui status pelunasan');
    }
  }

  async function handleResetSettled(subTripId: number, debtId: number) {
    if (!publicId) return;
    try {
      await api.toggleDebtSettled(publicId, subTripId, debtId, false, currentMemberId);
      await fetchSettled();
      if (onRefresh) onRefresh();
    } catch {
      alert('Gagal membatalkan status pelunasan');
    }
  }

  useEffect(() => {
    if (isOpen && publicId) {
      fetchSettled();
    }
  }, [isOpen, publicId]);

  if (!isOpen) return null;

  const memberRollup = saldoData?.rollupMembers.find((m) => m.memberId === memberId);
  const rollupVal = memberRollup?.rollup ?? 0;
  const isPos = rollupVal > 0;
  const isNeg = rollupVal < 0;

  // Unsettled debts where member is debtor (owes money)
  const myDebtsToPay = saldoData?.unsettledDebts.filter((d) => d.debtorId === memberId) ?? [];
  // Unsettled debts where member is creditor (nalingin)
  const myDebtsToReceive = saldoData?.unsettledDebts.filter((d) => d.creditorId === memberId) ?? [];

  // Settled debts for this member
  const mySettledDebts = settledDebts.filter(
    (d) => d.debtorId === memberId || d.creditorId === memberId || d.debtorName === memberName || d.creditorName === memberName
  );

  // Deposits involving this member
  const myDeposits = saldoData?.deposits.filter((dp) => dp.fromMemberId === memberId || dp.toMemberId === memberId) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Sheet Content */}
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-card sm:rounded-card border border-border bg-surface shadow-xl animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex flex-none items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-accent/15 font-manrope text-base font-bold text-accent">
              {memberName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-manrope text-base font-extrabold text-text">{memberName}</div>
              <div className="font-inter text-xs text-sub">Rincian tagihan & pelunasan</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surfaceAlt font-inter text-sm font-semibold text-sub hover:text-text"
          >
            ✕
          </button>
        </div>

        {/* Body Scrollable */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {/* Total Rollup Card */}
          <div className="flex items-center justify-between rounded-card border border-border bg-bg p-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-inter text-xs font-semibold text-sub">Saldo Rollup</span>
              <span className={`font-inter text-xs font-medium ${isPos ? 'text-pos' : isNeg ? 'text-neg' : 'text-sub'}`}>
                {isPos ? 'Berhak Menerima' : isNeg ? 'Kewajiban Membayar' : 'Semua Lunas'}
              </span>
            </div>
            <div className={`font-mono text-xl font-bold ${isPos ? 'text-pos' : isNeg ? 'text-neg' : 'text-text'}`}>
              {formatRupiah(rollupVal)}
            </div>
          </div>

          {/* Section: Debts to Pay (Kewajiban Membayar) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
                Kewajiban Membayar ({myDebtsToPay.length})
              </div>
              {myDebtsToPay.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setSettleTargetDebt(
                      myDebtsToPay.map((d) => ({
                        subTripId: d.subTripId,
                        debtId: d.id,
                        subTripName: d.subTripName,
                        debtorName: d.debtorName,
                        creditorName: d.creditorName,
                        amount: d.amount,
                      }))
                    );
                  }}
                  className="rounded-pill bg-accent px-2.5 py-1 font-inter text-[10.5px] font-bold text-onAccent shadow-sm hover:opacity-90 active:scale-95 transition-all"
                >
                  ⚡ Lunasi Sekaligus ({formatRupiah(myDebtsToPay.reduce((s, d) => s + d.amount, 0))})
                </button>
              )}
            </div>
            {myDebtsToPay.length === 0 ? (
              <div className="rounded-input border border-border bg-bg px-3.5 py-3 text-center font-inter text-xs text-sub">
                Tidak ada kewajiban belum bayar 👍
              </div>
            ) : (
              myDebtsToPay.map((d) => (
                <div key={d.id} className="flex flex-col gap-2 rounded-card border border-border bg-bg p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="font-inter text-sm font-semibold text-text">
                      {d.subTripName}
                    </div>
                    <div className="font-mono text-sm font-bold text-neg">
                      {formatRupiah(d.amount)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between font-inter text-xs text-sub">
                    <span>Bayar ke: <strong className="text-text">{d.creditorName}</strong></span>
                    <span>{d.date}</span>
                  </div>
                  {d.depositNote && (
                    <div className="rounded bg-accent/10 px-2.5 py-1 font-inter text-[11px] text-accent">
                      💡 {d.depositNote}
                    </div>
                  )}
                  <SwipeToConfirm
                    label="Geser jika sudah bayar 👉"
                    confirmedLabel="✓ Lunas"
                    isSettled={false}
                    onConfirm={() => {
                      setSettleTargetDebt({
                        subTripId: d.subTripId,
                        debtId: d.id,
                        subTripName: d.subTripName,
                        debtorName: d.debtorName,
                        creditorName: d.creditorName,
                        amount: d.amount,
                      });
                    }}
                    onReset={() => handleResetSettled(d.subTripId, d.id)}
                  />
                </div>
              ))
            )}
          </div>

          {/* Section: Debts to Receive (Hak Menerima / Nalingin) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
                Hak Menerima / Nalingin ({myDebtsToReceive.length})
              </div>
              {myDebtsToReceive.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setSettleTargetDebt(
                      myDebtsToReceive.map((d) => ({
                        subTripId: d.subTripId,
                        debtId: d.id,
                        subTripName: d.subTripName,
                        debtorName: d.debtorName,
                        creditorName: d.creditorName,
                        amount: d.amount,
                      }))
                    );
                  }}
                  className="rounded-pill bg-pos px-2.5 py-1 font-inter text-[10.5px] font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all"
                >
                  ⚡ Tandai Lunas Sekaligus ({formatRupiah(myDebtsToReceive.reduce((s, d) => s + d.amount, 0))})
                </button>
              )}
            </div>
            {myDebtsToReceive.length === 0 ? (
              <div className="rounded-input border border-border bg-bg px-3.5 py-3 text-center font-inter text-xs text-sub">
                Tidak ada tagihan ke orang lain
              </div>
            ) : (
              myDebtsToReceive.map((d) => (
                <div key={d.id} className="flex flex-col gap-2 rounded-card border border-border bg-bg p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="font-inter text-sm font-semibold text-text">
                      {d.subTripName}
                    </div>
                    <div className="font-mono text-sm font-bold text-pos">
                      +{formatRupiah(d.amount)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between font-inter text-xs text-sub">
                    <span>Ditagih ke: <strong className="text-text">{d.debtorName}</strong></span>
                    <span>{d.date}</span>
                  </div>
                  {d.depositNote && (
                    <div className="rounded bg-accent/10 px-2.5 py-1 font-inter text-[11px] text-accent">
                      💡 {d.depositNote}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `Halo ${d.debtorName}! 👋\nMau reminder tagihan trip *${d.subTripName}* sebesar ${formatRupiah(d.amount)}.\nCek rinciannya di: ${window.location.origin}/t/${publicId}/ringkasan`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded bg-[#25D366]/15 px-2 py-1 font-inter text-[11px] font-bold text-[#128C7E] dark:text-[#25D366] hover:bg-[#25D366]/25 transition-colors"
                    >
                      <span>💬 Tagih via WA</span>
                    </a>
                  </div>
                  <SwipeToConfirm
                    label="Geser tandai lunas 👉"
                    confirmedLabel="✓ Lunas"
                    isSettled={false}
                    onConfirm={() => {
                      setSettleTargetDebt({
                        subTripId: d.subTripId,
                        debtId: d.id,
                        subTripName: d.subTripName,
                        debtorName: d.debtorName,
                        creditorName: d.creditorName,
                        amount: d.amount,
                      });
                    }}
                    onReset={() => handleResetSettled(d.subTripId, d.id)}
                  />
                </div>
              ))
            )}
          </div>

          {/* Section: Deposit / Simpanan */}
          {myDeposits.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
                Deposit Antar-Anggota
              </div>
              {myDeposits.map((dep, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-card border border-border bg-bg p-3 font-inter text-xs">
                  <span className="text-text">{dep.fromName} → {dep.toName}</span>
                  <span className="font-mono font-bold text-text">
                    Sisa {formatRupiah(dep.remainingBalance)} (total {formatRupiah(dep.totalAmount)})
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Section: Settled History */}
          <div className="flex flex-col gap-2">
            <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
              Riwayat Sudah Lunas ({mySettledDebts.length})
            </div>
            {loadingSettled ? (
              <div className="text-center font-inter text-xs text-sub py-2">Memuat riwayat...</div>
            ) : mySettledDebts.length === 0 ? (
              <div className="rounded-input border border-border bg-bg px-3.5 py-3 text-center font-inter text-xs text-sub">
                Belum ada riwayat pelunasan
              </div>
            ) : (
              mySettledDebts.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-card border border-border bg-bg px-3.5 py-2.5">
                  <div className="flex flex-col font-inter text-xs">
                    <span className="font-semibold text-text">{d.subTripName}</span>
                    <span className="text-sub">{d.debtorName} → {d.creditorName}</span>
                    {d.settledByMemberName && (
                      <span className="font-inter text-[10px] text-accent font-medium mt-0.5">
                        Dilunaskan oleh {d.settledByMemberName}
                      </span>
                    )}
                    {d.proofImage && (
                      <button
                        type="button"
                        onClick={() => setPreviewProof(d.proofImage!)}
                        className="mt-1 text-left font-inter text-[10.5px] font-bold text-teal-600 dark:text-teal-400 hover:underline"
                      >
                        📸 Lihat Bukti Transfer
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-mono text-xs font-bold text-pos">✓ {formatRupiah(d.amount)}</span>
                    <span className="font-inter text-[10px] text-sub">{d.settledAt ? d.settledAt.substring(0, 10) : 'Lunas'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Settle Debt Confirmation Modal with Optional Proof */}
      <SettleDebtModal
        isOpen={Boolean(settleTargetDebt)}
        debt={settleTargetDebt}
        onClose={() => setSettleTargetDebt(null)}
        onConfirm={handleConfirmSettlement}
      />

      {/* Bukti Transfer Modal Preview */}
      {previewProof && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5 cursor-pointer"
          onClick={() => setPreviewProof(null)}
        >
          <div className="relative flex flex-col items-center gap-3 rounded-card bg-surface p-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between w-full">
              <span className="font-manrope text-sm font-bold text-text">Bukti Transfer</span>
              <button
                type="button"
                onClick={() => setPreviewProof(null)}
                className="font-inter text-xs font-bold text-sub hover:text-text"
              >
                ✕ Tutup
              </button>
            </div>
            <img src={previewProof} alt="Bukti Transfer" className="w-full max-h-[380px] rounded-lg object-contain bg-black/10" />
            <a
              href={previewProof}
              download="bukti_transfer.png"
              className="w-full text-center rounded-pill bg-accent py-2 font-inter text-xs font-bold text-onAccent shadow-sm"
            >
              ⬇️ Download Bukti
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
