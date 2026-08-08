import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WaPreviewScreen from '../src/screens/WaPreviewScreen';
import { api } from '../src/lib/api';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../src/lib/api');

describe('WaPreviewScreen', () => {
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

    vi.mocked(api.getSaldoData).mockResolvedValue({
      rollupMembers: [],
      unsettledDebts: [
        {
          id: 1,
          subTripId: 10,
          subTripName: 'Makan Gudeg',
          date: '2026-08-01',
          debtorId: 2,
          debtorName: 'Budi',
          creditorId: 1,
          creditorName: 'Adit',
          amount: 20000,
          accounts: [{ id: 100, label: 'BCA', accountNumber: '123456789', isDefault: true }],
        },
      ],
      deposits: [],
    });
  });

  it('renders monospace WA rekap grouped per sub-trip and wa.me deep-link button', async () => {
    render(
      <MemoryRouter initialEntries={['/t/test-trip/wa-preview']}>
        <Routes>
          <Route path="/t/:publicId/wa-preview" element={<WaPreviewScreen />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Preview Rekap WA')).toBeInTheDocument();
      expect(screen.getByText(/Makan Gudeg/)).toBeInTheDocument();
      expect(screen.getByText('Buka WhatsApp & pilih grup')).toBeInTheDocument();
    });
  });

  it('picks the isDefault account for the rekap text, not just the first one in the array', async () => {
    vi.mocked(api.getSaldoData).mockResolvedValue({
      rollupMembers: [],
      unsettledDebts: [
        {
          id: 1,
          subTripId: 10,
          subTripName: 'Makan Gudeg',
          date: '2026-08-01',
          debtorId: 2,
          debtorName: 'Budi',
          creditorId: 1,
          creditorName: 'Adit',
          amount: 20000,
          accounts: [
            { id: 100, label: 'Mandiri', accountNumber: '111111', isDefault: false },
            { id: 101, label: 'BCA', accountNumber: '222222', isDefault: true },
          ],
        },
      ],
      deposits: [],
    });

    render(
      <MemoryRouter initialEntries={['/t/test-trip/wa-preview']}>
        <Routes>
          <Route path="/t/:publicId/wa-preview" element={<WaPreviewScreen />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/BCA: 222222/)).toBeInTheDocument();
      expect(screen.queryByText(/Mandiri: 111111/)).not.toBeInTheDocument();
    });
  });
});
