import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type SettledDebtItem } from '../lib/api';
import { formatRupiah } from '../lib/format';

export default function RiwayatPelunasanScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [settledDebts, setSettledDebts] = useState<SettledDebtItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicId) return;
    api.getSettledDebts(publicId)
      .then(setSettledDebts)
      .catch(() => setError('Gagal memuat riwayat pelunasan.'));
  }, [publicId]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
        <div className="font-inter text-[13px] text-neg">{error}</div>
      </div>
    );
  }

  if (!settledDebts || !publicId) return null;

  return (
    <div className="flex min-h-screen flex-col gap-5 px-5 pb-10 pt-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/t/${publicId}/saldo`)}
          className="font-inter text-xs font-semibold text-accent"
        >
          ← Saldo & deposit
        </button>
        <div className="font-manrope text-[17px] font-extrabold text-text">Riwayat pelunasan</div>
        <div className="w-[60px]" />
      </div>

      {settledDebts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sub font-inter text-xs">
          Belum ada riwayat pelunasan.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {settledDebts.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3">
              <div>
                <div className="font-inter text-sm font-bold text-text">
                  {item.debtorName} → {item.creditorName}
                </div>
                <div className="font-inter text-xs text-sub">
                  {item.subTripName}
                </div>
              </div>
              <div className="font-mono text-sm font-bold text-pos">
                {formatRupiah(item.amount)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
