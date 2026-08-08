import { useState } from 'react';

export interface ItemRowMember {
  id: number;
  name: string;
}

export interface ItemRowParticipant {
  memberId: number;
  billedToMemberId: number | null;
}

interface ItemRowProps {
  index: number;
  name: string;
  priceText: string;
  participants: ItemRowParticipant[];
  members: ItemRowMember[];
  canRemove: boolean;
  onNameChange: (name: string) => void;
  onPriceChange: (priceText: string) => void;
  onParticipantsChange: (participants: ItemRowParticipant[]) => void;
  onRemove: () => void;
}

export default function ItemRow({
  index,
  name,
  priceText,
  participants,
  members,
  canRemove,
  onNameChange,
  onPriceChange,
  onParticipantsChange,
  onRemove,
}: ItemRowProps) {
  const [search, setSearch] = useState('');
  const [redirectOpenFor, setRedirectOpenFor] = useState<number | null>(null);

  const participantIds = new Set(participants.map((p) => p.memberId));
  const filteredMembers = members.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  function toggleParticipant(memberId: number) {
    if (participantIds.has(memberId)) {
      onParticipantsChange(participants.filter((p) => p.memberId !== memberId));
    } else {
      onParticipantsChange([...participants, { memberId, billedToMemberId: null }]);
    }
  }

  function selectAll() {
    onParticipantsChange(
      members.map((m) => ({
        memberId: m.id,
        billedToMemberId: participants.find((p) => p.memberId === m.id)?.billedToMemberId ?? null,
      })),
    );
  }

  function clearAll() {
    onParticipantsChange([]);
  }

  function setBilledTo(memberId: number, billedToMemberId: number | null) {
    onParticipantsChange(participants.map((p) => (p.memberId === memberId ? { ...p, billedToMemberId } : p)));
    setRedirectOpenFor(null);
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-input border border-border bg-surface p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-inter text-xs font-semibold text-sub">Item {index + 1}</span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="font-inter text-xs font-semibold text-neg">
            Hapus item
          </button>
        )}
      </div>

      <input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Nama item"
        className="rounded-input border border-border bg-bg px-3.5 py-2.5 font-inter text-sm text-text"
      />

      <div className="flex items-center gap-2 rounded-input border border-border bg-bg px-3.5 py-2.5">
        <span className="font-mono text-sm text-sub">Rp</span>
        <input
          value={priceText}
          onChange={(e) => onPriceChange(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          placeholder="0"
          className="flex-1 border-none bg-transparent font-mono text-sm text-text outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-inter text-xs font-semibold text-sub">
            Peserta ({participants.length}/{members.length})
          </span>
          <div className="flex gap-3">
            <button type="button" onClick={selectAll} className="font-inter text-xs font-semibold text-accent">
              Pilih semua
            </button>
            <button type="button" onClick={clearAll} className="font-inter text-xs font-semibold text-accent">
              Kosongkan
            </button>
          </div>
        </div>
        {members.length > 5 && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari anggota"
            className="rounded-input border border-border bg-bg px-3.5 py-2 font-inter text-[12.5px] text-text"
          />
        )}
        <div className="flex flex-col gap-1.5">
          {filteredMembers.map((m) => {
            const participant = participants.find((p) => p.memberId === m.id);
            const billedToMember = participant?.billedToMemberId
              ? members.find((mm) => mm.id === participant.billedToMemberId)
              : undefined;
            return (
              <div key={m.id} className="flex flex-col gap-1.5 rounded-input border border-border bg-bg px-3.5 py-2">
                <label className="flex items-center gap-2.5">
                  <input type="checkbox" checked={participantIds.has(m.id)} onChange={() => toggleParticipant(m.id)} />
                  <span className="font-inter text-sm text-text">{m.name}</span>
                </label>
                {participant && (
                  <div className="relative ml-6">
                    <button
                      type="button"
                      onClick={() => setRedirectOpenFor(redirectOpenFor === m.id ? null : m.id)}
                      className="font-inter text-[11px] font-medium text-accent"
                    >
                      {billedToMember ? `Tagihkan ke ${billedToMember.name} →` : 'Tagihkan ke →'}
                    </button>
                    {redirectOpenFor === m.id && (
                      <div className="absolute left-0 top-full z-10 mt-1 flex flex-col overflow-hidden rounded-input border border-border bg-surface shadow-lg">
                        <button
                          type="button"
                          onClick={() => setBilledTo(m.id, null)}
                          className={`px-3.5 py-2 text-left font-inter text-[12.5px] ${
                            participant.billedToMemberId === null ? 'bg-accent text-onAccent' : 'text-text'
                          }`}
                        >
                          Tidak dialihkan
                        </button>
                        {members
                          .filter((other) => other.id !== m.id)
                          .map((other) => (
                            <button
                              key={other.id}
                              type="button"
                              onClick={() => setBilledTo(m.id, other.id)}
                              className={`px-3.5 py-2 text-left font-inter text-[12.5px] ${
                                participant.billedToMemberId === other.id ? 'bg-accent text-onAccent' : 'text-text'
                              }`}
                            >
                              {other.name}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
