import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type SaldoData, type SubTripListItem, type TripDetail, type TripSummaryDetail } from '../lib/api';
import { getCurrentMemberId } from '../lib/localTrips';
import { formatDateRange, formatRupiah } from '../lib/format';
import BottomNavTripLevel from '../components/BottomNavTripLevel';
import AddEditSubTripSheet from '../components/AddEditSubTripSheet';
import InstallPwaSheet from '../components/InstallPwaSheet';
import ShareTripSheet from '../components/ShareTripSheet';
import MemberDetailSheet from '../components/MemberDetailSheet';
import AppLogo from '../components/AppLogo';


export default function RingkasanScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [summary, setSummary] = useState<TripSummaryDetail | null>(null);
  const [subTrips, setSubTrips] = useState<SubTripListItem[] | null>(null);
  const [saldoData, setSaldoData] = useState<SaldoData | null>(null);
  const [subTripSheetOpen, setSubTripSheetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [selectedMemberDetail, setSelectedMemberDetail] = useState<{ id: number; name: string } | null>(null);
  const [installBannerVisible, setInstallBannerVisible] = useState(true);
  const [installSheetOpen, setInstallSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const currentMemberId = publicId ? getCurrentMemberId(publicId) : null;

  async function load() {
    if (!publicId) return;
    try {
      const [tripData, summaryData, subTripData, saldoDataRes] = await Promise.all([
        api.tripDetail(publicId),
        api.tripSummary(publicId),
        api.listSubTrips(publicId),
        api.getSaldoData ? api.getSaldoData(publicId).catch(() => null) : Promise.resolve(null),
      ]);
      setTrip(tripData);
      setSummary(summaryData);
      setSubTrips(subTripData);
      setSaldoData(saldoDataRes);
    } catch {
      setError('Gagal muat ringkasan. Coba refresh halaman.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId]);

  function handleSaved() {
    setSubTripSheetOpen(false);
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
  const myStatus = mySummary?.status as string | undefined;
  const statusColor = myStatus === 'pos' || myStatus === 'dilunasin' ? 'text-pos' : myStatus === 'neg' || myStatus === 'ngutang' ? 'text-neg' : 'text-text';
  const isEmpty = subTrips.length === 0;

  return (

    <div className="flex min-h-screen flex-col gap-4 px-5 pb-[100px] pt-2">
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <AppLogo size={28} />
          <div className="min-w-0">
            <div className="truncate font-manrope text-[17px] font-extrabold text-text">{trip.name}</div>
            <div className="truncate font-inter text-xs text-sub">
              {trip.members.length} orang · {formatDateRange(trip.startDate, trip.endDate)} · Total {formatRupiah(summary.tripTotal)}
            </div>
          </div>
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1 rounded-pill bg-accent px-3 py-1.5 font-inter text-xs font-bold text-onAccent shadow-sm hover:opacity-90 active:scale-95 transition-transform"
          >
            <span>🔗</span>
            <span>Bagikan</span>
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 rounded-pill border border-border bg-surface px-3 py-1.5 font-inter text-xs font-semibold text-text"
          >
            Trip lain
          </button>
        </div>
      </div>


      {installBannerVisible && (
        <div className="flex items-center justify-between rounded-card border border-accent/30 bg-accent/10 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-base">📱</span>
            <span className="font-inter text-xs font-medium text-text">Install biar gampang dibuka pas jalan-jalan</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setInstallSheetOpen(true)}
              className="rounded bg-accent px-2.5 py-1 font-inter text-xs font-bold text-onAccent"
            >
              Instal
            </button>
            <button
              onClick={() => setInstallBannerVisible(false)}
              className="px-1 font-inter text-xs font-bold text-sub"
            >
              ✕
            </button>
          </div>
        </div>
      )}


      {isEmpty ? (
        <div className="my-auto flex flex-col items-center justify-center gap-3 text-center">
          <div className="font-manrope text-base font-extrabold text-text">Belum ada pengeluaran</div>
          <div className="font-inter text-xs text-sub">Catat pengeluaran pertama dengan menekan tombol + di bawah</div>
          <button
            onClick={() => setSubTripSheetOpen(true)}
            className="rounded-pill bg-accent px-5 py-2.5 font-inter text-xs font-bold text-onAccent shadow-md hover:opacity-90"
          >
            + Tambah pengeluaran pertama
          </button>
        </div>
      ) : (
        <>
          {/* Card Status Saldo Saya */}
          <div
            onClick={() => currentMemberId !== null && setSelectedMemberDetail({ id: currentMemberId, name: myName })}
            className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4 cursor-pointer hover:bg-surfaceAlt transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="font-inter text-xs font-semibold text-sub">
                Saldo kamu ({myName}) — total semua sub trip
              </span>
              <span className="font-inter text-[11px] font-bold text-accent">Lihat rincian 🔍</span>
            </div>
            <div
              data-testid="my-rollup"
              className={`font-mono text-2xl font-bold ${statusColor}`}
            >
              {formatRupiah(mySummary?.rollup ?? 0)}
            </div>
            <div className="font-inter text-xs text-sub">
              {myStatus === 'pos' || myStatus === 'dilunasin'
                ? 'Total berhak menerima pelunasan dari anggota lain'
                : myStatus === 'neg' || myStatus === 'ngutang'
                ? 'Total sisa kewajiban kamu di trip ini'
                : 'Semua tagihan kamu sudah lunas!'}
            </div>
          </div>

          {/* List Status Semua Anggota */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
                Status anggota ({summary.members.length})
              </div>
              <div className="font-inter text-[10.5px] text-sub font-medium">Klik nama untuk rincian 💡</div>
            </div>
            {summary.members.map((m) => {
              const statusStr = m.status as string;
              const isPos = statusStr === 'pos' || statusStr === 'dilunasin' || m.rollup > 0;
              const isNeg = statusStr === 'neg' || statusStr === 'ngutang' || m.rollup < 0;
              const isZero = !isPos && !isNeg;
              const memberName = trip.members.find((tm) => tm.id === m.memberId)?.name ?? m.name ?? '';

              return (
                <div
                  key={m.memberId}
                  onClick={() => setSelectedMemberDetail({ id: m.memberId, name: memberName })}
                  className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-3.5 py-3 cursor-pointer hover:bg-surfaceAlt active:scale-[0.99] transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-surfaceAlt font-manrope text-xs font-bold text-text">
                      {memberName.trim().charAt(0).toUpperCase() || '?'}
                    </div>
                    <div>
                      <div className="font-inter text-sm font-semibold text-text">{memberName}</div>
                      <div
                        className={`font-inter text-[11px] ${
                          isPos ? 'text-pos' : isNeg ? 'text-neg' : 'text-sub'
                        }`}
                      >
                        {isPos ? 'Dilunasin' : isNeg ? 'Ngutang' : 'Lunas'}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`font-mono text-sm font-bold ${
                      isPos ? 'text-pos' : isNeg ? 'text-neg' : 'text-sub'
                    }`}
                  >
                    {isZero ? 'Rp0' : formatRupiah(Math.abs(m.rollup))}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => navigate(`/t/${publicId}/riwayat`)}
            className="mt-1 text-center font-inter text-xs font-semibold text-sub"
          >
            Lihat semua tagihan per sub trip →
          </button>
        </>
      )}

      <BottomNavTripLevel publicId={publicId} active="ringkasan" onAddClick={() => setSubTripSheetOpen(true)} />

      {subTripSheetOpen && currentMemberId !== null && (
        <AddEditSubTripSheet
          publicId={publicId}
          members={trip.members}
          currentMemberId={currentMemberId}
          mode="create"
          onClose={() => setSubTripSheetOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {installSheetOpen && (
        <InstallPwaSheet
          isOpen={installSheetOpen}
          onClose={() => setInstallSheetOpen(false)}
        />
      )}

      <ShareTripSheet
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        tripName={trip.name}
        publicId={publicId}
      />

      <MemberDetailSheet
        isOpen={Boolean(selectedMemberDetail)}
        onClose={() => setSelectedMemberDetail(null)}
        publicId={publicId}
        memberId={selectedMemberDetail?.id ?? 0}
        memberName={selectedMemberDetail?.name ?? ''}
        saldoData={saldoData}
        onRefresh={load}
      />
    </div>
  );
}
