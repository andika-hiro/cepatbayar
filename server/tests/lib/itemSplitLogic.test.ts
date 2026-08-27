import { describe, expect, it } from 'vitest';
import { computeItemBasedShares } from '../../src/lib/itemSplitLogic';

describe('computeItemBasedShares', () => {
  it('splits a single item evenly among its participants, excluding the payer from their own debt', () => {
    const result = computeItemBasedShares(
      [{ name: 'Nasi Goreng', price: 90000, participants: [{ memberId: 1 }, { memberId: 2 }, { memberId: 3 }] }],
      0, 0, 1,
    );
    expect(result.shares.get(1)).toBeUndefined();
    expect(result.shares.get(2)).toBe(30000);
    expect(result.shares.get(3)).toBe(30000);
    expect(result.subtotal).toBe(90000);
    expect(result.grandTotal).toBe(90000);
  });

  it('computes food tax per item and rounds each item share up', () => {
    const result = computeItemBasedShares(
      [{ name: 'Nasi Goreng', price: 100000, participants: [{ memberId: 2 }, { memberId: 3 }] }],
      10, 0, 1,
    );
    // tax = ceil(100000 * 10 / 100) = 10000; itemTotal = 110000; share = ceil(110000/2) = 55000
    expect(result.taxTotal).toBe(10000);
    expect(result.shares.get(2)).toBe(55000);
    expect(result.shares.get(3)).toBe(55000);
    expect(result.grandTotal).toBe(110000);
  });

  it('redirects a participant\'s item debt to their "Tagihkan ke" target', () => {
    const result = computeItemBasedShares(
      [{ name: 'Nasi Goreng', price: 60000, participants: [{ memberId: 2 }, { memberId: 3, billedToMemberId: 4 }] }],
      0, 0, 1,
    );
    expect(result.shares.get(2)).toBe(30000);
    expect(result.shares.get(3)).toBeUndefined();
    expect(result.shares.get(4)).toBe(30000);
  });

  it('computes service charge once on the pre-tax subtotal, split evenly among effective debtors (redirected participants pass their service charge share to their target)', () => {
    const result = computeItemBasedShares(
      [
        { name: 'Nasi Goreng', price: 50000, participants: [{ memberId: 2 }] },
        { name: 'Mie Goreng', price: 50000, participants: [{ memberId: 3, billedToMemberId: 4 }] },
      ],
      0, 10, 1,
    );
    // subtotal = 100000; serviceCharge = ceil(100000*10/100) = 10000; 2 unique effective debtors (2, 4) -> share = ceil(10000/2) = 5000
    expect(result.serviceCharge).toBe(10000);
    // member 2: item share (50000) + service share (5000) = 55000
    expect(result.shares.get(2)).toBe(55000);
    // member 3's item debt and service charge share are redirected to 4, so member 3 owes nothing
    expect(result.shares.get(3)).toBeUndefined();
    // member 4: redirected item share (50000) + service share (5000) = 55000
    expect(result.shares.get(4)).toBe(55000);
  });

  it('aggregates multiple items owed to the same debtor into one total', () => {
    const result = computeItemBasedShares(
      [
        { name: 'Item A', price: 20000, participants: [{ memberId: 2 }] },
        { name: 'Item B', price: 30000, participants: [{ memberId: 2 }] },
      ],
      0, 0, 1,
    );
    expect(result.shares.get(2)).toBe(50000);
    expect(result.shares.size).toBe(1);
  });

  it('produces no debt for the payer even when they are an item participant', () => {
    const result = computeItemBasedShares(
      [{ name: 'Nasi Goreng', price: 90000, participants: [{ memberId: 1 }, { memberId: 2 }] }],
      0, 0, 1,
    );
    expect(result.shares.has(1)).toBe(false);
    expect(result.shares.get(2)).toBe(45000);
  });

  it('computes the grand total as subtotal + tax total + service charge', () => {
    const result = computeItemBasedShares(
      [{ name: 'Nasi Goreng', price: 100000, participants: [{ memberId: 2 }] }],
      10, 10, 1,
    );
    // tax = ceil(100000*0.1) = 10000; serviceCharge = ceil(100000*0.1) = 10000
    expect(result.grandTotal).toBe(100000 + 10000 + 10000);
  });

  it('does not divide by zero when service charge is zero', () => {
    const result = computeItemBasedShares(
      [{ name: 'Item', price: 10000, participants: [{ memberId: 2 }] }],
      0, 0, 1,
    );
    expect(result.serviceCharge).toBe(0);
  });

  it('correctly attributes service charge per item portion when a participant redirects their bill', () => {
    const result = computeItemBasedShares(
      [
        {
          name: 'Menu Utama',
          price: 900000,
          participants: [
            { memberId: 1 },
            { memberId: 2 },
            { memberId: 3, billedToMemberId: 2 },
            { memberId: 4 },
            { memberId: 5 },
            { memberId: 6 },
            { memberId: 7 },
            { memberId: 8 },
          ],
        },
      ],
      10, 5, 1,
    );
    expect(result.subtotal).toBe(900000);
    expect(result.taxTotal).toBe(90000);
    expect(result.serviceCharge).toBe(45000);
    expect(result.grandTotal).toBe(1035000);

    expect(result.shares.get(4)).toBe(129375);
    expect(result.shares.get(5)).toBe(129375);
    expect(result.shares.get(6)).toBe(129375);
    expect(result.shares.get(7)).toBe(129375);
    expect(result.shares.get(8)).toBe(129375);

    expect(result.shares.get(3)).toBeUndefined();
    expect(result.shares.get(2)).toBe(258750);
  });
});
