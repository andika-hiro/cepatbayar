import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

import { beforeEach } from 'vitest';
import { db } from '../src/db/client';
import { authTokens, tripMembers, trips, users } from '../src/db/schema';

beforeEach(async () => {
  await db.delete(tripMembers);
  await db.delete(trips);
  await db.delete(authTokens);
  await db.delete(users);
});
