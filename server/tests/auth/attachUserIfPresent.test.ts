import { describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { attachUserIfPresent } from '../../src/auth/attachUserIfPresent';
import { signSession, SESSION_COOKIE } from '../../src/auth/session';

function buildTestApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/whoami', attachUserIfPresent, (req, res) => {
    res.json({ userId: req.userId ?? null });
  });
  return app;
}

describe('attachUserIfPresent', () => {
  it('sets req.userId when a valid session cookie is present', async () => {
    const app = buildTestApp();
    const token = signSession({ userId: 42 });
    const res = await request(app).get('/whoami').set('Cookie', `${SESSION_COOKIE}=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(42);
  });

  it('leaves req.userId undefined and does not reject when no cookie is present', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/whoami');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBeNull();
  });

  it('leaves req.userId undefined and does not reject when the cookie is invalid', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/whoami').set('Cookie', `${SESSION_COOKIE}=not-a-real-token`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBeNull();
  });
});
