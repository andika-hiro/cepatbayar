import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

// This lives in its own test file (rather than alongside the other
// /api/auth/request-link tests) because the rate limiter's hit counter is a
// module-level singleton shared by every request to the route, keyed by
// client IP — and every supertest request in this process shares an IP.
// Vitest resets the module registry between test files, so this file gets a
// limiter with a clean slate instead of one already exhausted by the many
// request-link calls made throughout auth.test.ts.
vi.mock('../src/mail', () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
}));

describe('POST /api/auth/request-link rate limiting', () => {
  it('rejects the 6th request within the window with 429', async () => {
    const app = createApp();
    let lastRes;
    for (let i = 0; i < 6; i++) {
      lastRes = await request(app)
        .post('/api/auth/request-link')
        .send({ email: `ratelimit-${i}@example.com` });
    }
    expect(lastRes!.status).toBe(429);
  });

  it('derives client IP from X-Forwarded-For when set (trust proxy behavior)', async () => {
    const app = createApp();
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/auth/request-link')
        .set('X-Forwarded-For', '203.0.113.5')
        .send({ email: `test${i}@example.com` });
      expect(res.status).toBe(200);
    }
    // a 6th request from the SAME forwarded IP should be rate-limited
    const limited = await request(app)
      .post('/api/auth/request-link')
      .set('X-Forwarded-For', '203.0.113.5')
      .send({ email: 'test-limited@example.com' });
    expect(limited.status).toBe(429);

    // but a request from a DIFFERENT forwarded IP should NOT be limited yet
    const differentIp = await request(app)
      .post('/api/auth/request-link')
      .set('X-Forwarded-For', '203.0.113.99')
      .send({ email: 'test-different-ip@example.com' });
    expect(differentIp.status).toBe(200);
  });
});
