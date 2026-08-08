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

  describe('cross-trip scoping (IDOR protection)', () => {
    let otherTripPublicId: string;
    let otherMemberId: number;
    let otherAccountId: number;

    beforeEach(async () => {
      otherTripPublicId = 'other-idor-trip';
      await db.insert(users).values({ email: 'other-member-test@example.com' });
      const [otherUser] = await db.select().from(users).where(eq(users.email, 'other-member-test@example.com'));

      await db.insert(trips).values({
        publicId: otherTripPublicId,
        name: 'Jakarta Trip',
        destination: 'Jakarta',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        creatorUserId: otherUser.id,
      });
      const [otherTrip] = await db.select().from(trips).where(eq(trips.publicId, otherTripPublicId));

      await db.insert(tripMembers).values({ tripId: otherTrip.id, name: 'Dedi' });
      const otherMembers = await db.select().from(tripMembers).where(eq(tripMembers.tripId, otherTrip.id));
      otherMemberId = otherMembers[0].id;

      await db.insert(memberAccounts).values({ memberId: otherMemberId, label: 'BRI', accountNumber: '333', isDefault: true });
      const otherAccs = await db.select().from(memberAccounts).where(eq(memberAccounts.memberId, otherMemberId));
      otherAccountId = otherAccs[0].id;
    });

    it('GET rejects a memberId that belongs to a different trip', async () => {
      const res = await request(app).get(`/api/trips/${tripPublicId}/members/${otherMemberId}/accounts`);
      expect(res.status).not.toBe(200);
    });

    it('POST rejects a memberId that belongs to a different trip', async () => {
      const res = await request(app)
        .post(`/api/trips/${tripPublicId}/members/${otherMemberId}/accounts`)
        .send({ label: 'Fraud', accountNumber: '999', isDefault: true });
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(201);

      const accs = await db.select().from(memberAccounts).where(eq(memberAccounts.memberId, otherMemberId));
      expect(accs).toHaveLength(1); // unchanged, no fraudulent account inserted
    });

    it('PATCH rejects a memberId/accountId that belongs to a different trip', async () => {
      const res = await request(app)
        .patch(`/api/trips/${tripPublicId}/members/${otherMemberId}/accounts/${otherAccountId}`)
        .send({ isDefault: true });
      expect(res.status).not.toBe(200);
    });

    it('PATCH rejects an accountId that does not belong to the given memberId, even within the same trip', async () => {
      const res = await request(app)
        .patch(`/api/trips/${tripPublicId}/members/${memberBudiId}/accounts/${otherAccountId}`)
        .send({ isDefault: true });
      expect(res.status).not.toBe(200);

      const [account] = await db.select().from(memberAccounts).where(eq(memberAccounts.id, otherAccountId));
      expect(account.memberId).toBe(otherMemberId); // untouched
    });

    it('DELETE rejects a memberId/accountId that belongs to a different trip', async () => {
      const res = await request(app).delete(`/api/trips/${tripPublicId}/members/${otherMemberId}/accounts/${otherAccountId}`);
      expect(res.status).not.toBe(200);

      const stillThere = await db.select().from(memberAccounts).where(eq(memberAccounts.id, otherAccountId));
      expect(stillThere).toHaveLength(1); // not deleted
    });
  });
});
