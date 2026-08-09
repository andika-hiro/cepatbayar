import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BottomNavTripLevel from '../components/BottomNavTripLevel';
import { getStoredTheme, setStoredTheme, type ThemeMode } from '../lib/theme';

export default function PengaturanScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());

  function handleThemeChange(mode: ThemeMode) {
    setTheme(mode);
    setStoredTheme(mode);
  }

  if (!publicId) return null;

  return (
    <div className="flex min-h-screen flex-col gap-5 px-5 pb-[100px] pt-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/t/${publicId}/ringkasan`)}
          className="font-inter text-xs font-semibold text-accent"
        >
          ← Ringkasan
        </button>
        <div className="font-manrope text-[17px] font-extrabold text-text">Pengaturan</div>
        <div className="w-[60px]" />
      </div>

      <div className="flex flex-col gap-2">
        <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">Tampilan</div>
        <div className="flex flex-col rounded-card border border-border bg-surface p-2">
          {(['system', 'light', 'dark'] as const).map((mode) => (
            <label
              key={mode}
              className="flex items-center justify-between px-3 py-2.5 font-inter text-sm text-text cursor-pointer"
            >
              <span>{mode === 'system' ? 'Ikuti sistem' : mode === 'light' ? 'Terang' : 'Gelap'}</span>
              <input
                type="radio"
                name="theme"
                value={mode}
                checked={theme === mode}
                onChange={() => handleThemeChange(mode)}
                className="accent-accent"
              />
            </label>
          ))}
        </div>
      </div>


      <button
        onClick={() => navigate(`/t/${publicId}/pengaturan/anggota`)}
        className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3 font-inter text-sm font-semibold text-text"
      >
        <span>Kelola anggota & rekening</span>
        <span className="text-accent">→</span>
      </button>

      <BottomNavTripLevel publicId={publicId} active="profil" />
    </div>
  );
}
