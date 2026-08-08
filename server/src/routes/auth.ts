import crypto from 'node:crypto';
import { Router } from 'express';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { authTokens, users } from '../db/schema';
import { sendMagicLinkEmail } from '../mail';
import { requireAuth } from '../auth/requireAuth';
import { SESSION_COOKIE, SESSION_MAX_AGE_MS, signSession } from '../auth/session';

const router = Router();

const requestLinkSchema = z.object({
  email: z.string().email(),
  redirect: z.string().startsWith('/').optional(),
});

router.post('/request-link', async (req, res) => {
  const parsed = requestLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_email' });
    return;
  }
  const { email, redirect } = parsed.data;

  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    await db.insert(users).values({ email });
    [user] = await db.select().from(users).where(eq(users.email, email));
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(authTokens).values({ userId: user.id, tokenHash, expiresAt });

  const appUrl = process.env.APP_URL ?? 'http://localhost:4000';
  const link = `${appUrl}/api/auth/verify?token=${rawToken}&redirect=${encodeURIComponent(redirect ?? '/')}`;
  await sendMagicLinkEmail(email, link);

  res.status(200).json({ ok: true });
});

router.get('/verify', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const redirectParam = typeof req.query.redirect === 'string' ? req.query.redirect : '/';
  const safeRedirect = redirectParam.startsWith('/') && !redirectParam.startsWith('//') ? redirectParam : '/';

  if (!token) {
    res.status(400).send('Link tidak valid.');
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const [row] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, tokenHash), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())));

  if (!row) {
    res.status(400).send('Link sudah dipakai atau kedaluwarsa.');
    return;
  }

  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));

  const sessionToken = signSession({ userId: row.userId });
  res.cookie(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS,
  });

  const clientUrl = process.env.CLIENT_URL ?? '';
  res.redirect(`${clientUrl}${safeRedirect}`);
});

router.get('/me', requireAuth, async (req, res) => {
  const [user] = await db.select().from(users).where(eq(users.id, req.userId!));
  if (!user) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  res.json({ id: user.id, email: user.email });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.status(200).json({ ok: true });
});

export default router;
