import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { createAuthedUser } from './helpers/auth';
import { db } from '../src/db/client';
import { trips, subTrips, debts, deposits, tripMembers as tripMembersTable } from '../src/db/schema';
import { eq } from 'drizzle-orm';

const app = createApp();

describe('POST /api/trips', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/trips').send({});
    expect(res.status).toBe(401);
  });

  it('creates a trip with members for the authenticated user', async () => {
    const { cookie } = await createAuthedUser('dedi@example.com');
    const res = await request(app)
      .post('/api/trips')
      .set('Cookie', cookie)
      .send({
        name: 'Trip ke Jogja',
        destination: 'Yogyakarta',
        startDate: '2026-09-01',
        endDate: '2026-09-04',
        members: ['Dedi', 'Budi'],
      });
    expect(res.status).toBe(201);
    expect(res.body.publicId).toBeTypeOf('string');
    expect(res.body.publicId.length).toBeGreaterThan(10);
  });

  it('rejects a trip with no members', async () => {
    const { cookie } = await createAuthedUser('eka@example.com');
    const res = await request(app)
      .post('/api/trips')
      .set('Cookie', cookie)
      .send({ name: 'Trip', destination: 'Bandung', startDate: '2026-09-01', endDate: '2026-09-02', members: [] });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/trips/mine', () => {
  it('lists only trips created by the authenticated user', async () => {
    const { cookie: cookieA } = await createAuthedUser('fajar@example.com');
    const { cookie: cookieB } = await createAuthedUser('gita@example.com');
    await request(app).post('/api/trips').set('Cookie', cookieA).send({
      name: 'Trip A', destination: 'Bali', startDate: '2026-09-01', endDate: '2026-09-02', members: ['Fajar'],
    });
    await request(app).post('/api/trips').set('Cookie', cookieB).send({
      name: 'Trip B', destination: 'Lombok', startDate: '2026-09-01', endDate: '2026-09-02', members: ['Gita'],
    });

    const res = await request(app).get('/api/trips/mine').set('Cookie', cookieA);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Trip A');
    expect(res.body[0].memberCount).toBe(1);
    expect(res.body[0].unsettledCount).toBe(0);
  });

  it('reports the real unsettled debt count instead of a hardcoded 0', async () => {
    const { cookie } = await createAuthedUser('unsettled-mine@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip Unsettled', destination: 'Bali', startDate: '2026-09-01', endDate: '2026-09-02', members: ['Budi', 'Aji'],
    });
    const { publicId } = createRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const members = await db.select().from(tripMembersTable).where(eq(tripMembersTable.tripId, trip.id));
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    await db.insert(subTrips).values({
      tripId: trip.id, name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, amount: 40000, createdByMemberId: budi.id,
    });
    const [subTrip] = await db.select().from(subTrips).where(eq(subTrips.tripId, trip.id));
    await db.insert(debts).values([
      { subTripId: subTrip.id, memberId: aji.id, amount: 20000, settled: false },
      { subTripId: subTrip.id, memberId: aji.id, amount: 5000, settled: true },
    ]);

    const res = await request(app).get('/api/trips/mine').set('Cookie', cookie);
    expect(res.status).toBe(200);
    // only the unsettled debt counts — settled debts are excluded.
    expect(res.body[0].unsettledCount).toBe(1);
  });

  it('returns unsettledCount 0 for a trip with sub trips but no unsettled debts', async () => {
    const { cookie } = await createAuthedUser('unsettled-none@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip All Settled', destination: 'Bali', startDate: '2026-09-01', endDate: '2026-09-02', members: ['Budi', 'Aji'],
    });
    const { publicId } = createRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const members = await db.select().from(tripMembersTable).where(eq(tripMembersTable.tripId, trip.id));
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    await db.insert(subTrips).values({
      tripId: trip.id, name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, amount: 40000, createdByMemberId: budi.id,
    });
    const [subTrip] = await db.select().from(subTrips).where(eq(subTrips.tripId, trip.id));
    await db.insert(debts).values({ subTripId: subTrip.id, memberId: aji.id, amount: 20000, settled: true });

    const res = await request(app).get('/api/trips/mine').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body[0].unsettledCount).toBe(0);
  });
});

describe('GET /api/trips/:publicId', () => {
  it('returns trip detail with members for a valid publicId', async () => {
    const { cookie } = await createAuthedUser('hana@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip Hana', destination: 'Malang', startDate: '2026-09-01', endDate: '2026-09-02', members: ['Hana', 'Ivan'],
    });
    const { publicId } = createRes.body;

    const res = await request(app).get(`/api/trips/${publicId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Trip Hana');
    expect(res.body.members).toHaveLength(2);
    expect(res.body.members.map((m: { name: string }) => m.name)).toEqual(['Hana', 'Ivan']);
  });

  it('returns 404 for an unknown publicId', async () => {
    const res = await request(app).get('/api/trips/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/trips/summary', () => {
  it('returns summaries for known ids and silently drops unknown ones', async () => {
    const { cookie } = await createAuthedUser('joko@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip Joko', destination: 'Solo', startDate: '2026-09-01', endDate: '2026-09-02', members: ['Joko'],
    });
    const { publicId } = createRes.body;

    const res = await request(app).post('/api/trips/summary').send({ publicIds: [publicId, 'unknown-id'] });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].publicId).toBe(publicId);
  });
});

describe('GET /api/trips/:publicId/summary', () => {
  it('returns zero rollup for every member when there are no sub trips', async () => {
    const { cookie } = await createAuthedUser('summary-empty@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip Kosong', destination: 'Bogor', startDate: '2026-01-01', endDate: '2026-01-02', members: ['Budi', 'Aji'],
    });
    const { publicId } = createRes.body;

    const res = await request(app).get(`/api/trips/${publicId}/summary`);
    expect(res.status).toBe(200);
    expect(res.body.tripTotal).toBe(0);
    expect(res.body.members).toHaveLength(2);
    for (const m of res.body.members) {
      expect(m.rollup).toBe(0);
      expect(m.status).toBe('lunas');
    }
  });

  it('computes rollup correctly for a payer and a debtor with one unsettled debt', async () => {
    const { cookie } = await createAuthedUser('summary-basic@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip Isi', destination: 'Bandung', startDate: '2026-01-01', endDate: '2026-01-02', members: ['Budi', 'Aji'],
    });
    const { publicId } = createRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const members = await db.select().from(tripMembersTable).where(eq(tripMembersTable.tripId, trip.id));
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    await db.insert(subTrips).values({
      tripId: trip.id, name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, amount: 40000, createdByMemberId: budi.id,
    });
    const [subTrip] = await db.select().from(subTrips).where(eq(subTrips.tripId, trip.id));
    await db.insert(debts).values({ subTripId: subTrip.id, memberId: aji.id, amount: 20000 });

    const res = await request(app).get(`/api/trips/${publicId}/summary`);
    expect(res.status).toBe(200);
    expect(res.body.tripTotal).toBe(40000);
    const budiSummary = res.body.members.find((m: { memberId: number }) => m.memberId === budi.id);
    const ajiSummary = res.body.members.find((m: { memberId: number }) => m.memberId === aji.id);
    expect(budiSummary.rollup).toBe(20000);
    expect(budiSummary.status).toBe('dilunasin');
    expect(ajiSummary.rollup).toBe(-20000);
    expect(ajiSummary.status).toBe('ngutang');
  });

  it('excludes settled debts from the rollup', async () => {
    const { cookie } = await createAuthedUser('summary-settled@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip Lunas', destination: 'Malang', startDate: '2026-01-01', endDate: '2026-01-02', members: ['Budi', 'Aji'],
    });
    const { publicId } = createRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const members = await db.select().from(tripMembersTable).where(eq(tripMembersTable.tripId, trip.id));
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    await db.insert(subTrips).values({
      tripId: trip.id, name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, amount: 40000, createdByMemberId: budi.id,
    });
    const [subTrip] = await db.select().from(subTrips).where(eq(subTrips.tripId, trip.id));
    await db.insert(debts).values({ subTripId: subTrip.id, memberId: aji.id, amount: 20000, settled: true });

    const res = await request(app).get(`/api/trips/${publicId}/summary`);
    const budiSummary = res.body.members.find((m: { memberId: number }) => m.memberId === budi.id);
    expect(budiSummary.rollup).toBe(0);
    expect(budiSummary.status).toBe('lunas');
  });

  it('deducts dynamic deposits from debt rollups in summary', async () => {
    const { cookie } = await createAuthedUser('summary-deposit@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip Deposit Summary', destination: 'Bali', startDate: '2026-08-01', endDate: '2026-08-05', members: ['Hiro', 'Ando'],
    });
    const { publicId } = createRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const members = await db.select().from(tripMembersTable).where(eq(tripMembersTable.tripId, trip.id));
    const hiro = members.find((m) => m.name === 'Hiro')!;
    const ando = members.find((m) => m.name === 'Ando')!;

    await db.insert(deposits).values({
      tripId: trip.id,
      fromMemberId: hiro.id,
      toMemberId: ando.id,
      amount: 1000000,
    });

    await db.insert(subTrips).values({
      tripId: trip.id, name: 'Makan Ando', category: 'makan', date: '2026-08-01',
      payerMemberId: ando.id, amount: 112000, createdByMemberId: ando.id,
    });
    const [subTrip] = await db.select().from(subTrips).where(eq(subTrips.tripId, trip.id));
    await db.insert(debts).values({ subTripId: subTrip.id, memberId: hiro.id, amount: 112000, settled: false });

    const res = await request(app).get(`/api/trips/${publicId}/summary`);
    expect(res.status).toBe(200);

    const hiroSummary = res.body.members.find((m: { memberId: number }) => m.memberId === hiro.id);
    const andoSummary = res.body.members.find((m: { memberId: number }) => m.memberId === ando.id);

    expect(hiroSummary.rollup).toBe(0);
    expect(hiroSummary.status).toBe('lunas');
    expect(andoSummary.rollup).toBe(0);
    expect(andoSummary.status).toBe('lunas');
  });

  it('returns 404 for an unknown publicId', async () => {
    const res = await request(app).get('/api/trips/does-not-exist/summary');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/trips/:publicId/analytics', () => {
  it('returns complete visual analytics data, category breakdown, daily spending, awards, and settlement progress', async () => {
    const { cookie } = await createAuthedUser('analytics-test@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip Liburan', destination: 'Lombok', startDate: '2026-08-10', endDate: '2026-08-15', members: ['Ando', 'Hiro'],
    });
    const { publicId } = createRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const [ando, hiro] = await db.select().from(tripMembersTable).where(eq(tripMembersTable.tripId, trip.id));

    // SubTrip 1: Makan (100,000)
    await db.insert(subTrips).values({
      tripId: trip.id,
      name: 'Makan Malam',
      category: 'makan',
      date: '2026-08-10',
      payerMemberId: ando.id,
      amount: 100000,
      createdByMemberId: ando.id,
    });
    const [st1] = await db.select().from(subTrips).where(eq(subTrips.name, 'Makan Malam'));
    await db.insert(debts).values({ subTripId: st1.id, memberId: hiro.id, amount: 50000, settled: true });

    // SubTrip 2: Transport (50,000)
    await db.insert(subTrips).values({
      tripId: trip.id,
      name: 'Grab Car',
      category: 'transport',
      date: '2026-08-11',
      payerMemberId: hiro.id,
      amount: 50000,
      createdByMemberId: hiro.id,
    });
    const [st2] = await db.select().from(subTrips).where(eq(subTrips.name, 'Grab Car'));
    await db.insert(debts).values({ subTripId: st2.id, memberId: ando.id, amount: 25000, settled: false });

    const res = await request(app).get(`/api/trips/${publicId}/analytics`);
    expect(res.status).toBe(200);
    expect(res.body.totalExpense).toBe(150000);
    expect(res.body.subTripCount).toBe(2);
    expect(res.body.memberCount).toBe(2);

    // Category breakdown
    expect(res.body.categoryBreakdown).toHaveLength(2);
    expect(res.body.categoryBreakdown[0].category).toBe('makan');
    expect(res.body.categoryBreakdown[0].total).toBe(100000);
    expect(res.body.categoryBreakdown[0].percentage).toBe(67);

    // Daily spending
    expect(res.body.dailySpending).toHaveLength(2);
    expect(res.body.dailySpending[0].date).toBe('2026-08-10');
    expect(res.body.dailySpending[0].isPeak).toBe(true);

    // Awards
    expect(res.body.awards.topCreditor.name).toBe('Ando');
    expect(res.body.awards.topCreditor.amount).toBe(100000);
    expect(res.body.awards.mostExpensiveSubTrip.name).toBe('Makan Malam');
    expect(res.body.awards.averagePerMember).toBe(75000);

    // Settlement Progress
    expect(res.body.settlementProgress.totalDebtsAmount).toBe(75000);
    expect(res.body.settlementProgress.settledDebtsAmount).toBe(50000);
    expect(res.body.settlementProgress.unsettledDebtsAmount).toBe(25000);
    expect(res.body.settlementProgress.settledPercentage).toBe(67);
  });

  it('returns 404 for an unknown publicId', async () => {
    const res = await request(app).get('/api/trips/does-not-exist/analytics');
    expect(res.status).toBe(404);
  });
});

