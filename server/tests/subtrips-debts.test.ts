import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { trips, tripMembers, debts } from '../src/db/schema';
import { createAuthedUser } from './helpers/auth';

const app = createApp();

async function createTripWithDebt() {
  const { cookie } = await createAuthedUser(`debts-toggle-${Date.now()}-${Math.random()}@example.com`);
  const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
    name: 'Test Trip', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02', members: ['Budi', 'Aji'],
  });
  const { publicId } = createRes.body;
  const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));

  const subTripRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
    name: 'Makan', category: 'makan', date: '2026-01-01',
    payerMemberId: members[0].id, amount: 40000, participantMemberIds: members.map((m) => m.id), createdByMemberId: members[0].id,
    splitMode: 'total',
  });
  const [debtRow] = await db.select().from(debts).where(eq(debts.subTripId, subTripRes.body.id));

  return { publicId, subTripId: subTripRes.body.id, debtId: debtRow.id };
}

describe('PATCH .../subtrips/:subTripId/debts/:debtId', () => {
  it('marks a debt as settled, with no authorization required', async () => {
    const { publicId, subTripId, debtId } = await createTripWithDebt();
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}/debts/${debtId}`)
      .send({ settled: true });
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(debts).where(eq(debts.id, debtId));
    expect(updated.settled).toBe(true);
    expect(updated.settledAt).not.toBeNull();
  });

  it('can toggle a debt back to unsettled', async () => {
    const { publicId, subTripId, debtId } = await createTripWithDebt();
    await request(app).patch(`/api/trips/${publicId}/subtrips/${subTripId}/debts/${debtId}`).send({ settled: true });
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}/debts/${debtId}`)
      .send({ settled: false });
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(debts).where(eq(debts.id, debtId));
    expect(updated.settled).toBe(false);
    expect(updated.settledAt).toBeNull();
  });

  it('returns 404 for a debtId that does not belong to the given subTripId', async () => {
    const { publicId, subTripId } = await createTripWithDebt();
    const { debtId: otherDebtId } = await createTripWithDebt();
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}/debts/${otherDebtId}`)
      .send({ settled: true });
    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-boolean settled value', async () => {
    const { publicId, subTripId, debtId } = await createTripWithDebt();
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}/debts/${debtId}`)
      .send({ settled: 'yes' });
    expect(res.status).toBe(400);
  });

  it('returns 404 (not a 500) for a non-numeric subTripId in the URL', async () => {
    const { publicId, debtId } = await createTripWithDebt();
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/not-a-number/debts/${debtId}`)
      .send({ settled: true });
    expect(res.status).toBe(404);
  });

  it('marks debt as settled with explicit null proofImage and null settledByMemberId', async () => {
    const { publicId, subTripId, debtId } = await createTripWithDebt();
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}/debts/${debtId}`)
      .send({ settled: true, settledByMemberId: null, proofImage: null });
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(debts).where(eq(debts.id, debtId));
    expect(updated.settled).toBe(true);
    expect(updated.proofImage).toBeNull();
  });
});
