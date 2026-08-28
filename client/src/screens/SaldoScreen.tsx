import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type DepositHistoryItem, type SaldoData, type TripDetail } from '../lib/api';
import { getCurrentMemberId } from '../lib/localTrips';
import { formatRupiah } from '../lib/format';
import BottomNavTripLevel from '../components/BottomNavTripLevel';
import AddDepositSheet from '../components/AddDepositSheet';
import ShareTripSheet from '../components/ShareTripSheet';
import MemberDetailSheet from '../components/MemberDetailSheet';
import AppLogo from '../components/AppLogo';
import SwipeToConfirm from '../components/SwipeToConfirm';
import SettleDebtModal, { type SettleDebtTarget } from '../components/SettleDebtModal';


export default function SaldoScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [saldoData, setSaldoData] = useState<SaldoData | null>(null);
  const [depositSheetOpen, setDepositSheetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [selectedMemberDetail, setSelectedMemberDetail] = useState<{ id: number; name: string } | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<Record<number, number>>({});
  const [settleTargetDebt, setSettleTargetDebt] = useState<SettleDebtTarget | null>(null);
  const [previewQris, setPreviewQris] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentMemberId = publicId ? getCurrentMemberId(publicId) : null;

  async function load() {
    if (!publicId) return;
    try {
      const [tripData, data] = await Promise.all([
        api.tripDetail(publicId),
        api.getSaldoData(publicId),
      ]);
      setTrip(tripData);
      setSaldoData(data);
    } catch {
      setError('Gagal memuat data saldo dan deposit.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId]);

  async function handleConfirmSettlement(proofImage?: string | null) {
    if (!publicId || !settleTargetDebt) return;
    try {
      await api.toggleDebtSettled(publicId, settleTargetDebt.subTripId, settleTargetDebt.debtId, true, currentMemberId, proofImage);
      setSettleTargetDebt(null);
      load();
    } catch {
      alert('Gagal memperbarui status pelunasan');
    }
  }

  async function handleResetSettled(subTripId: number, debtId: number) {
    if (!publicId) return;
    try {
      await api.toggleDebtSettled(publicId, subTripId, debtId, false, currentMemberId);
      load();
    } catch {
      alert('Gagal membatalkan status pelunasan');
    }
  }

  async function handleDeleteDeposit(depositId: number, fromName: string, amount: number) {
    if (!publicId) return;
    if (!confirm(`Hapus deposit dari ${fromName} sebesar ${formatRupiah(amount)}?`)) return;
    try {
      await api.deleteDeposit(publicId, depositId);
      load();
    } catch {
      alert('Gagal menghapus deposit');
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
        <div className="font-inter text-[13px] text-neg">{error}</div>
      </div>
    );
  }

  if (!trip || !saldoData || !publicId || currentMemberId === null) return null;

  return (
    <div className="flex min-h-screen flex-col gap-5 px-5 pb-[100px] pt-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/t/${publicId}/ringkasan`)}
          className="font-inter text-xs font-semibold text-accent"
        >
          ← Ringkasan
        </button>
        <div className="flex items-center gap-1.5 font-manrope text-[17px] font-extrabold text-text">
          <AppLogo size={22} />
          <span>Saldo & deposit</span>
        </div>
        <button
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-1 rounded-pill bg-accent px-3 py-1 font-inter text-xs font-bold text-onAccent shadow-sm hover:opacity-90"
        >
          <span>🔗 Bagikan</span>
        </button>
      </div>

      {/* Section 1: Saldo Semua Anggota (Rollup) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
            Saldo semua anggota (rollup informasional)
          </div>
          <div className="font-inter text-[10.5px] font-medium text-sub">Klik nama untuk rincian 💡</div>
        </div>
        <div className="flex flex-col gap-2">
          {saldoData.rollupMembers.map((m) => {
            const statusLabel = m.status === 'pos' ? 'Dilunasin' : m.status === 'neg' ? 'Ngutang' : 'Lunas';
            const statusColor = m.status === 'pos' ? 'text-pos' : m.status === 'neg' ? 'text-neg' : 'text-sub';
            return (
              <div
                key={m.memberId}
                onClick={() => setSelectedMemberDetail({ id: m.memberId, name: m.name })}
                className="flex items-center justify-between rounded-card border border-border bg-surface px-3.5 py-3 cursor-pointer hover:bg-surfaceAlt active:scale-[0.99] transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-surfaceAlt font-manrope text-xs font-bold text-text">
                    {m.name.trim().charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="font-inter text-sm font-semibold text-text">{m.name}</div>
                </div>
                <div className="text-right">
                  <div className={`font-inter text-[11px] font-medium ${statusColor}`}>{statusLabel}</div>
                  <div className={`font-mono text-[13px] font-semibold ${statusColor}`}>{formatRupiah(m.rollup)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Button: Preview rekap WA */}
      <button
        onClick={() => navigate(`/t/${publicId}/wa-preview`)}
        className="rounded-input border border-border bg-surface px-4 py-3 text-center font-inter text-[13px] font-semibold text-accent"
      >
        Preview & kirim rekap ke grup WA →
      </button>

      {/* Section 2: Semua tagihan per sub trip */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
            Semua tagihan (per sub trip)
          </div>
          <div className="font-inter text-xs text-sub">
            Tagihan gak dijumlah antar sub trip — tiap baris ditandai lunas sendiri-sendiri.
          </div>
        </div>

        {saldoData.unsettledDebts.length === 0 ? (
          <div className="rounded-card border border-border bg-surface px-4 py-6 text-center font-inter text-xs text-sub">
            Semua tagihan sub trip sudah lunas 🎉
          </div>
        ) : (
          saldoData.unsettledDebts.map((debt) => {
            const isMeDebtor = debt.debtorId === currentMemberId;
            const isMeCreditor = debt.creditorId === currentMemberId;
            const activeAccId = selectedAccounts[debt.id];
            const selectedAccount = debt.accounts.find((a) => a.id === activeAccId) || debt.accounts.find((a) => a.isDefault) || debt.accounts[0];

            return (
              <div key={debt.id} className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-inter text-sm font-bold text-text">
                      {debt.debtorName} → {debt.creditorName}
                    </div>
                    <div className="font-inter text-xs text-sub">
                      {debt.subTripName} · {debt.date}
                    </div>
                  </div>
                  <div className="font-mono text-base font-bold text-neg">
                    {formatRupiah(debt.amount)}
                  </div>
                </div>

                {/* Inline Deposit Note if present */}
                {debt.depositNote && (
                  <div className="rounded-md bg-surfaceAlt px-2.5 py-1.5 font-inter text-xs text-accent">
                    {debt.depositNote}
                  </div>
                )}

                {/* Account info section & WA Tagih button */}
                <div className="flex flex-col gap-2 rounded-md bg-surfaceAlt px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="font-inter text-xs text-sub">Transfer ke:</div>
                    {debt.accounts.length > 0 ? (
                      debt.accounts.length === 1 ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-text">
                            {selectedAccount.label}: {selectedAccount.accountNumber}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(selectedAccount.accountNumber);
                              setCopiedKey(`${debt.id}-${selectedAccount.id}`);
                              setTimeout(() => setCopiedKey(null), 2000);
                            }}
                            className="rounded border border-border px-1.5 py-0.5 font-inter text-[10px] font-medium text-sub hover:bg-surface active:scale-95 transition-all"
                            title="Salin nomor rekening"
                          >
                            {copiedKey === `${debt.id}-${selectedAccount.id}` ? '✓ Tersalin' : '📋 Salin'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={selectedAccount.id}
                            onChange={(e) => setSelectedAccounts({ ...selectedAccounts, [debt.id]: Number(e.target.value) })}
                            className="rounded border border-border bg-surface px-2 py-1 font-mono text-xs text-text"
                          >
                            {debt.accounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.label}: {acc.accountNumber} {acc.isDefault ? '(Default)' : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(selectedAccount.accountNumber);
                              setCopiedKey(`${debt.id}-${selectedAccount.id}`);
                              setTimeout(() => setCopiedKey(null), 2000);
                            }}
                            className="rounded border border-border px-1.5 py-0.5 font-inter text-[10px] font-medium text-sub hover:bg-surface active:scale-95 transition-all"
                            title="Salin nomor rekening"
                          >
                            {copiedKey === `${debt.id}-${selectedAccount.id}` ? '✓ Tersalin' : '📋 Salin'}
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="font-inter text-xs italic text-sub">Belum ada info rekening</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-border/50 pt-1.5">
                    {selectedAccount?.qrisImage ? (
                      <button
                        type="button"
                        onClick={() => setPreviewQris(selectedAccount.qrisImage!)}
                        className="rounded bg-teal-500/15 px-2 py-1 font-inter text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:opacity-85"
                      >
                        📸 Scan QRIS
                      </button>
                    ) : (
                      <div />
                    )}

                    {/* 1-on-1 WA Reminder Button */}
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `Halo ${debt.debtorName}! 👋\nMau reminder tagihan trip *${trip.name}*:\n• *${debt.subTripName}*: ${formatRupiah(debt.amount)}${
                          selectedAccount ? `\nTransfer ke ${selectedAccount.label}: ${selectedAccount.accountNumber} a/n ${debt.creditorName}` : ''
                        }\n\nCek rincian trip di: ${window.location.origin}/t/${publicId}/ringkasan`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded bg-[#25D366]/15 px-2 py-1 font-inter text-[11px] font-bold text-[#128C7E] dark:text-[#25D366] hover:bg-[#25D366]/25 transition-colors"
                      title="Kirim pesan tagihan personal via WhatsApp"
                    >
                      <span>💬</span>
                      <span>Tagih via WA</span>
                    </a>
                  </div>
                </div>

                {/* Action swipe component */}
                <SwipeToConfirm
                  label={isMeCreditor ? 'Geser untuk tandai lunas 👉' : isMeDebtor ? 'Geser jika sudah transfer 👉' : 'Geser untuk tandai lunas 👉'}
                  confirmedLabel="✓ Lunas"
                  isSettled={Boolean((debt as any).settled)}
                  onConfirm={() => {
                    setSettleTargetDebt({
                      subTripId: debt.subTripId,
                      debtId: debt.id,
                      subTripName: debt.subTripName,
                      debtorName: debt.debtorName,
                      creditorName: debt.creditorName,
                      amount: debt.amount,
                    });
                  }}
                  onReset={() => handleResetSettled(debt.subTripId, debt.id)}
                  className="mt-1"
                />
              </div>
            );
          })
        )}
      </div>

      {/* Section 3: Deposit antar-anggota */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
            Deposit antar-anggota
          </div>
          <button
            onClick={() => setDepositSheetOpen(true)}
            className="font-inter text-xs font-bold text-accent"
          >
            + Deposit
          </button>
        </div>

        {saldoData.deposits.length === 0 ? (
          <div className="rounded-card border border-border bg-surface px-4 py-4 text-center font-inter text-xs text-sub">
            Belum ada deposit antar-anggota.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {saldoData.deposits.map((dep, idx) => (
              <div key={idx} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5">
                <div className="flex items-center justify-between">
                  <div className="font-inter text-xs font-semibold text-text">
                    {dep.fromName} → {dep.toName}
                  </div>
                  <div className="font-mono text-xs font-bold text-text">
                    Sisa {formatRupiah(dep.remainingBalance)} (total {formatRupiah(dep.totalAmount)})
                  </div>
                </div>

                {dep.low && (
                  <div className="flex items-center justify-between rounded-md bg-neg/10 px-3 py-2 font-inter text-xs text-neg">
                    <span>Saldo deposit menipis — kirim reminder?</span>
                    <a
                      href={`https://wa.me/?text=Halo%20${encodeURIComponent(dep.fromName)},%20saldo%20deposit%20kamu%20ke%20${encodeURIComponent(dep.toName)}%20sudah%20menipis/habis.`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded bg-neg px-2 py-1 font-bold text-white"
                    >
                      Kirim WA
                    </a>
                  </div>
                )}
              </div>
            ))}

            {/* Riwayat / Rincian Catatan Deposit Individual dengan Tombol Hapus */}
            {saldoData.depositHistory && saldoData.depositHistory.length > 0 && (
              <div className="mt-1 flex flex-col gap-2">
                <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
                  Rincian catatan deposit
                </div>
                <div className="flex flex-col gap-1.5">
                  {saldoData.depositHistory.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-3.5 py-2.5"
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="font-inter text-xs font-semibold text-text">
                          {item.fromName} → {item.toName}: <span className="font-mono font-bold text-accent">{formatRupiah(item.amount)}</span>
                        </div>
                        {item.proofNote && (
                          <div className="font-inter text-[11px] text-sub">
                            {item.proofNote}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteDeposit(item.id, item.fromName, item.amount)}
                        className="rounded-input border border-neg/30 bg-neg/10 px-2.5 py-1 font-inter text-[11px] font-bold text-neg hover:bg-neg/20"
                        title="Hapus deposit"
                      >
                        Hapus
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {saldoData.rawDeposits && saldoData.rawDeposits.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-2.5">
            <div className="font-inter text-[11px] font-semibold text-sub">Riwayat Deposit (dapat dihapus)</div>
            {saldoData.rawDeposits.map((rd) => (
              <div key={rd.id} className="flex items-center justify-between rounded-input border border-border bg-bg px-3 py-2">
                <div className="flex flex-col font-inter text-xs text-text">
                  <span>{rd.fromName} → {rd.toName}</span>
                  <span className="font-mono text-[11px] text-sub">{formatRupiah(rd.amount)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteDeposit(rd.id, rd.fromName, rd.amount)}
                  className="font-inter text-xs font-semibold text-neg"
                >
                  Hapus
                </button>
              </div>
            ))}
          </div>
        )}
      </div>


      {/* Footer Link */}
      <button
        onClick={() => navigate(`/t/${publicId}/riwayat-pelunasan`)}
        className="mt-2 text-center font-inter text-xs font-semibold text-sub"
      >
        Riwayat pelunasan →
      </button>

      <BottomNavTripLevel publicId={publicId} active="saldo" />

      {depositSheetOpen && (
        <AddDepositSheet
          isOpen={depositSheetOpen}
          members={trip.members}
          currentMemberId={currentMemberId}
          onClose={() => setDepositSheetOpen(false)}
          onSave={async (input) => {
            await api.createDeposit(publicId, input);
            setDepositSheetOpen(false);
            load();
          }}
        />
      )}

      <ShareTripSheet
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        tripName={trip.name}
        publicId={publicId}
      />

      <MemberDetailSheet
        isOpen={Boolean(selectedMemberDetail)}
        onClose={() => setSelectedMemberDetail(null)}
        publicId={publicId}
        memberId={selectedMemberDetail?.id ?? 0}
        memberName={selectedMemberDetail?.name ?? ''}
        saldoData={saldoData}
        onRefresh={load}
      />

      {/* Settle Debt Confirmation Modal with Optional Proof */}
      <SettleDebtModal
        isOpen={Boolean(settleTargetDebt)}
        debt={settleTargetDebt}
        onClose={() => setSettleTargetDebt(null)}
        onConfirm={handleConfirmSettlement}
      />

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
