import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import KelolaAnggotaScreen from '../src/screens/KelolaAnggotaScreen';
import { api } from '../src/lib/api';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../src/lib/api');

describe('KelolaAnggotaScreen', () => {
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
    vi.mocked(api.getMemberAccounts).mockImplementation(async (_publicId, memberId) => {
      if (memberId === 1) return [{ id: 10, label: 'BCA', accountNumber: '123', isDefault: true }];
      return [];
    });
  });

  it('renders member list with account count badges', async () => {
    render(
      <MemoryRouter initialEntries={['/t/test-trip/pengaturan/anggota']}>
        <Routes>
          <Route path="/t/:publicId/pengaturan/anggota" element={<KelolaAnggotaScreen />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Kelola anggota')).toBeInTheDocument();
      expect(screen.getByText('Adit')).toBeInTheDocument();
      expect(screen.getByText(/1 rekening tersimpan/)).toBeInTheDocument();
      expect(screen.getByText(/0 rekening tersimpan/)).toBeInTheDocument();
    });
  });
});
