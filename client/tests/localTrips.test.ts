import { beforeEach, describe, expect, it } from 'vitest';
import { addJoinedTripId, getIdentity, getJoinedTripIds, setIdentity } from '../src/lib/localTrips';

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
