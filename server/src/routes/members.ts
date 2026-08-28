import { Router, type Request, type Response } from 'express';
import { db } from '../db/client';
import { trips, tripMembers, memberAccounts } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { getTripByPublicId, memberIdsBelongToTrip } from '../lib/tripAccess';

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

// Shared preamble for every route scoped to a single member
// (:publicId/:memberId): looks up the trip, safely parses memberId, and
// verifies memberId actually belongs to that trip (tripMembers.id is a
// globally unique auto-increment integer shared across every trip, so
// without this check any memberId could be paired with any publicId).
// Writes a 404 on any failure so callers can just do `if (!loaded) return;`.
async function loadScopedMember(req: Request, res: Response): Promise<{ tripId: number; memberId: number } | null> {
  const trip = await getTripByPublicId(req.params.publicId);
  if (!trip) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  const memberId = parseInt(req.params.memberId, 10);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  const belongs = await memberIdsBelongToTrip(trip.id, [memberId]);
  if (!belongs) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  return { tripId: trip.id, memberId };
}

// GET /api/trips/:publicId/members/:memberId/accounts
router.get('/:publicId/members/:memberId/accounts', async (req, res) => {
  const loaded = await loadScopedMember(req, res);
  if (!loaded) return;
  const { memberId } = loaded;

  const accounts = await db.select().from(memberAccounts).where(eq(memberAccounts.memberId, memberId));
  res.json(accounts);
});

// POST /api/trips/:publicId/members/:memberId/accounts
router.post('/:publicId/members/:memberId/accounts', async (req, res) => {
  const loaded = await loadScopedMember(req, res);
  if (!loaded) return;
  const { memberId } = loaded;

  const { label, accountNumber, isDefault, qrisImage } = req.body;

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
    qrisImage: qrisImage || null,
  });

  res.status(201).json({ id: inserted[0].insertId, label, accountNumber, isDefault: !!isDefault, qrisImage: qrisImage || null });
});

// PATCH /api/trips/:publicId/members/:memberId/accounts/:accountId
router.patch('/:publicId/members/:memberId/accounts/:accountId', async (req, res) => {
  const loaded = await loadScopedMember(req, res);
  if (!loaded) return;
  const { memberId } = loaded;

  const accountId = parseInt(req.params.accountId, 10);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const [account] = await db
    .select()
    .from(memberAccounts)
    .where(and(eq(memberAccounts.id, accountId), eq(memberAccounts.memberId, memberId)));
  if (!account) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const { isDefault } = req.body;

  if (isDefault) {
    await db.update(memberAccounts).set({ isDefault: false }).where(eq(memberAccounts.memberId, memberId));
    await db.update(memberAccounts).set({ isDefault: true }).where(and(eq(memberAccounts.id, accountId), eq(memberAccounts.memberId, memberId)));
  }

  res.json({ success: true });
});

// DELETE /api/trips/:publicId/members/:memberId/accounts/:accountId
router.delete('/:publicId/members/:memberId/accounts/:accountId', async (req, res) => {
  const loaded = await loadScopedMember(req, res);
  if (!loaded) return;
  const { memberId } = loaded;

  const accountId = parseInt(req.params.accountId, 10);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const [account] = await db
    .select()
    .from(memberAccounts)
    .where(and(eq(memberAccounts.id, accountId), eq(memberAccounts.memberId, memberId)));
  if (!account) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  await db.delete(memberAccounts).where(and(eq(memberAccounts.id, accountId), eq(memberAccounts.memberId, memberId)));
  res.json({ success: true });
});

export default router;
