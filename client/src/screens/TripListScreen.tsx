import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type TripSummary } from '../lib/api';
import { getJoinedTripIds } from '../lib/localTrips';
import TripCard from '../components/TripCard';
import BottomNavAppLevel from '../components/BottomNavAppLevel';

export default function TripListScreen() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const joinedIds = getJoinedTripIds();
      const [mine, joined] = await Promise.all([
        api.myTrips().catch((err) => (err instanceof ApiError && err.status === 401 ? [] : Promise.reject(err))),
        joinedIds.length > 0 ? api.tripSummaries(joinedIds) : Promise.resolve([]),
      ]);
      if (cancelled) return;
      const byId = new Map<string, TripSummary>();
      for (const trip of [...mine, ...joined]) byId.set(trip.publicId, trip);
      setTrips([...byId.values()]);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter((t) => t.name.toLowerCase().includes(q) || t.destination.toLowerCase().includes(q));
  }, [trips, search]);

  return (
    <div className="flex min-h-screen flex-col gap-4 px-5 pb-[100px] pt-2">
      <div className="mt-2.5 flex items-center gap-2.5">
        <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-accent">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg)" strokeWidth={2.2}>
            <path d="M12 2v6" />
            <path d="M5 10h14l-1.5 10a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z" />
          </svg>
        </div>
        <div className="font-manrope text-[17px] font-extrabold text-text">Cepatkan Bayar</div>
      </div>

      <div className="flex items-center gap-2 rounded-input border border-border bg-surface px-3 py-2.5">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-sub)" strokeWidth={2}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari trip…"
          className="flex-1 border-none bg-transparent font-inter text-[13px] font-medium text-text outline-none placeholder:opacity-70"
        />
      </div>

      <button
        onClick={() => navigate('/trip/new')}
        className="flex items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-[13px] font-inter text-[13.5px] font-bold text-onAccent"
      >
        + Buat Trip Baru
      </button>

      <div className="mt-0.5 font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">Trip kamu</div>

      {!loading && (
        <div className="flex flex-col gap-2.5">
          {filtered.map((trip) => (
            <TripCard
              key={trip.publicId}
              trip={trip}
              onOpen={(publicId) => navigate(`/t/${publicId}`, { state: { viaShareLink: false } })}
            />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && search.trim() && (
        <div className="py-5 text-center font-inter text-[12.5px] text-sub">
          Nggak ada trip yang cocok sama "{search}"
        </div>
      )}

      <BottomNavAppLevel />
    </div>
  );
}
