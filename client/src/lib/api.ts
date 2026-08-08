export interface TripSummary {
  publicId: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  memberCount: number;
  unsettledCount: number;
}

export interface TripMember {
  id: number;
  name: string;
}

export interface TripDetail {
  publicId: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  members: TripMember[];
}

export type SubTripCategory = 'makan' | 'transport' | 'nginap' | 'tiket_wisata' | 'lainnya';

export interface MemberSummary {
  memberId: number;
  name: string;
  rollup: number;
  status: 'dilunasin' | 'ngutang' | 'lunas';
}

export interface TripSummaryDetail {
  members: MemberSummary[];
  tripTotal: number;
}

// Distinct from MemberSummary.status above: the /saldo rollup endpoint
// returns 'pos' | 'neg' | 'zero', not 'dilunasin' | 'ngutang' | 'lunas'.
export type RollupStatus = 'pos' | 'neg' | 'zero';

export interface RollupMember {
  memberId: number;
  name: string;
  rollup: number;
  status: RollupStatus;
}

export interface SubTripListItem {
  id: number;
  name: string;
  category: SubTripCategory;
  date: string;
  payerMemberId: number;
  payerName: string;
  amount: number;
  unsettledCount: number;
}

export interface DebtItem {
  id: number;
  memberId: number;
  name: string;
  amount: number;
  settled: boolean;
}

export type SplitMode = 'total' | 'per_item';

export interface ItemParticipantInput {
  memberId: number;
  billedToMemberId?: number;
}

export interface ItemInput {
  name: string;
  price: number;
  participants: ItemParticipantInput[];
}

export interface ItemParticipantDetail {
  memberId: number;
  name: string;
  billedToMemberId: number | null;
  billedToName: string | null;
}

export interface SubTripItemDetail {
  id: number;
  name: string;
  price: number;
  participants: ItemParticipantDetail[];
}

export interface SubTripDetail {
  id: number;
  name: string;
  category: SubTripCategory;
  date: string;
  payerMemberId: number;
  payerName: string;
  amount: number;
  payerParticipates: boolean;
  createdByMemberId: number;
  splitMode: SplitMode;
  taxPercent: number;
  servicePercent: number;
  items: SubTripItemDetail[];
  debts: DebtItem[];
}

export interface TotalModeInput {
  name: string;
  category: SubTripCategory;
  date: string;
  payerMemberId: number;
  createdByMemberId: number;
  splitMode: 'total';
  amount: number;
  participantMemberIds: number[];
}

export interface PerItemModeInput {
  name: string;
  category: SubTripCategory;
  date: string;
  payerMemberId: number;
  createdByMemberId: number;
  splitMode: 'per_item';
  taxPercent: number;
  servicePercent: number;
  items: ItemInput[];
}

export type SubTripInput = TotalModeInput | PerItemModeInput;


export interface CurrentUser {
  id: number;
  email: string;
}

export interface MemberAccount {
  id: number;
  label: string;
  accountNumber: string;
  isDefault: boolean;
}

export interface UnsettledDebtItem {
  id: number;
  subTripId: number;
  subTripName: string;
  date: string;
  debtorId: number;
  debtorName: string;
  creditorId: number;
  creditorName: string;
  amount: number;
  depositNote?: string;
  accounts: MemberAccount[];
}

export interface DepositSummaryItem {
  fromMemberId: number;
  fromName: string;
  toMemberId: number;
  toName: string;
  totalAmount: number;
  remainingBalance: number;
  low: boolean;
}

export interface SaldoData {
  rollupMembers: RollupMember[];
  unsettledDebts: UnsettledDebtItem[];
  deposits: DepositSummaryItem[];
}

export interface SettledDebtItem {
  id: number;
  subTripName: string;
  debtorName: string;
  creditorName: string;
  amount: number;
  settledAt: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number) {
    super(`API request failed with status ${status}`);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    credentials: 'same-origin',
  });
  if (!res.ok) {
    throw new ApiError(res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface OcrScanResult {
  items: { name: string; price: number }[];
  taxPercent: number;
  servicePercent: number;
  total: number;
}

export const api = {
  me: () => request<CurrentUser>('/auth/me'),
  requestLink: (email: string, redirect?: string) =>
    request<{ ok: true }>('/auth/request-link', { method: 'POST', body: JSON.stringify({ email, redirect }) }),
  myTrips: () => request<TripSummary[]>('/trips/mine'),
  tripSummaries: (publicIds: string[]) =>
    request<TripSummary[]>('/trips/summary', { method: 'POST', body: JSON.stringify({ publicIds }) }),
  tripDetail: (publicId: string) => request<TripDetail>(`/trips/${publicId}`),
  tripSummary: (publicId: string) => request<TripSummaryDetail>(`/trips/${publicId}/summary`),
  listSubTrips: (publicId: string) => request<SubTripListItem[]>(`/trips/${publicId}/subtrips`),
  createSubTrip: (publicId: string, input: SubTripInput) =>
    request<{ id: number }>(`/trips/${publicId}/subtrips`, { method: 'POST', body: JSON.stringify(input) }),
  getSubTrip: (publicId: string, subTripId: number) => request<SubTripDetail>(`/trips/${publicId}/subtrips/${subTripId}`),
  updateSubTrip: (publicId: string, subTripId: number, input: SubTripInput, memberId: number) =>
    request<{ id: number }>(`/trips/${publicId}/subtrips/${subTripId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
      headers: { 'X-Member-Id': String(memberId) },
    }),
  deleteSubTrip: (publicId: string, subTripId: number, memberId: number) =>
    request<{ ok: true }>(`/trips/${publicId}/subtrips/${subTripId}`, {
      method: 'DELETE',
      headers: { 'X-Member-Id': String(memberId) },
    }),
  toggleDebtSettled: (publicId: string, subTripId: number, debtId: number, settled: boolean) =>
    request<{ ok: true }>(`/trips/${publicId}/subtrips/${subTripId}/debts/${debtId}`, {
      method: 'PATCH',
      body: JSON.stringify({ settled }),
    }),
  createTrip: (input: { name: string; destination: string; startDate: string; endDate: string; members: string[] }) =>
    request<{ publicId: string }>('/trips', { method: 'POST', body: JSON.stringify(input) }),
  getSaldoData: (publicId: string) => request<SaldoData>(`/trips/${publicId}/saldo`),
  getSettledDebts: (publicId: string) => request<SettledDebtItem[]>(`/trips/${publicId}/settled-debts`),
  createDeposit: (publicId: string, input: { fromMemberId: number; toMemberId: number; amount: number; proofNote?: string }) =>
    request<{ success: true; id: number }>(`/trips/${publicId}/deposits`, { method: 'POST', body: JSON.stringify(input) }),
  addTripMember: (publicId: string, name: string) =>
    request<{ id: number; name: string }>(`/trips/${publicId}/members`, { method: 'POST', body: JSON.stringify({ name }) }),
  getMemberAccounts: (publicId: string, memberId: number) =>
    request<MemberAccount[]>(`/trips/${publicId}/members/${memberId}/accounts`),
  addMemberAccount: (publicId: string, memberId: number, input: { label: string; accountNumber: string; isDefault?: boolean }) =>
    request<MemberAccount>(`/trips/${publicId}/members/${memberId}/accounts`, { method: 'POST', body: JSON.stringify(input) }),
  setDefaultAccount: (publicId: string, memberId: number, accountId: number) =>
    request<{ success: true }>(`/trips/${publicId}/members/${memberId}/accounts/${accountId}`, { method: 'PATCH', body: JSON.stringify({ isDefault: true }) }),
  deleteMemberAccount: (publicId: string, memberId: number, accountId: number) =>
    request<{ success: true }>(`/trips/${publicId}/members/${memberId}/accounts/${accountId}`, { method: 'DELETE' }),
  scanReceipt: (imageBase64: string) =>
    request<OcrScanResult>('/ocr/scan', { method: 'POST', body: JSON.stringify({ imageBase64 }) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
};



