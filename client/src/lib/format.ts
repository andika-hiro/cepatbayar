const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function formatDateRange(startDate: string, endDate: string): string {
  const fmt = (iso: string) => {
    const [, month, day] = iso.split('-');
    return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
  };
  return `${fmt(startDate)}–${fmt(endDate)}`;
}

export function formatRupiah(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-US');
  return amount < 0 ? `-Rp${formatted}` : `Rp${formatted}`;
}

export function formatNumberWithCommas(amount: number | string): string {
  const numText = String(amount).replace(/[^0-9]/g, '');
  if (!numText) return '';
  const num = parseInt(numText, 10);
  if (isNaN(num)) return '';
  return num.toLocaleString('en-US');
}

export const formatThousands = formatNumberWithCommas;

export function parseFormattedNumber(text: string): string {
  return text.replace(/[^0-9]/g, '');
}
