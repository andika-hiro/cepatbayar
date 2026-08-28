import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RiwayatPelunasanScreen from '../src/screens/RiwayatPelunasanScreen';
import { api } from '../src/lib/api';

vi.mock('../src/lib/api', () => ({
  api: {
    getSettledDebts: vi.fn(),
  },
}));

describe('RiwayatPelunasanScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders and groups multi-debt combined settlement sharing the same proofImage', async () => {
    const mockSettledDebts = [
      {
        id: 1,
        subTripName: 'Makan Malam',
        debtorId: 10,
        debtorName: 'Andika',
        creditorId: 20,
        creditorName: 'Ando',
        amount: 10000,
        settledAt: '2026-08-28T12:00:00.000Z',
        proofImage: 'https://res.cloudinary.com/demo/image/upload/proof123.jpg',
      },
      {
        id: 2,
        subTripName: 'Grab Car',
        debtorId: 10,
        debtorName: 'Andika',
        creditorId: 20,
        creditorName: 'Ando',
        amount: 20000,
        settledAt: '2026-08-28T12:00:00.000Z',
        proofImage: 'https://res.cloudinary.com/demo/image/upload/proof123.jpg',
      },
    ];

    vi.mocked(api.getSettledDebts).mockResolvedValue(mockSettledDebts as any);

    render(
      <MemoryRouter initialEntries={['/t/trip123/riwayat-pelunasan']}>
        <Routes>
          <Route path="/t/:publicId/riwayat-pelunasan" element={<RiwayatPelunasanScreen />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Pelunasan Gabungan \(2 tagihan\)/)).toBeInTheDocument();
      expect(screen.getByText('Makan Malam')).toBeInTheDocument();
      expect(screen.getByText('Grab Car')).toBeInTheDocument();
      expect(screen.getAllByText(/30[,.]000/).length).toBeGreaterThanOrEqual(1);
    });
  });
});
