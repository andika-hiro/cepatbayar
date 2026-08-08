import jwt from 'jsonwebtoken';

const JWT_SECRET =
  process.env.JWT_SECRET ??
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('JWT_SECRET must be set in production');
      })()
    : 'dev-secret-change-me');
export const SESSION_COOKIE = 'cb_session';
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionPayload {
  userId: number;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}
