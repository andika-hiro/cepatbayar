import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddEditSubTripSheet from '../src/components/AddEditSubTripSheet';

vi.mock('../src/lib/api', () => ({
  api: {
    createSubTrip: vi.fn(),
    updateSubTrip: vi.fn(),
  },
}));

import { api } from '../src/lib/api';

const members = [
  { id: 1, name: 'Budi' },
  { id: 2, name: 'Aji' },
  { id: 3, name: 'Citra' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AddEditSubTripSheet — create mode', () => {
  it('defaults to all members checked', () => {
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />,
    );
    expect(screen.getByText('Dibagi ke (3/3)')).toBeInTheDocument();
  });

  it('disables submit until a category is picked and required fields are filled', async () => {
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />,
    );
    const submit = screen.getByText('Simpan pengeluaran');
    expect(submit).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('misal: Makan siang di Resto A'), 'Makan Siang');
    await user.type(screen.getByPlaceholderText('0'), '90000');
    expect(submit).toBeDisabled();

    await user.click(screen.getByText('Makan', { selector: 'button' }));
    expect(submit).not.toBeDisabled();
  });

  it('unchecking a member updates the counter and excludes them from the submitted participants', async () => {
    vi.mocked(api.createSubTrip).mockResolvedValue({ id: 1 });
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('misal: Makan siang di Resto A'), 'Makan');
    await user.type(screen.getByPlaceholderText('0'), '90000');
    await user.click(screen.getByText('Makan', { selector: 'button' }));
    await user.click(screen.getByText('Citra'));
    expect(screen.getByText('Dibagi ke (2/3)')).toBeInTheDocument();

    await user.click(screen.getByText('Simpan pengeluaran'));
    expect(api.createSubTrip).toHaveBeenCalledWith('a1', expect.objectContaining({ participantMemberIds: [1, 2] }));
  });

  it('"Kosongkan" then "Pilih semua" round-trips the participant selection', async () => {
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('Kosongkan'));
    expect(screen.getByText('Dibagi ke (0/3)')).toBeInTheDocument();
    await user.click(screen.getByText('Pilih semua'));
    expect(screen.getByText('Dibagi ke (3/3)')).toBeInTheDocument();
  });

  it('submits with createdByMemberId and default payer set to the current member', async () => {
    vi.mocked(api.createSubTrip).mockResolvedValue({ id: 1 });
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={2} mode="create" onClose={() => {}} onSaved={() => {}} />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('misal: Makan siang di Resto A'), 'Makan');
    await user.type(screen.getByPlaceholderText('0'), '30000');
    await user.click(screen.getByText('Lainnya'));
    await user.click(screen.getByText('Simpan pengeluaran'));
    expect(api.createSubTrip).toHaveBeenCalledWith('a1', expect.objectContaining({ createdByMemberId: 2, payerMemberId: 2 }));
  });

  it('calls onClose when Batal is clicked', async () => {
    const onClose = vi.fn();
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={onClose} onSaved={() => {}} />,
    );
    await userEvent.setup().click(screen.getByText('Batal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onSaved after a successful submit', async () => {
    vi.mocked(api.createSubTrip).mockResolvedValue({ id: 1 });
    const onSaved = vi.fn();
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={onSaved} />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('misal: Makan siang di Resto A'), 'Makan');
    await user.type(screen.getByPlaceholderText('0'), '10000');
    await user.click(screen.getByText('Lainnya'));
    await user.click(screen.getByText('Simpan pengeluaran'));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

describe('AddEditSubTripSheet — edit mode', () => {
  const initialData = {
    id: 5,
    name: 'Makan Malam',
    category: 'makan' as const,
    date: '2026-01-01',
    payerMemberId: 1,
    payerName: 'Budi',
    amount: 60000,
    createdByMemberId: 1,
    debts: [{ id: 10, memberId: 2, name: 'Aji', amount: 30000, settled: false }],
  };

  it('pre-fills fields from initialData, reconstructing participants from payer + debts', () => {
    render(
      <AddEditSubTripSheet
        publicId="a1" members={members} currentMemberId={1} mode="edit" initialData={initialData}
        onClose={() => {}} onSaved={() => {}}
      />,
    );
    expect(screen.getByDisplayValue('Makan Malam')).toBeInTheDocument();
    expect(screen.getByDisplayValue('60000')).toBeInTheDocument();
    expect(screen.getByText('Dibagi ke (2/3)')).toBeInTheDocument();
  });

  it('submits an update with the original createdByMemberId and unchanged date, using the editor as X-Member-Id', async () => {
    vi.mocked(api.updateSubTrip).mockResolvedValue({ id: 5 });
    render(
      <AddEditSubTripSheet
        publicId="a1" members={members} currentMemberId={2} mode="edit" initialData={initialData}
        onClose={() => {}} onSaved={() => {}}
      />,
    );
    await userEvent.setup().click(screen.getByText('Simpan pengeluaran'));
    expect(api.updateSubTrip).toHaveBeenCalledWith(
      'a1',
      5,
      expect.objectContaining({ createdByMemberId: 1, date: '2026-01-01' }),
      2,
    );
  });
});
