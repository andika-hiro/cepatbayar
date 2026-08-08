import { Router } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../db/client';
import { tripMembers, trips, subTrips, debts } from '../db/schema';
import { requireAuth } from '../auth/requireAuth';
import { isoDateSchema } from '../lib/validators';
import { getTripByPublicId } from '../lib/tripAccess';

const router = Router();

const createTripSchema = z
  .object({
    name: z.string().trim().min(1),
    destination: z.string().trim().min(1),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    members: z.array(z.string().trim().min(1)).min(1),
  })
  .refine((data) => data.startDate <= data.endDate, { message: 'end_before_start', path: ['endDate'] });

async function summarizeTrips(tripRows: (typeof trips.$inferSelect)[]) {
  if (tripRows.length === 0) return [];
  const ids = tripRows.map((t) => t.id);
  const members = await db.select().from(tripMembers).where(inArray(tripMembers.tripId, ids));
  const countByTripId = new Map<number, number>();
  for (const m of members) {
    countByTripId.set(m.tripId, (countByTripId.get(m.tripId) ?? 0) + 1);
  }

  const unsettledDebtRows = await db
    .select({ tripId: subTrips.tripId, debtId: debts.id })
    .from(debts)
    .innerJoin(subTrips, eq(debts.subTripId, subTrips.id))
    .where(and(inArray(subTrips.tripId, ids), eq(debts.settled, false)));
  const unsettledCountByTripId = new Map<number, number>();
  for (const row of unsettledDebtRows) {
    unsettledCountByTripId.set(row.tripId, (unsettledCountByTripId.get(row.tripId) ?? 0) + 1);
  }

  return tripRows.map((t) => ({
    publicId: t.publicId,
    name: t.name,
    destination: t.destination,
    startDate: t.startDate,
    endDate: t.endDate,
    memberCount: countByTripId.get(t.id) ?? 0,
    unsettledCount: unsettledCountByTripId.get(t.id) ?? 0,
  }));
}

router.post('/', requireAuth, async (req, res) => {
  const parsed = createTripSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }
  const { name, destination, startDate, endDate, members } = parsed.data;
  const publicId = nanoid(16);

  await db.transaction(async (tx) => {
    const [result] = await tx
      .insert(trips)
      .values({ publicId, name, destination, startDate, endDate, creatorUserId: req.userId! });
    const tripId = result.insertId;

    await tx.insert(tripMembers).values(members.map((memberName) => ({ tripId, name: memberName })));
  });

  res.status(201).json({ publicId });
});

router.get('/mine', requireAuth, async (req, res) => {
  const rows = await db.select().from(trips).where(eq(trips.creatorUserId, req.userId!));
  res.json(await summarizeTrips(rows));
});

const summarySchema = z.object({
  publicIds: z.array(z.string()).max(50),
});

router.post('/summary', async (req, res) => {
  const parsed = summarySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }
  if (parsed.data.publicIds.length === 0) {
    res.json([]);
    return;
  }
  const rows = await db.select().from(trips).where(inArray(trips.publicId, parsed.data.publicIds));
  res.json(await summarizeTrips(rows));
});

router.get('/:publicId', async (req, res) => {
  const trip = await getTripByPublicId(req.params.publicId);
  if (!trip) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
  res.json({
    publicId: trip.publicId,
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    members: members.map((m) => ({ id: m.id, name: m.name })),
  });
});

router.get('/:publicId/summary', async (req, res) => {
  const trip = await getTripByPublicId(req.params.publicId);
  if (!trip) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));

  const debtRows = await db
    .select({ debtMemberId: debts.memberId, debtAmount: debts.amount, debtSettled: debts.settled, payerMemberId: subTrips.payerMemberId })
    .from(debts)
    .innerJoin(subTrips, eq(debts.subTripId, subTrips.id))
    .where(eq(subTrips.tripId, trip.id));

  const rollups = new Map<number, number>();
  for (const m of members) rollups.set(m.id, 0);
  for (const row of debtRows) {
    if (row.debtSettled) continue;
    rollups.set(row.payerMemberId, (rollups.get(row.payerMemberId) ?? 0) + row.debtAmount);
    rollups.set(row.debtMemberId, (rollups.get(row.debtMemberId) ?? 0) - row.debtAmount);
  }

  const memberSummaries = members.map((m) => {
    const rollup = rollups.get(m.id) ?? 0;
    const status = rollup > 0 ? 'dilunasin' : rollup < 0 ? 'ngutang' : 'lunas';
    return { memberId: m.id, name: m.name, rollup, status };
  });

  const subTripRows = await db.select({ amount: subTrips.amount }).from(subTrips).where(eq(subTrips.tripId, trip.id));
  const tripTotal = subTripRows.reduce((sum, r) => sum + r.amount, 0);

  res.json({ members: memberSummaries, tripTotal });
});

export default router;
