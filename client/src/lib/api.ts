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
  debts: DebtItem[];
}

export interface SubTripInput {
  name: string;
  category: SubTripCategory;
  date: string;
  payerMemberId: number;
  amount: number;
  participantMemberIds: number[];
  createdByMemberId: number;
}

export interface CurrentUser {
  id: number;
  email: string;
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
};
