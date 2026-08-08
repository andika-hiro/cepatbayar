import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type TripDetail, type MemberAccount } from '../lib/api';

export default function KelolaAnggotaScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [accountsMap, setAccountsMap] = useState<Record<number, MemberAccount[]>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!publicId) return;
    try {
      const tripData = await api.tripDetail(publicId);
      setTrip(tripData);

      const accMap: Record<number, MemberAccount[]> = {};
      await Promise.all(
        tripData.members.map(async (m) => {
          const accs = await api.getMemberAccounts(publicId, m.id);
          accMap[m.id] = accs;
        })
      );
      setAccountsMap(accMap);
    } catch {
      setError('Gagal memuat daftar anggota.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!publicId || !newMemberName.trim()) return;
    try {
      await api.addTripMember(publicId, newMemberName.trim());
      setNewMemberName('');
      setIsAddModalOpen(false);
      load();
    } catch {
      alert('Gagal menambahkan anggota');
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
        <div className="font-inter text-[13px] text-neg">{error}</div>
      </div>
    );
  }

  if (!trip || !publicId) return null;

  return (
    <div className="flex min-h-screen flex-col gap-5 px-5 pb-10 pt-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/t/${publicId}/pengaturan`)}
          className="font-inter text-xs font-semibold text-accent"
        >
          ← Pengaturan
        </button>
        <div className="font-manrope text-[17px] font-extrabold text-text">Kelola anggota</div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="font-inter text-xs font-bold text-accent"
        >
          + Tambah
        </button>
      </div>

      {/* Member List */}
      <div className="flex flex-col gap-2.5">
        {trip.members.map((member) => {
          const accs = accountsMap[member.id] || [];
          return (
            <div
              key={member.id}
              onClick={() => navigate(`/t/${publicId}/pengaturan/anggota/${member.id}`)}
              className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-surfaceAlt font-manrope text-xs font-bold text-text">
                  {member.name.trim().charAt(0).toUpperCase() || '?'}
                </div>
                <div>
                  <div className="font-inter text-sm font-semibold text-text">{member.name}</div>
                  <div className="font-inter text-xs text-sub">
                    {accs.length} rekening tersimpan
                  </div>
                </div>
              </div>
              <div className="font-inter text-xs text-accent font-semibold">
                Detail →
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Member Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-5">
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-card bg-surface p-5">
            <div className="font-manrope text-base font-bold text-text">Tambah Anggota Baru</div>
            <form onSubmit={handleAddMember} className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Nama anggota"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                className="rounded-input border border-border bg-surface px-3 py-2 font-inter text-sm text-text"
                autoFocus
                required
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-pill border border-border px-4 py-1.5 font-inter text-xs font-semibold text-sub"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-pill bg-accent px-4 py-1.5 font-inter text-xs font-bold text-onAccent"
                >
                  Tambah
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
