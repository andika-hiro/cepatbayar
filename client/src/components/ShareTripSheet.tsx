import { useState } from 'react';

interface ShareTripSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tripName: string;
  publicId: string;
}

export default function ShareTripSheet({
  isOpen,
  onClose,
  tripName,
  publicId,
}: ShareTripSheetProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const shareUrl = `${window.location.origin}/t/${publicId}`;
  const shareText = `Halo! Yuk cek rincian & pelunasan tagihan trip "${tripName}" di CepatBayar:\n${shareUrl}`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  async function handleCopyLink() {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const input = document.createElement('input');
        input.value = shareUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert(`Link trip: ${shareUrl}`);
    }
  }

  async function handleNativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Trip: ${tripName} - CepatBayar`,
          text: `Yuk cek rincian & pelunasan tagihan trip "${tripName}" di CepatBayar!`,
          url: shareUrl,
        });
      } catch {
        // User cancelled native share sheet
      }
    } else {
      handleCopyLink();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Sheet Container */}
      <div className="relative w-full max-w-md rounded-t-card sm:rounded-card border border-border bg-surface p-5 shadow-xl animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔗</span>
            <div className="font-manrope text-base font-bold text-text">Bagikan Trip</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surfaceAlt font-inter text-sm font-semibold text-sub hover:text-text"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <p className="font-inter text-xs text-sub">
            Bagikan link ini ke anggota kelompok agar semua bisa melihat rincian tagihan & melunasi bersama:
          </p>

          {/* Readonly Link Box */}
          <div className="flex items-center justify-between rounded-input border border-border bg-bg px-3.5 py-2.5 font-mono text-xs text-text">
            <span className="truncate pr-2">{shareUrl}</span>
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex-none rounded-md bg-accent/15 px-2.5 py-1 font-inter text-xs font-bold text-accent hover:bg-accent/25"
            >
              {copied ? '✓ Tersalin!' : 'Salin'}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 pt-1">
            <a
              href={waUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2.5 rounded-input bg-[#25D366] py-3 font-inter text-xs font-bold text-white shadow-sm hover:opacity-95 active:scale-[0.99] transition-transform"
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
              </svg>
              Bagikan via WhatsApp
            </a>

            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="flex items-center justify-center gap-2 rounded-input border border-border bg-bg py-3 font-inter text-xs font-bold text-text hover:bg-surfaceAlt"
              >
                <span>📤</span>
                Bagikan ke Aplikasi Lain
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
