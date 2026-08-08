import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NewTripScreen from '../src/screens/NewTripScreen';

vi.mock('../src/lib/api', () => ({
  api: {
    me: vi.fn(),
    requestLink: vi.fn(),
    createTrip: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super('err');
      this.status = status;
    }
  },
}));

import { api, ApiError } from '../src/lib/api';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/trip/new']}>
      <Routes>
        <Route path="/trip/new" element={<NewTripScreen />} />
        <Route path="/t/:publicId" element={<div>Identity screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NewTripScreen auth gate', () => {
  it('shows the email step when unauthenticated', async () => {
    vi.mocked(api.me).mockRejectedValue(new ApiError(401));
    renderScreen();
    expect(await screen.findByPlaceholderText('email@kamu.com')).toBeInTheDocument();
  });

  it('sends the magic link and shows a confirmation message', async () => {
    vi.mocked(api.me).mockRejectedValue(new ApiError(401));
    vi.mocked(api.requestLink).mockResolvedValue({ ok: true });
    renderScreen();
    const user = userEvent.setup();
    await user.type(await screen.findByPlaceholderText('email@kamu.com'), 'budi@example.com');
    await user.click(screen.getByText('Kirim link masuk'));
    expect(await screen.findByText('Cek email kamu, klik link buat lanjut.')).toBeInTheDocument();
    expect(api.requestLink).toHaveBeenCalledWith('budi@example.com', '/trip/new');
  });

  it('falls back to the email step when api.me() fails with a non-401 error', async () => {
    vi.mocked(api.me).mockRejectedValue(new ApiError(500));
    renderScreen();
    expect(await screen.findByPlaceholderText('email@kamu.com')).toBeInTheDocument();
  });

  it('falls back to the email step when api.me() throws a non-ApiError', async () => {
    vi.mocked(api.me).mockRejectedValue(new Error('network error'));
    renderScreen();
    expect(await screen.findByPlaceholderText('email@kamu.com')).toBeInTheDocument();
  });
});

describe('NewTripScreen form', () => {
  beforeEach(() => {
    vi.mocked(api.me).mockResolvedValue({ id: 1, email: 'budi@example.com' });
  });

  it('adds and removes members as chips', async () => {
    renderScreen();
    const user = userEvent.setup();
    const input = await screen.findByPlaceholderText('Tambah nama, enter buat konfirmasi');
    await user.type(input, 'Budi{Enter}');
    expect(screen.getByText('Budi')).toBeInTheDocument();
    await user.click(screen.getByText('×'));
    expect(screen.queryByText('Budi')).not.toBeInTheDocument();
  });

  it('disables submit until required fields are filled', async () => {
    renderScreen();
    const submit = await screen.findByText('Buat trip');
    expect(submit).toBeDisabled();
  });

  it('submits the trip and navigates to the identity screen', async () => {
    vi.mocked(api.createTrip).mockResolvedValue({ publicId: 'a1' });
    renderScreen();
    const user = userEvent.setup();
    await user.type(await screen.findByPlaceholderText('misal: Trip ke Jogja'), 'Trip ke Jogja');
    await user.type(screen.getByPlaceholderText('misal: Yogyakarta'), 'Yogyakarta');
    fireEvent.change(screen.getByLabelText('Mulai'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Selesai'), { target: { value: '2026-09-04' } });
    await user.type(screen.getByPlaceholderText('Tambah nama, enter buat konfirmasi'), 'Budi{Enter}');
    await user.click(screen.getByText('Buat trip'));
    expect(await screen.findByText('Identity screen')).toBeInTheDocument();
    expect(api.createTrip).toHaveBeenCalledWith({
      name: 'Trip ke Jogja',
      destination: 'Yogyakarta',
      startDate: '2026-09-01',
      endDate: '2026-09-04',
      members: ['Budi'],
    });
  });
});
