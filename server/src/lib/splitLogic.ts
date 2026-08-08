export function computeEqualShares(
  amount: number,
  participantMemberIds: number[],
  payerMemberId: number,
): Map<number, number> {
  const divisor = participantMemberIds.length;
  const share = Math.ceil(amount / divisor);
  const shares = new Map<number, number>();
  for (const memberId of participantMemberIds) {
    if (memberId === payerMemberId) continue;
    shares.set(memberId, share);
  }
  return shares;
}

export interface ExistingDebt {
  id: number;
  memberId: number;
  settled: boolean;
}

export interface ReconcileResult {
  toInsert: { memberId: number; amount: number }[];
  toUpdateAmount: { id: number; amount: number }[];
  toDelete: { id: number }[];
}

export function reconcileDebts(existingDebts: ExistingDebt[], newShares: Map<number, number>): ReconcileResult {
  const toInsert: ReconcileResult['toInsert'] = [];
  const toUpdateAmount: ReconcileResult['toUpdateAmount'] = [];
  const toDelete: ReconcileResult['toDelete'] = [];

  const existingByMemberId = new Map(existingDebts.map((d) => [d.memberId, d]));

  for (const [memberId, amount] of newShares) {
    const existing = existingByMemberId.get(memberId);
    if (existing) {
      toUpdateAmount.push({ id: existing.id, amount });
    } else {
      toInsert.push({ memberId, amount });
    }
  }

  for (const existing of existingDebts) {
    if (!newShares.has(existing.memberId)) {
      toDelete.push({ id: existing.id });
    }
  }

  return { toInsert, toUpdateAmount, toDelete };
}
