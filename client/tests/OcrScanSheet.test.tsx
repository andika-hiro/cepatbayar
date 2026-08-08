import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OcrScanSheet from '../src/components/OcrScanSheet';
import { api } from '../src/lib/api';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../src/lib/api');

describe('OcrScanSheet', () => {
  it('advances from capture to draft and allows editing items before applying', async () => {
    vi.mocked(api.scanReceipt).mockResolvedValue({
      items: [{ name: 'Nasi Goreng', price: 25000 }],
      taxPercent: 10,
      servicePercent: 5,
      total: 28750,
    });

    const onApply = vi.fn();
    render(<OcrScanSheet isOpen={true} onClose={() => {}} onApply={onApply} />);

    // Capture step shutter click
    fireEvent.click(screen.getByLabelText('Ambil foto struk'));

    // Loading step and advance to draft step
    await waitFor(() => {
      expect(screen.getByText('Hasil Scan Struk')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Nasi Goreng')).toBeInTheDocument();
    });

    // Apply button
    fireEvent.click(screen.getByText('Pakai hasil ini'));
    expect(onApply).toHaveBeenCalledWith({
      items: [{ name: 'Nasi Goreng', price: 25000 }],
      taxPercent: 10,
      servicePercent: 5,
    });
  });
});
