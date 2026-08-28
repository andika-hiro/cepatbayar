import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettleDebtModal from '../src/components/SettleDebtModal';

describe('SettleDebtModal', () => {
  const dummyDebt = {
    subTripId: 1,
    debtId: 10,
    subTripName: 'Makan Malam Seafood',
    debtorName: 'Andika',
    creditorName: 'Budi',
    amount: 75000,
  };

  it('renders correctly when open', () => {
    render(
      <SettleDebtModal
        isOpen={true}
        debt={dummyDebt}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText('Konfirmasi Pelunasan')).toBeInTheDocument();
    expect(screen.getByText('Makan Malam Seafood')).toBeInTheDocument();
    expect(screen.getByText(/Andika/)).toBeInTheDocument();
    expect(screen.getByText(/75[,.]000/)).toBeInTheDocument();
    expect(screen.getByText('Bukti Transfer (Opsional)')).toBeInTheDocument();
  });

  it('calls onConfirm with null when confirmed without proof', async () => {
    const onConfirmMock = vi.fn().mockResolvedValue(undefined);
    const onCloseMock = vi.fn();

    render(
      <SettleDebtModal
        isOpen={true}
        debt={dummyDebt}
        onClose={onCloseMock}
        onConfirm={onConfirmMock}
      />
    );

    const confirmBtn = screen.getByText('✓ Tandai Lunas');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onConfirmMock).toHaveBeenCalledWith(null);
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  it('calls onClose when Batal is clicked', () => {
    const onCloseMock = vi.fn();

    render(
      <SettleDebtModal
        isOpen={true}
        debt={dummyDebt}
        onClose={onCloseMock}
        onConfirm={vi.fn()}
      />
    );

    const cancelBtn = screen.getByText('Batal');
    fireEvent.click(cancelBtn);

    expect(onCloseMock).toHaveBeenCalled();
  });
});
