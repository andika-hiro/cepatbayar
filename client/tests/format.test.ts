import { describe, expect, it } from 'vitest';
import { formatDateRange, formatRupiah, formatThousands } from '../src/lib/format';

describe('formatDateRange', () => {
  it('formats a date range with Indonesian month abbreviations', () => {
    expect(formatDateRange('2026-09-01', '2026-09-04')).toBe('1 Sep–4 Sep');
  });
});

describe('formatRupiah', () => {
  it('formats a positive amount with a Rp prefix and comma thousands separators', () => {
    expect(formatRupiah(20000)).toBe('Rp20,000');
    expect(formatRupiah(5000000)).toBe('Rp5,000,000');
  });

  it('formats zero without a sign', () => {
    expect(formatRupiah(0)).toBe('Rp0');
  });

  it('formats a negative amount with the minus sign before Rp', () => {
    expect(formatRupiah(-20000)).toBe('-Rp20,000');
  });
});

describe('formatThousands', () => {
  it('formats numbers and numeric strings with thousands separators', () => {
    expect(formatThousands(5000)).toBe('5,000');
    expect(formatThousands(50000)).toBe('50,000');
    expect(formatThousands('1000000')).toBe('1,000,000');
  });

  it('handles empty and zero values gracefully', () => {
    expect(formatThousands('')).toBe('');
    expect(formatThousands(undefined)).toBe('');
    expect(formatThousands(0)).toBe('0');
  });
});
