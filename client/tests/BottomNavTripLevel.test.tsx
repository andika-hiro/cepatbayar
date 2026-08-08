import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import BottomNavTripLevel from '../src/components/BottomNavTripLevel';

describe('BottomNavTripLevel', () => {
  it('calls onAddClick when the FAB is clicked, and the FAB is not disabled', async () => {
    const onAddClick = vi.fn();
    render(
      <MemoryRouter>
        <BottomNavTripLevel publicId="a1" active="ringkasan" onAddClick={onAddClick} />
      </MemoryRouter>,
    );
    const fab = screen.getByLabelText('Tambah sub trip');
    expect(fab).not.toBeDisabled();
    const user = userEvent.setup();
    await user.click(fab);
    expect(onAddClick).toHaveBeenCalledTimes(1);
  });

  it('highlights the active tab', () => {
    render(
      <MemoryRouter>
        <BottomNavTripLevel publicId="a1" active="riwayat" onAddClick={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Riwayat')).toHaveClass('text-accent');
    expect(screen.getByText('Ringkasan')).toHaveClass('text-sub');
  });
});
