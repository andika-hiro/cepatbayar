import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE, verifySession } from './session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = typeof token === 'string' ? verifySession(token) : null;
  if (!session) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  req.userId = session.userId;
  next();
}
