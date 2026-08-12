import { describe, it, expect } from 'vitest';
import { computeDynamicDeposits } from '../../src/lib/depositLogic';

describe('computeDynamicDeposits', () => {
  it('auto-applies deposit in chronological debt order and generates depositNote', () => {
    const rawDebts = [
      { id: 1, subTripId: 10, subTripName: 'Makan 1', debtorId: 2, debtorName: 'Budi', creditorId: 1, creditorName: 'Adit', amount: 15000, date: '2026-08-01' },
      { id: 2, subTripId: 11, subTripName: 'Makan 2', debtorId: 2, debtorName: 'Budi', creditorId: 1, creditorName: 'Adit', amount: 20000, date: '2026-08-02' },
    ];
    const rawDeposits = [
      { id: 100, fromMemberId: 2, fromName: 'Budi', toMemberId: 1, toName: 'Adit', amount: 20000 },
    ];

    const result = computeDynamicDeposits(rawDebts, rawDeposits);

    // First debt (15k) consumed 15k from 20k deposit, remaining 5k
    expect(result.annotatedDebts[0].depositNote).toBe('Rp15.000 dipotong dari deposit Budi → Adit (sisa Rp5.000)');
    // Second debt (20k) consumed remaining 5k deposit, remaining 0
    expect(result.annotatedDebts[1].depositNote).toBe('Rp5.000 dipotong dari deposit Budi → Adit (sisa Rp0)');
    
    // Deposit summary for Budi -> Adit has remaining balance 0 and low indicator true
    expect(result.depositSummaries[0].remainingBalance).toBe(0);
    expect(result.depositSummaries[0].low).toBe(true);
  });

  it('handles multiple deposit pairs independently', () => {
    const rawDebts = [
      { id: 1, subTripId: 10, subTripName: 'Makan 1', debtorId: 2, debtorName: 'Budi', creditorId: 1, creditorName: 'Adit', amount: 30000, date: '2026-08-01' },
      { id: 2, subTripId: 11, subTripName: 'Transport', debtorId: 3, debtorName: 'Charlie', creditorId: 2, creditorName: 'Budi', amount: 50000, date: '2026-08-01' },
    ];
    const rawDeposits = [
      { id: 100, fromMemberId: 2, fromName: 'Budi', toMemberId: 1, toName: 'Adit', amount: 100000 },
    ];

    const result = computeDynamicDeposits(rawDebts, rawDeposits);

    expect(result.annotatedDebts[0].depositNote).toBe('Rp30.000 dipotong dari deposit Budi → Adit (sisa Rp70.000)');
    expect(result.annotatedDebts[1].depositNote).toBeUndefined();

    expect(result.depositSummaries[0].remainingBalance).toBe(70000);
    expect(result.depositSummaries[0].low).toBe(false);
  });

  it('auto-settles debt fully covered by deposit and maintains remaining balance even if debt was marked settled', () => {
    const rawDebts = [
      { id: 1, subTripId: 10, subTripName: 'Makan 1', debtorId: 2, debtorName: 'Hiro', creditorId: 1, creditorName: 'Ando', amount: 100000, date: '2026-08-01', settled: true },
    ];
    const rawDeposits = [
      { id: 100, fromMemberId: 2, fromName: 'Hiro', toMemberId: 1, toName: 'Ando', amount: 1000000 },
    ];

    const result = computeDynamicDeposits(rawDebts, rawDeposits);

    expect(result.annotatedDebts[0].settled).toBe(true);
    expect(result.annotatedDebts[0].coveredByDeposit).toBe(true);
    expect(result.depositSummaries[0].remainingBalance).toBe(900000);
  });
});

