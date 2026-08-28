import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type TripAnalyticsData, type TripDetail } from '../lib/api';
import { formatRupiah } from '../lib/format';
import BottomNavTripLevel from '../components/BottomNavTripLevel';
import ShareTripSheet from '../components/ShareTripSheet';
import AppLogo from '../components/AppLogo';

export default function StatistikScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [analytics, setAnalytics] = useState<TripAnalyticsData | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicId) return;
    setLoading(true);
    Promise.all([api.tripDetail(publicId), api.tripAnalytics(publicId)])
      .then(([tripData, analyticsData]) => {
        setTrip(tripData);
        setAnalytics(analyticsData);
      })
      .catch(() => setError('Gagal memuat statistik trip.'))
      .finally(() => setLoading(false));
  }, [publicId]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
        <div className="font-inter text-[13px] text-neg">{error}</div>
        <button
          onClick={() => navigate(`/t/${publicId}/ringkasan`)}
          className="font-inter text-xs font-semibold text-accent"
        >
          ← Kembali ke Ringkasan
        </button>
      </div>
    );
  }

  if (loading || !trip || !analytics || !publicId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="font-inter text-sm text-sub animate-pulse">Memuat statistik visual...</div>
      </div>
    );
  }

  const { categoryBreakdown, dailySpending, awards, settlementProgress, totalExpense, memberCount } = analytics;

  // Donut Chart Math
  const radius = 65;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPercent = 0;

  return (
    <div className="flex min-h-screen flex-col gap-4 px-5 pb-[110px] pt-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/t/${publicId}/ringkasan`)}
          className="font-inter text-xs font-semibold text-accent hover:underline"
        >
          ← Ringkasan
        </button>
        <div className="flex items-center gap-1.5 font-manrope text-[17px] font-extrabold text-text">
          <AppLogo size={22} />
          <span>Statistik Trip</span>
        </div>
        <button
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-1 rounded-pill bg-accent px-3 py-1.5 font-inter text-xs font-bold text-onAccent shadow-sm hover:opacity-90 active:scale-95 transition-transform"
        >
          <span>🔗</span>
          <span>Bagikan</span>
        </button>
      </div>

      {/* Hero: Total Spending & Summary */}
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="font-inter text-xs font-semibold text-sub">Total Pengeluaran Trip</span>
          <span className="rounded-full bg-surfaceAlt px-2.5 py-0.5 font-inter text-[11px] font-medium text-sub">
            {memberCount} Anggota · {analytics.subTripCount} Sub Trip
          </span>
        </div>
        <div className="font-mono text-3xl font-extrabold text-text">
          {formatRupiah(totalExpense)}
        </div>
        <div className="flex items-center justify-between border-t border-border/70 pt-2.5 font-inter text-xs text-sub">
          <span>Rata-rata per orang:</span>
          <span className="font-mono font-bold text-text">{formatRupiah(awards.averagePerMember)}</span>
        </div>
      </div>

      {/* Section 1: Settlement Progress Gauge */}
      <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
            Progres Pelunasan Trip
          </div>
          <span className="font-mono text-sm font-bold text-pos">
            {settlementProgress.settledPercentage}% Lunas
          </span>
        </div>

        {/* Progress Bar Capsule */}
        <div className="relative h-3.5 w-full overflow-hidden rounded-pill bg-surfaceAlt">
          <div
            className="h-full rounded-pill bg-pos transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, settlementProgress.settledPercentage))}%` }}
          />
        </div>

        <div className="mt-1 flex items-center justify-between font-inter text-xs">
          <span className="text-pos font-semibold">
            ✓ {formatRupiah(settlementProgress.settledDebtsAmount)} ({settlementProgress.settledDebtsCount} tagihan)
          </span>
          <span className="text-neg font-semibold">
            {settlementProgress.unsettledDebtsAmount > 0 ? `Sisa ${formatRupiah(settlementProgress.unsettledDebtsAmount)}` : 'Semua Beres! 🎉'}
          </span>
        </div>
      </div>

      {/* Section 2: Visual Donut Chart by Category */}
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
        <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
          Pengeluaran per Kategori
        </div>

        {categoryBreakdown.length === 0 ? (
          <div className="py-6 text-center font-inter text-xs text-sub">Belum ada data pengeluaran</div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* SVG Donut Chart */}
            <div className="relative flex h-[160px] w-[160px] flex-none items-center justify-center">
              <svg width="160" height="160" viewBox="0 0 160 160" className="-rotate-90">
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="transparent"
                  stroke="var(--color-surface-alt, #f3f4f6)"
                  strokeWidth="20"
                />
                {categoryBreakdown.map((cat) => {
                  const dashLength = (cat.percentage / 100) * circumference;
                  const dashOffset = -((accumulatedPercent / 100) * circumference);
                  accumulatedPercent += cat.percentage;
                  return (
                    <circle
                      key={cat.category}
                      cx="80"
                      cy="80"
                      r={radius}
                      fill="transparent"
                      stroke={cat.color}
                      strokeWidth="20"
                      strokeDasharray={`${dashLength} ${circumference}`}
                      strokeDashoffset={dashOffset}
                      className="cursor-pointer transition-all duration-300 hover:opacity-85"
                      onClick={() => setSelectedCategory(selectedCategory === cat.category ? null : cat.category)}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="font-inter text-[10px] uppercase font-semibold text-sub">Total</span>
                <span className="font-mono text-sm font-bold text-text">{formatRupiah(totalExpense)}</span>
              </div>
            </div>

            {/* Category Legend List */}
            <div className="flex flex-1 flex-col gap-2 w-full">
              {categoryBreakdown.map((cat) => (
                <div
                  key={cat.category}
                  onClick={() => setSelectedCategory(selectedCategory === cat.category ? null : cat.category)}
                  className={`flex items-center justify-between rounded-lg p-2 transition-colors cursor-pointer ${
                    selectedCategory === cat.category ? 'bg-surfaceAlt ring-1 ring-accent' : 'hover:bg-surfaceAlt/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="h-3 w-3 flex-none rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <div className="truncate font-inter text-xs font-semibold text-text">
                      {cat.label}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-sub font-medium">{cat.percentage}%</span>
                    <span className="font-bold text-text">{formatRupiah(cat.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Daily Spending Bar Chart */}
      {dailySpending.length > 0 && (
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
              Tren Pengeluaran Harian
            </div>
            <div className="font-inter text-[10.5px] font-medium text-sub">
              {dailySpending.length} Hari
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {dailySpending.map((day) => {
              const maxSpend = Math.max(...dailySpending.map((d) => d.total), 1);
              const barPercent = Math.min(100, Math.max(10, Math.round((day.total / maxSpend) * 100)));
              return (
                <div key={day.date} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between font-inter text-xs">
                    <span className="font-semibold text-text flex items-center gap-1">
                      {day.formattedDate}
                      {day.isPeak && <span title="Hari Pengeluaran Tertinggi">🔥</span>}
                    </span>
                    <span className="font-mono font-bold text-text">{formatRupiah(day.total)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-pill bg-surfaceAlt">
                    <div
                      className={`h-full rounded-pill transition-all duration-300 ${
                        day.isPeak ? 'bg-amber-500' : 'bg-accent'
                      }`}
                      style={{ width: `${barPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 4: Trip Awards & Highlights */}
      <div className="flex flex-col gap-2.5">
        <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">
          🏆 Trip Highlights & Awards
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {/* Sultan Trip Award */}
          {awards.topCreditor && (
            <div className="flex items-center gap-3.5 rounded-card border border-amber-500/30 bg-amber-500/10 p-3.5">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-amber-500 text-lg shadow-sm">
                👑
              </div>
              <div className="flex flex-col">
                <span className="font-inter text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Sultan Trip (Paling Nalingin)
                </span>
                <span className="font-manrope text-sm font-extrabold text-text">
                  {awards.topCreditor.name}
                </span>
                <span className="font-mono text-xs font-semibold text-sub">
                  Total nalingin {formatRupiah(awards.topCreditor.amount)}
                </span>
              </div>
            </div>
          )}

          {/* Top Consumer Award */}
          {awards.topConsumer && (
            <div className="flex items-center gap-3.5 rounded-card border border-accent/30 bg-accent/10 p-3.5">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-accent text-lg shadow-sm">
                🍽️
              </div>
              <div className="flex flex-col">
                <span className="font-inter text-[11px] font-bold uppercase tracking-wider text-accent">
                  Top Spender (Paling Doyan Jajan)
                </span>
                <span className="font-manrope text-sm font-extrabold text-text">
                  {awards.topConsumer.name}
                </span>
                <span className="font-mono text-xs font-semibold text-sub">
                  Total konsumsi {formatRupiah(awards.topConsumer.amount)}
                </span>
              </div>
            </div>
          )}

          {/* Most Expensive Sub Trip */}
          {awards.mostExpensiveSubTrip && (
            <div className="flex items-center gap-3.5 rounded-card border border-border bg-surface p-3.5 sm:col-span-2">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-surfaceAlt text-lg shadow-sm">
                🏷️
              </div>
              <div className="flex flex-1 items-center justify-between">
                <div className="flex flex-col min-w-0">
                  <span className="font-inter text-[11px] font-semibold text-sub">
                    Sub Trip Termahal ({awards.mostExpensiveSubTrip.category})
                  </span>
                  <span className="truncate font-manrope text-sm font-extrabold text-text">
                    {awards.mostExpensiveSubTrip.name}
                  </span>
                  <span className="font-inter text-[11px] text-sub">
                    {awards.mostExpensiveSubTrip.date}
                  </span>
                </div>
                <div className="font-mono text-base font-bold text-text ml-3">
                  {formatRupiah(awards.mostExpensiveSubTrip.amount)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <BottomNavTripLevel publicId={publicId} active="ringkasan" onAddClick={() => navigate(`/t/${publicId}/ringkasan`)} />

      <ShareTripSheet
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        tripName={trip.name}
        publicId={publicId}
      />
    </div>
  );
}
