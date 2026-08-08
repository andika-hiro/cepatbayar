import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import rateLimit, { MemoryStore } from 'express-rate-limit';
import { db } from '../db/client';
import { debts, subTrips, tripMembers } from '../db/schema';
import { getTripByPublicId, memberIdsBelongToTrip } from '../lib/tripAccess';
import { computeEqualShares, reconcileDebts } from '../lib/splitLogic';
import { isoDateSchema } from '../lib/validators';
import { attachUserIfPresent } from '../auth/attachUserIfPresent';

const router = Router({ mergeParams: true });

const categoryEnum = z.enum(['makan', 'transport', 'nginap', 'tiket_wisata', 'lainnya']);

export const subTripInputSchema = z.object({
  name: z.string().trim().min(1),
  category: categoryEnum,
  date: isoDateSchema,
  payerMemberId: z.number().int().positive(),
  amount: z.number().int().positive(),
  participantMemberIds: z.array(z.number().int().positive()).min(1),
  createdByMemberId: z.number().int().positive(),
});

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
  const { name, category, date, payerMemberId, amount, participantMemberIds, createdByMemberId } = parsed.data;

  const allIds = [...new Set([payerMemberId, createdByMemberId, ...participantMemberIds])];
  const valid = await memberIdsBelongToTrip(trip.id, allIds);
  if (!valid) {
    res.status(400).json({ error: 'invalid_member' });
    return;
  }

  const shares = computeEqualShares(amount, participantMemberIds, payerMemberId);
  const payerParticipates = participantMemberIds.includes(payerMemberId);

  const subTripId = await db.transaction(async (tx) => {
    const [result] = await tx.insert(subTrips).values({
      tripId: trip.id, name, category, date, payerMemberId, amount, payerParticipates, createdByMemberId,
    });
    const newSubTripId = result.insertId;
    if (shares.size > 0) {
      await tx.insert(debts).values(
        [...shares.entries()].map(([memberId, shareAmount]) => ({
          subTripId: newSubTripId, memberId, amount: shareAmount,
        })),
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

  const payerIds = [...new Set(rows.map((r) => r.payerMemberId))];
  const payers = await db.select().from(tripMembers).where(inArray(tripMembers.id, payerIds));
  const payerNameById = new Map(payers.map((p) => [p.id, p.name]));

  const subTripIds = rows.map((r) => r.id);
  const unsettledRows = await db
    .select({ subTripId: debts.subTripId })
    .from(debts)
    .where(and(inArray(debts.subTripId, subTripIds), eq(debts.settled, false)));
  const unsettledCountBySubTrip = new Map<number, number>();
  for (const r of unsettledRows) {
    unsettledCountBySubTrip.set(r.subTripId, (unsettledCountBySubTrip.get(r.subTripId) ?? 0) + 1);
  }

  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      date: r.date,
      payerMemberId: r.payerMemberId,
      payerName: payerNameById.get(r.payerMemberId) ?? '',
      amount: r.amount,
      unsettledCount: unsettledCountBySubTrip.get(r.id) ?? 0,
    })),
  );
});

router.get<{ publicId: string; subTripId: string }>('/:subTripId', async (req, res) => {
  const loaded = await loadScopedSubTrip(req, res);
  if (!loaded) return;
  const { subTrip } = loaded;

  const [payer] = await db.select().from(tripMembers).where(eq(tripMembers.id, subTrip.payerMemberId));
  const debtRows = await db.select().from(debts).where(eq(debts.subTripId, subTrip.id));
  const debtMemberIds = [...new Set(debtRows.map((d) => d.memberId))];
  const debtMembers = debtMemberIds.length
    ? await db.select().from(tripMembers).where(inArray(tripMembers.id, debtMemberIds))
    : [];
  const nameById = new Map(debtMembers.map((m) => [m.id, m.name]));

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
    debts: debtRows.map((d) => ({ id: d.id, memberId: d.memberId, name: nameById.get(d.memberId) ?? '', amount: d.amount, settled: d.settled })),
  });
});

router.patch<{ publicId: string; subTripId: string }>('/:subTripId', attachUserIfPresent, async (req, res) => {
  const loaded = await loadScopedSubTrip(req, res);
  if (!loaded) return;
  const { trip, subTrip: existing } = loaded;
  const subTripId = existing.id;

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
  const { name, category, date, payerMemberId, amount, participantMemberIds, createdByMemberId } = parsed.data;
  // Note: createdByMemberId from the request body is validated above (it must
  // belong to the trip) but is intentionally never written in the
  // `tx.update(subTrips).set(...)` below — the original creator is immutable
  // once set, regardless of what a PATCH body claims.
  const allIds = [...new Set([payerMemberId, createdByMemberId, ...participantMemberIds])];
  const valid = await memberIdsBelongToTrip(trip.id, allIds);
  if (!valid) {
    res.status(400).json({ error: 'invalid_member' });
    return;
  }

  const shares = computeEqualShares(amount, participantMemberIds, payerMemberId);
  const payerParticipates = participantMemberIds.includes(payerMemberId);
  const existingDebtRows = await db.select().from(debts).where(eq(debts.subTripId, subTripId));
  const reconciled = reconcileDebts(
    existingDebtRows.map((d) => ({ id: d.id, memberId: d.memberId, settled: d.settled })),
    shares,
  );

  const claimedMemberIdHeader = req.header('X-Member-Id');

  await db.transaction(async (tx) => {
    await tx
      .update(subTrips)
      .set({
        name,
        category,
        date,
        payerMemberId,
        amount,
        payerParticipates,
        updatedByMemberId: claimedMemberIdHeader ? Number(claimedMemberIdHeader) : existing.createdByMemberId,
      })
      .where(eq(subTrips.id, subTripId));

    for (const del of reconciled.toDelete) {
      await tx.delete(debts).where(eq(debts.id, del.id));
    }
    for (const upd of reconciled.toUpdateAmount) {
      await tx.update(debts).set({ amount: upd.amount }).where(eq(debts.id, upd.id));
    }
    if (reconciled.toInsert.length > 0) {
      await tx.insert(debts).values(reconciled.toInsert.map((i) => ({ subTripId, memberId: i.memberId, amount: i.amount })));
    }
  });

  res.status(200).json({ id: subTripId });
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
    await tx.delete(debts).where(eq(debts.subTripId, existing.id));
    await tx.delete(subTrips).where(eq(subTrips.id, existing.id));
  });

  res.status(200).json({ ok: true });
});

const toggleDebtSchema = z.object({ settled: z.boolean() });

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

  await db
    .update(debts)
    .set({ settled: parsed.data.settled, settledAt: parsed.data.settled ? new Date() : null })
    .where(eq(debts.id, debtId));

  res.status(200).json({ ok: true });
});

export default router;
