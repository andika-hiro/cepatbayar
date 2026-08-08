import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BottomNavAppLevel from '../src/components/BottomNavAppLevel';
import ProfilePlaceholderScreen from '../src/screens/ProfilePlaceholderScreen';
import { api } from '../src/lib/api';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../src/lib/api');

describe('BottomNavAppLevel & Profile Screen', () => {
  it('renders Beranda link in BottomNavAppLevel pointing to /', () => {
    render(
      <MemoryRouter initialEntries={['/profil']}>
        <BottomNavAppLevel />
      </MemoryRouter>
    );

    const berandaLink = screen.getByText('Beranda').closest('a');
    expect(berandaLink).toBeInTheDocument();
    expect(berandaLink).toHaveAttribute('href', '/');
  });

  it('renders auth form when unauthenticated on Profile screen', async () => {
    vi.mocked(api.me).mockRejectedValue(new Error('Unauthenticated'));

    render(
      <MemoryRouter initialEntries={['/profil']}>
        <Routes>
          <Route path="/profil" element={<ProfilePlaceholderScreen />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Masuk ke Akun Kamu')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('email@kamu.com')).toBeInTheDocument();
    });
  });

  it('renders user profile and logout button when authenticated', async () => {
    vi.mocked(api.me).mockResolvedValue({ id: 1, email: 'user@example.com' });

    render(
      <MemoryRouter initialEntries={['/profil']}>
        <Routes>
          <Route path="/profil" element={<ProfilePlaceholderScreen />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('user@example.com')).toBeInTheDocument();
      expect(screen.getByText('Keluar (Logout)')).toBeInTheDocument();
    });

    vi.mocked(api.logout).mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByText('Keluar (Logout)'));

    await waitFor(() => {
      expect(api.logout).toHaveBeenCalled();
      expect(screen.getByText('Masuk ke Akun Kamu')).toBeInTheDocument();
    });
  });
});
