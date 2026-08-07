import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { users } from '../src/db/schema';

describe('database connection', () => {
  it('inserts and reads back a user', async () => {
    await db.insert(users).values({ email: 'test@example.com' });
    const [user] = await db.select().from(users).where(eq(users.email, 'test@example.com'));
    expect(user).toBeDefined();
    expect(user.email).toBe('test@example.com');
  });
});
