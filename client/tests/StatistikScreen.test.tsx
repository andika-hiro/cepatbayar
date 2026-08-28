import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StatistikScreen from '../src/screens/StatistikScreen';
import { api, type TripAnalyticsData, type TripDetail } from '../src/lib/api';

vi.mock('../src/lib/api', () => ({
  api: {
    tripDetail: vi.fn(),
    tripAnalytics: vi.fn(),
  },
}));

describe('StatistikScreen', () => {
  const mockTrip: TripDetail = {
    publicId: 'trip-123',
    name: 'Liburan Bali',
    destination: 'Bali',
    startDate: '2026-08-10',
    endDate: '2026-08-15',
    members: [
      { id: 1, name: 'Ando' },
      { id: 2, name: 'Farel' },
    ],
  };

  const mockAnalytics: TripAnalyticsData = {
    totalExpense: 1500000,
    subTripCount: 3,
    memberCount: 2,
    categoryBreakdown: [
      { category: 'makan', label: 'Makan & Minum', total: 1000000, percentage: 67, count: 2, color: '#0D9488' },
      { category: 'transport', label: 'Transportasi', total: 500000, percentage: 33, count: 1, color: '#F59E0B' },
    ],
    dailySpending: [
      { date: '2026-08-10', formattedDate: '10 Agu', total: 1000000, isPeak: true },
      { date: '2026-08-11', formattedDate: '11 Agu', total: 500000, isPeak: false },
    ],
    awards: {
      topCreditor: { memberId: 1, name: 'Ando', amount: 1200000 },
      topConsumer: { memberId: 2, name: 'Farel', amount: 800000 },
      mostExpensiveSubTrip: { id: 1, name: 'Makan Seafood', amount: 800000, category: 'Makan & Minum', date: '10 Agu' },
      averagePerMember: 750000,
    },
    settlementProgress: {
      totalDebtsAmount: 800000,
      settledDebtsAmount: 600000,
      unsettledDebtsAmount: 200000,
      settledPercentage: 75,
      totalDebtsCount: 4,
      settledDebtsCount: 3,
      unsettledDebtsCount: 1,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.tripDetail as any).mockResolvedValue(mockTrip);
    (api.tripAnalytics as any).mockResolvedValue(mockAnalytics);
  });

  it('renders total spending, awards, category donut legend, and settlement progress', async () => {
    render(
      <MemoryRouter initialEntries={['/t/trip-123/statistik']}>
        <Routes>
          <Route path="/t/:publicId/statistik" element={<StatistikScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Statistik Trip')).toBeInTheDocument();
      expect(screen.getByText('Total Pengeluaran Trip')).toBeInTheDocument();
      expect(screen.getAllByText('Rp1,500,000')).toHaveLength(2);
      expect(screen.getByText('Rp750,000')).toBeInTheDocument(); // Average per person
      expect(screen.getByText(/75.*% Lunas/)).toBeInTheDocument();
      expect(screen.getByText('Sultan Trip (Paling Nalingin)')).toBeInTheDocument();
      expect(screen.getByText('Top Spender (Paling Doyan Jajan)')).toBeInTheDocument();
      expect(screen.getByText('Makan Seafood')).toBeInTheDocument();
    });
  });
});
