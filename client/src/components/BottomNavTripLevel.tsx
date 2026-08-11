import { Link } from 'react-router-dom';

interface BottomNavTripLevelProps {
  publicId: string;
  active: 'ringkasan' | 'riwayat' | 'saldo' | 'profil';
  onAddClick?: () => void;
}

export default function BottomNavTripLevel({ publicId, active, onAddClick }: BottomNavTripLevelProps) {
  const isRingkasan = active === 'ringkasan';
  const isRiwayat = active === 'riwayat';
  const isSaldo = active === 'saldo';
  const isProfil = active === 'profil';

  const strokeColor = (isActive: boolean) => (isActive ? 'var(--color-accent)' : 'var(--color-sub)');
  const textClass = (isActive: boolean) =>
    `font-inter text-[10px] ${isActive ? 'font-semibold text-accent' : 'font-medium text-sub'}`;

  return (
    <div className="fixed inset-x-0 bottom-0 flex items-center justify-around border-t border-border bg-surface px-4 pb-[18px] pt-[10px] z-40">
      {/* Ringkasan */}
      <Link to={`/t/${publicId}/ringkasan`} className="flex flex-col items-center gap-[3px]">
        <svg
          aria-hidden="true"
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor(isRingkasan)}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="7" height="9" x="3" y="3" rx="1" />
          <rect width="7" height="5" x="14" y="3" rx="1" />
          <rect width="7" height="9" x="14" y="12" rx="1" />
          <rect width="7" height="5" x="3" y="16" rx="1" />
        </svg>
        <span className={textClass(isRingkasan)}>Ringkasan</span>
      </Link>

      {/* Riwayat */}
      <Link to={`/t/${publicId}/riwayat`} className="flex flex-col items-center gap-[3px]">
        <svg
          aria-hidden="true"
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor(isRiwayat)}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
          <path d="M16 8H8" />
          <path d="M16 12H8" />
          <path d="M13 16H8" />
        </svg>
        <span className={textClass(isRiwayat)}>Riwayat</span>
      </Link>

      {/* FAB Add Button */}
      <button
        onClick={onAddClick}
        aria-label="Tambah sub trip"
        className="flex h-12 w-12 flex-none -translate-y-3 items-center justify-center rounded-full bg-accent font-inter text-lg font-bold text-onAccent shadow-md hover:opacity-90 active:scale-95 transition-transform"
      >
        +
      </button>

      {/* Saldo */}
      <Link to={`/t/${publicId}/saldo`} className="flex flex-col items-center gap-[3px]">
        <svg
          aria-hidden="true"
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor(isSaldo)}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h3v-4Z" />
        </svg>
        <span className={textClass(isSaldo)}>Saldo</span>
      </Link>

      {/* Profil */}
      <Link to={`/t/${publicId}/pengaturan`} className="flex flex-col items-center gap-[3px]">
        <svg
          aria-hidden="true"
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke={strokeColor(isProfil)}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c0-4 3-6 7-6s7 2 7 6" />
        </svg>
        <span className={textClass(isProfil)}>Profil</span>
      </Link>
    </div>
  );
}
