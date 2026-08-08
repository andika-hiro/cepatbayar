import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

describe('navigation shell', () => {
  it('renders the Ringkasan placeholder with its bottom nav', async () => {
    render(
      <MemoryRouter initialEntries={['/t/a1/ringkasan']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Ringkasan segera hadir')).toBeInTheDocument();
    expect(screen.getByText('Ringkasan')).toBeInTheDocument();
    expect(screen.getByText('Riwayat')).toBeInTheDocument();
    expect(screen.getByText('Saldo')).toBeInTheDocument();
  });

  it('navigates from the trip-level bottom nav to the app-level Profil placeholder', async () => {
    render(
      <MemoryRouter initialEntries={['/t/a1/ringkasan']}>
        <App />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByText('Profil'));
    expect(await screen.findByText('Pengaturan segera hadir')).toBeInTheDocument();
  });

  it('renders the app-level bottom nav (Beranda/Profil) on the Profil placeholder itself', async () => {
    render(
      <MemoryRouter initialEntries={['/profil']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Pengaturan segera hadir')).toBeInTheDocument();
    expect(screen.getByText('Beranda')).toBeInTheDocument();
    expect(screen.getByText('Profil')).toBeInTheDocument();
  });
});
