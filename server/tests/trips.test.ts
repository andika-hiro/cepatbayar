import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { createAuthedUser } from './helpers/auth';
import { db } from '../src/db/client';
import { trips, subTrips, debts, tripMembers as tripMembersTable } from '../src/db/schema';
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

  it('returns 404 for an unknown publicId', async () => {
    const res = await request(app).get('/api/trips/does-not-exist/summary');
    expect(res.status).toBe(404);
  });
});
