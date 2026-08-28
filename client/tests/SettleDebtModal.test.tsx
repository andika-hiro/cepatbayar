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
    expect(screen.getAllByText(/75[,.]000/).length).toBeGreaterThanOrEqual(1);
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

    const confirmBtn = screen.getByText(/✓ Tandai Lunas/);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onConfirmMock).toHaveBeenCalledWith([dummyDebt], null);
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  it('renders and settles multiple debts in batch', async () => {
    const debts = [
      { subTripId: 1, debtId: 10, subTripName: 'Makan Malam', debtorName: 'Andika', creditorName: 'Ando', amount: 10000 },
      { subTripId: 2, debtId: 11, subTripName: 'Grab Car', debtorName: 'Andika', creditorName: 'Ando', amount: 20000 },
    ];
    const onConfirmMock = vi.fn().mockResolvedValue(undefined);
    render(
      <SettleDebtModal
        isOpen={true}
        debt={debts}
        onClose={vi.fn()}
        onConfirm={onConfirmMock}
      />
    );

    expect(screen.getByText('Pelunasan Gabungan')).toBeInTheDocument();
    expect(screen.getByText('Makan Malam')).toBeInTheDocument();
    expect(screen.getByText('Grab Car')).toBeInTheDocument();
    expect(screen.getAllByText(/30[,.]000/).length).toBeGreaterThanOrEqual(1);

    const confirmBtn = screen.getByText(/✓ Tandai Lunas/);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onConfirmMock).toHaveBeenCalledWith(debts, null);
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
