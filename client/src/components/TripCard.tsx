import type { TripSummary } from '../lib/api';
import { formatDateRange } from '../lib/format';

interface TripCardProps {
  trip: TripSummary;
  onOpen: (publicId: string) => void;
}

export default function TripCard({ trip, onOpen }: TripCardProps) {
  const statusLabel = trip.unsettledCount > 0 ? `${trip.unsettledCount} tagihan belum lunas` : 'Semua lunas';
  const statusColor = trip.unsettledCount > 0 ? 'text-neg' : 'text-pos';

  return (
    <button
      onClick={() => onOpen(trip.publicId)}
      className="flex flex-col gap-1.5 rounded-card border border-border bg-surface px-[15px] py-3.5 text-left font-inter"
    >
      <div className="font-manrope text-[15px] font-bold text-text">{trip.name}</div>
      <div className="text-xs text-sub">
        {trip.destination} · {formatDateRange(trip.startDate, trip.endDate)}
      </div>
      <div className="mt-1 flex items-center justify-between">
        <div className="text-[11.5px] font-medium text-sub">{trip.memberCount} orang</div>
        <div className={`text-[11.5px] font-semibold ${statusColor}`}>{statusLabel}</div>
      </div>
    </button>
  );
}
