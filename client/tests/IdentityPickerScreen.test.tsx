import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import IdentityPickerScreen from '../src/screens/IdentityPickerScreen';
import { getIdentity, getJoinedTripIds } from '../src/lib/localTrips';

vi.mock('../src/lib/api', () => ({
  api: {
    tripDetail: vi.fn(),
  },
}));

import { api } from '../src/lib/api';

beforeEach(() => {
  localStorage.clear();
  vi.mocked(api.tripDetail).mockResolvedValue({
    publicId: 'a1',
    name: 'Trip ke Jogja',
    destination: 'Yogyakarta',
    startDate: '2026-09-01',
    endDate: '2026-09-04',
    members: [
      { id: 1, name: 'Budi' },
      { id: 2, name: 'Aji' },
    ],
  });
});

function renderScreen(initialEntries: Array<string | { pathname: string; state?: unknown }>) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/t/:publicId" element={<IdentityPickerScreen />} />
        <Route path="/t/:publicId/ringkasan" element={<div>Ringkasan placeholder</div>} />
        <Route path="/" element={<div>Daftar trip screen</div>} />
        <Route path="/trip/new" element={<div>New trip screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('IdentityPickerScreen', () => {
  it('shows the back-to-list link when not arriving via a share link', async () => {
    renderScreen([{ pathname: '/t/a1', state: { viaShareLink: false } }]);
    expect(await screen.findByText('Budi')).toBeInTheDocument();
    expect(screen.getByText('Daftar trip')).toBeInTheDocument();
  });

  it('hides the back-to-list link when arriving via a share link (no router state)', async () => {
    renderScreen(['/t/a1']);
    await screen.findByText('Budi');
    expect(screen.queryByText('Daftar trip')).not.toBeInTheDocument();
  });

  it('selecting a member stores identity locally and navigates to the ringkasan placeholder', async () => {
    renderScreen(['/t/a1']);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Budi'));
    expect(await screen.findByText('Ringkasan placeholder')).toBeInTheDocument();
    expect(getIdentity('a1')).toBe('1');
    expect(getJoinedTripIds()).toEqual(['a1']);
  });

  it('shows an error message instead of a blank page when the trip fetch fails', async () => {
    vi.mocked(api.tripDetail).mockRejectedValue(new Error('network error'));
    renderScreen(['/t/a1']);
    expect(await screen.findByText('Trip nggak ketemu')).toBeInTheDocument();
  });

  it('shows the trip name in the subtitle and the "bikin trip baru" link', async () => {
    renderScreen(['/t/a1']);
    expect(await screen.findByText('Trip ke Jogja')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByText('Bikin trip baru →'));
    expect(await screen.findByText('New trip screen')).toBeInTheDocument();
  });
});
