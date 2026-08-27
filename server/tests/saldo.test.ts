import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import request from 'supertest';

import { createApp } from '../src/app';
import { db } from '../src/db/client';

const app = createApp();

import { users, trips, tripMembers, subTrips, debts, deposits, memberAccounts } from '../src/db/schema';

describe('Saldo & Deposits API', () => {
  let tripPublicId = 'saldo-test-trip';
  let memberAditId: number;
  let memberBudiId: number;
  let subTripId: number;

  beforeEach(async () => {
    await db.insert(users).values({ email: 'saldo-test@example.com' });
    const [user] = await db.select().from(users).where(eq(users.email, 'saldo-test@example.com'));

    await db.insert(trips).values({
      publicId: tripPublicId,
      name: 'Jogja Trip',
      destination: 'Jogja',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      creatorUserId: user.id,
    });
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, tripPublicId));

    await db.insert(tripMembers).values({ tripId: trip.id, name: 'Adit' });
    await db.insert(tripMembers).values({ tripId: trip.id, name: 'Budi' });
    const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
    
    memberAditId = members.find(m => m.name === 'Adit')!.id;
    memberBudiId = members.find(m => m.name === 'Budi')!.id;

    await db.insert(memberAccounts).values({
      memberId: memberAditId,
      label: 'BCA',
      accountNumber: '123456789',
      isDefault: true,
    });

    await db.insert(subTrips).values({
      tripId: trip.id,
      name: 'Makan Gudeg',
      category: 'makan',
      date: '2026-08-01',
      payerMemberId: memberAditId,
      amount: 40000,
      createdByMemberId: memberAditId,
    });
    const [st] = await db.select().from(subTrips).where(eq(subTrips.tripId, trip.id));
    subTripId = st.id;

    await db.insert(debts).values({
      subTripId: st.id,
      memberId: memberBudiId,
      amount: 20000,
      settled: false,
    });

    await db.insert(deposits).values({
      tripId: trip.id,
      fromMemberId: memberBudiId,
      toMemberId: memberAditId,
      amount: 10000,
    });
  });

  it('GET /api/trips/:publicId/saldo returns rollup, debts with depositNote & accounts, and deposit summaries', async () => {
    const res = await request(app).get(`/api/trips/${tripPublicId}/saldo`);
    expect(res.status).toBe(200);
    expect(res.body.rollupMembers).toHaveLength(2);
    
    const budiRollup = res.body.rollupMembers.find((m: any) => m.memberId === memberBudiId);
    expect(budiRollup.rollup).toBe(-10000);
    expect(budiRollup.status).toBe('neg');

    expect(res.body.unsettledDebts).toHaveLength(1);
    const debt = res.body.unsettledDebts[0];
    expect(debt.amount).toBe(20000);
    expect(debt.depositNote).toContain('Rp10.000 dipotong dari deposit Budi → Adit (sisa Rp0)');
    expect(debt.accounts).toHaveLength(1);
    expect(debt.accounts[0].label).toBe('BCA');

    expect(res.body.deposits).toHaveLength(1);
    expect(res.body.deposits[0].remainingBalance).toBe(0);
    expect(res.body.deposits[0].low).toBe(true);
  });

  it('POST /api/trips/:publicId/deposits creates a deposit record', async () => {
    const res = await request(app)
      .post(`/api/trips/${tripPublicId}/deposits`)
      .send({
        fromMemberId: memberBudiId,
        toMemberId: memberAditId,
        amount: 30000,
        proofNote: 'Transfer BCA 30k',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/trips/:publicId/settled-debts returns settled debts history', async () => {
    await db.insert(debts).values({
      subTripId,
      memberId: memberBudiId,
      amount: 15000,
      settled: true,
      settledAt: new Date(),
    });

    const res = await request(app).get(`/api/trips/${tripPublicId}/settled-debts`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].amount).toBe(15000);
    expect(res.body[0].debtorName).toBe('Budi');
    expect(res.body[0].creditorName).toBe('Adit');
  });
});
