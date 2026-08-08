import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { trips, tripMembers, debts, subTripItems } from '../src/db/schema';
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
    splitMode: 'total',
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
        splitMode: 'total',
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
        splitMode: 'total',
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
        splitMode: 'total',
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
        splitMode: 'total',
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
        splitMode: 'total',
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
        splitMode: 'total',
      });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-numeric subTripId in the URL, instead of a 500 from NaN reaching the DB', async () => {
    const { publicId, creatorMemberId } = await createTestTripWithSubTrip('edit-nan@example.com', ['Budi']);
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/not-a-number`)
      .set('X-Member-Id', String(creatorMemberId))
      .send({
        name: 'X', category: 'makan', date: '2026-01-01',
        payerMemberId: creatorMemberId, amount: 1000, participantMemberIds: [creatorMemberId], createdByMemberId: creatorMemberId,
        splitMode: 'total',
      });
    expect(res.status).toBe(404);
  });
});

describe('payer participation (payerParticipates) round trip', () => {
  it('records payerParticipates: false when the payer pays for others only, and a same-participant PATCH leaves debt amounts unchanged', async () => {
    const { cookie } = await createAuthedUser('payer-not-participant@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Test Trip', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02',
      members: ['Budi', 'Aji', 'Citra'],
    });
    const { publicId } = createRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;
    const citra = members.find((m) => m.name === 'Citra')!;

    // Budi pays for Aji and Citra's tickets without joining them.
    const subTripRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Tiket Wisata', category: 'tiket_wisata', date: '2026-01-01',
      payerMemberId: budi.id, amount: 100000,
      participantMemberIds: [aji.id, citra.id],
      createdByMemberId: budi.id,
      splitMode: 'total',
    });
    expect(subTripRes.status).toBe(201);
    const subTripId = subTripRes.body.id;

    const detailRes = await request(app).get(`/api/trips/${publicId}/subtrips/${subTripId}`);
    expect(detailRes.body.payerParticipates).toBe(false);
    // divisor is 2 (Aji, Citra), NOT 3 — Budi never joined.
    expect(detailRes.body.debts).toHaveLength(2);
    expect(detailRes.body.debts.every((d: { amount: number }) => d.amount === 50000)).toBe(true);

    // Regression check: PATCHing with the EXACT same (payer-excluded)
    // participant list must not silently change the divisor to 3.
    const patchRes = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(budi.id))
      .send({
        name: 'Tiket Wisata (typo fix)', category: 'tiket_wisata', date: '2026-01-01',
        payerMemberId: budi.id, amount: 100000,
        participantMemberIds: [aji.id, citra.id],
        createdByMemberId: budi.id,
        splitMode: 'total',
      });
    expect(patchRes.status).toBe(200);

    const afterPatch = await request(app).get(`/api/trips/${publicId}/subtrips/${subTripId}`);
    expect(afterPatch.body.payerParticipates).toBe(false);
    expect(afterPatch.body.debts).toHaveLength(2);
    expect(afterPatch.body.debts.every((d: { amount: number }) => d.amount === 50000)).toBe(true);
  });

  it('records payerParticipates: true when the payer is included among the participants', async () => {
    const { publicId, subTripId } = await createTestTripWithSubTrip('payer-is-participant@example.com', ['Budi', 'Aji']);
    const res = await request(app).get(`/api/trips/${publicId}/subtrips/${subTripId}`);
    expect(res.status).toBe(200);
    expect(res.body.payerParticipates).toBe(true);
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

  it('returns 404 (not a 500) for a non-numeric subTripId in the URL', async () => {
    const { publicId, creatorMemberId } = await createTestTripWithSubTrip('delete-nan@example.com', ['Budi']);
    const res = await request(app).delete(`/api/trips/${publicId}/subtrips/not-a-number`).set('X-Member-Id', String(creatorMemberId));
    expect(res.status).toBe(404);
  });

  it('allows deleting a per_item sub trip, cleaning up its subTripItems rows too', async () => {
    const { cookie } = await createAuthedUser('delete-peritem@example.com');
    const createTripRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02', members: ['Budi', 'Aji'],
    });
    const { publicId } = createTripRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    const createRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, createdByMemberId: budi.id,
      splitMode: 'per_item', taxPercent: 0, servicePercent: 0,
      items: [{ name: 'Item A', price: 20000, participants: [{ memberId: aji.id }] }],
    });
    const subTripId = createRes.body.id;

    const res = await request(app)
      .delete(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(budi.id));
    expect(res.status).toBe(200);

    const remainingItems = await db.select().from(subTripItems).where(eq(subTripItems.subTripId, subTripId));
    expect(remainingItems).toHaveLength(0);
  });
});

describe('PATCH /api/trips/:publicId/subtrips/:subTripId — per-item mode', () => {
  it('replaces the item list wholesale and recomputes debts', async () => {
    const { cookie } = await createAuthedUser('edit-peritem1@example.com');
    const createTripRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02', members: ['Budi', 'Aji'],
    });
    const { publicId } = createTripRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    const createRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, createdByMemberId: budi.id,
      splitMode: 'per_item', taxPercent: 0, servicePercent: 0,
      items: [{ name: 'Item A', price: 20000, participants: [{ memberId: aji.id }] }],
    });
    const subTripId = createRes.body.id;

    const patchRes = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(budi.id))
      .send({
        name: 'Makan (edited)', category: 'makan', date: '2026-01-01',
        payerMemberId: budi.id, createdByMemberId: budi.id,
        splitMode: 'per_item', taxPercent: 0, servicePercent: 0,
        items: [{ name: 'Item B', price: 40000, participants: [{ memberId: aji.id }] }],
      });
    expect(patchRes.status).toBe(200);

    const itemRows = await db.select().from(subTripItems).where(eq(subTripItems.subTripId, subTripId));
    expect(itemRows).toHaveLength(1);
    expect(itemRows[0].name).toBe('Item B');

    const debtRows = await db.select().from(debts).where(eq(debts.subTripId, subTripId));
    expect(debtRows).toHaveLength(1);
    expect(debtRows[0].amount).toBe(40000);
  });

  it('preserves settled status on an edit that keeps the same debtor', async () => {
    const { cookie } = await createAuthedUser('edit-peritem2@example.com');
    const createTripRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02', members: ['Budi', 'Aji'],
    });
    const { publicId } = createTripRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    const createRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, createdByMemberId: budi.id,
      splitMode: 'per_item', taxPercent: 0, servicePercent: 0,
      items: [{ name: 'Item A', price: 20000, participants: [{ memberId: aji.id }] }],
    });
    const subTripId = createRes.body.id;
    const [debtRow] = await db.select().from(debts).where(eq(debts.subTripId, subTripId));
    await db.update(debts).set({ settled: true }).where(eq(debts.id, debtRow.id));

    await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(budi.id))
      .send({
        name: 'Makan', category: 'makan', date: '2026-01-01',
        payerMemberId: budi.id, createdByMemberId: budi.id,
        splitMode: 'per_item', taxPercent: 0, servicePercent: 0,
        items: [{ name: 'Item A', price: 40000, participants: [{ memberId: aji.id }] }],
      });

    const [updatedDebt] = await db.select().from(debts).where(eq(debts.memberId, aji.id));
    expect(updatedDebt.settled).toBe(true);
    expect(updatedDebt.amount).toBe(40000);
  });

  it('rejects a PATCH that tries to change splitMode from the stored value', async () => {
    const { cookie } = await createAuthedUser('edit-peritem3@example.com');
    const createTripRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02', members: ['Budi'],
    });
    const { publicId } = createTripRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));

    const createRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: members[0].id, createdByMemberId: members[0].id,
      splitMode: 'total', amount: 10000, participantMemberIds: [members[0].id],
    });
    const subTripId = createRes.body.id;

    const patchRes = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(members[0].id))
      .send({
        name: 'Makan', category: 'makan', date: '2026-01-01',
        payerMemberId: members[0].id, createdByMemberId: members[0].id,
        splitMode: 'per_item', taxPercent: 0, servicePercent: 0,
        items: [{ name: 'Item', price: 10000, participants: [{ memberId: members[0].id }] }],
      });
    expect(patchRes.status).toBe(400);
    expect(patchRes.body.error).toBe('split_mode_locked');
  });
});
