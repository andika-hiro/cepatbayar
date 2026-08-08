import { useRef, useState } from 'react';
import { api, type SplitMode, type SubTripCategory, type SubTripDetail, type SubTripInput } from '../lib/api';
import { CATEGORIES } from '../lib/categories';
import ItemRow, { type ItemRowParticipant } from './ItemRow';
import OcrScanSheet from './OcrScanSheet';

interface DraftItem {
  key: string;
  name: string;
  priceText: string;
  participants: ItemRowParticipant[];
}

interface AddEditSubTripSheetProps {
  publicId: string;
  members: { id: number; name: string }[];
  currentMemberId: number;
  mode: 'create' | 'edit';
  initialData?: SubTripDetail;
  onClose: () => void;
  onSaved: () => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AddEditSubTripSheet({
  publicId,
  members,
  currentMemberId,
  mode,
  initialData,
  onClose,
  onSaved,
}: AddEditSubTripSheetProps) {
  const [ocrSheetOpen, setOcrSheetOpen] = useState(false);
  const [name, setName] = useState(initialData?.name ?? '');
  const [category, setCategory] = useState<SubTripCategory | null>(initialData?.category ?? null);
  const [amountText, setAmountText] = useState(initialData ? String(initialData.amount) : '');
  const [payerMemberId, setPayerMemberId] = useState<number>(initialData?.payerMemberId ?? currentMemberId);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(
    new Set(
      initialData
        ? [...initialData.debts.map((d) => d.memberId), ...(initialData.payerParticipates ? [initialData.payerMemberId] : [])]
        : members.map((m) => m.id),
    ),
  );
  const [items, setItems] = useState<DraftItem[]>(() =>
    initialData && initialData.items.length > 0
      ? initialData.items.map((item) => ({
          key: `item-${item.id}`,
          name: item.name,
          priceText: String(item.price),
          participants: item.participants.map((p) => ({ memberId: p.memberId, billedToMemberId: p.billedToMemberId })),
        }))
      : [{ key: 'item-0', name: '', priceText: '', participants: members.map((m) => ({ memberId: m.id, billedToMemberId: null })) }],
  );
  const nextItemKeyRef = useRef(Date.now());

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        key: `item-${nextItemKeyRef.current++}`,
        name: '',
        priceText: '',
        participants: members.map((m) => ({ memberId: m.id, billedToMemberId: null })),
      },
    ]);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }
  const [taxPercentText, setTaxPercentText] = useState(initialData ? String(initialData.taxPercent) : '0');
  const [servicePercentText, setServicePercentText] = useState(initialData ? String(initialData.servicePercent) : '0');
  const [payerOpen, setPayerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>(initialData?.splitMode ?? 'total');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const payerName = members.find((m) => m.id === payerMemberId)?.name ?? '';

  const amount = Number.parseInt(amountText, 10);
  const totalModeValid = Number.isFinite(amount) && amount > 0 && checkedIds.size > 0;
  const perItemModeValid =
    items.length > 0 &&
    items.every((item) => item.name.trim() && Number.parseInt(item.priceText, 10) > 0 && item.participants.length > 0);
  const canSubmit = Boolean(name.trim() && category && (splitMode === 'total' ? totalModeValid : perItemModeValid));

  function toggleMember(id: number) {
    const next = new Set(checkedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedIds(next);
  }

  function handleApplyOcr(draft: { items: { name: string; price: number }[]; taxPercent: number; servicePercent: number }) {
    setSplitMode('per_item');
    setTaxPercentText(String(draft.taxPercent));
    setServicePercentText(String(draft.servicePercent));
    setItems(
      draft.items.map((item, idx) => ({
        key: `ocr-item-${idx}-${Date.now()}`,
        name: item.name,
        priceText: String(item.price),
        participants: members.map((m) => ({ memberId: m.id, billedToMemberId: null })),
      }))
    );
    setOcrSheetOpen(false);
    setAdvancedOpen(true);
  }

  async function handleSubmit() {
    if (!canSubmit || !category) return;
    setSubmitting(true);
    setError(null);
    try {
      const date = initialData?.date ?? todayIso();
      const createdByMemberId = initialData?.createdByMemberId ?? currentMemberId;
      const input: SubTripInput =
        splitMode === 'total'
          ? {
              name: name.trim(),
              category,
              date,
              payerMemberId,
              createdByMemberId,
              splitMode: 'total',
              amount,
              participantMemberIds: [...checkedIds],
            }
          : {
              name: name.trim(),
              category,
              date,
              payerMemberId,
              createdByMemberId,
              splitMode: 'per_item',
              taxPercent: Number.parseFloat(taxPercentText) || 0,
              servicePercent: Number.parseFloat(servicePercentText) || 0,
              items: items.map((item) => ({
                name: item.name.trim(),
                price: Number.parseInt(item.priceText, 10),
                participants: item.participants.map((p) =>
                  p.billedToMemberId ? { memberId: p.memberId, billedToMemberId: p.billedToMemberId } : { memberId: p.memberId },
                ),
              })),
            };
      if (mode === 'create') {
        await api.createSubTrip(publicId, input);
      } else if (initialData) {
        await api.updateSubTrip(publicId, initialData.id, input, currentMemberId);
      }
      onSaved();
    } catch {
      setError('Gagal simpan pengeluaran. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }


      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <button onClick={onClose} className="font-inter text-sm text-sub">
          Batal
        </button>
        <div className="font-manrope text-sm font-bold text-text">
          {mode === 'create' ? 'Tambah pengeluaran' : 'Edit pengeluaran'}
        </div>
        <div className="w-10" />
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 pb-[100px]">
        <label className="flex flex-col gap-1.5">
          <span className="font-inter text-xs font-semibold text-sub">Keterangan</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="misal: Makan siang di Resto A"
            className="rounded-input border border-border bg-surface px-3.5 py-3 font-inter text-sm text-text"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="font-inter text-xs font-semibold text-sub">Kategori</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={`rounded-pill border px-3.5 py-1.5 font-inter text-[12.5px] font-medium ${
                  category === c.value ? 'border-accent bg-accent text-onAccent' : 'border-border bg-surface text-text'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOcrSheetOpen(true)}
          className="flex items-center justify-center gap-2 rounded-input border border-accent/40 bg-accent/10 px-3.5 py-3 font-inter text-xs font-bold text-accent"
        >
          📷 Scan struk (isi otomatis pakai OCR)
        </button>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="flex items-center justify-between font-inter text-xs font-semibold text-sub"
          >
            <span>Opsi lanjutan</span>
            <span>{advancedOpen ? '▴' : '▾'}</span>
          </button>

          {advancedOpen && (
            <div className="flex flex-col gap-1.5 rounded-input border border-border bg-surface p-3.5">
              <span className="font-inter text-xs font-semibold text-sub">Cara bagi</span>
              {mode === 'create' ? (
                <div className="flex overflow-hidden rounded-pill border border-border">
                  <button
                    type="button"
                    onClick={() => setSplitMode('total')}
                    className={`flex-1 px-3.5 py-2 font-inter text-[12.5px] font-medium ${
                      splitMode === 'total' ? 'bg-accent text-onAccent' : 'bg-surface text-text'
                    }`}
                  >
                    Jumlah total
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitMode('per_item')}
                    className={`flex-1 px-3.5 py-2 font-inter text-[12.5px] font-medium ${
                      splitMode === 'per_item' ? 'bg-accent text-onAccent' : 'bg-surface text-text'
                    }`}
                  >
                    Rincian per item
                  </button>
                </div>
              ) : (
                <div className="rounded-pill border border-border bg-surfaceAlt px-3.5 py-2 font-inter text-[12.5px] font-medium text-sub">
                  {splitMode === 'total' ? 'Jumlah total' : 'Rincian per item'} (tidak bisa diubah saat edit)
                </div>
              )}
            </div>
          )}
        </div>

        {splitMode === 'total' && (
          <label className="flex flex-col gap-1.5">
            <span className="font-inter text-xs font-semibold text-sub">Nominal</span>
            <div className="flex items-center gap-2 rounded-input border border-border bg-surface px-3.5 py-3">
              <span className="font-mono text-sm text-sub">Rp</span>
              <input
                value={amountText}
                onChange={(e) => setAmountText(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                placeholder="0"
                className="flex-1 border-none bg-transparent font-mono text-sm text-text outline-none"
              />
            </div>
          </label>
        )}

        {splitMode === 'per_item' && (
          <div className="flex flex-col gap-2.5">
            <span className="font-inter text-xs font-semibold text-sub">Item</span>
            {items.map((item, idx) => (
              <ItemRow
                key={item.key}
                index={idx}
                name={item.name}
                priceText={item.priceText}
                participants={item.participants}
                members={members}
                canRemove={items.length > 1}
                onNameChange={(value) => updateItem(item.key, { name: value })}
                onPriceChange={(value) => updateItem(item.key, { priceText: value })}
                onParticipantsChange={(value) => updateItem(item.key, { participants: value })}
                onRemove={() => removeItem(item.key)}
              />
            ))}
            <button
              type="button"
              onClick={addItem}
              className="rounded-input border border-dashed border-border px-3.5 py-2.5 font-inter text-[12.5px] font-semibold text-accent"
            >
              + Tambah item
            </button>
            <label className="flex flex-col gap-1.5">
              <span className="font-inter text-xs font-semibold text-sub">Pajak makanan (per item)</span>
              <div className="flex items-center gap-2 rounded-input border border-border bg-surface px-3.5 py-3">
                <input
                  value={taxPercentText}
                  onChange={(e) => setTaxPercentText(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  placeholder="0"
                  className="flex-1 border-none bg-transparent font-mono text-sm text-text outline-none"
                />
                <span className="font-mono text-sm text-sub">%</span>
              </div>
              <span className="font-inter text-[11px] text-sub">Dihitung per item dan dibebankan ke penanggungnya.</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-inter text-xs font-semibold text-sub">Service charge (rata)</span>
              <div className="flex items-center gap-2 rounded-input border border-border bg-surface px-3.5 py-3">
                <input
                  value={servicePercentText}
                  onChange={(e) => setServicePercentText(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  placeholder="0"
                  className="flex-1 border-none bg-transparent font-mono text-sm text-text outline-none"
                />
                <span className="font-mono text-sm text-sub">%</span>
              </div>
              <span className="font-inter text-[11px] text-sub">
                Dibagi rata ke semua peserta sub trip ini, tanpa peduli besar-kecil pesanannya masing-masing.
              </span>
            </label>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="font-inter text-xs font-semibold text-sub">Dibayar oleh</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setPayerOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-input border border-border bg-surface px-3.5 py-3 font-inter text-sm text-text"
            >
              <span>{payerName}</span>
              <span className="text-sub">▾</span>
            </button>
            {payerOpen && (
              <div className="absolute inset-x-0 top-full z-10 mt-1 flex flex-col overflow-hidden rounded-input border border-border bg-surface shadow-lg">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setPayerMemberId(m.id);
                      setPayerOpen(false);
                    }}
                    className={`px-3.5 py-2.5 text-left font-inter text-sm ${
                      m.id === payerMemberId ? 'bg-accent text-onAccent' : 'text-text'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {splitMode === 'total' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-inter text-xs font-semibold text-sub">
                Dibagi ke ({checkedIds.size}/{members.length})
              </span>
              <div className="flex gap-3">
                <button onClick={() => setCheckedIds(new Set(members.map((m) => m.id)))} className="font-inter text-xs font-semibold text-accent">
                  Pilih semua
                </button>
                <button onClick={() => setCheckedIds(new Set())} className="font-inter text-xs font-semibold text-accent">
                  Kosongkan
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {members.map((m) => (
                <label key={m.id} className="flex items-center gap-2.5 rounded-input border border-border bg-surface px-3.5 py-2.5">
                  <input type="checkbox" checked={checkedIds.has(m.id)} onChange={() => toggleMember(m.id)} />
                  <span className="font-inter text-sm text-text">{m.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <div className="font-inter text-[12.5px] text-neg">{error}</div>}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface px-5 py-3.5">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full rounded-[14px] bg-accent px-4 py-3.5 font-inter text-sm font-bold text-onAccent disabled:opacity-50"
        >
          Simpan pengeluaran
        </button>
      </div>

      {ocrSheetOpen && (
        <OcrScanSheet
          isOpen={ocrSheetOpen}
          onClose={() => setOcrSheetOpen(false)}
          onApply={handleApplyOcr}
        />
      )}
    </div>
  );
}

