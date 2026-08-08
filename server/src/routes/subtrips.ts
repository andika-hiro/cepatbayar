import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { debts, subTrips } from '../db/schema';
import { getTripByPublicId, memberIdsBelongToTrip } from '../lib/tripAccess';
import { computeEqualShares } from '../lib/splitLogic';
import { isoDateSchema } from '../lib/validators';

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

router.post<{ publicId: string }>('/', async (req, res) => {
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

  const subTripId = await db.transaction(async (tx) => {
    const [result] = await tx.insert(subTrips).values({
      tripId: trip.id, name, category, date, payerMemberId, amount, createdByMemberId,
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

export default router;
