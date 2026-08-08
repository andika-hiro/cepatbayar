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
  const uniqueParticipants = new Set<number>();

  for (const item of items) {
    subtotal += item.price;
    const itemTax = Math.ceil((item.price * taxPercent) / 100);
    taxTotal += itemTax;
    const itemTotal = item.price + itemTax;
    const participantCount = item.participants.length;
    const share = Math.ceil(itemTotal / participantCount);

    for (const participant of item.participants) {
      uniqueParticipants.add(participant.memberId);
      const debtor = participant.billedToMemberId ?? participant.memberId;
      if (debtor === payerMemberId) continue;
      shares.set(debtor, (shares.get(debtor) ?? 0) + share);
    }
  }

  const serviceCharge = Math.ceil((subtotal * servicePercent) / 100);
  if (serviceCharge > 0 && uniqueParticipants.size > 0) {
    const serviceShare = Math.ceil(serviceCharge / uniqueParticipants.size);
    for (const memberId of uniqueParticipants) {
      if (memberId === payerMemberId) continue;
      shares.set(memberId, (shares.get(memberId) ?? 0) + serviceShare);
    }
  }

  const grandTotal = subtotal + taxTotal + serviceCharge;
  return { shares, subtotal, taxTotal, serviceCharge, grandTotal };
}
