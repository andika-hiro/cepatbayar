import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SaldoScreen from '../src/screens/SaldoScreen';
import { api } from '../src/lib/api';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../src/lib/api');
vi.mock('../src/lib/localTrips', () => ({
  getCurrentMemberId: () => 1,
}));

describe('SaldoScreen', () => {
  beforeEach(() => {
    vi.mocked(api.tripDetail).mockResolvedValue({
      publicId: 'test-trip',
      name: 'Jogja Trip',
      destination: 'Jogja',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      members: [
        { id: 1, name: 'Adit' },
        { id: 2, name: 'Budi' },
      ],
    });
  });

  it('renders all debts and deposit summaries', async () => {
    vi.mocked(api.getSaldoData).mockResolvedValue({
      rollupMembers: [
        { memberId: 1, name: 'Adit', rollup: 10000, status: 'pos' },
        { memberId: 2, name: 'Budi', rollup: -10000, status: 'neg' },
      ],
      unsettledDebts: [
        {
          id: 1,
          subTripId: 1,
          subTripName: 'Makan Gudeg',
          date: '2026-08-01',
          debtorId: 2,
          debtorName: 'Budi',
          creditorId: 1,
          creditorName: 'Adit',
          amount: 15000,
          depositNote: 'Rp10.000 dipotong dari deposit Budi → Adit (sisa Rp0)',
          accounts: [{ id: 1, label: 'BCA', accountNumber: '123456789', isDefault: true }],
        },
      ],
      deposits: [
        { fromMemberId: 2, fromName: 'Budi', toMemberId: 1, toName: 'Adit', totalAmount: 10000, remainingBalance: 0, low: true },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/t/test-trip/saldo']}>
        <Routes>
          <Route path="/t/:publicId/saldo" element={<SaldoScreen />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Makan Gudeg/)).toBeInTheDocument();

      expect(screen.getByText(/Semua tagihan/i)).toBeInTheDocument();
      expect(screen.getByText(/123456789/)).toBeInTheDocument();
      expect(screen.getByText(/dipotong dari deposit/)).toBeInTheDocument();
      expect(screen.getByText(/Saldo deposit menipis/)).toBeInTheDocument();
    });






  });
});
