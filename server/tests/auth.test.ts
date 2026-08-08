import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { authTokens, users } from '../src/db/schema';

vi.mock('../src/mail', () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
}));

import { sendMagicLinkEmail } from '../src/mail';

const app = createApp();

describe('POST /api/auth/request-link', () => {
  it('creates a user and sends a magic link email', async () => {
    const res = await request(app).post('/api/auth/request-link').send({ email: 'budi@example.com' });
    expect(res.status).toBe(200);

    const [user] = await db.select().from(users).where(eq(users.email, 'budi@example.com'));
    expect(user).toBeDefined();

    expect(sendMagicLinkEmail).toHaveBeenCalledTimes(1);
    const [, link] = vi.mocked(sendMagicLinkEmail).mock.calls[0];
    expect(link).toContain('/api/auth/verify?token=');
  });

  it('rejects an invalid email', async () => {
    const res = await request(app).post('/api/auth/request-link').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/verify', () => {
  it('sets a session cookie and redirects for a valid token', async () => {
    await request(app).post('/api/auth/request-link').send({ email: 'anton@example.com' });
    const link = vi.mocked(sendMagicLinkEmail).mock.calls.at(-1)![1];
    const token = new URL(link).searchParams.get('token')!;

    const res = await request(app).get(`/api/auth/verify?token=${token}`);
    expect(res.status).toBe(302);
    expect(res.headers['set-cookie']?.[0]).toContain('cb_session=');
  });

  it('rejects an invalid token', async () => {
    const res = await request(app).get('/api/auth/verify?token=not-a-real-token');
    expect(res.status).toBe(400);
  });

  it('rejects a token that has already been used (single-use enforcement)', async () => {
    await request(app).post('/api/auth/request-link').send({ email: 'dewi@example.com' });
    const link = vi.mocked(sendMagicLinkEmail).mock.calls.at(-1)![1];
    const token = new URL(link).searchParams.get('token')!;

    const first = await request(app).get(`/api/auth/verify?token=${token}`);
    expect(first.status).toBe(302);

    const second = await request(app).get(`/api/auth/verify?token=${token}`);
    expect(second.status).toBe(400);
  });

  it('prefixes the redirect with CLIENT_URL when set, for cross-origin dev redirects', async () => {
    const original = process.env.CLIENT_URL;
    process.env.CLIENT_URL = 'http://localhost:5173';
    try {
      await request(app).post('/api/auth/request-link').send({ email: 'putri@example.com' });
      const link = vi.mocked(sendMagicLinkEmail).mock.calls.at(-1)![1];
      const token = new URL(link).searchParams.get('token')!;

      const res = await request(app).get(`/api/auth/verify?token=${token}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:5173/');
    } finally {
      process.env.CLIENT_URL = original;
    }
  });

  it('rejects a token whose auth_tokens row has already expired (expiry enforcement)', async () => {
    await db.insert(users).values({ email: 'expired-user@example.com' });
    const [user] = await db.select().from(users).where(eq(users.email, 'expired-user@example.com'));

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await db.insert(authTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request(app).get(`/api/auth/verify?token=${rawToken}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the user with a valid session cookie', async () => {
    await request(app).post('/api/auth/request-link').send({ email: 'citra@example.com' });
    const link = vi.mocked(sendMagicLinkEmail).mock.calls.at(-1)![1];
    const token = new URL(link).searchParams.get('token')!;
    const verifyRes = await request(app).get(`/api/auth/verify?token=${token}`);
    const cookie = verifyRes.headers['set-cookie']![0];

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('citra@example.com');
  });
});
