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
  const formatted = new Intl.NumberFormat('id-ID').format(abs);
  return amount < 0 ? `-Rp${formatted}` : `Rp${formatted}`;
}

export function formatThousands(val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === '') return '';
  const digits = String(val).replace(/\D/g, '');
  if (!digits) return '';
  return new Intl.NumberFormat('en-US').format(Number(digits));
}
