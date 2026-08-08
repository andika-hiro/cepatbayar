import { beforeEach, describe, expect, it } from 'vitest';
import { addJoinedTripId, getCurrentMemberId, getIdentity, getJoinedTripIds, setIdentity } from '../src/lib/localTrips';

beforeEach(() => {
  localStorage.clear();
});

describe('getJoinedTripIds / addJoinedTripId', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(getJoinedTripIds()).toEqual([]);
  });

  it('adds and deduplicates trip ids', () => {
    addJoinedTripId('trip-a');
    addJoinedTripId('trip-b');
    addJoinedTripId('trip-a');
    expect(getJoinedTripIds()).toEqual(['trip-a', 'trip-b']);
  });
});

describe('getIdentity / setIdentity', () => {
  it('returns null when no identity is set for a trip', () => {
    expect(getIdentity('trip-a')).toBeNull();
  });

  it('stores identity per trip and also marks the trip as joined', () => {
    setIdentity('trip-a', '42');
    expect(getIdentity('trip-a')).toBe('42');
    expect(getJoinedTripIds()).toEqual(['trip-a']);
  });
});

describe('getCurrentMemberId', () => {
  it('returns null when no identity is set for a trip (not 0 — Number(null) is 0, which this must not leak)', () => {
    expect(getCurrentMemberId('trip-a')).toBeNull();
  });

  it('returns the numeric member id when a valid identity is set', () => {
    setIdentity('trip-a', '42');
    expect(getCurrentMemberId('trip-a')).toBe(42);
  });

  // A non-numeric/garbage stored value (e.g. "abc") isn't reachable through
  // any app code path — setIdentity is only ever called from
  // IdentityPickerScreen with String(memberId) from a real trip member id —
  // but getCurrentMemberId still guards against it defensively (returning
  // null instead of NaN or 0), which we exercise here directly against
  // localStorage since the app itself can't produce this state.
  it('returns null (not NaN or 0) for a corrupted/non-numeric stored value', () => {
    localStorage.setItem('cb.identity.trip-a', 'not-a-number');
    expect(getCurrentMemberId('trip-a')).toBeNull();
  });

  it('returns null (not 0) for a stored value of "0"', () => {
    localStorage.setItem('cb.identity.trip-a', '0');
    expect(getCurrentMemberId('trip-a')).toBeNull();
  });
});
