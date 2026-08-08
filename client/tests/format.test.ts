import { describe, expect, it } from 'vitest';
import { formatDateRange, formatRupiah } from '../src/lib/format';

describe('formatDateRange', () => {
  it('formats a date range with Indonesian month abbreviations', () => {
    expect(formatDateRange('2026-09-01', '2026-09-04')).toBe('1 Sep–4 Sep');
  });
});

describe('formatRupiah', () => {
  it('formats a positive amount with a Rp prefix and thousands separators', () => {
    expect(formatRupiah(20000)).toBe('Rp20.000');
  });

  it('formats zero without a sign', () => {
    expect(formatRupiah(0)).toBe('Rp0');
  });

  it('formats a negative amount with the minus sign before Rp', () => {
    expect(formatRupiah(-20000)).toBe('-Rp20.000');
  });
});
