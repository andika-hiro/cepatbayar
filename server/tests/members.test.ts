import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { users, trips, tripMembers, memberAccounts } from '../src/db/schema';

const app = createApp();

describe('Member & Accounts API', () => {
  let tripPublicId = 'member-test-trip';
  let memberBudiId: number;

  beforeEach(async () => {
    await db.insert(users).values({ email: 'member-test@example.com' });
    const [user] = await db.select().from(users).where(eq(users.email, 'member-test@example.com'));

    await db.insert(trips).values({
      publicId: tripPublicId,
      name: 'Bali Trip',
      destination: 'Bali',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      creatorUserId: user.id,
    });
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, tripPublicId));

    await db.insert(tripMembers).values({ tripId: trip.id, name: 'Budi' });
    const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
    memberBudiId = members[0].id;
  });

  it('POST /api/trips/:publicId/members adds a member to trip', async () => {
    const res = await request(app)
      .post(`/api/trips/${tripPublicId}/members`)
      .send({ name: 'Charlie' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Charlie');

    const [trip] = await db.select().from(trips).where(eq(trips.publicId, tripPublicId));
    const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
    expect(members).toHaveLength(2);
  });

  it('POST /api/trips/:publicId/members/:memberId/accounts adds a bank account', async () => {
    const res = await request(app)
      .post(`/api/trips/${tripPublicId}/members/${memberBudiId}/accounts`)
      .send({ label: 'BCA', accountNumber: '0987654321', isDefault: true });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe('BCA');
    expect(res.body.isDefault).toBe(true);

    const getRes = await request(app).get(`/api/trips/${tripPublicId}/members/${memberBudiId}/accounts`);
    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveLength(1);
    expect(getRes.body[0].accountNumber).toBe('0987654321');
  });

  it('PATCH /api/trips/:publicId/members/:memberId/accounts/:accountId updates default status', async () => {
    await db.insert(memberAccounts).values([
      { memberId: memberBudiId, label: 'BCA', accountNumber: '111', isDefault: true },
      { memberId: memberBudiId, label: 'Mandiri', accountNumber: '222', isDefault: false },
    ]);
    const accs = await db.select().from(memberAccounts).where(eq(memberAccounts.memberId, memberBudiId));
    const mandiriAcc = accs.find(a => a.label === 'Mandiri')!;

    const res = await request(app)
      .patch(`/api/trips/${tripPublicId}/members/${memberBudiId}/accounts/${mandiriAcc.id}`)
      .send({ isDefault: true });
    expect(res.status).toBe(200);

    const updatedAccs = await db.select().from(memberAccounts).where(eq(memberAccounts.memberId, memberBudiId));
    const bca = updatedAccs.find(a => a.label === 'BCA')!;
    const mandiri = updatedAccs.find(a => a.label === 'Mandiri')!;
    expect(bca.isDefault).toBe(false);
    expect(mandiri.isDefault).toBe(true);
  });

  it('DELETE /api/trips/:publicId/members/:memberId/accounts/:accountId deletes account', async () => {
    await db.insert(memberAccounts).values({ memberId: memberBudiId, label: 'BCA', accountNumber: '111', isDefault: true });
    const accs = await db.select().from(memberAccounts).where(eq(memberAccounts.memberId, memberBudiId));

    const res = await request(app).delete(`/api/trips/${tripPublicId}/members/${memberBudiId}/accounts/${accs[0].id}`);
    expect(res.status).toBe(200);

    const remaining = await db.select().from(memberAccounts).where(eq(memberAccounts.memberId, memberBudiId));
    expect(remaining).toHaveLength(0);
  });
});
