import { render, screen, fireEvent } from '@testing-library/react';
import AddDepositSheet from '../src/components/AddDepositSheet';
import { vi, describe, it, expect } from 'vitest';

describe('AddDepositSheet', () => {
  it('submits deposit when form is filled', () => {
    const onSave = vi.fn();
    render(
      <AddDepositSheet
        isOpen={true}
        members={[{ id: 1, name: 'Adit' }, { id: 2, name: 'Budi' }]}
        currentMemberId={1}
        onClose={() => {}}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText(/Jumlah \(Rp\)/i), { target: { value: '50000' } });
    fireEvent.click(screen.getByText('Simpan deposit'));

    expect(onSave).toHaveBeenCalledWith({
      fromMemberId: 1,
      toMemberId: 2,
      amount: 50000,
      proofNote: undefined,
    });
  });
});
