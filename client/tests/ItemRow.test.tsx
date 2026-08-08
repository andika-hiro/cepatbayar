import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ItemRow from '../src/components/ItemRow';

const members = [
  { id: 1, name: 'Budi' },
  { id: 2, name: 'Aji' },
];

describe('ItemRow', () => {
  it('calls onNameChange/onPriceChange as the user types', async () => {
    const onNameChange = vi.fn();
    const onPriceChange = vi.fn();
    render(
      <ItemRow
        index={0}
        name=""
        priceText=""
        participants={[]}
        members={members}
        canRemove={false}
        onNameChange={onNameChange}
        onPriceChange={onPriceChange}
        onParticipantsChange={() => {}}
        onRemove={() => {}}
      />,
    );
    await userEvent.setup().type(screen.getByPlaceholderText('Nama item'), 'X');
    expect(onNameChange).toHaveBeenCalledWith('X');
  });

  it('toggling a member checkbox adds/removes them from participants', async () => {
    const onParticipantsChange = vi.fn();
    render(
      <ItemRow
        index={0}
        name="Item"
        priceText="1000"
        participants={[{ memberId: 1, billedToMemberId: null }]}
        members={members}
        canRemove={false}
        onNameChange={() => {}}
        onPriceChange={() => {}}
        onParticipantsChange={onParticipantsChange}
        onRemove={() => {}}
      />,
    );
    await userEvent.setup().click(screen.getByText('Aji'));
    expect(onParticipantsChange).toHaveBeenCalledWith([
      { memberId: 1, billedToMemberId: null },
      { memberId: 2, billedToMemberId: null },
    ]);
  });

  it('Hapus item calls onRemove, hidden when canRemove is false', () => {
    const onRemove = vi.fn();
    render(
      <ItemRow
        index={0}
        name="Item"
        priceText="1000"
        participants={[]}
        members={members}
        canRemove={false}
        onNameChange={() => {}}
        onPriceChange={() => {}}
        onParticipantsChange={() => {}}
        onRemove={onRemove}
      />,
    );
    expect(screen.queryByText('Hapus item')).not.toBeInTheDocument();
  });

  it('Tagihkan ke picker redirects a participant to another member', async () => {
    const onParticipantsChange = vi.fn();
    render(
      <ItemRow
        index={0}
        name="Item"
        priceText="1000"
        participants={[{ memberId: 1, billedToMemberId: null }]}
        members={members}
        canRemove={false}
        onNameChange={() => {}}
        onPriceChange={() => {}}
        onParticipantsChange={onParticipantsChange}
        onRemove={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('Tagihkan ke →'));
    await user.click(screen.getByRole('button', { name: 'Aji' }));
    expect(onParticipantsChange).toHaveBeenCalledWith([{ memberId: 1, billedToMemberId: 2 }]);
  });
});
