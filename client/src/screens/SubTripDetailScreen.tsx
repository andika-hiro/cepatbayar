import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type SaldoData, type SubTripDetail as SubTripDetailType } from '../lib/api';
import { getCurrentMemberId } from '../lib/localTrips';
import { formatRupiah } from '../lib/format';
import { categoryLabel } from '../lib/categories';
import BottomNavTripLevel from '../components/BottomNavTripLevel';
import AddEditSubTripSheet from '../components/AddEditSubTripSheet';
import SwipeToConfirm from '../components/SwipeToConfirm';
import MemberDetailSheet from '../components/MemberDetailSheet';
import SettleDebtModal, { type SettleDebtTarget } from '../components/SettleDebtModal';

export default function SubTripDetailScreen() {
  const { publicId, subTripId } = useParams<{ publicId: string; subTripId: string }>();
  const navigate = useNavigate();
  const [subTrip, setSubTrip] = useState<SubTripDetailType | null>(null);
  const [members, setMembers] = useState<{ id: number; name: string }[] | null>(null);
  const [saldoData, setSaldoData] = useState<SaldoData | null>(null);
  const [sheetMode, setSheetMode] = useState<'create' | 'edit' | null>(null);
  const [selectedMemberDetail, setSelectedMemberDetail] = useState<{ id: number; name: string } | null>(null);
  const [settleTargetDebt, setSettleTargetDebt] = useState<SettleDebtTarget | null>(null);
  const [previewProof, setPreviewProof] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentMemberId = publicId ? getCurrentMemberId(publicId) : null;

  async function load() {
    if (!publicId || !subTripId) return;
    try {
      const [subTripData, tripData, saldoRes] = await Promise.all([
        api.getSubTrip(publicId, Number(subTripId)),
        api.tripDetail(publicId),
        api.getSaldoData ? api.getSaldoData(publicId).catch(() => null) : Promise.resolve(null),
      ]);
      setSubTrip(subTripData);
      setMembers(tripData.members);
      setSaldoData(saldoRes);
    } catch {
      setError('Gagal muat detail sub trip. Coba refresh halaman.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId, subTripId]);

  async function handleConfirmSettlement(selectedDebts: SettleDebtTarget[], proofImage?: string | null) {
    if (!publicId || !subTripId || selectedDebts.length === 0) return;
    try {
      await api.toggleDebtSettled(publicId, Number(subTripId), selectedDebts[0].debtId, true, currentMemberId, proofImage);
      setSettleTargetDebt(null);
      load();
    } catch {
      alert('Gagal memperbarui status pelunasan');
    }
  }

  async function handleResetSettled(debtId: number) {
    if (!publicId || !subTripId) return;
    try {
      await api.toggleDebtSettled(publicId, Number(subTripId), debtId, false, currentMemberId);
      load();
    } catch {
      alert('Gagal membatalkan status pelunasan');
    }
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
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="font-mono text-xl font-semibold">{formatRupiah(subTrip.amount)}</span>
          {subTrip.discountAmount && subTrip.discountAmount > 0 ? (
            <span className="rounded bg-white/20 px-2 py-0.5 font-inter text-[11px] font-bold">
              🏷️ Hemat {formatRupiah(subTrip.discountAmount)}
            </span>
          ) : null}
        </div>
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
          <div key={d.id} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div
                onClick={() => {
                  const targetMember = members?.find((m) => m.name === d.name);
                  if (targetMember) setSelectedMemberDetail({ id: targetMember.id, name: targetMember.name });
                }}
                className="flex items-center gap-2.5 cursor-pointer hover:opacity-85"
              >
                <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-surfaceAlt font-manrope text-xs font-bold text-text">
                  {d.name.charAt(0)}
                </div>
                <div>
                  <div className="font-inter text-sm font-semibold text-text hover:underline">{d.name}</div>
                  <div className={`font-inter text-[11px] ${d.settled ? 'text-pos' : 'text-neg'}`}>
                    {d.settled ? (d.coveredByDeposit ? 'Lunas (Deposit)' : 'Lunas') : 'Belum transfer'}
                  </div>
                  {d.depositNote && (
                    <div className="mt-0.5 font-inter text-[10.5px] font-medium text-accent">
                      {d.depositNote}
                    </div>
                  )}
                  {d.proofImage && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewProof(d.proofImage!);
                      }}
                      className="mt-1 text-left font-inter text-[10.5px] font-bold text-teal-600 dark:text-teal-400 hover:underline"
                    >
                      📸 Lihat Bukti Transfer
                    </button>
                  )}
                </div>
              </div>
              <div className="font-mono text-sm font-semibold text-text">{formatRupiah(d.amount)}</div>
            </div>

            <SwipeToConfirm
              label="Geser tandai lunas 👉"
              confirmedLabel={d.settledByMemberName ? `✓ Lunas (oleh ${d.settledByMemberName})` : '✓ Lunas'}
              isSettled={Boolean(d.settled)}
              onConfirm={() => {
                setSettleTargetDebt({
                  subTripId: Number(subTripId),
                  debtId: d.id,
                  subTripName: subTrip.name,
                  debtorName: d.name,
                  creditorName: subTrip.payerName,
                  amount: d.amount,
                });
              }}
              onReset={() => handleResetSettled(d.id)}
            />
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

      <MemberDetailSheet
        isOpen={Boolean(selectedMemberDetail)}
        onClose={() => setSelectedMemberDetail(null)}
        publicId={publicId ?? ''}
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

      {/* Bukti Transfer Modal Preview */}
      {previewProof && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5 cursor-pointer"
          onClick={() => setPreviewProof(null)}
        >
          <div className="relative flex flex-col items-center gap-3 rounded-card bg-surface p-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between w-full">
              <span className="font-manrope text-sm font-bold text-text">Bukti Transfer</span>
              <button
                type="button"
                onClick={() => setPreviewProof(null)}
                className="font-inter text-xs font-bold text-sub hover:text-text"
              >
                ✕ Tutup
              </button>
            </div>
            <img src={previewProof} alt="Bukti Transfer" className="w-full max-h-[380px] rounded-lg object-contain bg-black/10" />
            <a
              href={previewProof}
              download="bukti_transfer.png"
              className="w-full text-center rounded-pill bg-accent py-2 font-inter text-xs font-bold text-onAccent shadow-sm"
            >
              ⬇️ Download Bukti
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
