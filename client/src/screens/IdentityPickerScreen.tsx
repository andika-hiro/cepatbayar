import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, type TripDetail } from '../lib/api';
import { setIdentity } from '../lib/localTrips';
import MemberAvatar from '../components/MemberAvatar';

export default function IdentityPickerScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [error, setError] = useState(false);

  const viaShareLink = (location.state as { viaShareLink?: boolean } | null)?.viaShareLink ?? true;

  useEffect(() => {
    if (!publicId) return;
    api.tripDetail(publicId).then(setTrip).catch(() => setError(true));
  }, [publicId]);

  function handleSelect(memberId: number) {
    if (!publicId) return;
    setIdentity(publicId, String(memberId));
    navigate(`/t/${publicId}/ringkasan`);
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
        <div className="font-manrope text-base font-bold text-text">Trip nggak ketemu</div>
        <div className="font-inter text-[13px] text-sub">Link-nya mungkin salah atau trip-nya udah dihapus.</div>
      </div>
    );
  }
  if (!trip) return null;

  return (
    <div className="flex min-h-screen flex-col px-[22px] pb-8 pt-2">
      {!viaShareLink && (
        <button onClick={() => navigate('/')} className="mt-2.5 flex items-center gap-1.5 border-none bg-transparent">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-sub)" strokeWidth={2}>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <span className="font-inter text-[12.5px] font-medium text-sub">Daftar trip</span>
        </button>
      )}

      <div className="mb-[22px] mt-[18px]">
        <div className="font-manrope text-[22px] font-extrabold text-text">Kamu yang mana?</div>
        <div className="mt-1.5 font-inter text-[13px] leading-relaxed text-sub">
          Pilih nama kamu buat lanjut ke <strong className="text-text">{trip.name}</strong>. Nggak perlu login.
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {trip.members.map((m) => (
          <button
            key={m.id}
            onClick={() => handleSelect(m.id)}
            className="flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-3.5 text-left"
          >
            <MemberAvatar name={m.name} />
            <div className="flex-1 font-inter text-sm font-semibold text-text">{m.name}</div>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-sub)" strokeWidth={2}>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-4">
        <div className="text-center font-inter text-xs leading-relaxed text-sub">
          Belum ada di daftar? Minta pembuat trip buat nambahin kamu.
        </div>
        <button onClick={() => navigate('/trip/new')} className="border-none bg-transparent font-inter text-xs font-semibold text-accent">
          Bikin trip baru →
        </button>
      </div>
    </div>
  );
}
