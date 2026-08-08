import { Router } from 'express';
import { db } from '../db/client';
import { trips, tripMembers, memberAccounts } from '../db/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

// POST /api/trips/:publicId/members
router.post('/:publicId/members', async (req, res) => {
  const { publicId } = req.params;
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const tripList = await db.select().from(trips).where(eq(trips.publicId, publicId));
  if (!tripList.length) return res.status(404).json({ error: 'Trip not found' });
  const trip = tripList[0];

  const inserted = await db.insert(tripMembers).values({
    tripId: trip.id,
    name: name.trim(),
  });

  res.status(201).json({ id: inserted[0].insertId, name: name.trim() });
});

// GET /api/trips/:publicId/members/:memberId/accounts
router.get('/:publicId/members/:memberId/accounts', async (req, res) => {
  const memberId = parseInt(req.params.memberId, 10);
  const accounts = await db.select().from(memberAccounts).where(eq(memberAccounts.memberId, memberId));
  res.json(accounts);
});

// POST /api/trips/:publicId/members/:memberId/accounts
router.post('/:publicId/members/:memberId/accounts', async (req, res) => {
  const memberId = parseInt(req.params.memberId, 10);
  const { label, accountNumber, isDefault } = req.body;

  if (!label || !accountNumber) {
    return res.status(400).json({ error: 'Label and accountNumber are required' });
  }

  if (isDefault) {
    // Unset current default
    await db.update(memberAccounts).set({ isDefault: false }).where(eq(memberAccounts.memberId, memberId));
  }

  const inserted = await db.insert(memberAccounts).values({
    memberId,
    label,
    accountNumber,
    isDefault: !!isDefault,
  });

  res.status(201).json({ id: inserted[0].insertId, label, accountNumber, isDefault: !!isDefault });
});

// PATCH /api/trips/:publicId/members/:memberId/accounts/:accountId
router.patch('/:publicId/members/:memberId/accounts/:accountId', async (req, res) => {
  const memberId = parseInt(req.params.memberId, 10);
  const accountId = parseInt(req.params.accountId, 10);
  const { isDefault } = req.body;

  if (isDefault) {
    await db.update(memberAccounts).set({ isDefault: false }).where(eq(memberAccounts.memberId, memberId));
    await db.update(memberAccounts).set({ isDefault: true }).where(and(eq(memberAccounts.id, accountId), eq(memberAccounts.memberId, memberId)));
  }

  res.json({ success: true });
});

// DELETE /api/trips/:publicId/members/:memberId/accounts/:accountId
router.delete('/:publicId/members/:memberId/accounts/:accountId', async (req, res) => {
  const memberId = parseInt(req.params.memberId, 10);
  const accountId = parseInt(req.params.accountId, 10);

  await db.delete(memberAccounts).where(and(eq(memberAccounts.id, accountId), eq(memberAccounts.memberId, memberId)));
  res.json({ success: true });
});

export default router;
