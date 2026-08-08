const JOINED_TRIPS_KEY = 'cb.joinedTripIds';
const identityKey = (tripPublicId: string) => `cb.identity.${tripPublicId}`;

export function getJoinedTripIds(): string[] {
  try {
    const raw = localStorage.getItem(JOINED_TRIPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function addJoinedTripId(tripPublicId: string): void {
  const ids = getJoinedTripIds();
  if (!ids.includes(tripPublicId)) {
    localStorage.setItem(JOINED_TRIPS_KEY, JSON.stringify([...ids, tripPublicId]));
  }
}

export function getIdentity(tripPublicId: string): string | null {
  return localStorage.getItem(identityKey(tripPublicId));
}

export function setIdentity(tripPublicId: string, memberId: string): void {
  localStorage.setItem(identityKey(tripPublicId), memberId);
  addJoinedTripId(tripPublicId);
}
