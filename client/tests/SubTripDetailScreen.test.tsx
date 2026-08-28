import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SubTripDetailScreen from '../src/screens/SubTripDetailScreen';
import { setIdentity } from '../src/lib/localTrips';

vi.mock('../src/lib/api', () => ({
  api: {
    getSubTrip: vi.fn(),
    tripDetail: vi.fn(),
    toggleDebtSettled: vi.fn(),
    deleteSubTrip: vi.fn(),
    getSaldoData: vi.fn().mockResolvedValue(null),
    getSettledDebts: vi.fn().mockResolvedValue([]),
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

const subTripDetail = {
  id: 5,
  name: 'Makan Malam',
  category: 'makan' as const,
  date: '2026-01-01',
  payerMemberId: 1,
  payerName: 'Budi',
  amount: 60000,
  payerParticipates: true,
  createdByMemberId: 1,
  splitMode: 'total' as const,
  taxPercent: 0,
  servicePercent: 0,
  items: [],
  debts: [{ id: 10, memberId: 2, name: 'Aji', amount: 30000, settled: false }],
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(api.tripDetail).mockResolvedValue(tripDetail);
  vi.mocked(api.getSubTrip).mockResolvedValue(subTripDetail);
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/t/a1/subtrip/5']}>
      <Routes>
        <Route path="/t/:publicId/subtrip/:subTripId" element={<SubTripDetailScreen />} />
        <Route path="/t/:publicId/riwayat" element={<div>Riwayat screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SubTripDetailScreen — display', () => {
  it('renders sub trip header, accent card, and debt rows', async () => {
    setIdentity('a1', '2');
    renderScreen();
    expect(await screen.findByText('Makan Malam')).toBeInTheDocument();
    expect(screen.getByText('Makan · 2026-01-01')).toBeInTheDocument();
    expect(screen.getByText('Total dibayar Budi')).toBeInTheDocument();
    expect(screen.getByText('Rp60,000')).toBeInTheDocument();
    expect(screen.getByText('Aji')).toBeInTheDocument();
    expect(screen.getByText('Belum transfer')).toBeInTheDocument();
    expect(screen.getByText('Rp30,000')).toBeInTheDocument();
  });

  it('navigates back to Riwayat via the back link', async () => {
    setIdentity('a1', '2');
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('← Riwayat'));
    expect(await screen.findByText('Riwayat screen')).toBeInTheDocument();
  });
});

describe('SubTripDetailScreen — toggling debts', () => {
  it('marks a debt as settled and refetches', async () => {
    setIdentity('a1', '2');
    vi.mocked(api.toggleDebtSettled).mockResolvedValue({ ok: true });
    renderScreen();
    const knob = await screen.findByTestId('swipe-knob');
    fireEvent.mouseDown(knob, { clientX: 0 });
    fireEvent.mouseMove(knob, { clientX: 300 });
    fireEvent.mouseUp(knob);

    const confirmModalBtn = await screen.findByText(/✓ Tandai Lunas/);
    fireEvent.click(confirmModalBtn);

    await waitFor(() => {
      expect(api.toggleDebtSettled).toHaveBeenCalledWith('a1', 5, 10, true, 2, null);
      expect(api.getSubTrip).toHaveBeenCalledTimes(2);
    });
  });
});

describe('SubTripDetailScreen — edit/delete authorization', () => {
  it('shows Edit and Hapus for the member who created the entry', async () => {
    setIdentity('a1', '1');
    renderScreen();
    expect(await screen.findByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Hapus')).toBeInTheDocument();
  });

  it('hides Edit and Hapus for a member who did not create the entry', async () => {
    setIdentity('a1', '2');
    renderScreen();
    await screen.findByText('Makan Malam');
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Hapus')).not.toBeInTheDocument();
  });

  it('opens the sheet in edit mode, pre-filled, when Edit is clicked', async () => {
    setIdentity('a1', '1');
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('Edit'));
    expect(screen.getByText('Edit pengeluaran')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Makan Malam')).toBeInTheDocument();
  });

  it('shows a confirmation step before deleting, and Batal cancels it', async () => {
    setIdentity('a1', '1');
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('Hapus'));
    expect(screen.getByText('Yakin mau hapus sub trip ini?')).toBeInTheDocument();
    await user.click(screen.getByText('Batal'));
    expect(screen.queryByText('Yakin mau hapus sub trip ini?')).not.toBeInTheDocument();
  });

  it('deletes the sub trip and navigates to Riwayat on confirm', async () => {
    setIdentity('a1', '1');
    vi.mocked(api.deleteSubTrip).mockResolvedValue({ ok: true });
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('Hapus'));
    await user.click(screen.getByText('Ya, hapus'));
    expect(api.deleteSubTrip).toHaveBeenCalledWith('a1', 5, 1);
    expect(await screen.findByText('Riwayat screen')).toBeInTheDocument();
  });
});

describe('SubTripDetailScreen — FAB', () => {
  it('opens the sheet in create mode from the FAB', async () => {
    setIdentity('a1', '2');
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Tambah sub trip'));
    expect(screen.getByText('Tambah pengeluaran')).toBeInTheDocument();
  });
});

describe('SubTripDetailScreen — error handling', () => {
  it('shows an error message when loading fails', async () => {
    setIdentity('a1', '2');
    vi.mocked(api.getSubTrip).mockRejectedValue(new Error('network error'));
    renderScreen();
    expect(await screen.findByText('Gagal muat detail sub trip. Coba refresh halaman.')).toBeInTheDocument();
  });
});

describe('SubTripDetailScreen — item breakdown', () => {
  it('shows Rincian item for a per-item sub trip', async () => {
    setIdentity('a1', '2');
    vi.mocked(api.getSubTrip).mockResolvedValue({
      ...subTripDetail,
      splitMode: 'per_item',
      taxPercent: 10,
      servicePercent: 0,
      items: [{ id: 1, name: 'Nasi Goreng', price: 20000, participants: [{ memberId: 2, name: 'Aji', billedToMemberId: null, billedToName: null }] }],
    });
    renderScreen();
    expect(await screen.findByText('Rincian item')).toBeInTheDocument();
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument();
  });

  it('hides Rincian item for a total-mode sub trip', async () => {
    setIdentity('a1', '2');
    renderScreen();
    await screen.findByText('Makan Malam');
    expect(screen.queryByText('Rincian item')).not.toBeInTheDocument();
  });
});
