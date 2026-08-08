import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client';
import { trips, tripMembers, users } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { getTripByPublicId, memberIdsBelongToTrip } from '../../src/lib/tripAccess';

async function createTestTrip(publicId: string, memberNames: string[]) {
  await db.insert(users).values({ email: `${publicId}@example.com` });
  const [user] = await db.select().from(users).where(eq(users.email, `${publicId}@example.com`));
  await db.insert(trips).values({
    publicId, name: 'Test', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02',
    creatorUserId: user.id,
  });
  const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
  await db.insert(tripMembers).values(memberNames.map((name) => ({ tripId: trip.id, name })));
  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
  return { trip, members };
}

describe('getTripByPublicId', () => {
  it('returns the trip row for a known publicId', async () => {
    const { trip } = await createTestTrip('access-test-1', ['Budi']);
    const found = await getTripByPublicId('access-test-1');
    expect(found?.id).toBe(trip.id);
  });

  it('returns null for an unknown publicId', async () => {
    const found = await getTripByPublicId('does-not-exist');
    expect(found).toBeNull();
  });
});

describe('memberIdsBelongToTrip', () => {
  it('returns true when all ids belong to the given trip', async () => {
    const { trip, members } = await createTestTrip('access-test-2', ['Budi', 'Aji']);
    const result = await memberIdsBelongToTrip(trip.id, members.map((m) => m.id));
    expect(result).toBe(true);
  });

  it('returns true for an empty id list', async () => {
    const { trip } = await createTestTrip('access-test-3', ['Budi']);
    const result = await memberIdsBelongToTrip(trip.id, []);
    expect(result).toBe(true);
  });

  it('returns false when an id belongs to a different trip', async () => {
    const { trip: tripA } = await createTestTrip('access-test-4', ['Budi']);
    const { members: membersB } = await createTestTrip('access-test-5', ['Citra']);
    const result = await memberIdsBelongToTrip(tripA.id, membersB.map((m) => m.id));
    expect(result).toBe(false);
  });

  it('returns false when an id does not exist at all', async () => {
    const { trip } = await createTestTrip('access-test-6', ['Budi']);
    const result = await memberIdsBelongToTrip(trip.id, [999999]);
    expect(result).toBe(false);
  });
});
