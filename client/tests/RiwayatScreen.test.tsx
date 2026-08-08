import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RiwayatScreen from '../src/screens/RiwayatScreen';
import { setIdentity } from '../src/lib/localTrips';

vi.mock('../src/lib/api', () => ({
  api: {
    tripDetail: vi.fn(),
    listSubTrips: vi.fn(),
  },
}));

import { api } from '../src/lib/api';

const tripDetail = {
  publicId: 'a1',
  name: 'Trip ke Jogja',
  destination: 'Yogyakarta',
  startDate: '2026-01-01',
  endDate: '2026-01-04',
  members: [{ id: 1, name: 'Budi' }],
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setIdentity('a1', '1');
  vi.mocked(api.tripDetail).mockResolvedValue(tripDetail);
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/t/a1/riwayat']}>
      <Routes>
        <Route path="/t/:publicId/riwayat" element={<RiwayatScreen />} />
        <Route path="/t/:publicId/subtrip/:subTripId" element={<div>Sub trip detail screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RiwayatScreen', () => {
  it('renders each sub trip row with category, payer, date, unsettled count, and amount', async () => {
    vi.mocked(api.listSubTrips).mockResolvedValue([
      { id: 1, name: 'Makan Siang', category: 'makan', date: '2026-01-01', payerMemberId: 1, payerName: 'Budi', amount: 40000, unsettledCount: 1 },
    ]);
    renderScreen();
    expect(await screen.findByText('Makan Siang')).toBeInTheDocument();
    expect(screen.getByText('Makan · dibayar Budi · 2026-01-01 · 1 belum lunas')).toBeInTheDocument();
    expect(screen.getByText('Rp40.000')).toBeInTheDocument();
  });

  it('shows "Semua lunas" when a sub trip has no unsettled debts', async () => {
    vi.mocked(api.listSubTrips).mockResolvedValue([
      { id: 1, name: 'Makan Siang', category: 'makan', date: '2026-01-01', payerMemberId: 1, payerName: 'Budi', amount: 40000, unsettledCount: 0 },
    ]);
    renderScreen();
    expect(await screen.findByText('Makan · dibayar Budi · 2026-01-01 · Semua lunas')).toBeInTheDocument();
  });

  it('shows an empty message when there are no sub trips', async () => {
    vi.mocked(api.listSubTrips).mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('Belum ada sub trip.')).toBeInTheDocument();
  });

  it('navigates to Sub trip detail when a row is tapped', async () => {
    vi.mocked(api.listSubTrips).mockResolvedValue([
      { id: 7, name: 'Makan Siang', category: 'makan', date: '2026-01-01', payerMemberId: 1, payerName: 'Budi', amount: 40000, unsettledCount: 1 },
    ]);
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('Makan Siang'));
    expect(await screen.findByText('Sub trip detail screen')).toBeInTheDocument();
  });

  it('opens the add sheet from the FAB', async () => {
    vi.mocked(api.listSubTrips).mockResolvedValue([]);
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Tambah sub trip'));
    expect(screen.getByText('Tambah pengeluaran')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.mocked(api.listSubTrips).mockRejectedValue(new Error('network error'));
    renderScreen();
    expect(await screen.findByText('Gagal muat riwayat. Coba refresh halaman.')).toBeInTheDocument();
  });
});
