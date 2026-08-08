import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { trips, tripMembers } from '../src/db/schema';
import { createAuthedUser } from './helpers/auth';

// This lives in its own test file (rather than alongside the other
// POST /subtrips tests) because the rate limiter's hit counter is a
// module-level singleton keyed by client IP, and every supertest request in
// a test run shares an IP — see rateLimit.test.ts for the same rationale
// applied to the auth request-link limiter. Vitest resets the module
// registry between test files, so this file gets a limiter with a clean
// slate instead of one already exercised by the many legitimate
// POST /subtrips calls made throughout subtrips.test.ts and
// subtrips-edit-delete.test.ts.
async function createTestTrip(app: ReturnType<typeof createApp>, email: string, memberNames: string[]) {
  const { cookie } = await createAuthedUser(email);
  const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
    name: 'Test Trip', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02', members: memberNames,
  });
  const { publicId } = createRes.body;
  const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
  return { publicId, members };
}

describe('POST /api/trips/:publicId/subtrips rate limiting', () => {
  // The limiter store is a module-level singleton keyed by client IP, shared
  // by both `it`s below (they run against the same imported module within
  // this file). Each test uses a distinct X-Forwarded-For IP — the app has
  // `trust proxy` enabled — so the two tests' request counts don't bleed
  // into each other, mirroring the pattern already used for the auth
  // request-link limiter's tests.
  it('rejects the 31st request within the window with 429', async () => {
    const app = createApp();
    const { publicId, members } = await createTestTrip(app, 'subtrip-ratelimit@example.com', ['Budi']);
    const budi = members[0];
    let lastRes;
    for (let i = 0; i < 31; i++) {
      lastRes = await request(app)
        .post(`/api/trips/${publicId}/subtrips`)
        .set('X-Forwarded-For', '198.51.100.10')
        .send({
          name: `Item ${i}`, category: 'makan', date: '2026-01-01',
          payerMemberId: budi.id, amount: 1000, participantMemberIds: [budi.id], createdByMemberId: budi.id,
        });
    }
    expect(lastRes!.status).toBe(429);
  });

  it('allows up to the limit without being rate-limited', async () => {
    const app = createApp();
    const { publicId, members } = await createTestTrip(app, 'subtrip-ratelimit-ok@example.com', ['Budi']);
    const budi = members[0];
    for (let i = 0; i < 30; i++) {
      const res = await request(app)
        .post(`/api/trips/${publicId}/subtrips`)
        .set('X-Forwarded-For', '198.51.100.20')
        .send({
          name: `Item ${i}`, category: 'makan', date: '2026-01-01',
          payerMemberId: budi.id, amount: 1000, participantMemberIds: [budi.id], createdByMemberId: budi.id,
        });
      expect(res.status).toBe(201);
    }
  });
});
