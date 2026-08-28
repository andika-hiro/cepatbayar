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
          depositNote: 'Rp10,000 dipotong dari deposit Budi → Adit (sisa Rp0)',
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

    // Adit is net creditor (status 'pos') -> should show green "Dilunasin"
    const aditLabel = await screen.findByText('Dilunasin');
    expect(aditLabel.className).toContain('text-pos');

    // Budi is net debtor (status 'neg') -> should show red "Ngutang"
    const budiLabel = await screen.findByText('Ngutang');
    expect(budiLabel.className).toContain('text-neg');
  });

  it('renders the neutral "Lunas" label/color for a zero rollup status', async () => {
    vi.mocked(api.getSaldoData).mockResolvedValue({
      rollupMembers: [{ memberId: 1, name: 'Adit', rollup: 0, status: 'zero' }],
      unsettledDebts: [],
      deposits: [],
    });

    render(
      <MemoryRouter initialEntries={['/t/test-trip/saldo']}>
        <Routes>
          <Route path="/t/:publicId/saldo" element={<SaldoScreen />} />
        </Routes>
      </MemoryRouter>
    );

    const lunasLabel = await screen.findByText('Lunas');
    expect(lunasLabel.className).toContain('text-sub');
  });

  it('renders deposit history and allows deleting a deposit', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.deleteDeposit).mockResolvedValue({ success: true });
    vi.mocked(api.getSaldoData).mockResolvedValue({
      rollupMembers: [{ memberId: 1, name: 'Adit', rollup: 0, status: 'zero' }],
      unsettledDebts: [],
      deposits: [
        { fromMemberId: 2, fromName: 'Budi', toMemberId: 1, toName: 'Adit', totalAmount: 10000, remainingBalance: 10000, low: false },
      ],
      depositHistory: [
        { id: 99, fromMemberId: 2, fromName: 'Budi', toMemberId: 1, toName: 'Adit', amount: 10000, proofNote: 'Via BCA' },
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
      expect(screen.getByText(/Rincian catatan deposit/i)).toBeInTheDocument();
      expect(screen.getByText(/Via BCA/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Hapus/i })).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole('button', { name: /Hapus/i });
    deleteBtn.click();

    expect(window.confirm).toHaveBeenCalled();
    expect(api.deleteDeposit).toHaveBeenCalledWith('test-trip', 99);
  });
});

