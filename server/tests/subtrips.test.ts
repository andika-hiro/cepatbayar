import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { trips, tripMembers, debts } from '../src/db/schema';
import { createAuthedUser } from './helpers/auth';

const app = createApp();

async function createTestTrip(email: string, memberNames: string[]) {
  const { cookie } = await createAuthedUser(email);
  const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
    name: 'Test Trip', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02', members: memberNames,
  });
  const { publicId } = createRes.body;
  const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
  return { publicId, trip, members };
}

describe('POST /api/trips/:publicId/subtrips', () => {
  it('creates a sub trip and generates debts for participants excluding the payer', async () => {
    const { publicId, members } = await createTestTrip('subtrip-create1@example.com', ['Budi', 'Aji', 'Citra']);
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;
    const citra = members.find((m) => m.name === 'Citra')!;

    const res = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan Siang', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, amount: 90000,
      participantMemberIds: [budi.id, aji.id, citra.id],
      createdByMemberId: budi.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTypeOf('number');

    const debtRows = await db.select().from(debts).where(eq(debts.subTripId, res.body.id));
    expect(debtRows).toHaveLength(2);
    expect(debtRows.every((d) => d.amount === 30000)).toBe(true);
    expect(debtRows.some((d) => d.memberId === budi.id)).toBe(false);
    expect(debtRows.some((d) => d.memberId === aji.id)).toBe(true);
    expect(debtRows.some((d) => d.memberId === citra.id)).toBe(true);
  });

  it('rejects an empty participant list', async () => {
    const { publicId, members } = await createTestTrip('subtrip-create2@example.com', ['Budi']);
    const res = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: members[0].id, amount: 10000, participantMemberIds: [], createdByMemberId: members[0].id,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a payerMemberId that belongs to a different trip', async () => {
    const { publicId } = await createTestTrip('subtrip-create3@example.com', ['Budi']);
    const { members: otherMembers } = await createTestTrip('subtrip-create4@example.com', ['Dedi']);
    const res = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: otherMembers[0].id, amount: 10000,
      participantMemberIds: [otherMembers[0].id], createdByMemberId: otherMembers[0].id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_member');
  });

  it('returns 404 for an unknown trip publicId', async () => {
    const res = await request(app).post('/api/trips/does-not-exist/subtrips').send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: 1, amount: 10000, participantMemberIds: [1], createdByMemberId: 1,
    });
    expect(res.status).toBe(404);
  });

  it('rejects an invalid category', async () => {
    const { publicId, members } = await createTestTrip('subtrip-create5@example.com', ['Budi']);
    const res = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'olahraga', date: '2026-01-01',
      payerMemberId: members[0].id, amount: 10000, participantMemberIds: [members[0].id], createdByMemberId: members[0].id,
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/trips/:publicId/subtrips', () => {
  it('lists sub trips with payer name and unsettled debt count', async () => {
    const { publicId, members } = await createTestTrip('subtrip-list1@example.com', ['Budi', 'Aji']);
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, amount: 40000, participantMemberIds: [budi.id, aji.id], createdByMemberId: budi.id,
    });

    const res = await request(app).get(`/api/trips/${publicId}/subtrips`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Makan');
    expect(res.body[0].payerName).toBe('Budi');
    expect(res.body[0].unsettledCount).toBe(1);
  });

  it('returns an empty array when the trip has no sub trips', async () => {
    const { publicId } = await createTestTrip('subtrip-list2@example.com', ['Budi']);
    const res = await request(app).get(`/api/trips/${publicId}/subtrips`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 404 for an unknown trip publicId', async () => {
    const res = await request(app).get('/api/trips/does-not-exist/subtrips');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/trips/:publicId/subtrips/:subTripId', () => {
  it('returns sub trip detail with named debts', async () => {
    const { publicId, members } = await createTestTrip('subtrip-detail1@example.com', ['Budi', 'Aji']);
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    const createRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, amount: 40000, participantMemberIds: [budi.id, aji.id], createdByMemberId: budi.id,
    });

    const res = await request(app).get(`/api/trips/${publicId}/subtrips/${createRes.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Makan');
    expect(res.body.payerName).toBe('Budi');
    expect(res.body.createdByMemberId).toBe(budi.id);
    expect(res.body.debts).toHaveLength(1);
    expect(res.body.debts[0].memberId).toBe(aji.id);
    expect(res.body.debts[0].name).toBe('Aji');
    expect(res.body.debts[0].settled).toBe(false);
  });

  it('returns 404 for a subTripId that does not belong to the given trip', async () => {
    const { publicId: publicIdA, members: membersA } = await createTestTrip('subtrip-detail2a@example.com', ['Budi']);
    const { publicId: publicIdB } = await createTestTrip('subtrip-detail2b@example.com', ['Dedi']);
    const createRes = await request(app).post(`/api/trips/${publicIdA}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: membersA[0].id, amount: 10000, participantMemberIds: [membersA[0].id], createdByMemberId: membersA[0].id,
    });

    const res = await request(app).get(`/api/trips/${publicIdB}/subtrips/${createRes.body.id}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-existent subTripId', async () => {
    const { publicId } = await createTestTrip('subtrip-detail3@example.com', ['Budi']);
    const res = await request(app).get(`/api/trips/${publicId}/subtrips/999999`);
    expect(res.status).toBe(404);
  });

  it('returns 404 (not a 500) for a non-numeric subTripId in the URL', async () => {
    const { publicId } = await createTestTrip('subtrip-detail4@example.com', ['Budi']);
    const res = await request(app).get(`/api/trips/${publicId}/subtrips/foo`);
    expect(res.status).toBe(404);
  });
});

describe('end-to-end: create → summary → settle → summary → edit', () => {
  it('drives the full API chain (not direct DB inserts) and keeps the summary rollup consistent at every step', async () => {
    const { publicId, members } = await createTestTrip('e2e-chain@example.com', ['Budi', 'Aji']);
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    // 1. Create a sub trip with a real split via the actual endpoint.
    const createRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, amount: 40000, participantMemberIds: [budi.id, aji.id], createdByMemberId: budi.id,
    });
    expect(createRes.status).toBe(201);
    const subTripId = createRes.body.id;

    // 2. Summary should reflect the debt before it's settled.
    let summaryRes = await request(app).get(`/api/trips/${publicId}/summary`);
    let budiSummary = summaryRes.body.members.find((m: { memberId: number }) => m.memberId === budi.id);
    let ajiSummary = summaryRes.body.members.find((m: { memberId: number }) => m.memberId === aji.id);
    expect(budiSummary.rollup).toBe(20000);
    expect(budiSummary.status).toBe('dilunasin');
    expect(ajiSummary.rollup).toBe(-20000);
    expect(ajiSummary.status).toBe('ngutang');

    // 3. Settle the debt via the real toggle endpoint.
    const detailRes = await request(app).get(`/api/trips/${publicId}/subtrips/${subTripId}`);
    const debtId = detailRes.body.debts[0].id;
    const settleRes = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}/debts/${debtId}`)
      .send({ settled: true });
    expect(settleRes.status).toBe(200);

    // 4. Summary should now exclude the settled debt entirely — both members back to 0/lunas.
    summaryRes = await request(app).get(`/api/trips/${publicId}/summary`);
    budiSummary = summaryRes.body.members.find((m: { memberId: number }) => m.memberId === budi.id);
    ajiSummary = summaryRes.body.members.find((m: { memberId: number }) => m.memberId === aji.id);
    expect(budiSummary.rollup).toBe(0);
    expect(budiSummary.status).toBe('lunas');
    expect(ajiSummary.rollup).toBe(0);
    expect(ajiSummary.status).toBe('lunas');

    // 5. Edit the sub trip's amount (same participants) via the real PATCH endpoint.
    const patchRes = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(budi.id))
      .send({
        name: 'Makan', category: 'makan', date: '2026-01-01',
        payerMemberId: budi.id, amount: 80000, participantMemberIds: [budi.id, aji.id], createdByMemberId: budi.id,
      });
    expect(patchRes.status).toBe(200);

    // 6. The debt's settled status must survive the amount change, but the amount is recomputed.
    const afterEditDetail = await request(app).get(`/api/trips/${publicId}/subtrips/${subTripId}`);
    expect(afterEditDetail.body.debts[0].settled).toBe(true);
    expect(afterEditDetail.body.debts[0].amount).toBe(40000);

    // 7. A fresh summary must still exclude it (still settled), regardless of the new amount.
    summaryRes = await request(app).get(`/api/trips/${publicId}/summary`);
    budiSummary = summaryRes.body.members.find((m: { memberId: number }) => m.memberId === budi.id);
    expect(budiSummary.rollup).toBe(0);
    expect(budiSummary.status).toBe('lunas');
  });
});

describe('createdByMemberId immutability', () => {
  it('ignores a PATCH body that tries to reassign createdByMemberId to a different member', async () => {
    const { publicId, members } = await createTestTrip('immutable-creator@example.com', ['Budi', 'Aji']);
    const budi = members.find((m) => m.name === 'Budi')!; // X — the real original adder
    const aji = members.find((m) => m.name === 'Aji')!; // Y — a different, otherwise-valid member

    const createRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, amount: 40000, participantMemberIds: [budi.id, aji.id], createdByMemberId: budi.id,
    });
    expect(createRes.status).toBe(201);
    const subTripId = createRes.body.id;

    // Authorized editor (the real original adder, Budi/X) sends a body
    // claiming createdByMemberId should become Aji/Y.
    const patchRes = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(budi.id))
      .send({
        name: 'Makan Malam', category: 'makan', date: '2026-01-01',
        payerMemberId: budi.id, amount: 40000, participantMemberIds: [budi.id, aji.id], createdByMemberId: aji.id,
      });
    expect(patchRes.status).toBe(200);

    const detailRes = await request(app).get(`/api/trips/${publicId}/subtrips/${subTripId}`);
    expect(detailRes.body.createdByMemberId).toBe(budi.id);
    expect(detailRes.body.createdByMemberId).not.toBe(aji.id);
  });
});
