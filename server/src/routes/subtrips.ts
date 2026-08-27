import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import rateLimit, { MemoryStore } from 'express-rate-limit';
import { db } from '../db/client';
import { debts, subTrips, tripMembers, subTripItems, subTripItemParticipants, deposits } from '../db/schema';
import { getTripByPublicId, memberIdsBelongToTrip } from '../lib/tripAccess';
import { computeEqualShares, reconcileDebts } from '../lib/splitLogic';
import { computeItemBasedShares } from '../lib/itemSplitLogic';
import { computeDynamicDeposits } from '../lib/depositLogic';

import { isoDateSchema } from '../lib/validators';
import { attachUserIfPresent } from '../auth/attachUserIfPresent';

const router = Router({ mergeParams: true });

const categoryEnum = z.enum(['makan', 'transport', 'nginap', 'tiket_wisata', 'lainnya']);

const itemParticipantSchema = z.object({
  memberId: z.number().int().positive(),
  billedToMemberId: z.number().int().positive().optional(),
});

const itemInputSchema = z.object({
  name: z.string().trim().min(1),
  price: z.number().int().positive(),
  participants: z.array(itemParticipantSchema).min(1),
});

const totalModeSchema = z.object({
  name: z.string().trim().min(1),
  category: categoryEnum,
  date: isoDateSchema,
  payerMemberId: z.number().int().positive(),
  createdByMemberId: z.number().int().positive(),
  splitMode: z.literal('total'),
  amount: z.number().int().positive(),
  participantMemberIds: z.array(z.number().int().positive()).min(1),
});

const perItemModeSchema = z.object({
  name: z.string().trim().min(1),
  category: categoryEnum,
  date: isoDateSchema,
  payerMemberId: z.number().int().positive(),
  createdByMemberId: z.number().int().positive(),
  splitMode: z.literal('per_item'),
  taxPercent: z.number().min(0).max(100).default(0),
  servicePercent: z.number().min(0).max(100).default(0),
  items: z.array(itemInputSchema).min(1),
});

export const subTripInputSchema = z.discriminatedUnion('splitMode', [totalModeSchema, perItemModeSchema]);

// Exported so tests can reset the counter between cases — the store is a
// module-level singleton keyed by client IP, and every supertest request in
// a test run shares an IP, so without a reset the many legitimate
// POST /subtrips calls made across a test file would trip the limiter. This
// is a more generous limit than the auth request-link limiter since adding
// expenses is a frequently-used, legitimate feature rather than a rarely-used
// login action.
export const createSubTripLimiterStore = new MemoryStore();

const createSubTripLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createSubTripLimiterStore,
});

async function canModifySubTrip(req: Request, trip: NonNullable<Awaited<ReturnType<typeof getTripByPublicId>>>, createdByMemberId: number): Promise<boolean> {
  const isCreatorUser = req.userId !== undefined && req.userId === trip.creatorUserId;
  const claimedMemberIdHeader = req.header('X-Member-Id');
  const isOriginalAdder = claimedMemberIdHeader !== undefined && Number(claimedMemberIdHeader) === createdByMemberId;
  return isCreatorUser || isOriginalAdder;
}

// Shared preamble for every route scoped to a single sub trip
// (:publicId/:subTripId): looks up the trip, safely parses subTripId (never
// letting a non-numeric segment reach the DB as NaN), and loads the sub trip
// scoped to that trip. Writes a 404 and returns null on any failure so
// callers can just do `if (!loaded) return;`.
async function loadScopedSubTrip(
  req: Request,
  res: Response,
): Promise<{ trip: NonNullable<Awaited<ReturnType<typeof getTripByPublicId>>>; subTrip: typeof subTrips.$inferSelect } | null> {
  const trip = await getTripByPublicId(req.params.publicId);
  if (!trip) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  const subTripId = Number(req.params.subTripId);
  if (!Number.isInteger(subTripId) || subTripId <= 0) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  const [subTrip] = await db.select().from(subTrips).where(and(eq(subTrips.id, subTripId), eq(subTrips.tripId, trip.id)));
  if (!subTrip) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  return { trip, subTrip };
}

router.post<{ publicId: string }>('/', createSubTripLimiter, async (req, res) => {
  const trip = await getTripByPublicId(req.params.publicId);
  if (!trip) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const parsed = subTripInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }
  const data = parsed.data;

  if (data.splitMode === 'total') {
    const allIds = [...new Set([data.payerMemberId, data.createdByMemberId, ...data.participantMemberIds])];
    const valid = await memberIdsBelongToTrip(trip.id, allIds);
    if (!valid) {
      res.status(400).json({ error: 'invalid_member' });
      return;
    }

    const shares = computeEqualShares(data.amount, data.participantMemberIds, data.payerMemberId);
    const payerParticipates = data.participantMemberIds.includes(data.payerMemberId);

    const subTripId = await db.transaction(async (tx) => {
      const [result] = await tx.insert(subTrips).values({
        tripId: trip.id, name: data.name, category: data.category, date: data.date,
        payerMemberId: data.payerMemberId, amount: data.amount, payerParticipates,
        createdByMemberId: data.createdByMemberId, splitMode: 'total',
      });
      const newSubTripId = result.insertId;
      if (shares.size > 0) {
        await tx.insert(debts).values(
          [...shares.entries()].map(([memberId, amount]) => ({ subTripId: newSubTripId, memberId, amount })),
        );
      }
      return newSubTripId;
    });

    res.status(201).json({ id: subTripId });
    return;
  }

  // splitMode === 'per_item'
  const itemMemberIds = data.items.flatMap((item) =>
    item.participants.flatMap((p) => (p.billedToMemberId ? [p.memberId, p.billedToMemberId] : [p.memberId])),
  );
  const allIds = [...new Set([data.payerMemberId, data.createdByMemberId, ...itemMemberIds])];
  const valid = await memberIdsBelongToTrip(trip.id, allIds);
  if (!valid) {
    res.status(400).json({ error: 'invalid_member' });
    return;
  }

  const split = computeItemBasedShares(data.items, data.taxPercent, data.servicePercent, data.payerMemberId);
  const payerParticipates = data.items.some((item) => item.participants.some((p) => p.memberId === data.payerMemberId));

  const subTripId = await db.transaction(async (tx) => {
    const [insertResult] = await tx.insert(subTrips).values({
      tripId: trip.id, name: data.name, category: data.category, date: data.date,
      payerMemberId: data.payerMemberId, amount: split.grandTotal, payerParticipates,
      createdByMemberId: data.createdByMemberId, splitMode: 'per_item',
      taxPercent: data.taxPercent, servicePercent: data.servicePercent,
    });
    const newSubTripId = insertResult.insertId;

    for (const item of data.items) {
      const [itemResult] = await tx.insert(subTripItems).values({ subTripId: newSubTripId, name: item.name, price: item.price });
      const newItemId = itemResult.insertId;
      await tx.insert(subTripItemParticipants).values(
        item.participants.map((p) => ({ itemId: newItemId, memberId: p.memberId, billedToMemberId: p.billedToMemberId ?? null })),
      );
    }

    if (split.shares.size > 0) {
      await tx.insert(debts).values(
        [...split.shares.entries()].map(([memberId, amount]) => ({ subTripId: newSubTripId, memberId, amount })),
      );
    }
    return newSubTripId;
  });

  res.status(201).json({ id: subTripId });
});

router.get<{ publicId: string }>('/', async (req, res) => {
  const trip = await getTripByPublicId(req.params.publicId);
  if (!trip) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const rows = await db.select().from(subTrips).where(eq(subTrips.tripId, trip.id));
  if (rows.length === 0) {
    res.json([]);
    return;
  }

  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
  const memberMap = new Map(members.map((p) => [p.id, p.name]));

  const depositRows = await db.select().from(deposits).where(eq(deposits.tripId, trip.id));
  const formattedDeposits = depositRows.map((dp) => ({
    id: dp.id,
    fromMemberId: dp.fromMemberId,
    fromName: memberMap.get(dp.fromMemberId) || 'Unknown',
    toMemberId: dp.toMemberId,
    toName: memberMap.get(dp.toMemberId) || 'Unknown',
    amount: dp.amount,
  }));

  const allDebts = await db
    .select({
      id: debts.id,
      subTripId: debts.subTripId,
      memberId: debts.memberId,
      amount: debts.amount,
      settled: debts.settled,
      payerMemberId: subTrips.payerMemberId,
      subTripName: subTrips.name,
      date: subTrips.date,
    })
    .from(debts)
    .innerJoin(subTrips, eq(debts.subTripId, subTrips.id))
    .where(eq(subTrips.tripId, trip.id));

  const rawDebts = allDebts.map((d) => ({
    id: d.id,
    subTripId: d.subTripId,
    subTripName: d.subTripName,
    debtorId: d.memberId,
    debtorName: memberMap.get(d.memberId) || 'Unknown',
    creditorId: d.payerMemberId,
    creditorName: memberMap.get(d.payerMemberId) || 'Unknown',
    amount: d.amount,
    date: d.date,
    settled: d.settled,
  }));

  const { annotatedDebts } = computeDynamicDeposits(rawDebts, formattedDeposits);

  const unsettledCountBySubTrip = new Map<number, number>();
  for (const d of annotatedDebts) {
    if (!d.settled) {
      unsettledCountBySubTrip.set(d.subTripId, (unsettledCountBySubTrip.get(d.subTripId) ?? 0) + 1);
    }
  }

  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      date: r.date,
      payerMemberId: r.payerMemberId,
      payerName: memberMap.get(r.payerMemberId) ?? '',
      amount: r.amount,
      unsettledCount: unsettledCountBySubTrip.get(r.id) ?? 0,
    })),
  );
});

router.get<{ publicId: string; subTripId: string }>('/:subTripId', async (req, res) => {
  const loaded = await loadScopedSubTrip(req, res);
  if (!loaded) return;
  const { trip, subTrip } = loaded;

  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
  const memberMap = new Map(members.map((m) => [m.id, m.name]));
  const payer = members.find((m) => m.id === subTrip.payerMemberId);

  const depositRows = await db.select().from(deposits).where(eq(deposits.tripId, trip.id));
  const formattedDeposits = depositRows.map((dp) => ({
    id: dp.id,
    fromMemberId: dp.fromMemberId,
    fromName: memberMap.get(dp.fromMemberId) || 'Unknown',
    toMemberId: dp.toMemberId,
    toName: memberMap.get(dp.toMemberId) || 'Unknown',
    amount: dp.amount,
  }));

  const allDebts = await db
    .select({
      id: debts.id,
      subTripId: debts.subTripId,
      memberId: debts.memberId,
      amount: debts.amount,
      settled: debts.settled,
      settledByMemberId: debts.settledByMemberId,
      payerMemberId: subTrips.payerMemberId,
      subTripName: subTrips.name,
      date: subTrips.date,
    })
    .from(debts)
    .innerJoin(subTrips, eq(debts.subTripId, subTrips.id))
    .where(eq(subTrips.tripId, trip.id));

  const rawDebts = allDebts.map((d) => ({
    id: d.id,
    subTripId: d.subTripId,
    subTripName: d.subTripName,
    debtorId: d.memberId,
    debtorName: memberMap.get(d.memberId) || 'Unknown',
    creditorId: d.payerMemberId,
    creditorName: memberMap.get(d.payerMemberId) || 'Unknown',
    amount: d.amount,
    date: d.date,
    settled: d.settled,
    settledByMemberId: d.settledByMemberId,
    settledByMemberName: d.settledByMemberId ? memberMap.get(d.settledByMemberId) || null : null,
  }));

  const { annotatedDebts } = computeDynamicDeposits(rawDebts, formattedDeposits);
  const subTripAnnotatedDebts = annotatedDebts.filter((d) => d.subTripId === subTrip.id);

  let items: {
    id: number;
    name: string;
    price: number;
    participants: { memberId: number; name: string; billedToMemberId: number | null; billedToName: string | null }[];
  }[] = [];

  if (subTrip.splitMode === 'per_item') {
    const itemRows = await db.select().from(subTripItems).where(eq(subTripItems.subTripId, subTrip.id));
    const itemIds = itemRows.map((i) => i.id);
    const participantRows = itemIds.length
      ? await db.select().from(subTripItemParticipants).where(inArray(subTripItemParticipants.itemId, itemIds))
      : [];
    const participantMemberIds = [
      ...new Set(participantRows.flatMap((p) => (p.billedToMemberId ? [p.memberId, p.billedToMemberId] : [p.memberId]))),
    ];
    const participantMembers = participantMemberIds.length
      ? await db.select().from(tripMembers).where(inArray(tripMembers.id, participantMemberIds))
      : [];
    const participantNameById = new Map(participantMembers.map((m) => [m.id, m.name]));

    items = itemRows.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      participants: participantRows
        .filter((p) => p.itemId === item.id)
        .map((p) => ({
          memberId: p.memberId,
          name: participantNameById.get(p.memberId) ?? '',
          billedToMemberId: p.billedToMemberId,
          billedToName: p.billedToMemberId ? participantNameById.get(p.billedToMemberId) ?? '' : null,
        })),
    }));
  }

  res.json({
    id: subTrip.id,
    name: subTrip.name,
    category: subTrip.category,
    date: subTrip.date,
    payerMemberId: subTrip.payerMemberId,
    payerName: payer?.name ?? '',
    amount: subTrip.amount,
    payerParticipates: subTrip.payerParticipates,
    createdByMemberId: subTrip.createdByMemberId,
    splitMode: subTrip.splitMode,
    taxPercent: Number(subTrip.taxPercent),
    servicePercent: Number(subTrip.servicePercent),
    items,
    debts: subTripAnnotatedDebts.map((d) => ({
      id: d.id,
      memberId: d.debtorId,
      name: d.debtorName,
      amount: d.amount,
      settled: d.settled,
      settledByMemberId: d.settledByMemberId,
      settledByMemberName: d.settledByMemberName,
      depositNote: d.depositNote,
      coveredByDeposit: d.coveredByDeposit,
    })),
  });
});


router.patch<{ publicId: string; subTripId: string }>('/:subTripId', attachUserIfPresent, async (req, res) => {
  const loaded = await loadScopedSubTrip(req, res);
  if (!loaded) return;
  const { trip, subTrip: existing } = loaded;

  const authorized = await canModifySubTrip(req, trip, existing.createdByMemberId);
  if (!authorized) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  const parsed = subTripInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }
  const data = parsed.data;

  if (data.splitMode !== existing.splitMode) {
    res.status(400).json({ error: 'split_mode_locked' });
    return;
  }

  const claimedMemberIdHeader = req.header('X-Member-Id');
  const updatedByMemberId = claimedMemberIdHeader ? Number(claimedMemberIdHeader) : existing.createdByMemberId;

  if (data.splitMode === 'total') {
    const allIds = [...new Set([data.payerMemberId, data.createdByMemberId, ...data.participantMemberIds])];
    const valid = await memberIdsBelongToTrip(trip.id, allIds);
    if (!valid) {
      res.status(400).json({ error: 'invalid_member' });
      return;
    }

    const shares = computeEqualShares(data.amount, data.participantMemberIds, data.payerMemberId);
    const payerParticipates = data.participantMemberIds.includes(data.payerMemberId);
    const existingDebtRows = await db.select().from(debts).where(eq(debts.subTripId, existing.id));
    const reconciled = reconcileDebts(
      existingDebtRows.map((d) => ({ id: d.id, memberId: d.memberId, settled: d.settled })),
      shares,
    );

    await db.transaction(async (tx) => {
      await tx
        .update(subTrips)
        .set({ name: data.name, category: data.category, date: data.date, payerMemberId: data.payerMemberId, amount: data.amount, payerParticipates, updatedByMemberId })
        .where(eq(subTrips.id, existing.id));

      for (const del of reconciled.toDelete) await tx.delete(debts).where(eq(debts.id, del.id));
      for (const upd of reconciled.toUpdateAmount) await tx.update(debts).set({ amount: upd.amount }).where(eq(debts.id, upd.id));
      if (reconciled.toInsert.length > 0) {
        await tx.insert(debts).values(reconciled.toInsert.map((i) => ({ subTripId: existing.id, memberId: i.memberId, amount: i.amount })));
      }
    });

    res.status(200).json({ id: existing.id });
    return;
  }

  // splitMode === 'per_item'
  const itemMemberIds = data.items.flatMap((item) =>
    item.participants.flatMap((p) => (p.billedToMemberId ? [p.memberId, p.billedToMemberId] : [p.memberId])),
  );
  const allIds = [...new Set([data.payerMemberId, data.createdByMemberId, ...itemMemberIds])];
  const valid = await memberIdsBelongToTrip(trip.id, allIds);
  if (!valid) {
    res.status(400).json({ error: 'invalid_member' });
    return;
  }

  const split = computeItemBasedShares(data.items, data.taxPercent, data.servicePercent, data.payerMemberId);
  const payerParticipates = data.items.some((item) => item.participants.some((p) => p.memberId === data.payerMemberId));
  const existingDebtRows = await db.select().from(debts).where(eq(debts.subTripId, existing.id));
  const reconciled = reconcileDebts(
    existingDebtRows.map((d) => ({ id: d.id, memberId: d.memberId, settled: d.settled })),
    split.shares,
  );

  await db.transaction(async (tx) => {
    await tx
      .update(subTrips)
      .set({
        name: data.name, category: data.category, date: data.date, payerMemberId: data.payerMemberId,
        amount: split.grandTotal, payerParticipates, taxPercent: data.taxPercent, servicePercent: data.servicePercent, updatedByMemberId,
      })
      .where(eq(subTrips.id, existing.id));

    const oldItemRows = await tx.select().from(subTripItems).where(eq(subTripItems.subTripId, existing.id));
    const oldItemIds = oldItemRows.map((i) => i.id);
    if (oldItemIds.length > 0) {
      await tx.delete(subTripItemParticipants).where(inArray(subTripItemParticipants.itemId, oldItemIds));
      await tx.delete(subTripItems).where(eq(subTripItems.subTripId, existing.id));
    }
    for (const item of data.items) {
      const [itemResult] = await tx.insert(subTripItems).values({ subTripId: existing.id, name: item.name, price: item.price });
      const newItemId = itemResult.insertId;
      await tx.insert(subTripItemParticipants).values(
        item.participants.map((p) => ({ itemId: newItemId, memberId: p.memberId, billedToMemberId: p.billedToMemberId ?? null })),
      );
    }

    for (const del of reconciled.toDelete) await tx.delete(debts).where(eq(debts.id, del.id));
    for (const upd of reconciled.toUpdateAmount) await tx.update(debts).set({ amount: upd.amount }).where(eq(debts.id, upd.id));
    if (reconciled.toInsert.length > 0) {
      await tx.insert(debts).values(reconciled.toInsert.map((i) => ({ subTripId: existing.id, memberId: i.memberId, amount: i.amount })));
    }
  });

  res.status(200).json({ id: existing.id });
});

router.delete<{ publicId: string; subTripId: string }>('/:subTripId', attachUserIfPresent, async (req, res) => {
  const loaded = await loadScopedSubTrip(req, res);
  if (!loaded) return;
  const { trip, subTrip: existing } = loaded;

  const authorized = await canModifySubTrip(req, trip, existing.createdByMemberId);
  if (!authorized) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  await db.transaction(async (tx) => {
    const itemRows = await tx.select().from(subTripItems).where(eq(subTripItems.subTripId, existing.id));
    const itemIds = itemRows.map((i) => i.id);
    if (itemIds.length > 0) {
      await tx.delete(subTripItemParticipants).where(inArray(subTripItemParticipants.itemId, itemIds));
      await tx.delete(subTripItems).where(eq(subTripItems.subTripId, existing.id));
    }
    await tx.delete(debts).where(eq(debts.subTripId, existing.id));
    await tx.delete(subTrips).where(eq(subTrips.id, existing.id));
  });

  res.status(200).json({ ok: true });
});

const toggleDebtSchema = z.object({
  settled: z.boolean(),
  settledByMemberId: z.number().int().positive().optional(),
});

router.patch<{ publicId: string; subTripId: string; debtId: string }>('/:subTripId/debts/:debtId', async (req, res) => {
  const loaded = await loadScopedSubTrip(req, res);
  if (!loaded) return;
  const { subTrip } = loaded;

  const parsed = toggleDebtSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }

  const debtId = Number(req.params.debtId);
  if (!Number.isInteger(debtId) || debtId <= 0) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const [debt] = await db.select().from(debts).where(and(eq(debts.id, debtId), eq(debts.subTripId, subTrip.id)));
  if (!debt) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const claimedMemberIdHeader = req.header('X-Member-Id');
  const settledByMemberId = parsed.data.settled
    ? (parsed.data.settledByMemberId ?? (claimedMemberIdHeader ? Number(claimedMemberIdHeader) : null))
    : null;

  await db
    .update(debts)
    .set({
      settled: parsed.data.settled,
      settledAt: parsed.data.settled ? new Date() : null,
      settledByMemberId: settledByMemberId,
    })
    .where(eq(debts.id, debtId));

  res.status(200).json({ ok: true });
});

export default router;
