import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type SubTripListItem, type TripDetail, type TripSummaryDetail } from '../lib/api';
import { getIdentity } from '../lib/localTrips';
import { formatDateRange, formatRupiah } from '../lib/format';
import BottomNavTripLevel from '../components/BottomNavTripLevel';
import AddEditSubTripSheet from '../components/AddEditSubTripSheet';

export default function RingkasanScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [summary, setSummary] = useState<TripSummaryDetail | null>(null);
  const [subTrips, setSubTrips] = useState<SubTripListItem[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentMemberId = publicId ? Number(getIdentity(publicId)) : null;

  async function load() {
    if (!publicId) return;
    try {
      const [tripData, summaryData, subTripData] = await Promise.all([
        api.tripDetail(publicId),
        api.tripSummary(publicId),
        api.listSubTrips(publicId),
      ]);
      setTrip(tripData);
      setSummary(summaryData);
      setSubTrips(subTripData);
    } catch {
      setError('Gagal muat ringkasan. Coba refresh halaman.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId]);

  function handleSaved() {
    setSheetOpen(false);
    load();
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
        <div className="font-inter text-[13px] text-neg">{error}</div>
      </div>
    );
  }

  if (!trip || !summary || !subTrips || !publicId || currentMemberId === null) return null;

  const myName = trip.members.find((m) => m.id === currentMemberId)?.name ?? '';
  const mySummary = summary.members.find((m) => m.memberId === currentMemberId);
  const isEmpty = subTrips.length === 0;

  return (
    <div className="flex min-h-screen flex-col gap-4 px-5 pb-[100px] pt-2">
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-manrope text-[17px] font-extrabold text-text">{trip.name}</div>
          <div className="truncate font-inter text-xs text-sub">
            {trip.members.length} orang · {formatDateRange(trip.startDate, trip.endDate)} · Total {formatRupiah(summary.tripTotal)}
          </div>
        </div>
        <button
          onClick={() => navigate('/')}
          className="flex flex-none items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1.5 font-inter text-xs font-semibold text-text"
        >
          Trip lain
        </button>
      </div>

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="font-manrope text-base font-bold text-text">Belum ada pengeluaran</div>
          <div className="max-w-[250px] font-inter text-[13px] leading-relaxed text-sub">
            Trip ini baru dibuat. Tambah sub trip pertama begitu ada yang nalangin sesuatu.
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            className="mt-1 rounded-[12px] bg-accent px-[18px] py-[11px] font-inter text-[13px] font-bold text-onAccent"
          >
            + Tambah pengeluaran pertama
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-card bg-accent px-4 py-4 text-onAccent">
            <div className="font-inter text-xs font-medium text-onAccentSoft">Saldo kamu ({myName}) — total semua sub trip</div>
            <div data-testid="my-rollup" className="mt-1.5 font-mono text-2xl font-semibold">
              {formatRupiah(mySummary?.rollup ?? 0)}
            </div>
            <div className="mt-1.5 font-inter text-[11px] text-onAccentSoft">
              Angka ini rollup aja — tagihan asli tetap per sub trip, lihat di bawah
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">Saldo semua anggota</div>
            {summary.members.map((m) => {
              const statusLabel = m.status === 'dilunasin' ? 'Dilunasin' : m.status === 'ngutang' ? 'Ngutang' : 'Lunas';
              const statusColor = m.status === 'dilunasin' ? 'text-pos' : m.status === 'ngutang' ? 'text-neg' : 'text-sub';
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

          <button
            onClick={() => navigate(`/t/${publicId}/riwayat`)}
            className="rounded-input border border-border bg-surface px-4 py-3 text-center font-inter text-[13px] font-semibold text-accent"
          >
            Lihat semua tagihan per sub trip →
          </button>
        </>
      )}

      <BottomNavTripLevel publicId={publicId} active="ringkasan" onAddClick={() => setSheetOpen(true)} />

      {sheetOpen && currentMemberId !== null && (
        <AddEditSubTripSheet
          publicId={publicId}
          members={trip.members}
          currentMemberId={currentMemberId}
          mode="create"
          onClose={() => setSheetOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
