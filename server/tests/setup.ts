import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

import { beforeEach } from 'vitest';
import { db } from '../src/db/client';
import { authTokens, tripMembers, trips, users, subTrips, debts, subTripItems, subTripItemParticipants } from '../src/db/schema';

beforeEach(async () => {
  await db.delete(subTripItemParticipants);
  await db.delete(subTripItems);
  await db.delete(debts);
  await db.delete(subTrips);
  await db.delete(tripMembers);
  await db.delete(trips);
  await db.delete(authTokens);
  await db.delete(users);
});
