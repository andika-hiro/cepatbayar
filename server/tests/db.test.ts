import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { users, trips, tripMembers, subTrips, debts, subTripItems, subTripItemParticipants, memberAccounts, deposits } from '../src/db/schema';

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

describe('sub_trips split_mode/tax/service columns and sub_trip_items tables', () => {
  it('round-trips splitMode/taxPercent/servicePercent as the correct types, and links items to participants', async () => {
    await db.insert(users).values({ email: 'schema-test-2b@example.com' });
    const [user] = await db.select().from(users).where(eq(users.email, 'schema-test-2b@example.com'));
    await db.insert(trips).values({
      publicId: 'schema-test-trip-2b', name: 'Test Trip 2b', destination: 'Test',
      startDate: '2026-01-01', endDate: '2026-01-02', creatorUserId: user.id,
    });
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, 'schema-test-trip-2b'));
    await db.insert(tripMembers).values({ tripId: trip.id, name: 'Budi' });
    const [member] = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));

    await db.insert(subTrips).values({
      tripId: trip.id, name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: member.id, amount: 50000, createdByMemberId: member.id,
      splitMode: 'per_item', taxPercent: 11, servicePercent: 5.5,
    });
    const [subTrip] = await db.select().from(subTrips).where(eq(subTrips.tripId, trip.id));
    expect(subTrip.splitMode).toBe('per_item');
    expect(subTrip.taxPercent).toBe(11);
    expect(subTrip.servicePercent).toBe(5.5);
    expect(typeof subTrip.taxPercent).toBe('number');

    await db.insert(subTripItems).values({ subTripId: subTrip.id, name: 'Nasi Goreng', price: 25000 });
    const [item] = await db.select().from(subTripItems).where(eq(subTripItems.subTripId, subTrip.id));
    expect(item.price).toBe(25000);

    await db.insert(subTripItemParticipants).values({ itemId: item.id, memberId: member.id, billedToMemberId: null });
    const [participant] = await db.select().from(subTripItemParticipants).where(eq(subTripItemParticipants.itemId, item.id));
    expect(participant.memberId).toBe(member.id);
    expect(participant.billedToMemberId).toBeNull();
  });
});

describe('member_accounts and deposits tables', () => {
  it('inserts and queries member_accounts and deposits correctly', async () => {
    await db.insert(users).values({ email: 'schema-test-3@example.com' });
    const [user] = await db.select().from(users).where(eq(users.email, 'schema-test-3@example.com'));
    await db.insert(trips).values({
      publicId: 'schema-test-trip-3', name: 'Test Trip 3', destination: 'Test',
      startDate: '2026-01-01', endDate: '2026-01-02', creatorUserId: user.id,
    });
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, 'schema-test-trip-3'));
    await db.insert(tripMembers).values({ tripId: trip.id, name: 'Budi' });
    await db.insert(tripMembers).values({ tripId: trip.id, name: 'Adit' });
    const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));

    const budi = members.find(m => m.name === 'Budi')!;
    const adit = members.find(m => m.name === 'Adit')!;

    await db.insert(memberAccounts).values({
      memberId: budi.id,
      label: 'BCA',
      accountNumber: '1234567890',
      isDefault: true,
    });
    const [acc] = await db.select().from(memberAccounts).where(eq(memberAccounts.memberId, budi.id));
    expect(acc.label).toBe('BCA');
    expect(acc.isDefault).toBe(true);

    await db.insert(deposits).values({
      tripId: trip.id,
      fromMemberId: budi.id,
      toMemberId: adit.id,
      amount: 50000,
      proofNote: 'Transfer via BCA',
    });
    const [dep] = await db.select().from(deposits).where(eq(deposits.tripId, trip.id));
    expect(dep.amount).toBe(50000);
    expect(dep.fromMemberId).toBe(budi.id);
  });
});

