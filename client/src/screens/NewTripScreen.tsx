import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { addJoinedTripId } from '../lib/localTrips';

type AuthStage = 'checking' | 'needsEmail' | 'linkSent' | 'authenticated';

export default function NewTripScreen() {
  const navigate = useNavigate();
  const [authStage, setAuthStage] = useState<AuthStage>('checking');
  const [email, setEmail] = useState('');

  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [memberDraft, setMemberDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(() => setAuthStage('authenticated'))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setAuthStage('needsEmail');
        }
      });
  }, []);

  async function handleRequestLink() {
    await api.requestLink(email, '/trip/new');
    setAuthStage('linkSent');
  }

  function addMember() {
    const trimmed = memberDraft.trim();
    if (trimmed && !members.includes(trimmed)) {
      setMembers([...members, trimmed]);
    }
    setMemberDraft('');
  }

  function removeMember(target: string) {
    setMembers(members.filter((m) => m !== target));
  }

  const canSubmit = Boolean(name.trim() && destination.trim() && startDate && endDate && members.length > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { publicId } = await api.createTrip({ name, destination, startDate, endDate, members });
      addJoinedTripId(publicId);
      navigate(`/t/${publicId}`, { state: { viaShareLink: false } });
    } catch {
      setError('Gagal bikin trip. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }

  if (authStage === 'checking') return null;

  if (authStage === 'needsEmail' || authStage === 'linkSent') {
    return (
      <div className="flex min-h-screen flex-col gap-4 px-[22px] pb-8 pt-3.5">
        <div className="mt-3.5">
          <div className="font-manrope text-[21px] font-extrabold text-text">Masuk dulu</div>
          <div className="mt-1.5 font-inter text-[13px] text-sub">Masukin email buat bikin &amp; ngatur trip kamu.</div>
        </div>
        {authStage === 'needsEmail' ? (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@kamu.com"
              className="rounded-input border border-border bg-surface px-3.5 py-3 font-inter text-sm text-text"
            />
            <button
              onClick={handleRequestLink}
              disabled={!email.trim()}
              className="rounded-[14px] bg-accent px-4 py-3.5 font-inter text-sm font-bold text-onAccent disabled:opacity-50"
            >
              Kirim link masuk
            </button>
          </>
        ) : (
          <div className="font-inter text-sm text-sub">Cek email kamu, klik link buat lanjut.</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 px-[22px] pb-8 pt-2">
      <div className="mt-3.5">
        <div className="font-manrope text-[21px] font-extrabold text-text">Buat trip baru</div>
        <div className="mt-1.5 font-inter text-[13px] text-sub">Isi info dasar, anggota bisa ditambah kapan aja nanti.</div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-inter text-xs font-semibold text-sub">Nama trip</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="misal: Trip ke Jogja"
          className="rounded-input border border-border bg-surface px-3.5 py-3 font-inter text-sm text-text"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-inter text-xs font-semibold text-sub">Destinasi</span>
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="misal: Yogyakarta"
          className="rounded-input border border-border bg-surface px-3.5 py-3 font-inter text-sm text-text"
        />
      </label>

      <div className="flex gap-2.5">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="font-inter text-xs font-semibold text-sub">Mulai</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-input border border-border bg-surface px-3.5 py-3 font-inter text-[13px] text-text"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="font-inter text-xs font-semibold text-sub">Selesai</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-input border border-border bg-surface px-3.5 py-3 font-inter text-[13px] text-text"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-inter text-xs font-semibold text-sub">Anggota awal</span>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <div key={m} className="flex items-center gap-1.5 rounded-pill bg-surfaceAlt py-1.5 pl-3 pr-2.5 font-inter text-[12.5px] text-text">
              {m}
              <span onClick={() => removeMember(m)} className="cursor-pointer text-sub">×</span>
            </div>
          ))}
        </div>
        <input
          value={memberDraft}
          onChange={(e) => setMemberDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addMember();
            }
          }}
          placeholder="Tambah nama, enter buat konfirmasi"
          className="rounded-input border border-dashed border-border bg-transparent px-3.5 py-2.5 font-inter text-[13px] text-text"
        />
      </div>

      {error && <div className="font-inter text-[12.5px] text-neg">{error}</div>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className="mt-1.5 w-full rounded-[14px] bg-accent px-4 py-3.5 font-inter text-sm font-bold text-onAccent disabled:opacity-50"
      >
        Buat trip
      </button>
    </div>
  );
}
