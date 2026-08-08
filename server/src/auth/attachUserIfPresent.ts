import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE, verifySession } from './session';

export function attachUserIfPresent(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = typeof token === 'string' ? verifySession(token) : null;
  if (session) {
    req.userId = session.userId;
  }
  next();
}
