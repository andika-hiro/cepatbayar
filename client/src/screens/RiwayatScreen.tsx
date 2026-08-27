import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type SubTripListItem, type TripDetail } from '../lib/api';
import { getCurrentMemberId } from '../lib/localTrips';
import { formatRupiah } from '../lib/format';
import { categoryLabel } from '../lib/categories';
import BottomNavTripLevel from '../components/BottomNavTripLevel';
import AddEditSubTripSheet from '../components/AddEditSubTripSheet';
import ShareTripSheet from '../components/ShareTripSheet';
import AppLogo from '../components/AppLogo';


export default function RiwayatScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [subTrips, setSubTrips] = useState<SubTripListItem[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentMemberId = publicId ? getCurrentMemberId(publicId) : null;

  async function load() {
    if (!publicId) return;
    try {
      const [tripData, subTripData] = await Promise.all([api.tripDetail(publicId), api.listSubTrips(publicId)]);
      setTrip(tripData);
      setSubTrips(subTripData);
    } catch {
      setError('Gagal muat riwayat. Coba refresh halaman.');
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

  if (!trip || !subTrips || !publicId || currentMemberId === null) return null;

  return (

    <div className="flex min-h-screen flex-col gap-3 px-5 pb-[100px] pt-2">
      <div className="mt-2.5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 font-manrope text-lg font-extrabold text-text">
            <AppLogo size={24} />
            <span>Riwayat</span>
          </div>
          <div className="mt-1 font-inter text-xs text-sub">Tiap sub trip punya tagihan sendiri, gak digabung sama yang lain.</div>
        </div>
        <button
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-1 rounded-pill bg-accent px-3 py-1.5 font-inter text-xs font-bold text-onAccent shadow-sm hover:opacity-90 active:scale-95 transition-transform"
        >
          <span>🔗</span>
          <span>Bagikan</span>
        </button>
      </div>


      {subTrips.length === 0 ? (
        <div className="py-8 text-center font-inter text-[13px] text-sub">Belum ada sub trip.</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {subTrips.map((s) => (
            <button
              key={s.id}
              onClick={() => navigate(`/t/${publicId}/subtrip/${s.id}`)}
              className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-3.5 py-3 text-left"
            >
              <div className="min-w-0">
                <div className="truncate font-inter text-sm font-semibold text-text">{s.name}</div>
                <div className="truncate font-inter text-xs text-sub">
                  {categoryLabel(s.category)} · dibayar {s.payerName} · {s.date} ·{' '}
                  {s.unsettledCount > 0 ? `${s.unsettledCount} belum lunas` : 'Semua lunas'}
                </div>
              </div>
              <div className="flex-none font-mono text-sm font-semibold text-text">{formatRupiah(s.amount)}</div>
            </button>
          ))}
        </div>
      )}

      <BottomNavTripLevel publicId={publicId} active="riwayat" onAddClick={() => setSheetOpen(true)} />

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

      <ShareTripSheet
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        tripName={trip.name}
        publicId={publicId}
      />
    </div>
  );
}
