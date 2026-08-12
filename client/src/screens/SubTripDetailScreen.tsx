import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type SubTripDetail as SubTripDetailType } from '../lib/api';
import { getCurrentMemberId } from '../lib/localTrips';
import { formatRupiah } from '../lib/format';
import { categoryLabel } from '../lib/categories';
import BottomNavTripLevel from '../components/BottomNavTripLevel';
import AddEditSubTripSheet from '../components/AddEditSubTripSheet';

export default function SubTripDetailScreen() {
  const { publicId, subTripId } = useParams<{ publicId: string; subTripId: string }>();
  const navigate = useNavigate();
  const [subTrip, setSubTrip] = useState<SubTripDetailType | null>(null);
  const [members, setMembers] = useState<{ id: number; name: string }[] | null>(null);
  const [sheetMode, setSheetMode] = useState<'create' | 'edit' | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentMemberId = publicId ? getCurrentMemberId(publicId) : null;

  async function load() {
    if (!publicId || !subTripId) return;
    try {
      const [subTripData, tripData] = await Promise.all([
        api.getSubTrip(publicId, Number(subTripId)),
        api.tripDetail(publicId),
      ]);
      setSubTrip(subTripData);
      setMembers(tripData.members);
    } catch {
      setError('Gagal muat detail sub trip. Coba refresh halaman.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId, subTripId]);

  async function handleToggleSettled(debtId: number, settled: boolean) {
    if (!publicId || !subTripId) return;
    await api.toggleDebtSettled(publicId, Number(subTripId), debtId, settled);
    load();
  }

  function handleSaved() {
    setSheetMode(null);
    load();
  }

  async function handleConfirmDelete() {
    if (!publicId || !subTripId || currentMemberId === null) return;
    try {
      await api.deleteSubTrip(publicId, Number(subTripId), currentMemberId);
      navigate(`/t/${publicId}/riwayat`);
    } catch {
      setError('Gagal hapus sub trip. Coba lagi.');
      setConfirmingDelete(false);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
        <div className="font-inter text-[13px] text-neg">{error}</div>
      </div>
    );
  }

  if (!subTrip || !members || !publicId || currentMemberId === null) return null;

  const canModify = currentMemberId === subTrip.createdByMemberId;

  return (
    <div className="flex min-h-screen flex-col gap-4 px-5 pb-[100px] pt-2">
      <button
        onClick={() => navigate(`/t/${publicId}/riwayat`)}
        className="mt-2.5 flex items-center gap-1.5 self-start border-none bg-transparent"
      >
        <span className="font-inter text-[12.5px] font-medium text-sub">← Riwayat</span>
      </button>

      <div>
        <div className="font-manrope text-lg font-extrabold text-text">{subTrip.name}</div>
        <div className="mt-1 font-inter text-xs text-sub">
          {categoryLabel(subTrip.category)} · {subTrip.date}
        </div>
      </div>

      <div className="rounded-card bg-accent px-4 py-4 text-onAccent">
        <div className="font-inter text-xs font-medium text-onAccentSoft">Total dibayar {subTrip.payerName}</div>
        <div className="mt-1.5 font-mono text-xl font-semibold">{formatRupiah(subTrip.amount)}</div>
      </div>

      <div className="flex h-24 items-center justify-center rounded-card border border-dashed border-border font-inter text-xs text-sub">
        foto struk
      </div>

      {subTrip.splitMode === 'per_item' && (
        <div className="flex flex-col gap-2">
          <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">Rincian item</div>
          {subTrip.items.map((item) => (
            <div key={item.id} className="flex flex-col gap-1.5 rounded-card border border-border bg-surface px-3.5 py-3">
              <div className="flex items-center justify-between">
                <span className="font-inter text-sm font-semibold text-text">{item.name}</span>
                <span className="font-mono text-sm text-text">{formatRupiah(item.price)}</span>
              </div>
              <div className="flex flex-col gap-1">
                {item.participants.map((p) => (
                  <div key={p.memberId} className="font-inter text-[11px] text-sub">
                    {p.name}
                    {p.billedToName ? ` → ditagihkan ke ${p.billedToName}` : ''}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">Tagihan per orang</div>
        {subTrip.debts.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-surfaceAlt font-manrope text-xs font-bold text-text">
                {d.name.trim().charAt(0).toUpperCase() || '?'}
              </div>
              <div>
                <div className="font-inter text-sm font-semibold text-text">{d.name}</div>
                <div className={`font-inter text-[11px] ${d.settled ? 'text-pos' : 'text-neg'}`}>
                  {d.settled ? (d.coveredByDeposit ? 'Lunas (Deposit)' : 'Lunas') : 'Belum transfer'}
                </div>
                {d.depositNote && (
                  <div className="mt-0.5 font-inter text-[10.5px] font-medium text-accent">
                    {d.depositNote}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="font-mono text-sm font-semibold text-text">{formatRupiah(d.amount)}</div>
              <button
                onClick={() => handleToggleSettled(d.id, !d.settled)}
                className={`rounded-input border px-2.5 py-1 font-inter text-[11px] font-semibold ${
                  d.settled ? 'border-pos text-pos' : 'border-accent text-accent'
                }`}
              >
                {d.settled ? 'Batalkan' : 'Tandai lunas'}
              </button>
            </div>
          </div>
        ))}
      </div>


      {canModify && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {confirmingDelete ? (
            <div className="flex flex-col gap-2">
              <div className="font-inter text-[12.5px] text-text">Yakin mau hapus sub trip ini?</div>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmDelete}
                  className="flex-1 rounded-input bg-neg px-4 py-2.5 font-inter text-[12.5px] font-bold text-onAccent"
                >
                  Ya, hapus
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="flex-1 rounded-input border border-border px-4 py-2.5 font-inter text-[12.5px] font-semibold text-text"
                >
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setSheetMode('edit')}
                className="flex-1 rounded-input border border-border px-4 py-2.5 font-inter text-[12.5px] font-semibold text-text"
              >
                Edit
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                className="flex-1 rounded-input border border-neg px-4 py-2.5 font-inter text-[12.5px] font-semibold text-neg"
              >
                Hapus
              </button>
            </div>
          )}
          <div className="font-inter text-[11px] text-sub">Cuma yang nambahin entri ini yang bisa edit/hapus.</div>
        </div>
      )}

      <BottomNavTripLevel publicId={publicId} active="riwayat" onAddClick={() => setSheetMode('create')} />

      {sheetMode && (
        <AddEditSubTripSheet
          publicId={publicId}
          members={members}
          currentMemberId={currentMemberId}
          mode={sheetMode}
          initialData={sheetMode === 'edit' ? subTrip : undefined}
          onClose={() => setSheetMode(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
