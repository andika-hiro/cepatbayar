import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProofPreviewModal from '../src/components/ProofPreviewModal';

describe('ProofPreviewModal', () => {
  it('renders single debt breakdown correctly', () => {
    render(
      <ProofPreviewModal
        isOpen={true}
        onClose={vi.fn()}
        proofImage="https://res.cloudinary.com/demo/image/upload/sample.jpg"
        relatedDebts={[
          {
            id: 1,
            subTripName: 'Makan Malam Seafood',
            debtorName: 'Andika',
            creditorName: 'Ando',
            amount: 50000,
          },
        ]}
      />
    );

    expect(screen.getByText('Bukti Transfer Pelunasan')).toBeInTheDocument();
    expect(screen.getByText('Makan Malam Seafood')).toBeInTheDocument();
    expect(screen.getByText(/Andika → Ando/)).toBeInTheDocument();
    expect(screen.getByText(/50[,.]000/)).toBeInTheDocument();
  });

  it('renders multi-debt combined settlement breakdown with total', () => {
    render(
      <ProofPreviewModal
        isOpen={true}
        onClose={vi.fn()}
        proofImage="https://res.cloudinary.com/demo/image/upload/sample.jpg"
        relatedDebts={[
          {
            id: 1,
            subTripName: 'Makan Malam',
            debtorName: 'Andika',
            creditorName: 'Ando',
            amount: 10000,
          },
          {
            id: 2,
            subTripName: 'Grab Car',
            debtorName: 'Andika',
            creditorName: 'Ando',
            amount: 15000,
          },
        ]}
      />
    );

    expect(screen.getByText(/Bukti Pelunasan Gabungan/)).toBeInTheDocument();
    expect(screen.getByText(/Melunasi 2 Tagihan Sekaligus/)).toBeInTheDocument();
    expect(screen.getByText('Makan Malam')).toBeInTheDocument();
    expect(screen.getByText('Grab Car')).toBeInTheDocument();
    expect(screen.getByText(/Total.*25[,.]000/)).toBeInTheDocument();
  });

  it('calls onClose when close button or backdrop is clicked', () => {
    const onCloseMock = vi.fn();
    render(
      <ProofPreviewModal
        isOpen={true}
        onClose={onCloseMock}
        proofImage="https://res.cloudinary.com/demo/image/upload/sample.jpg"
        relatedDebts={[]}
      />
    );

    fireEvent.click(screen.getByText('✕'));
    expect(onCloseMock).toHaveBeenCalled();
  });
});
