import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RingkasanScreen from '../src/screens/RingkasanScreen';
import { setIdentity } from '../src/lib/localTrips';

vi.mock('../src/lib/api', () => ({
  api: {
    tripDetail: vi.fn(),
    tripSummary: vi.fn(),
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
  members: [
    { id: 1, name: 'Budi' },
    { id: 2, name: 'Aji' },
  ],
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setIdentity('a1', '1');
  vi.mocked(api.tripDetail).mockResolvedValue(tripDetail);
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/t/a1/ringkasan']}>
      <Routes>
        <Route path="/t/:publicId/ringkasan" element={<RingkasanScreen />} />
        <Route path="/t/:publicId/riwayat" element={<div>Riwayat screen</div>} />
        <Route path="/" element={<div>Daftar trip screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RingkasanScreen — empty state', () => {
  it('shows the empty state when there are no sub trips', async () => {
    vi.mocked(api.tripSummary).mockResolvedValue({
      members: [
        { memberId: 1, name: 'Budi', rollup: 0, status: 'lunas' },
        { memberId: 2, name: 'Aji', rollup: 0, status: 'lunas' },
      ],
      tripTotal: 0,
    });
    vi.mocked(api.listSubTrips).mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('Belum ada pengeluaran')).toBeInTheDocument();
    expect(screen.getByText('+ Tambah pengeluaran pertama')).toBeInTheDocument();
  });

  it('opens the add sheet from the empty-state button', async () => {
    vi.mocked(api.tripSummary).mockResolvedValue({ members: [], tripTotal: 0 });
    vi.mocked(api.listSubTrips).mockResolvedValue([]);
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('+ Tambah pengeluaran pertama'));
    expect(screen.getByText('Tambah pengeluaran')).toBeInTheDocument();
  });
});

describe('RingkasanScreen — with sub trips', () => {
  beforeEach(() => {
    vi.mocked(api.tripSummary).mockResolvedValue({
      members: [
        { memberId: 1, name: 'Budi', rollup: 20000, status: 'dilunasin' },
        { memberId: 2, name: 'Aji', rollup: -20000, status: 'ngutang' },
      ],
      tripTotal: 40000,
    });
    vi.mocked(api.listSubTrips).mockResolvedValue([
      { id: 1, name: 'Makan', category: 'makan', date: '2026-01-01', payerMemberId: 1, payerName: 'Budi', amount: 40000, unsettledCount: 1 },
    ]);
  });

  it("shows the current member's rollup in the balance card", async () => {
    renderScreen();
    expect(await screen.findByText('Saldo kamu (Budi) — total semua sub trip')).toBeInTheDocument();
    expect(screen.getByTestId('my-rollup')).toHaveTextContent('Rp20.000');
  });

  it("shows every member's status in the list", async () => {
    renderScreen();
    await screen.findByText('Dilunasin');
    expect(screen.getByText('Ngutang')).toBeInTheDocument();
  });

  it('navigates to Riwayat via the CTA button', async () => {
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('Lihat semua tagihan per sub trip →'));
    expect(await screen.findByText('Riwayat screen')).toBeInTheDocument();
  });

  it('navigates to Daftar Trip via "Trip lain"', async () => {
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('Trip lain'));
    expect(await screen.findByText('Daftar trip screen')).toBeInTheDocument();
  });

  it('opens the add sheet from the FAB and can be closed again', async () => {
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Tambah sub trip'));
    expect(screen.getByText('Tambah pengeluaran')).toBeInTheDocument();
    await user.click(screen.getByText('Batal'));
    expect(screen.queryByText('Tambah pengeluaran')).not.toBeInTheDocument();
  });
});

describe('RingkasanScreen — error handling', () => {
  it('shows an error message when loading fails', async () => {
    vi.mocked(api.tripSummary).mockRejectedValue(new Error('network error'));
    vi.mocked(api.listSubTrips).mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('Gagal muat ringkasan. Coba refresh halaman.')).toBeInTheDocument();
  });
});
