interface InstallPwaSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InstallPwaSheet({ isOpen, onClose }: InstallPwaSheetProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/45">
      <div className="flex flex-col gap-4 rounded-t-[20px] bg-surface p-5 transition-transform duration-300">
        <div className="flex items-center justify-between">
          <div className="font-manrope text-base font-bold text-text">Cara Install Cepat Bayarkan</div>
          <button onClick={onClose} className="font-inter text-xs font-semibold text-sub">
            Tutup
          </button>
        </div>

        <div className="font-inter text-xs text-sub">
          Jadikan aplikasi ini layaknya aplikasi native di layar HP kamu tanpa perlu download dari App Store / Play Store.
        </div>

        <div className="flex flex-col gap-3 py-2">
          <div className="flex items-start gap-3 rounded-card border border-border bg-surfaceAlt p-3">
            <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent font-inter text-xs font-bold text-onAccent">
              1
            </div>
            <div>
              <div className="font-inter text-xs font-bold text-text">Tap ikon Share / Menu browser</div>
              <div className="font-inter text-[11px] text-sub">Di Safari iOS (ikon kotak panah ke atas) atau Chrome Android (titik 3 di pojok atas).</div>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-card border border-border bg-surfaceAlt p-3">
            <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent font-inter text-xs font-bold text-onAccent">
              2
            </div>
            <div>
              <div className="font-inter text-xs font-bold text-text">Pilih "Add to Home Screen"</div>
              <div className="font-inter text-[11px] text-sub">Atau "Tambahkan ke Layar Utama" di daftar menu.</div>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-card border border-border bg-surfaceAlt p-3">
            <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent font-inter text-xs font-bold text-onAccent">
              3
            </div>
            <div>
              <div className="font-inter text-xs font-bold text-text">Buka dari ikon di homescreen</div>
              <div className="font-inter text-[11px] text-sub">Aplikasi siap digunakan kapan saja pas lagi trip/jalan-jalan!</div>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-input bg-accent py-3 font-inter text-sm font-bold text-onAccent"
        >
          Siap, mengerti!
        </button>
      </div>
    </div>
  );
}
