import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client';
import { users } from '../../src/db/schema';
import { SESSION_COOKIE, signSession } from '../../src/auth/session';

export async function createAuthedUser(email: string) {
  await db.insert(users).values({ email });
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const token = signSession({ userId: user.id });
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}
