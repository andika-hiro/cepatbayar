import type { SubTripCategory } from './api';

export const CATEGORIES: { value: SubTripCategory; label: string }[] = [
  { value: 'makan', label: 'Makan' },
  { value: 'transport', label: 'Transport' },
  { value: 'nginap', label: 'Nginap' },
  { value: 'tiket_wisata', label: 'Tiket wisata' },
  { value: 'lainnya', label: 'Lainnya' },
];

export function categoryLabel(category: SubTripCategory): string {
  return CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
