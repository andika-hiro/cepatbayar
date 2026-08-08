import { Link, useLocation } from 'react-router-dom';

export default function BottomNavAppLevel() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="fixed inset-x-0 bottom-0 flex items-center justify-around border-t border-border bg-surface px-4 pb-[18px] pt-[10px]">
      <div className="flex flex-col items-center gap-[3px]">
        <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={isHome ? 'var(--color-accent)' : 'var(--color-sub)'} strokeWidth={2}>
          <path d="M4 11 12 4l8 7" />
          <path d="M6 10v9h12v-9" />
        </svg>
        <span className={`font-inter text-[10px] font-semibold ${isHome ? 'text-accent' : 'text-sub'}`}>Beranda</span>
      </div>
      <Link to="/profil" className="flex flex-col items-center gap-[3px]">
        <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--color-sub)" strokeWidth={2}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c0-4 3-6 7-6s7 2 7 6" />
        </svg>
        <span className="font-inter text-[10px] font-medium text-sub">Profil</span>
      </Link>
    </div>
  );
}
