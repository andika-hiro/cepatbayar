export interface RawDebt {
  id: number;
  subTripId: number;
  subTripName: string;
  debtorId: number;
  debtorName: string;
  creditorId: number;
  creditorName: string;
  amount: number;
  date: string;
  settled?: boolean;
}

export interface RawDeposit {
  id: number;
  fromMemberId: number;
  fromName: string;
  toMemberId: number;
  toName: string;
  amount: number;
}

export interface AnnotatedDebt extends RawDebt {
  depositNote?: string;
}

export interface DepositSummary {
  fromMemberId: number;
  fromName: string;
  toMemberId: number;
  toName: string;
  totalAmount: number;
  remainingBalance: number;
  low: boolean;
}

function formatRp(val: number): string {
  return new Intl.NumberFormat('id-ID').format(val);
}

export function computeDynamicDeposits(
  unsettledDebts: RawDebt[],
  depositsList: RawDeposit[]
): { annotatedDebts: AnnotatedDebt[]; depositSummaries: DepositSummary[] } {
  // Aggregate total deposits per pair (fromMemberId -> toMemberId)
  const poolMap = new Map<string, { total: number; remaining: number; fromName: string; toName: string; fromId: number; toId: number }>();

  for (const dep of depositsList) {
    const key = `${dep.fromMemberId}->${dep.toMemberId}`;
    const existing = poolMap.get(key) || { total: 0, remaining: 0, fromName: dep.fromName, toName: dep.toName, fromId: dep.fromMemberId, toId: dep.toMemberId };
    existing.total += dep.amount;
    existing.remaining += dep.amount;
    poolMap.set(key, existing);
  }

  // Sort debts chronologically (date, subTripId, debt id)
  const sortedDebts = [...unsettledDebts].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.subTripId !== b.subTripId) return a.subTripId - b.subTripId;
    return a.id - b.id;
  });

  const annotatedDebts: AnnotatedDebt[] = sortedDebts.map((debt) => {
    const key = `${debt.debtorId}->${debt.creditorId}`;
    const pool = poolMap.get(key);

    if (!pool || pool.remaining <= 0) {
      return { ...debt };
    }

    const applied = Math.min(debt.amount, pool.remaining);
    pool.remaining -= applied;

    const depositNote = `Rp${formatRp(applied)} dipotong dari deposit ${debt.debtorName} → ${debt.creditorName} (sisa Rp${formatRp(pool.remaining)})`;

    return {
      ...debt,
      depositNote,
    };
  });

  const depositSummaries: DepositSummary[] = Array.from(poolMap.values()).map((p) => ({
    fromMemberId: p.fromId,
    fromName: p.fromName,
    toMemberId: p.toId,
    toName: p.toName,
    totalAmount: p.total,
    remainingBalance: p.remaining,
    low: p.remaining <= 0 || p.remaining < 0.2 * p.total,
  }));

  return { annotatedDebts, depositSummaries };
}
