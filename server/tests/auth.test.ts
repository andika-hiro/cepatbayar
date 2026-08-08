import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { users } from '../src/db/schema';

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
