import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

describe('navigation shell', () => {
  it('renders the Profil placeholder with the app-level bottom nav', async () => {
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
