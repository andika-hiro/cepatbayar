import { useState } from 'react';
import { api, type OcrScanResult } from '../lib/api';
import { formatRupiah } from '../lib/format';

interface OcrScanSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (draft: { items: { name: string; price: number }[]; taxPercent: number; servicePercent: number }) => void;
}

function compressAndResizeImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        resolve('data:image/png;base64,mock');
        return;
      }
      const img = new Image();
      let done = false;
      const finish = (res: string) => {
        if (!done) {
          done = true;
          resolve(res);
        }
      };
      // Generous timeout — this only exists as a safety net in case image
      // decode never fires; it should essentially never trigger in practice.
      const timer = setTimeout(() => finish(dataUrl), 3000);
      img.onload = () => {
        clearTimeout(timer);
        try {
          // Receipt text (especially thermal-printer fonts) needs real
          // resolution to stay legible for OCR — 1200px made photos blurry
          // enough that the model frequently couldn't read them at all.
          // 10MB server limit gives plenty of headroom for 2000px JPEGs.
          const MAX_DIM = 2000;
          let width = img.width || 800;
          let height = img.height || 600;

          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            finish(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          finish(canvas.toDataURL('image/jpeg', 0.92));
        } catch {
          finish(dataUrl);
        }
      };
      img.onerror = () => finish(dataUrl);
      img.src = dataUrl;
    };
    reader.onerror = () => resolve('data:image/png;base64,mock');
    reader.readAsDataURL(file);
  });
}


export default function OcrScanSheet({ isOpen, onClose, onApply }: OcrScanSheetProps) {
  const [step, setStep] = useState<'capture' | 'loading' | 'draft'>('capture');
  const [items, setItems] = useState<{ name: string; price: number }[]>([]);
  const [taxPercent, setTaxPercent] = useState(10);
  const [servicePercent, setServicePercent] = useState(5);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleScan(imageData: string) {
    try {
      setStep('loading');
      setError(null);
      const res: OcrScanResult = await api.scanReceipt(imageData);
      const validItems = res.items && res.items.length > 0 ? res.items : [{ name: '', price: 0 }];
      setItems(validItems);
      setTaxPercent(res.taxPercent || 0);
      setServicePercent(res.servicePercent || 0);
      if (res.isFallback) {
        setError('⚠️ AI kesulitan membaca otomatis struk ini. Silakan periksa atau isi rincian item secara manual.');
      }
      setStep('draft');
    } catch {
      setItems([{ name: '', price: 0 }]);
      setTaxPercent(0);
      setServicePercent(0);
      setError('⚠️ Gagal memproses AI. Silakan masukkan rincian item struk secara manual di bawah.');
      setStep('draft');
    }
  }


  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setStep('loading');
      setError(null);
      const imageData = await compressAndResizeImage(file);
      await handleScan(imageData);
    } catch {
      setError('Gagal memproses gambar struk.');
      setStep('capture');
    }
  }

  function handleItemChange(index: number, field: 'name' | 'price', value: string) {
    const next = [...items];
    if (field === 'name') {
      next[index].name = value;
    } else {
      next[index].price = parseInt(value, 10) || 0;
    }
    setItems(next);
  }

  function handleAddItem() {
    setItems([...items, { name: '', price: 0 }]);
  }

  function handleRemoveItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const taxAmount = Math.ceil((subtotal * taxPercent) / 100);
  const serviceAmount = Math.ceil((subtotal * servicePercent) / 100);
  const grandTotal = subtotal + taxAmount + serviceAmount;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/45">
      <div className="flex max-h-[92vh] flex-col gap-4 rounded-t-[20px] bg-surface p-5 transition-transform duration-300 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="font-manrope text-[17px] font-bold text-text">
            {step === 'capture' ? 'Scan Struk (OCR)' : step === 'loading' ? 'Memproses Struk...' : 'Hasil Scan Struk'}
          </div>
          <button onClick={onClose} className="font-inter text-xs font-semibold text-sub">
            Batal
          </button>
        </div>

        {error && <div className="font-inter text-xs text-neg">{error}</div>}

        {/* Step 1: Capture */}
        {step === 'capture' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border bg-surfaceAlt px-4 text-sub">
              <span className="font-inter text-xs">Arahkan kamera ke struk atau pilih foto</span>
              <span className="font-inter text-[11px] text-sub/70">Pastikan tulisan item & total terlihat jelas</span>
            </div>

            <div className="flex w-full flex-col gap-2.5">
              <label className="w-full rounded-input bg-accent py-3 text-center font-inter text-sm font-bold text-onAccent cursor-pointer">
                <span>Ambil foto struk</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  aria-label="Ambil foto struk"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <label className="w-full rounded-input border border-border bg-surface py-3 text-center font-inter text-sm font-semibold text-text cursor-pointer">
                <span>Pilih dari galeri</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}


        {/* Step 2: Loading */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
            <div className="font-inter text-sm font-semibold text-text">Membaca struk dengan AI...</div>
            <div className="font-inter text-xs text-sub">Mengekstrak daftar item, pajak, dan total</div>
          </div>
        )}

        {/* Step 3: Editable Draft */}
        {step === 'draft' && (
          <div className="flex flex-col gap-4">
            <div className="rounded-card border border-border bg-surfaceAlt p-3.5 font-inter text-xs text-sub">
              💡 <span className="font-semibold text-text">Dapat diedit:</span> Periksa dan sesuaikan item sebelum digunakan di pengeluaran.
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="font-inter text-xs font-bold text-sub">Item Struk</div>
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                    placeholder="Nama item"
                    className="flex-1 rounded-input border border-border bg-surface px-3 py-2 font-inter text-sm text-text"
                  />
                  <input
                    type="number"
                    value={item.price || ''}
                    onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
                    placeholder="Harga"
                    className="w-28 rounded-input border border-border bg-surface px-3 py-2 font-mono text-sm text-text"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    className="px-2 text-neg font-bold text-base"
                  >
                    ×
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddItem}
                className="self-start font-inter text-xs font-bold text-accent"
              >
                + Tambah item
              </button>
            </div>

            {/* Tax & Service percents */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="tax-percent-input" className="font-inter text-xs font-semibold text-sub">Pajak (%)</label>
                <input
                  id="tax-percent-input"
                  type="number"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(Number(e.target.value))}
                  className="rounded-input border border-border bg-surface px-3 py-2 font-mono text-sm text-text"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="service-percent-input" className="font-inter text-xs font-semibold text-sub">Service Charge (%)</label>
                <input
                  id="service-percent-input"
                  type="number"
                  value={servicePercent}
                  onChange={(e) => setServicePercent(Number(e.target.value))}
                  className="rounded-input border border-border bg-surface px-3 py-2 font-mono text-sm text-text"
                />
              </div>
            </div>

            {/* Totals Summary */}
            <div className="flex flex-col gap-1 rounded-card bg-surfaceAlt p-3.5 font-inter text-xs">
              <div className="flex justify-between text-sub">
                <span>Subtotal:</span>
                <span className="font-mono">{formatRupiah(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sub">
                <span>Pajak ({taxPercent}%):</span>
                <span className="font-mono">{formatRupiah(taxAmount)}</span>
              </div>
              <div className="flex justify-between text-sub">
                <span>Service ({servicePercent}%):</span>
                <span className="font-mono">{formatRupiah(serviceAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-text pt-1 border-t border-border">
                <span>TOTAL:</span>
                <span className="font-mono text-sm">{formatRupiah(grandTotal)}</span>
              </div>
            </div>

            <button
              onClick={() => onApply({ items, taxPercent, servicePercent })}
              className="w-full rounded-input bg-accent py-3 font-inter text-sm font-bold text-onAccent"
            >
              Pakai hasil ini
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
