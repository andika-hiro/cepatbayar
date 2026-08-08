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
