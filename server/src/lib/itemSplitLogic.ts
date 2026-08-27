export interface ItemParticipantInput {
  memberId: number;
  billedToMemberId?: number;
}

export interface ItemInput {
  name: string;
  price: number;
  participants: ItemParticipantInput[];
}

export interface ItemBasedSplitResult {
  shares: Map<number, number>;
  subtotal: number;
  taxTotal: number;
  serviceCharge: number;
  grandTotal: number;
}

export function computeItemBasedShares(
  items: ItemInput[],
  taxPercent: number,
  servicePercent: number,
  payerMemberId: number,
): ItemBasedSplitResult {
  const shares = new Map<number, number>();
  let subtotal = 0;
  let taxTotal = 0;
  let serviceCharge = 0;

  for (const item of items) {
    subtotal += item.price;
    const itemTax = Math.ceil((item.price * taxPercent) / 100);
    const itemService = Math.ceil((item.price * servicePercent) / 100);
    taxTotal += itemTax;
    serviceCharge += itemService;

    const itemTotal = item.price + itemTax + itemService;
    const participantCount = item.participants.length;
    if (participantCount === 0) continue;

    const share = Math.ceil(itemTotal / participantCount);

    for (const participant of item.participants) {
      const debtor = participant.billedToMemberId ?? participant.memberId;
      if (debtor === payerMemberId) continue;
      shares.set(debtor, (shares.get(debtor) ?? 0) + share);
    }
  }

  const grandTotal = subtotal + taxTotal + serviceCharge;
  return { shares, subtotal, taxTotal, serviceCharge, grandTotal };
}
