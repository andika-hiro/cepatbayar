import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { trips, tripMembers, debts } from '../src/db/schema';
import { createAuthedUser } from './helpers/auth';

const app = createApp();

async function createTestTripWithSubTrip(email: string, memberNames: string[]) {
  const { cookie } = await createAuthedUser(email);
  const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
    name: 'Test Trip', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02', members: memberNames,
  });
  const { publicId } = createRes.body;
  const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
  const payer = members[0];

  const subTripRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
    name: 'Makan', category: 'makan', date: '2026-01-01',
    payerMemberId: payer.id, amount: 40000, participantMemberIds: members.map((m) => m.id), createdByMemberId: payer.id,
  });

  return { publicId, trip, members, subTripId: subTripRes.body.id, cookie, creatorMemberId: payer.id };
}

describe('PATCH /api/trips/:publicId/subtrips/:subTripId', () => {
  it('allows the trip creator (via session cookie) to edit, even without X-Member-Id', async () => {
    const { publicId, subTripId, members, cookie } = await createTestTripWithSubTrip('edit-creator@example.com', ['Budi', 'Aji']);
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('Cookie', cookie)
      .send({
        name: 'Makan Malam', category: 'makan', date: '2026-01-01',
        payerMemberId: members[0].id, amount: 60000, participantMemberIds: members.map((m) => m.id), createdByMemberId: members[0].id,
      });
    expect(res.status).toBe(200);
    const updated = await request(app).get(`/api/trips/${publicId}/subtrips/${subTripId}`);
    expect(updated.body.name).toBe('Makan Malam');
    expect(updated.body.amount).toBe(60000);
  });

  it('allows the original adder (via X-Member-Id) to edit without a session', async () => {
    const { publicId, subTripId, members, creatorMemberId } = await createTestTripWithSubTrip('edit-adder@example.com', ['Budi', 'Aji']);
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(creatorMemberId))
      .send({
        name: 'Makan Malam', category: 'makan', date: '2026-01-01',
        payerMemberId: members[0].id, amount: 50000, participantMemberIds: members.map((m) => m.id), createdByMemberId: members[0].id,
      });
    expect(res.status).toBe(200);
  });

  it('rejects an edit from neither the creator nor the original adder', async () => {
    const { publicId, subTripId, members } = await createTestTripWithSubTrip('edit-unauthorized@example.com', ['Budi', 'Aji']);
    const otherMemberId = members.find((m) => m.name === 'Aji')!.id;
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(otherMemberId))
      .send({
        name: 'Hack', category: 'makan', date: '2026-01-01',
        payerMemberId: members[0].id, amount: 1, participantMemberIds: [members[0].id], createdByMemberId: members[0].id,
      });
    expect(res.status).toBe(403);
  });

  it('preserves settled status for a debtor who remains a participant, but updates the amount', async () => {
    const { publicId, subTripId, members, creatorMemberId } = await createTestTripWithSubTrip('edit-preserve@example.com', ['Budi', 'Aji']);
    const aji = members.find((m) => m.name === 'Aji')!;
    const [debtRow] = await db.select().from(debts).where(eq(debts.subTripId, subTripId));
    await db.update(debts).set({ settled: true }).where(eq(debts.id, debtRow.id));

    await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(creatorMemberId))
      .send({
        name: 'Makan', category: 'makan', date: '2026-01-01',
        payerMemberId: members[0].id, amount: 80000, participantMemberIds: members.map((m) => m.id), createdByMemberId: members[0].id,
      });

    const [updatedDebt] = await db.select().from(debts).where(eq(debts.memberId, aji.id));
    expect(updatedDebt.settled).toBe(true);
    expect(updatedDebt.amount).toBe(40000);
  });

  it('deletes a debt for a participant removed from the sub trip, even if it was settled', async () => {
    const { publicId, subTripId, members, creatorMemberId } = await createTestTripWithSubTrip('edit-remove-participant@example.com', ['Budi', 'Aji']);
    const [debtRow] = await db.select().from(debts).where(eq(debts.subTripId, subTripId));
    await db.update(debts).set({ settled: true }).where(eq(debts.id, debtRow.id));

    await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(creatorMemberId))
      .send({
        name: 'Makan', category: 'makan', date: '2026-01-01',
        payerMemberId: members[0].id, amount: 40000, participantMemberIds: [members[0].id], createdByMemberId: members[0].id,
      });

    const remainingDebts = await db.select().from(debts).where(eq(debts.subTripId, subTripId));
    expect(remainingDebts).toHaveLength(0);
  });

  it('returns 404 for a non-existent subTripId', async () => {
    const { publicId, creatorMemberId } = await createTestTripWithSubTrip('edit-404@example.com', ['Budi']);
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/999999`)
      .set('X-Member-Id', String(creatorMemberId))
      .send({
        name: 'X', category: 'makan', date: '2026-01-01',
        payerMemberId: creatorMemberId, amount: 1000, participantMemberIds: [creatorMemberId], createdByMemberId: creatorMemberId,
      });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/trips/:publicId/subtrips/:subTripId', () => {
  it('allows the trip creator to delete, removing its debts too', async () => {
    const { publicId, subTripId, cookie } = await createTestTripWithSubTrip('delete-creator@example.com', ['Budi', 'Aji']);
    const res = await request(app).delete(`/api/trips/${publicId}/subtrips/${subTripId}`).set('Cookie', cookie);
    expect(res.status).toBe(200);

    const remainingDebts = await db.select().from(debts).where(eq(debts.subTripId, subTripId));
    expect(remainingDebts).toHaveLength(0);
    const notFound = await request(app).get(`/api/trips/${publicId}/subtrips/${subTripId}`);
    expect(notFound.status).toBe(404);
  });

  it('allows the original adder to delete', async () => {
    const { publicId, subTripId, creatorMemberId } = await createTestTripWithSubTrip('delete-adder@example.com', ['Budi']);
    const res = await request(app).delete(`/api/trips/${publicId}/subtrips/${subTripId}`).set('X-Member-Id', String(creatorMemberId));
    expect(res.status).toBe(200);
  });

  it('rejects a delete from neither the creator nor the original adder', async () => {
    const { publicId, subTripId, members } = await createTestTripWithSubTrip('delete-unauthorized@example.com', ['Budi', 'Aji']);
    const otherMemberId = members.find((m) => m.name === 'Aji')!.id;
    const res = await request(app).delete(`/api/trips/${publicId}/subtrips/${subTripId}`).set('X-Member-Id', String(otherMemberId));
    expect(res.status).toBe(403);
  });
});
