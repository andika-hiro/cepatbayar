import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { trips, tripMembers } from '../db/schema';

export async function getTripByPublicId(publicId: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
  return trip ?? null;
}

export async function memberIdsBelongToTrip(tripId: number, memberIds: number[]): Promise<boolean> {
  if (memberIds.length === 0) return true;
  const uniqueIds = [...new Set(memberIds)];
  const rows = await db
    .select({ id: tripMembers.id, tripId: tripMembers.tripId })
    .from(tripMembers)
    .where(inArray(tripMembers.id, uniqueIds));
  if (rows.length !== uniqueIds.length) return false;
  return rows.every((r) => r.tripId === tripId);
}
