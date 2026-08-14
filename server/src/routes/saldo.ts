import { Router } from 'express';
import { db } from '../db/client';
import { trips, tripMembers, subTrips, debts, deposits, memberAccounts } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { computeDynamicDeposits } from '../lib/depositLogic';

const router = Router();

// GET /api/trips/:publicId/saldo
router.get('/:publicId/saldo', async (req, res) => {
  const { publicId } = req.params;
  const tripList = await db.select().from(trips).where(eq(trips.publicId, publicId));
  if (!tripList.length) return res.status(404).json({ error: 'Trip not found' });
  const trip = tripList[0];

  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
  const memberMap = new Map(members.map(m => [m.id, m]));

  // Fetch all accounts for members of this trip
  const allAccounts = await db.select().from(memberAccounts);
  const accountsByMember = new Map<number, typeof allAccounts>();
  for (const acc of allAccounts) {
    if (memberMap.has(acc.memberId)) {
      const list = accountsByMember.get(acc.memberId) || [];
      list.push(acc);
      accountsByMember.set(acc.memberId, list);
    }
  }

  // Rollup calculation
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

  const allDebtsRaw = allDebts.map(d => ({
    id: d.id,
    subTripId: d.subTripId,
    subTripName: d.subTripName,
    debtorId: d.memberId,
    debtorName: memberMap.get(d.memberId)?.name || 'Unknown',
    creditorId: d.payerMemberId,
    creditorName: memberMap.get(d.payerMemberId)?.name || 'Unknown',
    amount: d.amount,
    date: d.date,
    settled: d.settled,
  }));

  const depositRows = await db
    .select()
    .from(deposits)
    .where(eq(deposits.tripId, trip.id))
    .orderBy(desc(deposits.createdAt));

  const formattedDeposits = depositRows.map(dp => ({
    id: dp.id,
    fromMemberId: dp.fromMemberId,
    fromName: memberMap.get(dp.fromMemberId)?.name || 'Unknown',
    toMemberId: dp.toMemberId,
    toName: memberMap.get(dp.toMemberId)?.name || 'Unknown',
    amount: dp.amount,
  }));

  const depositHistory = depositRows.map(dp => ({
    id: dp.id,
    fromMemberId: dp.fromMemberId,
    fromName: memberMap.get(dp.fromMemberId)?.name || 'Unknown',
    toMemberId: dp.toMemberId,
    toName: memberMap.get(dp.toMemberId)?.name || 'Unknown',
    amount: dp.amount,
    proofNote: dp.proofNote,
    createdAt: dp.createdAt,
  }));

  const dynamicResult = computeDynamicDeposits(allDebtsRaw, formattedDeposits);

  const rollupMap = new Map<number, { received: number; owed: number }>();
  for (const m of members) rollupMap.set(m.id, { received: 0, owed: 0 });

  for (const d of dynamicResult.annotatedDebts) {
    if (!d.settled) {
      const unpaidAmount = d.remainingUnpaidAmount !== undefined ? d.remainingUnpaidAmount : d.amount;
      const p = rollupMap.get(d.creditorId);
      if (p) p.received += unpaidAmount;
      const o = rollupMap.get(d.debtorId);
      if (o) o.owed += unpaidAmount;
    }
  }

  const rollupMembers = members.map(m => {
    const r = rollupMap.get(m.id) || { received: 0, owed: 0 };
    const net = r.received - r.owed;
    return {
      memberId: m.id,
      name: m.name,
      rollup: net,
      status: net > 0 ? 'pos' : net < 0 ? 'neg' : 'zero',
    };
  });

  const unsettledDebtsWithAccounts = dynamicResult.annotatedDebts
    .filter(d => !d.settled)
    .map(d => ({
      ...d,
      accounts: (accountsByMember.get(d.creditorId) || []).map(a => ({
        id: a.id,
        label: a.label,
        accountNumber: a.accountNumber,
        isDefault: a.isDefault,
      })),
    }));

  res.json({
    rollupMembers,
    unsettledDebts: unsettledDebtsWithAccounts,
    deposits: dynamicResult.depositSummaries,
    depositHistory,
  });
});



// GET /api/trips/:publicId/settled-debts
router.get('/:publicId/settled-debts', async (req, res) => {
  const { publicId } = req.params;
  const tripList = await db.select().from(trips).where(eq(trips.publicId, publicId));
  if (!tripList.length) return res.status(404).json({ error: 'Trip not found' });
  const trip = tripList[0];

  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
  const memberMap = new Map(members.map(m => [m.id, m.name]));

  const settledList = await db
    .select({
      id: debts.id,
      subTripName: subTrips.name,
      debtorId: debts.memberId,
      creditorId: subTrips.payerMemberId,
      amount: debts.amount,
      settledAt: debts.settledAt,
    })
    .from(debts)
    .innerJoin(subTrips, eq(debts.subTripId, subTrips.id))
    .where(and(eq(subTrips.tripId, trip.id), eq(debts.settled, true)))
    .orderBy(desc(debts.settledAt));

  const result = settledList.map(s => ({
    id: s.id,
    subTripName: s.subTripName,
    debtorName: memberMap.get(s.debtorId) || 'Unknown',
    creditorName: memberMap.get(s.creditorId) || 'Unknown',
    amount: s.amount,
    settledAt: s.settledAt,
  }));

  res.json(result);
});

// POST /api/trips/:publicId/deposits
router.post('/:publicId/deposits', async (req, res) => {
  const { publicId } = req.params;
  const { fromMemberId, toMemberId, amount, proofNote } = req.body;

  if (!fromMemberId || !toMemberId || !amount || amount <= 0 || fromMemberId === toMemberId) {
    return res.status(400).json({ error: 'Invalid deposit data' });
  }

  const tripList = await db.select().from(trips).where(eq(trips.publicId, publicId));
  if (!tripList.length) return res.status(404).json({ error: 'Trip not found' });
  const trip = tripList[0];

  // Validate members belong to trip
  const tripMemberRows = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
  const memberIds = new Set(tripMemberRows.map(m => m.id));

  if (!memberIds.has(fromMemberId) || !memberIds.has(toMemberId)) {
    return res.status(400).json({ error: 'Members do not belong to trip' });
  }

  const inserted = await db.insert(deposits).values({
    tripId: trip.id,
    fromMemberId,
    toMemberId,
    amount,
    proofNote: proofNote || null,
  });

  res.status(201).json({ success: true, id: inserted[0].insertId });
});

// DELETE /api/trips/:publicId/deposits/:depositId
router.delete('/:publicId/deposits/:depositId', async (req, res) => {
  const { publicId, depositId } = req.params;
  const id = Number(depositId);
  if (!id || isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid deposit ID' });
  }

  const tripList = await db.select().from(trips).where(eq(trips.publicId, publicId));
  if (!tripList.length) return res.status(404).json({ error: 'Trip not found' });
  const trip = tripList[0];

  const [existing] = await db
    .select()
    .from(deposits)
    .where(and(eq(deposits.id, id), eq(deposits.tripId, trip.id)));

  if (!existing) {
    return res.status(404).json({ error: 'Deposit not found' });
  }

  await db.delete(deposits).where(eq(deposits.id, id));

  res.json({ success: true });
});

export default router;

