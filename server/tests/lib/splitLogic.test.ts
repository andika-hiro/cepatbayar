import { describe, expect, it } from 'vitest';
import { computeEqualShares, reconcileDebts } from '../../src/lib/splitLogic';

describe('computeEqualShares', () => {
  it('splits evenly among participants, excluding the payer', () => {
    const shares = computeEqualShares(90000, [1, 2, 3], 1);
    expect(shares.get(1)).toBeUndefined();
    expect(shares.get(2)).toBe(30000);
    expect(shares.get(3)).toBe(30000);
    expect(shares.size).toBe(2);
  });

  it('rounds each share up to the nearest whole Rupiah when division is not exact', () => {
    const shares = computeEqualShares(100000, [1, 2, 3], 1);
    // 100000 / 3 = 33333.33... -> ceil = 33334
    expect(shares.get(2)).toBe(33334);
    expect(shares.get(3)).toBe(33334);
  });

  it('includes all participants as debtors when the payer is not among them', () => {
    const shares = computeEqualShares(60000, [2, 3], 1);
    expect(shares.get(2)).toBe(30000);
    expect(shares.get(3)).toBe(30000);
    expect(shares.size).toBe(2);
  });

  it('produces no debts when the payer is the only participant', () => {
    const shares = computeEqualShares(50000, [1], 1);
    expect(shares.size).toBe(0);
  });
});

describe('reconcileDebts', () => {
  it('updates the amount of an existing debt while preserving its settled status', () => {
    const existing = [{ id: 10, memberId: 2, settled: true }];
    const newShares = new Map([[2, 40000]]);
    const result = reconcileDebts(existing, newShares);
    expect(result.toUpdateAmount).toEqual([{ id: 10, amount: 40000 }]);
    expect(result.toInsert).toEqual([]);
    expect(result.toDelete).toEqual([]);
  });

  it('inserts a new debt for a newly added participant', () => {
    const existing: { id: number; memberId: number; settled: boolean }[] = [];
    const newShares = new Map([[3, 25000]]);
    const result = reconcileDebts(existing, newShares);
    expect(result.toInsert).toEqual([{ memberId: 3, amount: 25000 }]);
  });

  it('deletes a debt for a participant who was removed, even if it was settled', () => {
    const existing = [{ id: 11, memberId: 4, settled: true }];
    const newShares = new Map<number, number>();
    const result = reconcileDebts(existing, newShares);
    expect(result.toDelete).toEqual([{ id: 11 }]);
    expect(result.toUpdateAmount).toEqual([]);
  });

  it('handles a mix of insert, update, and delete in one call', () => {
    const existing = [
      { id: 1, memberId: 2, settled: false },
      { id: 2, memberId: 3, settled: true },
    ];
    const newShares = new Map([
      [2, 15000],
      [4, 15000],
    ]);
    const result = reconcileDebts(existing, newShares);
    expect(result.toUpdateAmount).toEqual([{ id: 1, amount: 15000 }]);
    expect(result.toInsert).toEqual([{ memberId: 4, amount: 15000 }]);
    expect(result.toDelete).toEqual([{ id: 2 }]);
  });
});
