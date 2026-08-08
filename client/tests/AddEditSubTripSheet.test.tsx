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
    payerParticipates: true,
    createdByMemberId: 1,
    splitMode: 'total' as const,
    taxPercent: 0,
    servicePercent: 0,
    items: [],
    debts: [{ id: 10, memberId: 2, name: 'Aji', amount: 30000, settled: false }],
  };

  it('pre-fills fields from initialData, reconstructing participants from payer + debts when payerParticipates is true', () => {
    render(
      <AddEditSubTripSheet
        publicId="a1" members={members} currentMemberId={1} mode="edit" initialData={initialData}
        onClose={() => {}} onSaved={() => {}}
      />,
    );
    expect(screen.getByDisplayValue('Makan Malam')).toBeInTheDocument();
    expect(screen.getByDisplayValue('60000')).toBeInTheDocument();
    // payer (Budi, id 1) participated, so debts (Aji) + payer = 2 checked
    expect(screen.getByText('Dibagi ke (2/3)')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Budi' })).toBeChecked();
  });

  it('does not check the payer when payerParticipates is false, reflecting a payer who only paid for others', () => {
    const initialDataPayerNotParticipating = { ...initialData, payerParticipates: false };
    render(
      <AddEditSubTripSheet
        publicId="a1" members={members} currentMemberId={1} mode="edit" initialData={initialDataPayerNotParticipating}
        onClose={() => {}} onSaved={() => {}}
      />,
    );
    // payer (Budi, id 1) did NOT participate, so only debts (Aji) = 1 checked
    expect(screen.getByText('Dibagi ke (1/3)')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Budi' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Aji' })).toBeChecked();
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

describe('AddEditSubTripSheet — split mode toggle', () => {
  it('Opsi lanjutan is collapsed by default and opens on click', async () => {
    render(<AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />);
    expect(screen.queryByText('Jumlah total')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByText('Opsi lanjutan'));
    expect(screen.getByText('Jumlah total')).toBeInTheDocument();
  });

  it('switching to Rincian per item hides Nominal and Dibagi ke, and disables submit', async () => {
    render(<AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('misal: Makan siang di Resto A'), 'Makan');
    await user.click(screen.getByText('Makan', { selector: 'button' }));
    await user.click(screen.getByText('Opsi lanjutan'));
    await user.click(screen.getByText('Rincian per item'));
    expect(screen.queryByText('Nominal')).not.toBeInTheDocument();
    expect(screen.queryByText(/Dibagi ke/)).not.toBeInTheDocument();
    expect(screen.getByText('Simpan pengeluaran')).toBeDisabled();
  });

  it('mode is a non-interactive indicator in edit mode', async () => {
    const initialData = {
      id: 5, name: 'Makan Malam', category: 'makan' as const, date: '2026-01-01',
      payerMemberId: 1, payerName: 'Budi', amount: 60000, payerParticipates: true, createdByMemberId: 1,
      splitMode: 'per_item' as const, taxPercent: 10, servicePercent: 0, items: [], debts: [],
    };
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="edit" initialData={initialData} onClose={() => {}} onSaved={() => {}} />,
    );
    await userEvent.setup().click(screen.getByText('Opsi lanjutan'));
    expect(screen.getByText(/tidak bisa diubah saat edit/)).toBeInTheDocument();
    expect(screen.queryByText('Jumlah total', { selector: 'button' })).not.toBeInTheDocument();
  });
});

describe('AddEditSubTripSheet — item editor', () => {
  async function openPerItemMode() {
    render(<AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Opsi lanjutan'));
    await user.click(screen.getByText('Rincian per item'));
    return user;
  }

  it('shows one empty item row by default, and + Tambah item adds another', async () => {
    const user = await openPerItemMode();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    await user.click(screen.getByText('+ Tambah item'));
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('reconstructs multiple items from initialData in edit mode', () => {
    const initialData = {
      id: 5, name: 'Makan', category: 'makan' as const, date: '2026-01-01',
      payerMemberId: 1, payerName: 'Budi', amount: 50000, payerParticipates: true, createdByMemberId: 1,
      splitMode: 'per_item' as const, taxPercent: 0, servicePercent: 0, debts: [],
      items: [
        { id: 1, name: 'Nasi', price: 20000, participants: [{ memberId: 1, name: 'Budi', billedToMemberId: null, billedToName: null }] },
        { id: 2, name: 'Es Teh', price: 5000, participants: [{ memberId: 2, name: 'Aji', billedToMemberId: null, billedToName: null }] },
      ],
    };
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="edit" initialData={initialData} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(screen.getByDisplayValue('Nasi')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Es Teh')).toBeInTheDocument();
  });

  it('does not produce duplicate keys when adding items in edit mode', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const initialData = {
      id: 5, name: 'Makan', category: 'makan' as const, date: '2026-01-01',
      payerMemberId: 1, payerName: 'Budi', amount: 50000, payerParticipates: true, createdByMemberId: 1,
      splitMode: 'per_item' as const, taxPercent: 0, servicePercent: 0, debts: [],
      items: [
        { id: 1, name: 'Nasi', price: 20000, participants: [{ memberId: 1, name: 'Budi', billedToMemberId: null, billedToName: null }] },
        { id: 2, name: 'Es Teh', price: 5000, participants: [{ memberId: 2, name: 'Aji', billedToMemberId: null, billedToName: null }] },
      ],
    };
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="edit" initialData={initialData} onClose={() => {}} onSaved={() => {}} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('+ Tambah item'));
    
    const keyWarnings = consoleSpy.mock.calls.filter((call) =>
      call[0]?.includes?.('Encountered two children with the same key'),
    );
    expect(keyWarnings).toHaveLength(0);
    consoleSpy.mockRestore();
  });
});

describe('AddEditSubTripSheet — per-item submit', () => {
  it('submits a per-item create with items, tax, and service percent', async () => {
    vi.mocked(api.createSubTrip).mockResolvedValue({ id: 1 });
    render(<AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('misal: Makan siang di Resto A'), 'Makan');
    await user.click(screen.getByText('Makan', { selector: 'button' }));
    await user.click(screen.getByText('Opsi lanjutan'));
    await user.click(screen.getByText('Rincian per item'));
    await user.type(screen.getByPlaceholderText('Nama item'), 'Nasi Goreng');
    await user.type(screen.getAllByPlaceholderText('0')[0], '50000');
    await user.click(screen.getByText('Simpan pengeluaran'));
    expect(api.createSubTrip).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({
        splitMode: 'per_item',
        items: [{ name: 'Nasi Goreng', price: 50000, participants: expect.any(Array) }],
      }),
    );
  });

  it('disables submit until every item has a name and a positive price', async () => {
    render(<AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('misal: Makan siang di Resto A'), 'Makan');
    await user.click(screen.getByText('Makan', { selector: 'button' }));
    await user.click(screen.getByText('Opsi lanjutan'));
    await user.click(screen.getByText('Rincian per item'));
    expect(screen.getByText('Simpan pengeluaran')).toBeDisabled();
  });
});



