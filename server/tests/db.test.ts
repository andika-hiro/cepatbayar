import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { users, trips, tripMembers, subTrips, debts } from '../src/db/schema';

describe('database connection', () => {
  it('inserts and reads back a user', async () => {
    await db.insert(users).values({ email: 'test@example.com' });
    const [user] = await db.select().from(users).where(eq(users.email, 'test@example.com'));
    expect(user).toBeDefined();
    expect(user.email).toBe('test@example.com');
  });
});

describe('sub_trips and debts tables', () => {
  it('inserts a trip, member, sub trip, and debt, and reads them back linked correctly', async () => {
    await db.insert(users).values({ email: 'schema-test@example.com' });
    const [user] = await db.select().from(users).where(eq(users.email, 'schema-test@example.com'));

    await db.insert(trips).values({
      publicId: 'schema-test-trip', name: 'Test Trip', destination: 'Test',
      startDate: '2026-01-01', endDate: '2026-01-02', creatorUserId: user.id,
    });
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, 'schema-test-trip'));

    await db.insert(tripMembers).values({ tripId: trip.id, name: 'Budi' });
    const [member] = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));

    await db.insert(subTrips).values({
      tripId: trip.id, name: 'Makan Siang', category: 'makan', date: '2026-01-01',
      payerMemberId: member.id, amount: 50000, createdByMemberId: member.id,
    });
    const [subTrip] = await db.select().from(subTrips).where(eq(subTrips.tripId, trip.id));
    expect(subTrip.category).toBe('makan');
    expect(subTrip.amount).toBe(50000);

    await db.insert(debts).values({ subTripId: subTrip.id, memberId: member.id, amount: 25000 });
    const [debt] = await db.select().from(debts).where(eq(debts.subTripId, subTrip.id));
    expect(debt.amount).toBe(25000);
    expect(debt.settled).toBe(false);
  });
});
