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
  createTrip: (input: { name: string; destination: string; startDate: string; endDate: string; members: string[] }) =>
    request<{ publicId: string }>('/trips', { method: 'POST', body: JSON.stringify(input) }),
};
