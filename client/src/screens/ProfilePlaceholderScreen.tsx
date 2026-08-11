import { useEffect, useState } from 'react';
import { api, type CurrentUser } from '../lib/api';
import BottomNavAppLevel from '../components/BottomNavAppLevel';
import { getStoredTheme, setStoredTheme, type ThemeMode } from '../lib/theme';
import AppLogo from '../components/AppLogo';


type AuthStage = 'checking' | 'needsEmail' | 'linkSent' | 'authenticated';

export default function ProfilePlaceholderScreen() {
  const [authStage, setAuthStage] = useState<AuthStage>('checking');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [email, setEmail] = useState('');
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleThemeChange(mode: ThemeMode) {
    setTheme(mode);
    setStoredTheme(mode);
  }


  useEffect(() => {
    api
      .me()
      .then((userData) => {
        setUser(userData);
        setAuthStage('authenticated');
      })
      .catch(() => {
        setAuthStage('needsEmail');
      });
  }, []);

  async function handleRequestLink() {
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.requestLink(email.trim(), '/profil');
      setAuthStage('linkSent');
    } catch {
      setError('Gagal kirim link. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
      setUser(null);
      setAuthStage('needsEmail');
    } catch {
      alert('Gagal keluar.');
    }
  }

  if (authStage === 'checking') return null;

  return (

    <div className="flex min-h-screen flex-col gap-5 px-5 pb-[100px] pt-4">
      <div className="flex items-center gap-2.5">
        <AppLogo size={32} />
        <div className="font-manrope text-[21px] font-extrabold text-text">Profil & Akun</div>
      </div>


      {authStage === 'needsEmail' || authStage === 'linkSent' ? (
        <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
          <div>
            <div className="font-manrope text-base font-bold text-text">Masuk ke Akun Kamu</div>
            <div className="mt-1 font-inter text-xs text-sub">
              Masukin email untuk mengelola profil dan melihat trip kamu.
            </div>
          </div>

          {authStage === 'needsEmail' ? (
            <div className="flex flex-col gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@kamu.com"
                className="rounded-input border border-border bg-surface px-3.5 py-3 font-inter text-sm text-text"
              />
              <button
                onClick={handleRequestLink}
                disabled={!email.trim() || submitting}
                className="rounded-[14px] bg-accent px-4 py-3 font-inter text-sm font-bold text-onAccent disabled:opacity-50"
              >
                Kirim link masuk
              </button>
            </div>
          ) : (
            <div className="rounded-md bg-surfaceAlt p-3.5 font-inter text-xs text-sub">
              📩 Cek email kamu (<span className="font-semibold text-text">{email}</span>), klik link yang dikirim untuk masuk.
            </div>
          )}

          {error && <div className="font-inter text-xs text-neg">{error}</div>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* User Info Card */}
          <div className="flex items-center gap-3.5 rounded-card border border-border bg-surface p-4">
            <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-accent font-manrope text-lg font-bold text-onAccent">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex flex-col min-w-0">
              <div className="truncate font-manrope text-sm font-bold text-text">{user?.email}</div>
              <div className="font-inter text-xs text-accent">Akun Terverifikasi</div>
            </div>
          </div>

          {/* Theme Settings */}
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

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="w-full rounded-card border border-neg/30 bg-neg/5 py-3 text-center font-inter text-sm font-semibold text-neg"
          >
            Keluar (Logout)
          </button>
        </div>
      )}

      <BottomNavAppLevel />
    </div>
  );
}
