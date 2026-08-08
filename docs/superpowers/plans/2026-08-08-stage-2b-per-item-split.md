# Tahap 2b: Rincian per item, pajak, Tagihkan ke — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second bill-split mode ("Rincian per item") to the existing Add/Edit sub trip flow — per-item pricing, food tax computed per item, service charge split evenly, and per-participant "Tagihkan ke" (bill-redirect) — without changing the existing `debts` table, settlement, or rollup logic at all.

**Architecture:** `debts` stays exactly what it was in Tahap 2a: one row per (sub trip, final debtor), independently settleable, computed from a `Map<memberId, amount>`. The only new thing is a second way to *produce* that Map — `computeItemBasedShares`, a pure function parallel to the existing `computeEqualShares` — plus two new tables (`sub_trip_items`, `sub_trip_item_participants`) that store the per-item "recipe" for audit/display, entirely separate from the settlement ledger. `reconcileDebts` (from Tahap 2a) is reused unchanged for edits in both modes. Full design and rationale: `docs/superpowers/specs/2026-08-08-cepatkan-bayar-stage-2b-per-item-split-design.md`.

**Tech Stack:** Same as Tahap 1/2 — Node/Express/TypeScript/Drizzle/MySQL, React/TypeScript/Vite/Tailwind/React Router v7, Vitest/Supertest/Testing Library.

## Global Constraints

- All product-facing text is Bahasa Indonesia, copied verbatim from `context/Cepat Bayarkan.dc.html` / `context/handoff.md`, matching the copy patterns already established in Tahap 2a's `AddEditSubTripSheet`.
- Money amounts are always whole Rupiah integers. Rounding rule (unchanged from Tahap 2a): `Math.ceil` at every division step — per-item tax, per-item share, service-charge share. Percentages (`taxPercent`, `servicePercent`) may have up to 2 decimal places and are NOT subject to the whole-Rupiah rule themselves.
- **"Tagihkan ke" only ever moves the debtor for that one item-participant row.** The sub trip's payer (who receives the money) never changes. Service charge is never redirected — each participant's service-charge share is always billed to themselves (design spec §2.2).
- **Mode is locked after creation.** `PATCH` must reject a body whose `splitMode` differs from the stored `sub_trips.split_mode` — this is enforced server-side, not just hidden in the UI.
- `debts`, `reconcileDebts`, `computeEqualShares`, the settle-toggle route, and the rollup endpoint are **not modified by this plan** except where explicitly stated (Tasks 3 and 5 touch `subtrips.ts`'s create/edit handlers, nothing else touches settlement).
- Every backend route file and frontend screen/component file must have a corresponding test file; no task is complete until its tests pass — **including every pre-existing Tahap 2a test that calls `POST`/`PATCH .../subtrips`**, which must be updated to send the now-required `splitMode: 'total'` field (Tasks 3 and 5 are explicit about which files this touches).

---

## File Structure

```
server/
  src/
    db/
      schema.ts                       # MODIFY: subTrips gets splitMode/taxPercent/servicePercent; add subTripItems, subTripItemParticipants
    lib/
      itemSplitLogic.ts                # NEW: computeItemBasedShares (pure function)
    routes/
      subtrips.ts                      # MODIFY: discriminated-union schema, per-item create/detail/edit
  tests/
    lib/
      itemSplitLogic.test.ts           # NEW
    subtrips.test.ts                   # MODIFY: add splitMode:'total' to existing bodies; add per-item creation tests
    subtrips-edit-delete.test.ts       # MODIFY: add splitMode:'total' to existing bodies; add per-item edit tests
    subtrips-debts.test.ts             # MODIFY: add splitMode:'total' to its helper's body
    subtrips-rateLimit.test.ts         # MODIFY: add splitMode:'total' to its loop bodies
client/
  src/
    lib/
      api.ts                           # MODIFY: SubTripInput/SubTripDetail grow item/splitMode/tax/service fields
    components/
      AddEditSubTripSheet.tsx          # MODIFY: "Opsi lanjutan" section, mode toggle, item editor, Tagihkan ke, tax/service inputs
      ItemRow.tsx                       # NEW: one item's name/price/participants/search/Tagihkan-ke, extracted for size
    screens/
      SubTripDetailScreen.tsx          # MODIFY: "Rincian item" section for splitMode === 'per_item'
  tests/
    AddEditSubTripSheet.test.tsx       # MODIFY: add splitMode:'total' to existing payload assertions; add per-item tests
    ItemRow.test.tsx                    # NEW
    SubTripDetailScreen.test.tsx        # MODIFY: add "Rincian item" tests
```

---

### Task 1: Database schema — `sub_trips` new columns, `sub_trip_items`, `sub_trip_item_participants`

**Files:**
- Modify: `server/src/db/schema.ts`
- Test: `server/tests/db.test.ts`

**Interfaces:**
- Produces: `subTrips.splitMode` (`'total'|'per_item'`, default `'total'`), `subTrips.taxPercent`/`subTrips.servicePercent` (decimal, default `0`); `subTripItems` table (`id, subTripId, name, price`); `subTripItemParticipants` table (`id, itemId, memberId, billedToMemberId` nullable) — consumed by every later task in this plan.

- [ ] **Step 1: Add the new columns and tables**

Modify `server/src/db/schema.ts` — add `decimal` and `mysqlEnum` (already imported) to the import line:
```ts
import { mysqlTable, int, varchar, timestamp, date, mysqlEnum, boolean, decimal } from 'drizzle-orm/mysql-core';
```

Add these three fields to the existing `subTrips` table definition, right after `payerParticipates`:
```ts
  splitMode: mysqlEnum('split_mode', ['total', 'per_item']).notNull().default('total'),
  taxPercent: decimal('tax_percent', { precision: 5, scale: 2, mode: 'number' }).notNull().default('0'),
  servicePercent: decimal('service_percent', { precision: 5, scale: 2, mode: 'number' }).notNull().default('0'),
```
(Keep `createdByMemberId` and everything after it exactly where it already is — just insert these three lines after `payerParticipates`.)

Append these two new table definitions after the existing `debts` table, at the end of the file:
```ts
export const subTripItems = mysqlTable('sub_trip_items', {
  id: int('id').autoincrement().primaryKey(),
  subTripId: int('sub_trip_id').notNull().references(() => subTrips.id),
  name: varchar('name', { length: 255 }).notNull(),
  price: int('price').notNull(),
});

export const subTripItemParticipants = mysqlTable('sub_trip_item_participants', {
  id: int('id').autoincrement().primaryKey(),
  itemId: int('item_id').notNull().references(() => subTripItems.id),
  memberId: int('member_id').notNull().references(() => tripMembers.id),
  billedToMemberId: int('billed_to_member_id').references(() => tripMembers.id),
});
```

- [ ] **Step 2: Push the schema to both local databases**

```bash
cd server
npx drizzle-kit push
DB_NAME=cepatkan_bayar_test npx drizzle-kit push
```
Expected: both report the new columns and 2 new tables (accept the prompts).

- [ ] **Step 3: Verify the `decimal` column's `mode: 'number'` actually round-trips as a JS number**

Add this to `server/tests/db.test.ts` (new test, alongside the existing `sub_trips and debts` describe block):
```ts
import { subTripItems, subTripItemParticipants } from '../src/db/schema';

describe('sub_trips split_mode/tax/service columns and sub_trip_items tables', () => {
  it('round-trips splitMode/taxPercent/servicePercent as the correct types, and links items to participants', async () => {
    await db.insert(users).values({ email: 'schema-test-2b@example.com' });
    const [user] = await db.select().from(users).where(eq(users.email, 'schema-test-2b@example.com'));
    await db.insert(trips).values({
      publicId: 'schema-test-trip-2b', name: 'Test Trip 2b', destination: 'Test',
      startDate: '2026-01-01', endDate: '2026-01-02', creatorUserId: user.id,
    });
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, 'schema-test-trip-2b'));
    await db.insert(tripMembers).values({ tripId: trip.id, name: 'Budi' });
    const [member] = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));

    await db.insert(subTrips).values({
      tripId: trip.id, name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: member.id, amount: 50000, createdByMemberId: member.id,
      splitMode: 'per_item', taxPercent: 11, servicePercent: 5.5,
    });
    const [subTrip] = await db.select().from(subTrips).where(eq(subTrips.tripId, trip.id));
    expect(subTrip.splitMode).toBe('per_item');
    expect(subTrip.taxPercent).toBe(11);
    expect(subTrip.servicePercent).toBe(5.5);
    expect(typeof subTrip.taxPercent).toBe('number');

    await db.insert(subTripItems).values({ subTripId: subTrip.id, name: 'Nasi Goreng', price: 25000 });
    const [item] = await db.select().from(subTripItems).where(eq(subTripItems.subTripId, subTrip.id));
    expect(item.price).toBe(25000);

    await db.insert(subTripItemParticipants).values({ itemId: item.id, memberId: member.id, billedToMemberId: null });
    const [participant] = await db.select().from(subTripItemParticipants).where(eq(subTripItemParticipants.itemId, item.id));
    expect(participant.memberId).toBe(member.id);
    expect(participant.billedToMemberId).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test**

Run: `cd server && npx vitest run tests/db.test.ts`
Expected: PASS. **If `subTrip.taxPercent` comes back as a string instead of a number** (i.e. `typeof subTrip.taxPercent === 'string'`), the installed `drizzle-orm` version doesn't support `mode: 'number'` on `decimal()` the way this step assumes — in that case, remove `mode: 'number'` from both column definitions, keep the columns as-is otherwise, and note in your report that every place this plan later reads `taxPercent`/`servicePercent` from a DB row must wrap it in `Number(...)` before use. Search this whole plan for `taxPercent`/`servicePercent` reads in later tasks and mentally flag them if you hit this case — you'll be the one implementing those tasks too.

- [ ] **Step 5: Run the full server suite to confirm nothing broke**

Run: `cd server && npx vitest run`
Expected: PASS (all pre-existing tests still green — this task only adds columns/tables, doesn't change any existing behavior).

- [ ] **Step 6: Commit**

```bash
git add server/src/db/schema.ts server/tests/db.test.ts
git commit -m "Add split_mode/tax_percent/service_percent columns and sub_trip_items tables"
```

---

### Task 2: Pure logic — `computeItemBasedShares`

**Files:**
- Create: `server/src/lib/itemSplitLogic.ts`
- Test: `server/tests/lib/itemSplitLogic.test.ts`

**Interfaces:**
- Produces: `computeItemBasedShares(items: ItemInput[], taxPercent: number, servicePercent: number, payerMemberId: number): ItemBasedSplitResult` where:
  ```ts
  export interface ItemParticipantInput {
    memberId: number;
    billedToMemberId?: number;
  }
  export interface ItemInput {
    name: string;
    price: number;
    participants: ItemParticipantInput[];
  }
  export interface ItemBasedSplitResult {
    shares: Map<number, number>;
    subtotal: number;
    taxTotal: number;
    serviceCharge: number;
    grandTotal: number;
  }
  ```
  Consumed by Task 3 (create) and Task 5 (edit).

No DB, no Express — pure function, fast unit tests. This is the financial core of the whole plan; test it thoroughly.

- [ ] **Step 1: Write the failing tests**

`server/tests/lib/itemSplitLogic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeItemBasedShares } from '../../src/lib/itemSplitLogic';

describe('computeItemBasedShares', () => {
  it('splits a single item evenly among its participants, excluding the payer from their own debt', () => {
    const result = computeItemBasedShares(
      [{ name: 'Nasi Goreng', price: 90000, participants: [{ memberId: 1 }, { memberId: 2 }, { memberId: 3 }] }],
      0, 0, 1,
    );
    expect(result.shares.get(1)).toBeUndefined();
    expect(result.shares.get(2)).toBe(30000);
    expect(result.shares.get(3)).toBe(30000);
    expect(result.subtotal).toBe(90000);
    expect(result.grandTotal).toBe(90000);
  });

  it('computes food tax per item and rounds each item share up', () => {
    const result = computeItemBasedShares(
      [{ name: 'Nasi Goreng', price: 100000, participants: [{ memberId: 2 }, { memberId: 3 }] }],
      10, 0, 1,
    );
    // tax = ceil(100000 * 10 / 100) = 10000; itemTotal = 110000; share = ceil(110000/2) = 55000
    expect(result.taxTotal).toBe(10000);
    expect(result.shares.get(2)).toBe(55000);
    expect(result.shares.get(3)).toBe(55000);
    expect(result.grandTotal).toBe(110000);
  });

  it('redirects a participant\'s item debt to their "Tagihkan ke" target', () => {
    const result = computeItemBasedShares(
      [{ name: 'Nasi Goreng', price: 60000, participants: [{ memberId: 2 }, { memberId: 3, billedToMemberId: 4 }] }],
      0, 0, 1,
    );
    expect(result.shares.get(2)).toBe(30000);
    expect(result.shares.get(3)).toBeUndefined();
    expect(result.shares.get(4)).toBe(30000);
  });

  it('computes service charge once on the pre-tax subtotal, split evenly among the union of original participants (never redirected)', () => {
    const result = computeItemBasedShares(
      [
        { name: 'Nasi Goreng', price: 50000, participants: [{ memberId: 2 }] },
        { name: 'Mie Goreng', price: 50000, participants: [{ memberId: 3, billedToMemberId: 4 }] },
      ],
      0, 10, 1,
    );
    // subtotal = 100000; serviceCharge = ceil(100000*10/100) = 10000; 2 unique original participants (2, 3) -> share = ceil(10000/2) = 5000
    expect(result.serviceCharge).toBe(10000);
    // member 2: their own item share (50000, sole participant of that item, not the payer) + service share (5000)
    expect(result.shares.get(2)).toBe(55000);
    // member 3's item debt was redirected to 4, but member 3 (not 4) still owes their own service-charge share
    expect(result.shares.get(3)).toBe(5000);
    expect(result.shares.get(4)).toBe(50000); // the redirected item share only, no service charge
  });

  it('aggregates multiple items owed to the same debtor into one total', () => {
    const result = computeItemBasedShares(
      [
        { name: 'Item A', price: 20000, participants: [{ memberId: 2 }] },
        { name: 'Item B', price: 30000, participants: [{ memberId: 2 }] },
      ],
      0, 0, 1,
    );
    expect(result.shares.get(2)).toBe(50000);
    expect(result.shares.size).toBe(1);
  });

  it('produces no debt for the payer even when they are an item participant', () => {
    const result = computeItemBasedShares(
      [{ name: 'Nasi Goreng', price: 90000, participants: [{ memberId: 1 }, { memberId: 2 }] }],
      0, 0, 1,
    );
    expect(result.shares.has(1)).toBe(false);
    expect(result.shares.get(2)).toBe(45000);
  });

  it('computes the grand total as subtotal + tax total + service charge', () => {
    const result = computeItemBasedShares(
      [{ name: 'Nasi Goreng', price: 100000, participants: [{ memberId: 2 }] }],
      10, 10, 1,
    );
    // tax = ceil(100000*0.1) = 10000; serviceCharge = ceil(100000*0.1) = 10000
    expect(result.grandTotal).toBe(100000 + 10000 + 10000);
  });

  it('does not divide by zero when service charge is zero', () => {
    const result = computeItemBasedShares(
      [{ name: 'Item', price: 10000, participants: [{ memberId: 2 }] }],
      0, 0, 1,
    );
    expect(result.serviceCharge).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/lib/itemSplitLogic.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

`server/src/lib/itemSplitLogic.ts`:
```ts
export interface ItemParticipantInput {
  memberId: number;
  billedToMemberId?: number;
}

export interface ItemInput {
  name: string;
  price: number;
  participants: ItemParticipantInput[];
}

export interface ItemBasedSplitResult {
  shares: Map<number, number>;
  subtotal: number;
  taxTotal: number;
  serviceCharge: number;
  grandTotal: number;
}

export function computeItemBasedShares(
  items: ItemInput[],
  taxPercent: number,
  servicePercent: number,
  payerMemberId: number,
): ItemBasedSplitResult {
  const shares = new Map<number, number>();
  let subtotal = 0;
  let taxTotal = 0;
  const uniqueParticipants = new Set<number>();

  for (const item of items) {
    subtotal += item.price;
    const itemTax = Math.ceil((item.price * taxPercent) / 100);
    taxTotal += itemTax;
    const itemTotal = item.price + itemTax;
    const participantCount = item.participants.length;
    const share = Math.ceil(itemTotal / participantCount);

    for (const participant of item.participants) {
      uniqueParticipants.add(participant.memberId);
      const debtor = participant.billedToMemberId ?? participant.memberId;
      if (debtor === payerMemberId) continue;
      shares.set(debtor, (shares.get(debtor) ?? 0) + share);
    }
  }

  const serviceCharge = Math.ceil((subtotal * servicePercent) / 100);
  if (serviceCharge > 0 && uniqueParticipants.size > 0) {
    const serviceShare = Math.ceil(serviceCharge / uniqueParticipants.size);
    for (const memberId of uniqueParticipants) {
      if (memberId === payerMemberId) continue;
      shares.set(memberId, (shares.get(memberId) ?? 0) + serviceShare);
    }
  }

  const grandTotal = subtotal + taxTotal + serviceCharge;
  return { shares, subtotal, taxTotal, serviceCharge, grandTotal };
}
```

- [ ] **Step 4: Run the tests again**

Run: `cd server && npx vitest run tests/lib/itemSplitLogic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/itemSplitLogic.ts server/tests/lib/itemSplitLogic.test.ts
git commit -m "Add pure computeItemBasedShares function for per-item split mode"
```

---

### Task 3: `POST /api/trips/:publicId/subtrips` — per-item creation, and the discriminated-union schema migration

**Files:**
- Modify: `server/src/routes/subtrips.ts`
- Modify: `server/tests/subtrips.test.ts`, `server/tests/subtrips-edit-delete.test.ts`, `server/tests/subtrips-debts.test.ts`, `server/tests/subtrips-rateLimit.test.ts`

**Interfaces:**
- Consumes: `computeItemBasedShares` from Task 2; `subTripItems`, `subTripItemParticipants` from Task 1.
- Produces: `subTripInputSchema` becomes a `z.discriminatedUnion('splitMode', [...])` — every later task that imports it (Task 5) sees this new shape. `POST /` accepts and correctly handles both `splitMode: 'total'` (existing behavior, now requires the literal field) and `splitMode: 'per_item'` (new).

**This task has a mechanical but important side effect: every existing test that POSTs to `/subtrips` must add `splitMode: 'total'` to its body, or it will now fail schema validation with 400.** The current `subTripInputSchema` is a flat object with no `splitMode` field at all — Tahap 2a's tests never needed to send one. Making the schema a discriminated union means `splitMode` becomes required on every request. This step is not optional polish — skipping it will break the whole existing subtrip test suite.

- [ ] **Step 1: Read the current file first**

Read `server/src/routes/subtrips.ts` in full before editing — this task modifies the schema and the `POST /` handler; the exact current code (imports, `canModifySubTrip`, `loadScopedSubTrip`, the `GET`/`PATCH`/`DELETE`/debts-toggle handlers) must stay untouched except where this task's steps say otherwise. Do not guess at its content from this plan's prose — read it.

- [ ] **Step 2: Replace `subTripInputSchema` with a discriminated union**

Replace the current `subTripInputSchema` definition with:
```ts
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
```

Add `subTripItems, subTripItemParticipants` to the existing `import { debts, subTrips, tripMembers } from '../db/schema';` line.

- [ ] **Step 3: Rewrite the `POST /` handler to branch on `splitMode`**

Replace the body of `router.post<{ publicId: string }>('/', createSubTripLimiter, async (req, res) => { ... })` (keep the route registration line and the initial trip-lookup/404/schema-validation lines the same shape as before) so that after `const data = parsed.data;` it branches:

```ts
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
```

Add `computeItemBasedShares` to the existing `import { computeEqualShares, reconcileDebts } from '../lib/splitLogic';` — no, it lives in a different file: add a new import line `import { computeItemBasedShares } from '../lib/itemSplitLogic';`.

- [ ] **Step 4: Migrate every existing test body across 4 files to include `splitMode: 'total'`**

In each of `server/tests/subtrips.test.ts`, `server/tests/subtrips-edit-delete.test.ts`, `server/tests/subtrips-debts.test.ts`, and `server/tests/subtrips-rateLimit.test.ts`: find every `.send({...})` call that targets `POST /api/trips/:publicId/subtrips` or `PATCH /api/trips/:publicId/subtrips/:subTripId` (i.e. every body containing `payerMemberId`/`amount`/`participantMemberIds` — NOT the debt-toggle bodies like `.send({ settled: true })`, and NOT the trip-creation bodies like `.send({ name: 'Test Trip', destination: ..., members: [...] })` which hit a completely different endpoint). Add `splitMode: 'total',` to each of those bodies (any position in the object literal is fine).

This includes bodies inside shared helper functions used by multiple tests (e.g. any `createTestTrip`/`createTestTripWithSubTrip`/`createTripWithDebt`-style helper in these files that itself calls `POST /subtrips` — fixing the helper once covers every test that calls it).

Do this file by file, running that file's tests after each to confirm you caught every call site:
```bash
cd server
npx vitest run tests/subtrips.test.ts
npx vitest run tests/subtrips-edit-delete.test.ts
npx vitest run tests/subtrips-debts.test.ts
npx vitest run tests/subtrips-rateLimit.test.ts
```
Any remaining `400 invalid_body` failure in these files at this point means you missed a call site — find it and add the field. Do not modify test *assertions* about behavior in this step, only the request *bodies* — the tests should still be testing the exact same things they tested before, just with a schema-compliant request.

- [ ] **Step 5: Write the failing per-item creation tests**

Append to `server/tests/subtrips.test.ts`:
```ts
describe('POST /api/trips/:publicId/subtrips — per-item mode', () => {
  it('creates a per-item sub trip, computing debts and the grand total from the items', async () => {
    const { publicId, members } = await createTestTrip('subtrip-peritem1@example.com', ['Budi', 'Aji']);
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    const res = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan di Resto', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, createdByMemberId: budi.id,
      splitMode: 'per_item', taxPercent: 10, servicePercent: 0,
      items: [{ name: 'Nasi Goreng', price: 100000, participants: [{ memberId: aji.id }] }],
    });
    expect(res.status).toBe(201);

    const [subTrip] = await db.select().from(subTrips).where(eq(subTrips.id, res.body.id));
    expect(subTrip.splitMode).toBe('per_item');
    expect(subTrip.amount).toBe(110000); // 100000 + 10% tax

    const debtRows = await db.select().from(debts).where(eq(debts.subTripId, res.body.id));
    expect(debtRows).toHaveLength(1);
    expect(debtRows[0].memberId).toBe(aji.id);
    expect(debtRows[0].amount).toBe(110000);
  });

  it('stores the item and its participants, including a Tagihkan ke redirect', async () => {
    const { publicId, members } = await createTestTrip('subtrip-peritem2@example.com', ['Budi', 'Aji', 'Citra']);
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;
    const citra = members.find((m) => m.name === 'Citra')!;

    const res = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan di Resto', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, createdByMemberId: budi.id,
      splitMode: 'per_item', taxPercent: 0, servicePercent: 0,
      items: [{ name: 'Es Teh', price: 20000, participants: [{ memberId: aji.id, billedToMemberId: citra.id }] }],
    });
    expect(res.status).toBe(201);

    const itemRows = await db.select().from(subTripItems).where(eq(subTripItems.subTripId, res.body.id));
    expect(itemRows).toHaveLength(1);
    const participantRows = await db.select().from(subTripItemParticipants).where(eq(subTripItemParticipants.itemId, itemRows[0].id));
    expect(participantRows).toHaveLength(1);
    expect(participantRows[0].memberId).toBe(aji.id);
    expect(participantRows[0].billedToMemberId).toBe(citra.id);

    // the debt itself belongs to citra (the redirect target), not aji
    const debtRows = await db.select().from(debts).where(eq(debts.subTripId, res.body.id));
    expect(debtRows).toHaveLength(1);
    expect(debtRows[0].memberId).toBe(citra.id);
    expect(debtRows[0].amount).toBe(20000);
  });

  it('rejects a per-item body with zero items', async () => {
    const { publicId, members } = await createTestTrip('subtrip-peritem3@example.com', ['Budi']);
    const res = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: members[0].id, createdByMemberId: members[0].id,
      splitMode: 'per_item', taxPercent: 0, servicePercent: 0, items: [],
    });
    expect(res.status).toBe(400);
  });

  it('rejects a billedToMemberId that belongs to a different trip', async () => {
    const { publicId, members } = await createTestTrip('subtrip-peritem4a@example.com', ['Budi', 'Aji']);
    const { members: otherMembers } = await createTestTrip('subtrip-peritem4b@example.com', ['Dedi']);
    const res = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: members[0].id, createdByMemberId: members[0].id,
      splitMode: 'per_item', taxPercent: 0, servicePercent: 0,
      items: [{ name: 'Item', price: 10000, participants: [{ memberId: members[1].id, billedToMemberId: otherMembers[0].id }] }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_member');
  });

  it('rejects a body missing splitMode entirely', async () => {
    const { publicId, members } = await createTestTrip('subtrip-peritem5@example.com', ['Budi']);
    const res = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: members[0].id, createdByMemberId: members[0].id,
      amount: 10000, participantMemberIds: [members[0].id],
    });
    expect(res.status).toBe(400);
  });
});
```

Add `subTripItems, subTripItemParticipants` to the top-of-file `import { trips, tripMembers, debts, subTrips } from '../src/db/schema';`-style import if this test file has one (check the actual current import line and extend it — don't add a duplicate import statement).

- [ ] **Step 6: Run it to verify it fails, then implement, then verify it passes**

Run: `cd server && npx vitest run tests/subtrips.test.ts`
Expected: FAIL first (before Steps 2-3's implementation exists in your working copy — if you're doing Steps 2-3 before Step 5 that's fine too, TDD ordering here is less strict than usual since Step 4's migration must happen before ANY of these tests can pass anyway; just make sure you run the suite red-then-green at some point and can show both). After Steps 2-3 are in place: PASS.

- [ ] **Step 7: Run the full server suite**

Run: `cd server && npx vitest run`
Expected: PASS — every pre-existing test (now migrated) plus the new per-item tests.

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/subtrips.ts server/tests/subtrips.test.ts server/tests/subtrips-edit-delete.test.ts server/tests/subtrips-debts.test.ts server/tests/subtrips-rateLimit.test.ts
git commit -m "Add per-item sub trip creation; migrate subTripInputSchema to a splitMode discriminated union"
```

---

### Task 4: `GET /api/trips/:publicId/subtrips/:subTripId` — return the item breakdown

**Files:**
- Modify: `server/src/routes/subtrips.ts`
- Modify: `server/tests/subtrips.test.ts`

**Interfaces:**
- Produces: the detail response gains `splitMode`, `taxPercent`, `servicePercent`, and `items: {id, name, price, participants: {memberId, name, billedToMemberId, billedToName}[]}[]` (empty array for `splitMode === 'total'`) — consumed by Task 6 (frontend `SubTripDetail` type) and Task 10 (the "Rincian item" UI section).

- [ ] **Step 1: Write the failing test**

Append to `server/tests/subtrips.test.ts`:
```ts
describe('GET /api/trips/:publicId/subtrips/:subTripId — per-item mode', () => {
  it('returns splitMode, tax/service percents, and the item/participant breakdown', async () => {
    const { publicId, members } = await createTestTrip('subtrip-detail-peritem@example.com', ['Budi', 'Aji', 'Citra']);
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;
    const citra = members.find((m) => m.name === 'Citra')!;

    const createRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan di Resto', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, createdByMemberId: budi.id,
      splitMode: 'per_item', taxPercent: 10, servicePercent: 5,
      items: [{ name: 'Nasi Goreng', price: 100000, participants: [{ memberId: aji.id, billedToMemberId: citra.id }] }],
    });

    const res = await request(app).get(`/api/trips/${publicId}/subtrips/${createRes.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.splitMode).toBe('per_item');
    expect(res.body.taxPercent).toBe(10);
    expect(res.body.servicePercent).toBe(5);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe('Nasi Goreng');
    expect(res.body.items[0].price).toBe(100000);
    expect(res.body.items[0].participants).toHaveLength(1);
    expect(res.body.items[0].participants[0].memberId).toBe(aji.id);
    expect(res.body.items[0].participants[0].name).toBe('Aji');
    expect(res.body.items[0].participants[0].billedToMemberId).toBe(citra.id);
    expect(res.body.items[0].participants[0].billedToName).toBe('Citra');
  });

  it('returns an empty items array and splitMode "total" for a total-mode sub trip', async () => {
    const { publicId, members } = await createTestTrip('subtrip-detail-total@example.com', ['Budi']);
    const createRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: members[0].id, createdByMemberId: members[0].id,
      splitMode: 'total', amount: 10000, participantMemberIds: [members[0].id],
    });

    const res = await request(app).get(`/api/trips/${publicId}/subtrips/${createRes.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.splitMode).toBe('total');
    expect(res.body.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/subtrips.test.ts`
Expected: FAIL — `splitMode`/`items` undefined on the response.

- [ ] **Step 3: Implement**

Read the current `router.get<{ publicId: string; subTripId: string }>('/:subTripId', ...)` handler in `server/src/routes/subtrips.ts` first (it was shown in full in Task 3's Step 1 read — re-check it's still exactly that shape before editing). Replace it with:
```ts
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
    taxPercent: subTrip.taxPercent,
    servicePercent: subTrip.servicePercent,
    items,
    debts: debtRows.map((d) => ({ id: d.id, memberId: d.memberId, name: nameById.get(d.memberId) ?? '', amount: d.amount, settled: d.settled })),
  });
});
```
(If Task 1's Step 4 found that `taxPercent`/`servicePercent` come back as strings from the DB rather than numbers, wrap them here: `taxPercent: Number(subTrip.taxPercent), servicePercent: Number(subTrip.servicePercent),` — check your own Task 1 report/notes for which case applies.)

Add `subTripItems, subTripItemParticipants` to this file's schema import if Task 3 didn't already add them (it should have — just confirm, don't duplicate the import).

- [ ] **Step 4: Run the tests**

Run: `cd server && npx vitest run tests/subtrips.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full server suite**

Run: `cd server && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/subtrips.ts server/tests/subtrips.test.ts
git commit -m "Return item breakdown in GET sub trip detail for per-item mode"
```

---

### Task 5: `PATCH /api/trips/:publicId/subtrips/:subTripId` — per-item edit, with server-enforced mode lock

**Files:**
- Modify: `server/src/routes/subtrips.ts`
- Modify: `server/tests/subtrips-edit-delete.test.ts`

**Interfaces:**
- Consumes: `reconcileDebts` (Tahap 2a, unchanged), `computeItemBasedShares` (Task 2).
- Produces: `PATCH` now rejects (400 `split_mode_locked`) any body whose `splitMode` differs from the stored sub trip's — this is the server-side half of design decision §2.3 (client-side half is Task 7).

**This task's Step 1 also requires migrating every existing `PATCH .../subtrips/:subTripId` test body in `subtrips-edit-delete.test.ts` to include `splitMode: 'total'`**, same reasoning as Task 3's Step 4 — the discriminated union schema (already live from Task 3) rejects any body without it.

- [ ] **Step 1: Read the current PATCH handler, then migrate existing test bodies**

Read the current `router.patch<{ publicId: string; subTripId: string }>('/:subTripId', attachUserIfPresent, async (req, res) => { ... })` handler in `server/src/routes/subtrips.ts` in full before editing.

In `server/tests/subtrips-edit-delete.test.ts`, find every `.send({...})` body sent to a `PATCH .../subtrips/:subTripId` call (including inside any shared helper like `createTestTripWithSubTrip` if it also issues a PATCH — check) and add `splitMode: 'total',` to each. Run `cd server && npx vitest run tests/subtrips-edit-delete.test.ts` — any `400 invalid_body` remaining means a missed call site.

- [ ] **Step 2: Rewrite the PATCH handler to branch on `splitMode`, enforcing the lock**

Replace the handler with:
```ts
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
```
Note the `createdByMemberId` immutability comment from the original handler (it's not in the `.set()` calls above, matching the existing behavior exactly — `data.createdByMemberId` is only used for the `memberIdsBelongToTrip` scoping check, never written).

- [ ] **Step 3: Write the failing per-item edit tests**

Append to `server/tests/subtrips-edit-delete.test.ts`:
```ts
describe('PATCH /api/trips/:publicId/subtrips/:subTripId — per-item mode', () => {
  it('replaces the item list wholesale and recomputes debts', async () => {
    const { cookie } = await createAuthedUser('edit-peritem1@example.com');
    const createTripRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02', members: ['Budi', 'Aji'],
    });
    const { publicId } = createTripRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    const createRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, createdByMemberId: budi.id,
      splitMode: 'per_item', taxPercent: 0, servicePercent: 0,
      items: [{ name: 'Item A', price: 20000, participants: [{ memberId: aji.id }] }],
    });
    const subTripId = createRes.body.id;

    const patchRes = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(budi.id))
      .send({
        name: 'Makan (edited)', category: 'makan', date: '2026-01-01',
        payerMemberId: budi.id, createdByMemberId: budi.id,
        splitMode: 'per_item', taxPercent: 0, servicePercent: 0,
        items: [{ name: 'Item B', price: 40000, participants: [{ memberId: aji.id }] }],
      });
    expect(patchRes.status).toBe(200);

    const itemRows = await db.select().from(subTripItems).where(eq(subTripItems.subTripId, subTripId));
    expect(itemRows).toHaveLength(1);
    expect(itemRows[0].name).toBe('Item B');

    const debtRows = await db.select().from(debts).where(eq(debts.subTripId, subTripId));
    expect(debtRows).toHaveLength(1);
    expect(debtRows[0].amount).toBe(40000);
  });

  it('preserves settled status on an edit that keeps the same debtor', async () => {
    const { cookie } = await createAuthedUser('edit-peritem2@example.com');
    const createTripRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02', members: ['Budi', 'Aji'],
    });
    const { publicId } = createTripRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    const createRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, createdByMemberId: budi.id,
      splitMode: 'per_item', taxPercent: 0, servicePercent: 0,
      items: [{ name: 'Item A', price: 20000, participants: [{ memberId: aji.id }] }],
    });
    const subTripId = createRes.body.id;
    const [debtRow] = await db.select().from(debts).where(eq(debts.subTripId, subTripId));
    await db.update(debts).set({ settled: true }).where(eq(debts.id, debtRow.id));

    await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(budi.id))
      .send({
        name: 'Makan', category: 'makan', date: '2026-01-01',
        payerMemberId: budi.id, createdByMemberId: budi.id,
        splitMode: 'per_item', taxPercent: 0, servicePercent: 0,
        items: [{ name: 'Item A', price: 40000, participants: [{ memberId: aji.id }] }],
      });

    const [updatedDebt] = await db.select().from(debts).where(eq(debts.memberId, aji.id));
    expect(updatedDebt.settled).toBe(true);
    expect(updatedDebt.amount).toBe(40000);
  });

  it('rejects a PATCH that tries to change splitMode from the stored value', async () => {
    const { cookie } = await createAuthedUser('edit-peritem3@example.com');
    const createTripRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02', members: ['Budi'],
    });
    const { publicId } = createTripRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));

    const createRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: members[0].id, createdByMemberId: members[0].id,
      splitMode: 'total', amount: 10000, participantMemberIds: [members[0].id],
    });
    const subTripId = createRes.body.id;

    const patchRes = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(members[0].id))
      .send({
        name: 'Makan', category: 'makan', date: '2026-01-01',
        payerMemberId: members[0].id, createdByMemberId: members[0].id,
        splitMode: 'per_item', taxPercent: 0, servicePercent: 0,
        items: [{ name: 'Item', price: 10000, participants: [{ memberId: members[0].id }] }],
      });
    expect(patchRes.status).toBe(400);
    expect(patchRes.body.error).toBe('split_mode_locked');
  });
});
```

Add `subTripItems` to this file's schema import if not already present from a prior task's changes.

- [ ] **Step 4: Run it to verify it fails, then run again after Step 2's implementation**

Run: `cd server && npx vitest run tests/subtrips-edit-delete.test.ts`
Expected: FAIL before Step 2's handler rewrite is in place, PASS after.

- [ ] **Step 5: Run the full server suite — this is the last backend task, confirm everything together**

Run: `cd server && npx vitest run && npx tsc --noEmit`
Expected: PASS, clean typecheck. All backend work for this plan is now done.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/subtrips.ts server/tests/subtrips-edit-delete.test.ts
git commit -m "Add per-item sub trip editing with a server-enforced split-mode lock"
```

---

### Task 6: Frontend API client — `SubTripInput`/`SubTripDetail` grow item/splitMode fields; migrate the existing total-mode submit

**Files:**
- Modify: `client/src/lib/api.ts`
- Modify: `client/src/components/AddEditSubTripSheet.tsx`
- Modify: `client/tests/AddEditSubTripSheet.test.tsx`

**Interfaces:**
- Produces: `SplitMode`, `ItemParticipantInput`, `ItemInput`, `SubTripInput` (now a union of `TotalModeInput | PerItemModeInput`), `SubTripDetail` (gains `splitMode`/`taxPercent`/`servicePercent`/`items`) — consumed by every remaining frontend task.

The current `SubTripInput` is a flat interface with no `splitMode`; the server (Task 3) now rejects any body without it. This task's second half fixes the one existing caller (`AddEditSubTripSheet`'s total-mode submit) so the app doesn't break.

- [ ] **Step 1: Read the current files first**

Read `client/src/lib/api.ts` and `client/src/components/AddEditSubTripSheet.tsx` in full before editing.

- [ ] **Step 2: Replace the sub-trip types in `client/src/lib/api.ts`**

Replace `SubTripDetail` and `SubTripInput` with:
```ts
export type SplitMode = 'total' | 'per_item';

export interface ItemParticipantInput {
  memberId: number;
  billedToMemberId?: number;
}

export interface ItemInput {
  name: string;
  price: number;
  participants: ItemParticipantInput[];
}

export interface ItemParticipantDetail {
  memberId: number;
  name: string;
  billedToMemberId: number | null;
  billedToName: string | null;
}

export interface SubTripItemDetail {
  id: number;
  name: string;
  price: number;
  participants: ItemParticipantDetail[];
}

export interface SubTripDetail {
  id: number;
  name: string;
  category: SubTripCategory;
  date: string;
  payerMemberId: number;
  payerName: string;
  amount: number;
  payerParticipates: boolean;
  createdByMemberId: number;
  splitMode: SplitMode;
  taxPercent: number;
  servicePercent: number;
  items: SubTripItemDetail[];
  debts: DebtItem[];
}

export interface TotalModeInput {
  name: string;
  category: SubTripCategory;
  date: string;
  payerMemberId: number;
  createdByMemberId: number;
  splitMode: 'total';
  amount: number;
  participantMemberIds: number[];
}

export interface PerItemModeInput {
  name: string;
  category: SubTripCategory;
  date: string;
  payerMemberId: number;
  createdByMemberId: number;
  splitMode: 'per_item';
  taxPercent: number;
  servicePercent: number;
  items: ItemInput[];
}

export type SubTripInput = TotalModeInput | PerItemModeInput;
```
(`createSubTrip`/`getSubTrip`/`updateSubTrip` keep their existing signatures — they already reference `SubTripInput`/`SubTripDetail` by name, so no change needed there.)

- [ ] **Step 3: Migrate `AddEditSubTripSheet.tsx`'s submit payload to `splitMode: 'total'`**

In `handleSubmit`, replace the `const input = { ... }` object with:
```ts
      const input: SubTripInput = {
        name: name.trim(),
        category,
        date: initialData?.date ?? todayIso(),
        payerMemberId,
        createdByMemberId: initialData?.createdByMemberId ?? currentMemberId,
        splitMode: 'total',
        amount,
        participantMemberIds: [...checkedIds],
      };
```
Update the import line to bring in the new type: `import { api, type SubTripCategory, type SubTripDetail, type SubTripInput } from '../lib/api';`

- [ ] **Step 4: Fix the test fixture's type**

In `client/tests/AddEditSubTripSheet.test.tsx`, the `initialData` object (edit-mode describe block) must satisfy the now-larger `SubTripDetail` type. Add these three fields to it:
```ts
    splitMode: 'total' as const,
    taxPercent: 0,
    servicePercent: 0,
    items: [],
```

- [ ] **Step 5: Run tests and typecheck**

```bash
cd client
npx vitest run tests/AddEditSubTripSheet.test.tsx
npx tsc --noEmit
```
Expected: PASS, clean typecheck (the existing tests use `expect.objectContaining`, so the new `splitMode` field in the submitted payload doesn't break them).

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/api.ts client/src/components/AddEditSubTripSheet.tsx client/tests/AddEditSubTripSheet.test.tsx
git commit -m "Extend SubTripInput/SubTripDetail for per-item mode; migrate total-mode submit to splitMode"
```

---

### Task 7: Mode toggle — "Opsi lanjutan" collapsible, locked on edit

**Files:**
- Modify: `client/src/components/AddEditSubTripSheet.tsx`
- Modify: `client/tests/AddEditSubTripSheet.test.tsx`

**Interfaces:**
- Consumes: `SplitMode` from Task 6.
- Produces: `splitMode` state — consumed by Task 8 (item editor visibility) and Task 9 (submit payload).

- [ ] **Step 1: Add state**

After `const [error, setError] = useState<string | null>(null);`, add:
```ts
  const [splitMode, setSplitMode] = useState<SplitMode>(initialData?.splitMode ?? 'total');
  const [advancedOpen, setAdvancedOpen] = useState(false);
```
Update the import: `import { api, type SplitMode, type SubTripCategory, type SubTripDetail, type SubTripInput } from '../lib/api';`

- [ ] **Step 2: Gate `canSubmit` on mode**

Replace:
```ts
  const amount = Number.parseInt(amountText, 10);
  const canSubmit = Boolean(name.trim() && category && Number.isFinite(amount) && amount > 0 && checkedIds.size > 0);
```
with:
```ts
  const amount = Number.parseInt(amountText, 10);
  const totalModeValid = Number.isFinite(amount) && amount > 0 && checkedIds.size > 0;
  // Per-item validity is wired in a later task; until then this mode can't be submitted.
  const canSubmit = Boolean(name.trim() && category && (splitMode === 'total' ? totalModeValid : false));
```

- [ ] **Step 3: Add the "Opsi lanjutan" section and hide Nominal/Dibagi-ke in per-item mode**

Insert this block right after the Kategori `</div>` and before the Nominal `<label>`:
```tsx
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="flex items-center justify-between font-inter text-xs font-semibold text-sub"
          >
            <span>Opsi lanjutan</span>
            <span>{advancedOpen ? '▴' : '▾'}</span>
          </button>
          {advancedOpen && (
            <div className="flex flex-col gap-1.5 rounded-input border border-border bg-surface p-3.5">
              <span className="font-inter text-xs font-semibold text-sub">Cara bagi</span>
              {mode === 'create' ? (
                <div className="flex overflow-hidden rounded-pill border border-border">
                  <button
                    type="button"
                    onClick={() => setSplitMode('total')}
                    className={`flex-1 px-3.5 py-2 font-inter text-[12.5px] font-medium ${
                      splitMode === 'total' ? 'bg-accent text-onAccent' : 'bg-surface text-text'
                    }`}
                  >
                    Jumlah total
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitMode('per_item')}
                    className={`flex-1 px-3.5 py-2 font-inter text-[12.5px] font-medium ${
                      splitMode === 'per_item' ? 'bg-accent text-onAccent' : 'bg-surface text-text'
                    }`}
                  >
                    Rincian per item
                  </button>
                </div>
              ) : (
                <div className="rounded-pill border border-border bg-surfaceAlt px-3.5 py-2 font-inter text-[12.5px] font-medium text-sub">
                  {splitMode === 'total' ? 'Jumlah total' : 'Rincian per item'} (tidak bisa diubah saat edit)
                </div>
              )}
            </div>
          )}
        </div>

```
Then wrap the existing Nominal `<label>...</label>` block in `{splitMode === 'total' && ( ... )}`, and wrap the existing "Dibagi ke" `<div className="flex flex-col gap-2">...</div>` block (the one with the checkbox list) in `{splitMode === 'total' && ( ... )}` too.

- [ ] **Step 4: Write tests**

Append to `client/tests/AddEditSubTripSheet.test.tsx`:
```ts
describe('AddEditSubTripSheet — split mode toggle', () => {
  it('Opsi lanjutan is collapsed by default and opens on click', async () => {
    render(<AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />);
    expect(screen.queryByText('Jumlah total')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByText('Opsi lanjutan'));
    expect(screen.getByText('Jumlah total')).toBeInTheDocument();
  });

  it('switching to Rincian per item hides Nominal and Dibagi ke, and disables submit', async () => {
    render(<AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('misal: Makan siang di Resto A'), 'Makan');
    await user.click(screen.getByText('Makan', { selector: 'button' }));
    await user.click(screen.getByText('Opsi lanjutan'));
    await user.click(screen.getByText('Rincian per item'));
    expect(screen.queryByPlaceholderText('0')).not.toBeInTheDocument();
    expect(screen.queryByText(/Dibagi ke/)).not.toBeInTheDocument();
    expect(screen.getByText('Simpan pengeluaran')).toBeDisabled();
  });

  it('mode is a non-interactive indicator in edit mode', async () => {
    const initialData = {
      id: 5, name: 'Makan Malam', category: 'makan' as const, date: '2026-01-01',
      payerMemberId: 1, payerName: 'Budi', amount: 60000, payerParticipates: true, createdByMemberId: 1,
      splitMode: 'per_item' as const, taxPercent: 10, servicePercent: 0, items: [], debts: [],
    };
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="edit" initialData={initialData} onClose={() => {}} onSaved={() => {}} />,
    );
    await userEvent.setup().click(screen.getByText('Opsi lanjutan'));
    expect(screen.getByText(/tidak bisa diubah saat edit/)).toBeInTheDocument();
    expect(screen.queryByText('Jumlah total', { selector: 'button' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd client && npx vitest run tests/AddEditSubTripSheet.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/AddEditSubTripSheet.tsx client/tests/AddEditSubTripSheet.test.tsx
git commit -m "Add Opsi lanjutan split-mode toggle, locked on edit"
```

---

### Task 8: Item editor — `ItemRow.tsx` (name, price, participants, search, Tagihkan ke)

**Files:**
- Create: `client/src/components/ItemRow.tsx`
- Test: `client/tests/ItemRow.test.tsx`
- Modify: `client/src/components/AddEditSubTripSheet.tsx`
- Modify: `client/tests/AddEditSubTripSheet.test.tsx`

**Interfaces:**
- Produces: `ItemRow` component (`ItemRowMember`, `ItemRowParticipant` types) — consumed by `AddEditSubTripSheet`. `DraftItem`/items state in the sheet — consumed by Task 9 (submit payload).

This task wires the full item-editing UI. Submitting in per-item mode is still disabled (Task 7 left `canSubmit` hardcoded `false` for that branch) — Task 9 turns it on once tax/service and the submit payload exist.

- [ ] **Step 1: Write `ItemRow.tsx`**

```tsx
import { useState } from 'react';

export interface ItemRowMember {
  id: number;
  name: string;
}

export interface ItemRowParticipant {
  memberId: number;
  billedToMemberId: number | null;
}

interface ItemRowProps {
  index: number;
  name: string;
  priceText: string;
  participants: ItemRowParticipant[];
  members: ItemRowMember[];
  canRemove: boolean;
  onNameChange: (name: string) => void;
  onPriceChange: (priceText: string) => void;
  onParticipantsChange: (participants: ItemRowParticipant[]) => void;
  onRemove: () => void;
}

export default function ItemRow({
  index, name, priceText, participants, members, canRemove,
  onNameChange, onPriceChange, onParticipantsChange, onRemove,
}: ItemRowProps) {
  const [search, setSearch] = useState('');
  const [redirectOpenFor, setRedirectOpenFor] = useState<number | null>(null);

  const participantIds = new Set(participants.map((p) => p.memberId));
  const filteredMembers = members.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  function toggleParticipant(memberId: number) {
    if (participantIds.has(memberId)) {
      onParticipantsChange(participants.filter((p) => p.memberId !== memberId));
    } else {
      onParticipantsChange([...participants, { memberId, billedToMemberId: null }]);
    }
  }

  function selectAll() {
    onParticipantsChange(
      members.map((m) => ({
        memberId: m.id,
        billedToMemberId: participants.find((p) => p.memberId === m.id)?.billedToMemberId ?? null,
      })),
    );
  }

  function clearAll() {
    onParticipantsChange([]);
  }

  function setBilledTo(memberId: number, billedToMemberId: number | null) {
    onParticipantsChange(participants.map((p) => (p.memberId === memberId ? { ...p, billedToMemberId } : p)));
    setRedirectOpenFor(null);
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-input border border-border bg-surface p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-inter text-xs font-semibold text-sub">Item {index + 1}</span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="font-inter text-xs font-semibold text-neg">
            Hapus item
          </button>
        )}
      </div>

      <input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Nama item"
        className="rounded-input border border-border bg-bg px-3.5 py-2.5 font-inter text-sm text-text"
      />

      <div className="flex items-center gap-2 rounded-input border border-border bg-bg px-3.5 py-2.5">
        <span className="font-mono text-sm text-sub">Rp</span>
        <input
          value={priceText}
          onChange={(e) => onPriceChange(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          placeholder="0"
          className="flex-1 border-none bg-transparent font-mono text-sm text-text outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-inter text-xs font-semibold text-sub">
            Peserta ({participants.length}/{members.length})
          </span>
          <div className="flex gap-3">
            <button type="button" onClick={selectAll} className="font-inter text-xs font-semibold text-accent">
              Pilih semua
            </button>
            <button type="button" onClick={clearAll} className="font-inter text-xs font-semibold text-accent">
              Kosongkan
            </button>
          </div>
        </div>
        {members.length > 5 && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari anggota"
            className="rounded-input border border-border bg-bg px-3.5 py-2 font-inter text-[12.5px] text-text"
          />
        )}
        <div className="flex flex-col gap-1.5">
          {filteredMembers.map((m) => {
            const participant = participants.find((p) => p.memberId === m.id);
            const billedToMember = participant?.billedToMemberId
              ? members.find((mm) => mm.id === participant.billedToMemberId)
              : undefined;
            return (
              <div key={m.id} className="flex flex-col gap-1.5 rounded-input border border-border bg-bg px-3.5 py-2">
                <label className="flex items-center gap-2.5">
                  <input type="checkbox" checked={participantIds.has(m.id)} onChange={() => toggleParticipant(m.id)} />
                  <span className="font-inter text-sm text-text">{m.name}</span>
                </label>
                {participant && (
                  <div className="relative ml-6">
                    <button
                      type="button"
                      onClick={() => setRedirectOpenFor(redirectOpenFor === m.id ? null : m.id)}
                      className="font-inter text-[11px] font-medium text-accent"
                    >
                      {billedToMember ? `Tagihkan ke ${billedToMember.name} →` : 'Tagihkan ke →'}
                    </button>
                    {redirectOpenFor === m.id && (
                      <div className="absolute left-0 top-full z-10 mt-1 flex flex-col overflow-hidden rounded-input border border-border bg-surface shadow-lg">
                        <button
                          type="button"
                          onClick={() => setBilledTo(m.id, null)}
                          className={`px-3.5 py-2 text-left font-inter text-[12.5px] ${
                            participant.billedToMemberId === null ? 'bg-accent text-onAccent' : 'text-text'
                          }`}
                        >
                          Tidak dialihkan
                        </button>
                        {members
                          .filter((other) => other.id !== m.id)
                          .map((other) => (
                            <button
                              key={other.id}
                              type="button"
                              onClick={() => setBilledTo(m.id, other.id)}
                              className={`px-3.5 py-2 text-left font-inter text-[12.5px] ${
                                participant.billedToMemberId === other.id ? 'bg-accent text-onAccent' : 'text-text'
                              }`}
                            >
                              {other.name}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `ItemRow.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ItemRow from '../src/components/ItemRow';

const members = [
  { id: 1, name: 'Budi' },
  { id: 2, name: 'Aji' },
];

describe('ItemRow', () => {
  it('calls onNameChange/onPriceChange as the user types', async () => {
    const onNameChange = vi.fn();
    const onPriceChange = vi.fn();
    render(
      <ItemRow index={0} name="" priceText="" participants={[]} members={members} canRemove={false}
        onNameChange={onNameChange} onPriceChange={onPriceChange} onParticipantsChange={() => {}} onRemove={() => {}} />,
    );
    await userEvent.setup().type(screen.getByPlaceholderText('Nama item'), 'X');
    expect(onNameChange).toHaveBeenCalledWith('X');
  });

  it('toggling a member checkbox adds/removes them from participants', async () => {
    const onParticipantsChange = vi.fn();
    render(
      <ItemRow index={0} name="Item" priceText="1000" participants={[{ memberId: 1, billedToMemberId: null }]} members={members}
        canRemove={false} onNameChange={() => {}} onPriceChange={() => {}} onParticipantsChange={onParticipantsChange} onRemove={() => {}} />,
    );
    await userEvent.setup().click(screen.getByText('Aji'));
    expect(onParticipantsChange).toHaveBeenCalledWith([
      { memberId: 1, billedToMemberId: null },
      { memberId: 2, billedToMemberId: null },
    ]);
  });

  it('Hapus item calls onRemove, hidden when canRemove is false', () => {
    const onRemove = vi.fn();
    render(
      <ItemRow index={0} name="Item" priceText="1000" participants={[]} members={members} canRemove={false}
        onNameChange={() => {}} onPriceChange={() => {}} onParticipantsChange={() => {}} onRemove={onRemove} />,
    );
    expect(screen.queryByText('Hapus item')).not.toBeInTheDocument();
  });

  it('Tagihkan ke picker redirects a participant to another member', async () => {
    const onParticipantsChange = vi.fn();
    render(
      <ItemRow index={0} name="Item" priceText="1000" participants={[{ memberId: 1, billedToMemberId: null }]} members={members}
        canRemove={false} onNameChange={() => {}} onPriceChange={() => {}} onParticipantsChange={onParticipantsChange} onRemove={() => {}} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('Tagihkan ke →'));
    await user.click(screen.getByText('Aji'));
    expect(onParticipantsChange).toHaveBeenCalledWith([{ memberId: 1, billedToMemberId: 2 }]);
  });
});
```

- [ ] **Step 3: Run it, verify it fails, then wire `ItemRow` into `AddEditSubTripSheet.tsx`**

Run: `cd client && npx vitest run tests/ItemRow.test.tsx` — expect FAIL (module missing) before Step 1, PASS after.

Add near the top of `AddEditSubTripSheet.tsx`:
```ts
import { useRef, useState } from 'react';
import ItemRow, { type ItemRowParticipant } from './ItemRow';
```
(replace the existing `import { useState } from 'react';` line)

Add above the component function:
```ts
interface DraftItem {
  key: string;
  name: string;
  priceText: string;
  participants: ItemRowParticipant[];
}
```

Add inside the component, after the `checkedIds` state block:
```ts
  const [items, setItems] = useState<DraftItem[]>(() =>
    initialData && initialData.items.length > 0
      ? initialData.items.map((item) => ({
          key: `item-${item.id}`,
          name: item.name,
          priceText: String(item.price),
          participants: item.participants.map((p) => ({ memberId: p.memberId, billedToMemberId: p.billedToMemberId })),
        }))
      : [{ key: 'item-0', name: '', priceText: '', participants: members.map((m) => ({ memberId: m.id, billedToMemberId: null })) }],
  );
  const nextItemKeyRef = useRef(items.length);

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        key: `item-${nextItemKeyRef.current++}`,
        name: '',
        priceText: '',
        participants: members.map((m) => ({ memberId: m.id, billedToMemberId: null })),
      },
    ]);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }
```

Insert this block right after the `{splitMode === 'total' && ( <label>...Nominal...</label> )}` block from Task 7:
```tsx
        {splitMode === 'per_item' && (
          <div className="flex flex-col gap-2.5">
            <span className="font-inter text-xs font-semibold text-sub">Item</span>
            {items.map((item, idx) => (
              <ItemRow
                key={item.key}
                index={idx}
                name={item.name}
                priceText={item.priceText}
                participants={item.participants}
                members={members}
                canRemove={items.length > 1}
                onNameChange={(value) => updateItem(item.key, { name: value })}
                onPriceChange={(value) => updateItem(item.key, { priceText: value })}
                onParticipantsChange={(value) => updateItem(item.key, { participants: value })}
                onRemove={() => removeItem(item.key)}
              />
            ))}
            <button
              type="button"
              onClick={addItem}
              className="rounded-input border border-dashed border-border px-3.5 py-2.5 font-inter text-[12.5px] font-semibold text-accent"
            >
              + Tambah item
            </button>
          </div>
        )}
```

- [ ] **Step 4: Write sheet-level wiring tests**

Append to `client/tests/AddEditSubTripSheet.test.tsx`:
```ts
describe('AddEditSubTripSheet — item editor', () => {
  async function openPerItemMode() {
    render(<AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Opsi lanjutan'));
    await user.click(screen.getByText('Rincian per item'));
    return user;
  }

  it('shows one empty item row by default, and + Tambah item adds another', async () => {
    const user = await openPerItemMode();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    await user.click(screen.getByText('+ Tambah item'));
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('reconstructs multiple items from initialData in edit mode', () => {
    const initialData = {
      id: 5, name: 'Makan', category: 'makan' as const, date: '2026-01-01',
      payerMemberId: 1, payerName: 'Budi', amount: 50000, payerParticipates: true, createdByMemberId: 1,
      splitMode: 'per_item' as const, taxPercent: 0, servicePercent: 0, debts: [],
      items: [
        { id: 1, name: 'Nasi', price: 20000, participants: [{ memberId: 1, name: 'Budi', billedToMemberId: null, billedToName: null }] },
        { id: 2, name: 'Es Teh', price: 5000, participants: [{ memberId: 2, name: 'Aji', billedToMemberId: null, billedToName: null }] },
      ],
    };
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="edit" initialData={initialData} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(screen.getByDisplayValue('Nasi')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Es Teh')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd client
npx vitest run tests/ItemRow.test.tsx tests/AddEditSubTripSheet.test.tsx
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/ItemRow.tsx client/tests/ItemRow.test.tsx client/src/components/AddEditSubTripSheet.tsx client/tests/AddEditSubTripSheet.test.tsx
git commit -m "Add ItemRow editor and wire per-item item list into AddEditSubTripSheet"
```

---

### Task 9: Tax/service inputs, and the per-item submit payload

**Files:**
- Modify: `client/src/components/AddEditSubTripSheet.tsx`
- Modify: `client/tests/AddEditSubTripSheet.test.tsx`

**Interfaces:**
- Consumes: `items` state (Task 8), `PerItemModeInput` (Task 6).
- Produces: complete per-item submission — the last piece of `AddEditSubTripSheet`.

- [ ] **Step 1: Add tax/service state**

After the `items`/`nextItemKeyRef` block from Task 8, add:
```ts
  const [taxPercentText, setTaxPercentText] = useState(initialData ? String(initialData.taxPercent) : '0');
  const [servicePercentText, setServicePercentText] = useState(initialData ? String(initialData.servicePercent) : '0');
```

- [ ] **Step 2: Replace `canSubmit` to validate per-item mode for real**

Replace the Task 7 version:
```ts
  const amount = Number.parseInt(amountText, 10);
  const totalModeValid = Number.isFinite(amount) && amount > 0 && checkedIds.size > 0;
  const perItemModeValid =
    items.length > 0 &&
    items.every((item) => item.name.trim() && Number.parseInt(item.priceText, 10) > 0 && item.participants.length > 0);
  const canSubmit = Boolean(name.trim() && category && (splitMode === 'total' ? totalModeValid : perItemModeValid));
```

- [ ] **Step 3: Replace `handleSubmit` to build the per-item payload**

```ts
  async function handleSubmit() {
    if (!canSubmit || !category) return;
    setSubmitting(true);
    setError(null);
    try {
      const date = initialData?.date ?? todayIso();
      const createdByMemberId = initialData?.createdByMemberId ?? currentMemberId;
      const input: SubTripInput =
        splitMode === 'total'
          ? {
              name: name.trim(), category, date, payerMemberId, createdByMemberId,
              splitMode: 'total', amount, participantMemberIds: [...checkedIds],
            }
          : {
              name: name.trim(), category, date, payerMemberId, createdByMemberId,
              splitMode: 'per_item',
              taxPercent: Number.parseFloat(taxPercentText) || 0,
              servicePercent: Number.parseFloat(servicePercentText) || 0,
              items: items.map((item) => ({
                name: item.name.trim(),
                price: Number.parseInt(item.priceText, 10),
                participants: item.participants.map((p) =>
                  p.billedToMemberId ? { memberId: p.memberId, billedToMemberId: p.billedToMemberId } : { memberId: p.memberId },
                ),
              })),
            };
      if (mode === 'create') {
        await api.createSubTrip(publicId, input);
      } else if (initialData) {
        await api.updateSubTrip(publicId, initialData.id, input, currentMemberId);
      }
      onSaved();
    } catch {
      setError('Gagal simpan pengeluaran. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }
```

- [ ] **Step 4: Add the tax/service inputs to the JSX**

Insert right after the item-editor block from Task 8 (still inside the outer `{splitMode === 'per_item' && (...)}` — add these two `<label>`s after the "+ Tambah item" button, before that block's closing `</div>`):
```tsx
            <label className="flex flex-col gap-1.5">
              <span className="font-inter text-xs font-semibold text-sub">Pajak makanan (per item)</span>
              <div className="flex items-center gap-2 rounded-input border border-border bg-surface px-3.5 py-3">
                <input
                  value={taxPercentText}
                  onChange={(e) => setTaxPercentText(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  placeholder="0"
                  className="flex-1 border-none bg-transparent font-mono text-sm text-text outline-none"
                />
                <span className="font-mono text-sm text-sub">%</span>
              </div>
              <span className="font-inter text-[11px] text-sub">Dihitung per item dan dibebankan ke penanggungnya.</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-inter text-xs font-semibold text-sub">Service charge (rata)</span>
              <div className="flex items-center gap-2 rounded-input border border-border bg-surface px-3.5 py-3">
                <input
                  value={servicePercentText}
                  onChange={(e) => setServicePercentText(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  placeholder="0"
                  className="flex-1 border-none bg-transparent font-mono text-sm text-text outline-none"
                />
                <span className="font-mono text-sm text-sub">%</span>
              </div>
              <span className="font-inter text-[11px] text-sub">
                Dibagi rata ke semua peserta sub trip ini, tanpa peduli besar-kecil pesanannya masing-masing.
              </span>
            </label>
```

- [ ] **Step 5: Write end-to-end submission tests**

Append to `client/tests/AddEditSubTripSheet.test.tsx`:
```ts
describe('AddEditSubTripSheet — per-item submit', () => {
  it('submits a per-item create with items, tax, and service percent', async () => {
    vi.mocked(api.createSubTrip).mockResolvedValue({ id: 1 });
    render(<AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('misal: Makan siang di Resto A'), 'Makan');
    await user.click(screen.getByText('Makan', { selector: 'button' }));
    await user.click(screen.getByText('Opsi lanjutan'));
    await user.click(screen.getByText('Rincian per item'));
    await user.type(screen.getByPlaceholderText('Nama item'), 'Nasi Goreng');
    await user.type(screen.getByPlaceholderText('0'), '50000');
    await user.click(screen.getByText('Simpan pengeluaran'));
    expect(api.createSubTrip).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({
        splitMode: 'per_item',
        items: [{ name: 'Nasi Goreng', price: 50000, participants: expect.any(Array) }],
      }),
    );
  });

  it('disables submit until every item has a name and a positive price', async () => {
    render(<AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('misal: Makan siang di Resto A'), 'Makan');
    await user.click(screen.getByText('Makan', { selector: 'button' }));
    await user.click(screen.getByText('Opsi lanjutan'));
    await user.click(screen.getByText('Rincian per item'));
    expect(screen.getByText('Simpan pengeluaran')).toBeDisabled();
  });
});
```

- [ ] **Step 6: Run the client suite and typecheck**

```bash
cd client
npx vitest run
npx tsc --noEmit
```
Expected: PASS, clean typecheck.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/AddEditSubTripSheet.tsx client/tests/AddEditSubTripSheet.test.tsx
git commit -m "Add tax/service inputs and complete the per-item submit payload"
```

---

### Task 10: `SubTripDetailScreen` — "Rincian item" section

**Files:**
- Modify: `client/src/screens/SubTripDetailScreen.tsx`
- Modify: `client/tests/SubTripDetailScreen.test.tsx`

**Interfaces:**
- Consumes: `SubTripDetail.items` (Task 6/4).

- [ ] **Step 1: Read the current file**

Read `client/src/screens/SubTripDetailScreen.tsx` in full first.

- [ ] **Step 2: Add the "Rincian item" section**

Insert this block right before the existing `<div className="flex flex-col gap-2">` that starts with `Tagihan per orang`:
```tsx
      {subTrip.splitMode === 'per_item' && (
        <div className="flex flex-col gap-2">
          <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">Rincian item</div>
          {subTrip.items.map((item) => (
            <div key={item.id} className="flex flex-col gap-1.5 rounded-card border border-border bg-surface px-3.5 py-3">
              <div className="flex items-center justify-between">
                <span className="font-inter text-sm font-semibold text-text">{item.name}</span>
                <span className="font-mono text-sm text-text">{formatRupiah(item.price)}</span>
              </div>
              <div className="flex flex-col gap-1">
                {item.participants.map((p) => (
                  <div key={p.memberId} className="font-inter text-[11px] text-sub">
                    {p.name}
                    {p.billedToName ? ` → ditagihkan ke ${p.billedToName}` : ''}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

```

- [ ] **Step 3: Update the test fixture and add a test**

In `client/tests/SubTripDetailScreen.test.tsx`, add `splitMode: 'total' as const, taxPercent: 0, servicePercent: 0, items: [],` to the existing `subTripDetail` fixture (it must satisfy the now-larger `SubTripDetail` type).

Append:
```ts
describe('SubTripDetailScreen — item breakdown', () => {
  it('shows Rincian item for a per-item sub trip', async () => {
    setIdentity('a1', '2');
    vi.mocked(api.getSubTrip).mockResolvedValue({
      ...subTripDetail,
      splitMode: 'per_item',
      taxPercent: 10,
      servicePercent: 0,
      items: [{ id: 1, name: 'Nasi Goreng', price: 20000, participants: [{ memberId: 2, name: 'Aji', billedToMemberId: null, billedToName: null }] }],
    });
    renderScreen();
    expect(await screen.findByText('Rincian item')).toBeInTheDocument();
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument();
  });

  it('hides Rincian item for a total-mode sub trip', async () => {
    setIdentity('a1', '2');
    renderScreen();
    await screen.findByText('Makan Malam');
    expect(screen.queryByText('Rincian item')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd client && npx vitest run tests/SubTripDetailScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/screens/SubTripDetailScreen.tsx client/tests/SubTripDetailScreen.test.tsx
git commit -m "Show Rincian item breakdown on SubTripDetailScreen for per-item sub trips"
```

---

### Task 11: Final integration

**Files:** none new — verification only.

- [ ] **Step 1: Run the full test suites**

```bash
cd server && npx vitest run && npx tsc --noEmit
cd ../client && npx vitest run && npx tsc --noEmit
```
Expected: PASS, clean typecheck, both packages.

- [ ] **Step 2: Manual browser walkthrough**

Using the claude-in-chrome tools (same pattern as Tahap 1/2's final integration tasks): start the dev servers, open a trip, add a sub trip via "Rincian per item" with 2 items, a tax %, a service %, and one "Tagihkan ke" redirect. Verify: the created sub trip's total and debts on `RingkasanScreen`/`SubTripDetailScreen` match the item math; editing it keeps `splitMode` locked (toggle non-interactive); the "Rincian item" section renders on the detail screen.

- [ ] **Step 3: Fix anything the walkthrough finds, then commit**

If the walkthrough finds a bug, fix it, add/adjust a test that would have caught it, and commit with a message describing the fix.

---

## Self-Review Notes

- **Spec coverage:** §2 decisions (per-item redirect scope: Task 2/3/5's `computeItemBasedShares`; service charge never redirected: same function, `uniqueParticipants` computed from `memberId` not `billedToMemberId`; mode locked on edit: Task 5 server-side `split_mode_locked`, Task 7 client-side disabled toggle) — all covered. §3 data model — Task 1. §4 calculation rules — Task 2, matches formulas exactly (`Math.ceil` at each step). §5 edit behavior (wholesale item replace, `reconcileDebts` reused) — Task 5. §6 API — Tasks 3/4/5. §7 screens — Tasks 7/8/9 (sheet), Task 10 (detail screen). §8 visual fidelity — reused existing Tailwind classes/tokens throughout, no new visual language introduced. §9 out-of-scope items (live preview, OCR autofill, item duplication) — correctly not built anywhere in this plan.
- **Placeholder scan:** no TBD/TODO/"handle later" text in any task; every step has literal code or an exact shell command.
- **Type consistency:** `ItemRowParticipant` (Task 8) matches `ItemParticipantDetail`'s `billedToMemberId: number | null` shape used when reconstructing from `initialData.items` in edit mode. `SubTripInput`'s `ItemInput`/`ItemParticipantInput` (Task 6, client) match `itemInputSchema`/`itemParticipantSchema` (Task 3, server) field-for-field. `computeItemBasedShares`'s signature (Task 2) is called identically in Task 3 (create) and Task 5 (edit).