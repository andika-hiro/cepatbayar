import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TripListScreen from '../src/screens/TripListScreen';

vi.mock('../src/lib/api', () => ({
  api: {
    myTrips: vi.fn(),
    tripSummaries: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super('err');
      this.status = status;
    }
  },
}));

import { api } from '../src/lib/api';

beforeEach(() => {
  localStorage.clear();
  vi.mocked(api.myTrips).mockResolvedValue([
    {
      publicId: 'a1',
      name: 'Trip ke Jogja',
      destination: 'Yogyakarta',
      startDate: '2026-09-01',
      endDate: '2026-09-04',
      memberCount: 4,
      unsettledCount: 2,
    },
  ]);
  vi.mocked(api.tripSummaries).mockResolvedValue([]);
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <TripListScreen />
    </MemoryRouter>,
  );
}

describe('TripListScreen', () => {
  it('renders trip cards from the API', async () => {
    renderScreen();
    expect(await screen.findByText('Trip ke Jogja')).toBeInTheDocument();
    expect(screen.getByText('2 tagihan belum lunas')).toBeInTheDocument();
    expect(screen.getByText('4 orang')).toBeInTheDocument();
  });

  it('shows a green "Semua lunas" status when nothing is unsettled', async () => {
    vi.mocked(api.myTrips).mockResolvedValue([
      {
        publicId: 'b2',
        name: 'Trip ke Bali',
        destination: 'Bali',
        startDate: '2026-10-01',
        endDate: '2026-10-03',
        memberCount: 3,
        unsettledCount: 0,
      },
    ]);
    renderScreen();
    expect(await screen.findByText('Semua lunas')).toBeInTheDocument();
  });

  it('filters trips by search query and shows the empty-result message', async () => {
    renderScreen();
    await screen.findByText('Trip ke Jogja');
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Cari trip…'), 'bandung');
    expect(screen.queryByText('Trip ke Jogja')).not.toBeInTheDocument();
    expect(screen.getByText('Nggak ada trip yang cocok sama "bandung"')).toBeInTheDocument();
  });

  it('shows an error message and stops loading when fetching trips fails', async () => {
    vi.mocked(api.myTrips).mockRejectedValue(new Error('network error'));
    renderScreen();
    expect(await screen.findByText('Gagal muat daftar trip. Coba refresh halaman.')).toBeInTheDocument();
  });

  it('caps joined trip ids sent to the server at the most recent 50', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `id-${i}`);
    localStorage.setItem('cb.joinedTripIds', JSON.stringify(ids));
    renderScreen();
    await screen.findByText('Trip ke Jogja');
    expect(api.tripSummaries).toHaveBeenCalledWith(ids.slice(-50));
  });

  it('merges locally-joined trip ids with the authenticated user\'s own trips', async () => {
    localStorage.setItem('cb.joinedTripIds', JSON.stringify(['c3']));
    vi.mocked(api.tripSummaries).mockResolvedValue([
      {
        publicId: 'c3',
        name: 'Trip ke Malang',
        destination: 'Malang',
        startDate: '2026-11-01',
        endDate: '2026-11-02',
        memberCount: 2,
        unsettledCount: 0,
      },
    ]);
    renderScreen();
    expect(await screen.findByText('Trip ke Malang')).toBeInTheDocument();
    expect(api.tripSummaries).toHaveBeenCalledWith(['c3']);
  });
});
