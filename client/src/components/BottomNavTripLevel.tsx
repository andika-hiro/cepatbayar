import { Link } from 'react-router-dom';

interface BottomNavTripLevelProps {
  publicId: string;
  active: 'ringkasan' | 'riwayat' | 'saldo' | 'profil';
  onAddClick?: () => void;
}

export default function BottomNavTripLevel({ publicId, active, onAddClick }: BottomNavTripLevelProps) {
  const itemClass = (key: string) => `font-inter text-[10px] font-semibold ${active === key ? 'text-accent' : 'text-sub'}`;

  return (
    <div className="fixed inset-x-0 bottom-0 flex items-center justify-around border-t border-border bg-surface px-4 pb-[18px] pt-[10px]">
      <Link to={`/t/${publicId}/ringkasan`} className="flex flex-col items-center gap-[3px]">
        <span className={itemClass('ringkasan')}>Ringkasan</span>
      </Link>
      <Link to={`/t/${publicId}/riwayat`} className="flex flex-col items-center gap-[3px]">
        <span className={itemClass('riwayat')}>Riwayat</span>
      </Link>
      <button
        onClick={onAddClick}
        aria-label="Tambah sub trip"
        className="flex h-12 w-12 flex-none -translate-y-3 items-center justify-center rounded-full bg-accent font-inter text-lg text-onAccent"
      >
        +
      </button>
      <Link to={`/t/${publicId}/saldo`} className="flex flex-col items-center gap-[3px]">
        <span className={itemClass('saldo')}>Saldo</span>
      </Link>
      <Link to={`/t/${publicId}/pengaturan`} className="flex flex-col items-center gap-[3px]">
        <span className={itemClass('profil')}>Profil</span>
      </Link>
    </div>
  );
}

