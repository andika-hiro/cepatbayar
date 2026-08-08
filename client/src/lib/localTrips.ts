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

// Null-safe alternative to `Number(getIdentity(tripPublicId))`: when no
// identity has ever been picked for this trip on this device, getIdentity
// returns null, and Number(null) is 0 — NOT null or NaN — which silently
// defeats `=== null` guards downstream. This always returns a real positive
// member id or null, never 0.
export function getCurrentMemberId(tripPublicId: string): number | null {
  const raw = getIdentity(tripPublicId);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function setIdentity(tripPublicId: string, memberId: string): void {
  localStorage.setItem(identityKey(tripPublicId), memberId);
  addJoinedTripId(tripPublicId);
}
