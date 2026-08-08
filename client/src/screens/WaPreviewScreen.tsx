import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type SaldoData, type TripDetail } from '../lib/api';
import { formatRupiah } from '../lib/format';

export default function WaPreviewScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [saldoData, setSaldoData] = useState<SaldoData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicId) return;
    Promise.all([api.tripDetail(publicId), api.getSaldoData(publicId)])
      .then(([t, s]) => {
        setTrip(t);
        setSaldoData(s);
      })
      .catch(() => setError('Gagal memuat data rekap WhatsApp.'));
  }, [publicId]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
        <div className="font-inter text-[13px] text-neg">{error}</div>
      </div>
    );
  }

  if (!trip || !saldoData || !publicId) return null;

  // Build monospace group rekap text per sub trip
  const subTripGroups: Record<string, { subTripName: string; date: string; debts: typeof saldoData.unsettledDebts }> = {};

  saldoData.unsettledDebts.forEach((debt) => {
    const key = `${debt.subTripId}-${debt.subTripName}`;
    if (!subTripGroups[key]) {
      subTripGroups[key] = { subTripName: debt.subTripName, date: debt.date, debts: [] };
    }
    subTripGroups[key].debts.push(debt);
  });

  let groupMessageText = `🧾 REKAP PATUNGAN: ${trip.name}\n--------------------------------\n`;
  let grandTotalUnsettled = 0;

  Object.values(subTripGroups).forEach((group) => {
    groupMessageText += `📍 ${group.subTripName} (${group.date})\n`;
    group.debts.forEach((debt) => {
      grandTotalUnsettled += debt.amount;
      const acc = debt.accounts[0];
      const accText = acc ? ` (${acc.label}: ${acc.accountNumber} a.n. ${debt.creditorName})` : '';
      groupMessageText += ` • ${debt.debtorName} → ${debt.creditorName}: ${formatRupiah(debt.amount)}${accText}\n`;
    });
    groupMessageText += `--------------------------------\n`;
  });

  groupMessageText += `Total belum lunas: ${formatRupiah(grandTotalUnsettled)}\n\nBuka & bayar via Cepat Bayarkan!`;

  const encodedGroupUrl = `https://wa.me/?text=${encodeURIComponent(groupMessageText)}`;

  return (
    <div className="flex min-h-screen flex-col gap-5 px-5 pb-10 pt-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/t/${publicId}/saldo`)}
          className="font-inter text-xs font-semibold text-accent"
        >
          ← Saldo
        </button>
        <div className="font-manrope text-[17px] font-extrabold text-text">Preview Rekap WA</div>
        <div className="w-[60px]" />
      </div>

      {/* Group Rekap Section */}
      <div className="flex flex-col gap-2.5">
        <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
          Rekap Grup WhatsApp (Per Sub Trip)
        </div>
        <div className="rounded-card border border-border bg-surfaceAlt p-4">
          <pre className="whitespace-pre-wrap font-mono text-xs text-text">{groupMessageText}</pre>
        </div>

        <a
          href={encodedGroupUrl}
          target="_blank"
          rel="noreferrer"
          className="block w-full rounded-input bg-[#25D366] py-3.5 text-center font-inter text-sm font-bold text-white shadow-md hover:bg-[#1EBE57]"
        >
          Buka WhatsApp & pilih grup
        </a>

        <div className="rounded-md bg-surfaceAlt px-3 py-2 font-inter text-[11px] text-sub text-center">
          💡 Tap 'Kirim' manual di WhatsApp adalah keterbatasan platform WhatsApp Web/Mobile link API, bukan bug.
        </div>
      </div>

      {/* Personal Reminders Section */}
      <div className="flex flex-col gap-2.5 pt-2">
        <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
          Reminder Personal Per Anggota
        </div>
        {saldoData.deposits.length === 0 && saldoData.unsettledDebts.length === 0 ? (
          <div className="rounded-card border border-border bg-surface p-4 text-center font-inter text-xs text-sub">
            Tidak ada reminder personal yang perlu dikirim.
          </div>
        ) : (
          saldoData.deposits.map((dep) => {
            const personalText = `Halo ${dep.fromMemberName}, saldo deposit kamu ke ${dep.toMemberName} di trip ${trip.name} tersisa ${formatRupiah(dep.remainingAmount)}. Mohon top-up deposit jika perlu. Terima kasih!`;
            const personalUrl = `https://wa.me/?text=${encodeURIComponent(personalText)}`;
            return (
              <div key={dep.id} className="flex items-center justify-between rounded-card border border-border bg-surface p-3.5">
                <div>
                  <div className="font-inter text-xs font-semibold text-text">
                    Deposit {dep.fromMemberName} → {dep.toMemberName}
                  </div>
                  <div className="font-mono text-xs text-sub">
                    Sisa {formatRupiah(dep.remainingAmount)} (total {formatRupiah(dep.totalAmount)})
                  </div>
                </div>
                <a
                  href={personalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-pill bg-[#25D366] px-3.5 py-1.5 font-inter text-xs font-bold text-white"
                >
                  Kirim WA
                </a>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
