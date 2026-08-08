import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type SaldoData, type TripDetail } from '../lib/api';
import { getCurrentMemberId } from '../lib/localTrips';
import { formatRupiah } from '../lib/format';
import BottomNavTripLevel from '../components/BottomNavTripLevel';
import AddDepositSheet from '../components/AddDepositSheet';

export default function SaldoScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [saldoData, setSaldoData] = useState<SaldoData | null>(null);
  const [depositSheetOpen, setDepositSheetOpen] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<Record<number, number>>({});
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

  async function handleToggleSettled(subTripId: number, debtId: number, currentSettled: boolean) {
    if (!publicId) return;
    try {
      await api.toggleDebtSettled(publicId, subTripId, debtId, !currentSettled);
      load();
    } catch {
      alert('Gagal memperbarui status pelunasan');
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
        <div className="font-manrope text-[17px] font-extrabold text-text">Saldo & deposit</div>
        <div className="w-[60px]" />
      </div>

      {/* Section 1: Saldo Semua Anggota (Rollup) */}
      <div className="flex flex-col gap-2">
        <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
          Saldo semua anggota (rollup informasional)
        </div>
        <div className="flex flex-col gap-2">
          {saldoData.rollupMembers.map((m) => {
            const statusLabel = m.status === 'pos' ? 'Dilunasin' : m.status === 'neg' ? 'Ngutang' : 'Lunas';
            const statusColor = m.status === 'pos' ? 'text-pos' : m.status === 'neg' ? 'text-neg' : 'text-sub';
            return (

              <div key={m.memberId} className="flex items-center justify-between rounded-card border border-border bg-surface px-3.5 py-3">
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

                {/* Account info section */}
                <div className="flex items-center justify-between rounded-md bg-surfaceAlt px-3 py-2">
                  <div className="font-inter text-xs text-sub">Transfer ke:</div>
                  {debt.accounts.length > 0 ? (
                    debt.accounts.length === 1 ? (
                      <div className="font-mono text-xs font-semibold text-text">
                        {selectedAccount.label}: {selectedAccount.accountNumber}
                      </div>
                    ) : (
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
                    )
                  ) : (
                    <div className="font-inter text-xs italic text-sub">Belum ada info rekening</div>
                  )}
                </div>

                {/* Action button */}
                <button
                  onClick={() => handleToggleSettled(debt.subTripId, debt.id, false)}
                  className="rounded-pill border border-accent px-4 py-2 font-inter text-xs font-bold text-accent"
                >
                  Tandai sudah transfer
                </button>
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
          saldoData.deposits.map((dep, idx) => (
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
          ))
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
    </div>
  );
}
