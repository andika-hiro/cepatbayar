# Tahap 2 (bagian 1): Ringkasan, Riwayat, Sub Trip (mode jumlah total) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build real Ringkasan (rollup saldo), Riwayat (sub trip list), Sub trip detail (tagihan per orang + tandai lunas), and Tambah/Edit/Hapus sub trip in "jumlah total" mode — replacing the Tahap 1 Ringkasan placeholder and completing the core expense-splitting loop for a single trip.

**Architecture:** Extends the existing Tahap 1 server (Express/Drizzle/MySQL) with `sub_trips` and `debts` tables, a new soft-auth middleware (`attachUserIfPresent`) for the "creator or original adder" edit/delete rule, and a nested `subtrips` router mounted under `/api/trips/:publicId/subtrips`. Extends the existing Tahap 1 client with three new screens (Ringkasan real, Riwayat, Sub trip detail) and one reusable full-screen sheet component (Add/Edit sub trip) triggered from multiple entry points as local component state, not a URL route. Full design and rationale: `docs/superpowers/specs/2026-08-08-cepatkan-bayar-stage-2-ringkasan-sub-trip-design.md`.

**Tech Stack:** Same as Tahap 1 — Node/Express/TypeScript/Drizzle/MySQL, React/TypeScript/Vite/Tailwind/React Router v7, Vitest/Supertest/Testing Library.

## Global Constraints

- All product-facing text is Bahasa Indonesia, copied verbatim from `context/Cepat Bayarkan.dc.html` / `context/handoff.md`, matching the exact copy patterns already established in Tahap 1's screens.
- Money amounts are always whole Rupiah integers (no decimals) — `amount` columns are `int`, never `decimal`/`float`. Share calculation: `share = Math.ceil(amount / participantCount)` — presisi penuh, cuma pecahan di bawah Rp1 dibulatkan ke atas.
- No debt is ever created for the payer against themselves — see spec §3.
- No debt/rollup simplification or netting, ever — every `Debt` row keeps its own independent `settled` status (this plan doesn't change that model, just adds the tables/endpoints that produce and consume it).
- `trips.id` (internal) must never appear in any API response — this plan's new endpoints must follow the same `publicId`-only discipline established in Tahap 1. `sub_trips.id` and `debts.id` MAY appear in responses (they're not the trip-access secret; they're scoped resource ids used the same way `trip_members.id` already is, per the Tahap 1 §9 decision — every endpoint that accepts one must validate it belongs to the trip identified by `publicId` in the URL).
- Edit/delete authorization for sub trips is a **soft guard**, not real security: trip creator is verified via real JWT session; "original adder" is verified only by trusting a client-supplied `X-Member-Id` header against `sub_trips.created_by_member_id`. This is intentional — see spec §2. Every task touching this must preserve, not strengthen or weaken, that model without discussion.
- Every backend route file and frontend screen file must have a corresponding test file; no task is complete until its tests pass.

---

## File Structure

```
server/
  src/
    db/
      schema.ts                 # MODIFY: add subTrips, debts tables
    lib/
      validators.ts             # NEW: shared isoDateSchema (extracted from trips.ts)
      tripAccess.ts             # NEW: getTripByPublicId, memberIdsBelongToTrip
      splitLogic.ts             # NEW: computeEqualShares, reconcileDebts (pure functions)
    auth/
      attachUserIfPresent.ts    # NEW: soft-auth middleware (never 401s itself)
    routes/
      trips.ts                  # MODIFY: use extracted validators/tripAccess; add GET /:publicId/summary
      subtrips.ts                # NEW: full sub-trip + debts CRUD, mounted with mergeParams
    app.ts                      # MODIFY: mount subtrips router
  tests/
    lib/
      splitLogic.test.ts        # NEW
      tripAccess.test.ts        # NEW
    auth/
      attachUserIfPresent.test.ts  # NEW
    trips.test.ts               # MODIFY: add summary endpoint tests
    subtrips.test.ts            # NEW: create/list/detail
    subtrips-edit-delete.test.ts # NEW: edit/delete authorization + reconcile
    subtrips-debts.test.ts      # NEW: toggle settled
client/
  src/
    lib/
      api.ts                    # MODIFY: add summary/subtrips/debts methods + types
    components/
      BottomNavTripLevel.tsx    # MODIFY: FAB becomes a real onAddClick callback, no longer disabled
      AddEditSubTripSheet.tsx   # NEW: reusable full-screen sheet form
    screens/
      RingkasanScreen.tsx       # NEW: replaces RingkasanPlaceholderScreen
      RiwayatScreen.tsx         # NEW
      SubTripDetailScreen.tsx   # NEW
    App.tsx                     # MODIFY: swap in real routes
  tests/
    BottomNavTripLevel.test.tsx # NEW (was untested in Tahap 1, now has real behavior to verify)
    RingkasanScreen.test.tsx    # NEW
    RiwayatScreen.test.tsx      # NEW
    SubTripDetailScreen.test.tsx # NEW
    AddEditSubTripSheet.test.tsx # NEW
```

---

### Task 1: Database schema — `sub_trips` and `debts` tables

**Files:**
- Modify: `server/src/db/schema.ts`
- Test: `server/tests/db.test.ts`

**Interfaces:**
- Consumes: existing `trips`, `tripMembers` tables from Tahap 1.
- Produces: `subTrips` table (`id, tripId, name, category, date, payerMemberId, amount, createdByMemberId, createdAt, updatedByMemberId, updatedAt`), `debts` table (`id, subTripId, memberId, amount, settled, settledAt, createdAt`) — consumed by every later task in this plan.

- [ ] **Step 1: Add the two tables to the schema**

Modify `server/src/db/schema.ts` — add these imports to the existing `drizzle-orm/mysql-core` import line (merge with what's already imported: `mysqlTable, int, varchar, timestamp, date`):
```ts
import { mysqlTable, int, varchar, timestamp, date, mysqlEnum, boolean } from 'drizzle-orm/mysql-core';
```

Append these two table definitions after the existing `tripMembers` table:
```ts
export const subTrips = mysqlTable('sub_trips', {
  id: int('id').autoincrement().primaryKey(),
  tripId: int('trip_id').notNull().references(() => trips.id),
  name: varchar('name', { length: 255 }).notNull(),
  category: mysqlEnum('category', ['makan', 'transport', 'nginap', 'tiket_wisata', 'lainnya']).notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  payerMemberId: int('payer_member_id').notNull().references(() => tripMembers.id),
  amount: int('amount').notNull(),
  createdByMemberId: int('created_by_member_id').notNull().references(() => tripMembers.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedByMemberId: int('updated_by_member_id'),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export const debts = mysqlTable('debts', {
  id: int('id').autoincrement().primaryKey(),
  subTripId: int('sub_trip_id').notNull().references(() => subTrips.id),
  memberId: int('member_id').notNull().references(() => tripMembers.id),
  amount: int('amount').notNull(),
  settled: boolean('settled').notNull().default(false),
  settledAt: timestamp('settled_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

- [ ] **Step 2: Push the schema to both local databases**

```bash
cd server
npx drizzle-kit push
DB_NAME=cepatkan_bayar_test npx drizzle-kit push
```
Expected: both report the 2 new tables created (accept the prompt).

- [ ] **Step 3: Write the failing round-trip test**

Add to `server/tests/db.test.ts` (new `describe` block, alongside the existing `users` round-trip test):
```ts
import { subTrips, trips, tripMembers, debts } from '../src/db/schema';

describe('sub_trips and debts tables', () => {
  it('inserts a trip, member, sub trip, and debt, and reads them back linked correctly', async () => {
    await db.insert(users).values({ email: 'schema-test@example.com' });
    const [user] = await db.select().from(users).where(eq(users.email, 'schema-test@example.com'));

    await db.insert(trips).values({
      publicId: 'schema-test-trip', name: 'Test Trip', destination: 'Test',
      startDate: '2026-01-01', endDate: '2026-01-02', creatorUserId: user.id,
    });
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, 'schema-test-trip'));

    await db.insert(tripMembers).values({ tripId: trip.id, name: 'Budi' });
    const [member] = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));

    await db.insert(subTrips).values({
      tripId: trip.id, name: 'Makan Siang', category: 'makan', date: '2026-01-01',
      payerMemberId: member.id, amount: 50000, createdByMemberId: member.id,
    });
    const [subTrip] = await db.select().from(subTrips).where(eq(subTrips.tripId, trip.id));
    expect(subTrip.category).toBe('makan');
    expect(subTrip.amount).toBe(50000);

    await db.insert(debts).values({ subTripId: subTrip.id, memberId: member.id, amount: 25000 });
    const [debt] = await db.select().from(debts).where(eq(debts.subTripId, subTrip.id));
    expect(debt.amount).toBe(25000);
    expect(debt.settled).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `cd server && npx vitest run tests/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full server suite to confirm nothing broke**

Run: `cd server && npx vitest run`
Expected: PASS (all pre-existing Tahap 1 tests still green).

- [ ] **Step 6: Commit**

```bash
git add server/src/db/schema.ts server/tests/db.test.ts
git commit -m "Add sub_trips and debts tables"
```

---

### Task 2: Pure split-logic functions

**Files:**
- Create: `server/src/lib/splitLogic.ts`
- Test: `server/tests/lib/splitLogic.test.ts`

**Interfaces:**
- Produces: `computeEqualShares(amount: number, participantMemberIds: number[], payerMemberId: number): Map<number, number>`, `reconcileDebts(existingDebts: {id: number; memberId: number; settled: boolean}[], newShares: Map<number, number>): {toInsert: {memberId: number; amount: number}[]; toUpdateAmount: {id: number; amount: number}[]; toDelete: {id: number}[]}` — both consumed by Tasks 5 and 7 (create and edit sub trip routes).

No DB, no Express — pure functions, fast unit tests.

- [ ] **Step 1: Write the failing tests**

`server/tests/lib/splitLogic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeEqualShares, reconcileDebts } from '../../src/lib/splitLogic';

describe('computeEqualShares', () => {
  it('splits evenly among participants, excluding the payer', () => {
    const shares = computeEqualShares(90000, [1, 2, 3], 1);
    expect(shares.get(1)).toBeUndefined();
    expect(shares.get(2)).toBe(30000);
    expect(shares.get(3)).toBe(30000);
    expect(shares.size).toBe(2);
  });

  it('rounds each share up to the nearest whole Rupiah when division is not exact', () => {
    const shares = computeEqualShares(100000, [1, 2, 3], 1);
    // 100000 / 3 = 33333.33... -> ceil = 33334
    expect(shares.get(2)).toBe(33334);
    expect(shares.get(3)).toBe(33334);
  });

  it('includes all participants as debtors when the payer is not among them', () => {
    const shares = computeEqualShares(60000, [2, 3], 1);
    expect(shares.get(2)).toBe(30000);
    expect(shares.get(3)).toBe(30000);
    expect(shares.size).toBe(2);
  });

  it('produces no debts when the payer is the only participant', () => {
    const shares = computeEqualShares(50000, [1], 1);
    expect(shares.size).toBe(0);
  });
});

describe('reconcileDebts', () => {
  it('updates the amount of an existing debt while preserving its settled status', () => {
    const existing = [{ id: 10, memberId: 2, settled: true }];
    const newShares = new Map([[2, 40000]]);
    const result = reconcileDebts(existing, newShares);
    expect(result.toUpdateAmount).toEqual([{ id: 10, amount: 40000 }]);
    expect(result.toInsert).toEqual([]);
    expect(result.toDelete).toEqual([]);
  });

  it('inserts a new debt for a newly added participant', () => {
    const existing: { id: number; memberId: number; settled: boolean }[] = [];
    const newShares = new Map([[3, 25000]]);
    const result = reconcileDebts(existing, newShares);
    expect(result.toInsert).toEqual([{ memberId: 3, amount: 25000 }]);
  });

  it('deletes a debt for a participant who was removed, even if it was settled', () => {
    const existing = [{ id: 11, memberId: 4, settled: true }];
    const newShares = new Map<number, number>();
    const result = reconcileDebts(existing, newShares);
    expect(result.toDelete).toEqual([{ id: 11 }]);
    expect(result.toUpdateAmount).toEqual([]);
  });

  it('handles a mix of insert, update, and delete in one call', () => {
    const existing = [
      { id: 1, memberId: 2, settled: false },
      { id: 2, memberId: 3, settled: true },
    ];
    const newShares = new Map([
      [2, 15000],
      [4, 15000],
    ]);
    const result = reconcileDebts(existing, newShares);
    expect(result.toUpdateAmount).toEqual([{ id: 1, amount: 15000 }]);
    expect(result.toInsert).toEqual([{ memberId: 4, amount: 15000 }]);
    expect(result.toDelete).toEqual([{ id: 2 }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/lib/splitLogic.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

`server/src/lib/splitLogic.ts`:
```ts
export function computeEqualShares(
  amount: number,
  participantMemberIds: number[],
  payerMemberId: number,
): Map<number, number> {
  const divisor = participantMemberIds.length;
  const share = Math.ceil(amount / divisor);
  const shares = new Map<number, number>();
  for (const memberId of participantMemberIds) {
    if (memberId === payerMemberId) continue;
    shares.set(memberId, share);
  }
  return shares;
}

export interface ExistingDebt {
  id: number;
  memberId: number;
  settled: boolean;
}

export interface ReconcileResult {
  toInsert: { memberId: number; amount: number }[];
  toUpdateAmount: { id: number; amount: number }[];
  toDelete: { id: number }[];
}

export function reconcileDebts(existingDebts: ExistingDebt[], newShares: Map<number, number>): ReconcileResult {
  const toInsert: ReconcileResult['toInsert'] = [];
  const toUpdateAmount: ReconcileResult['toUpdateAmount'] = [];
  const toDelete: ReconcileResult['toDelete'] = [];

  const existingByMemberId = new Map(existingDebts.map((d) => [d.memberId, d]));

  for (const [memberId, amount] of newShares) {
    const existing = existingByMemberId.get(memberId);
    if (existing) {
      toUpdateAmount.push({ id: existing.id, amount });
    } else {
      toInsert.push({ memberId, amount });
    }
  }

  for (const existing of existingDebts) {
    if (!newShares.has(existing.memberId)) {
      toDelete.push({ id: existing.id });
    }
  }

  return { toInsert, toUpdateAmount, toDelete };
}
```

- [ ] **Step 4: Run the tests again**

Run: `cd server && npx vitest run tests/lib/splitLogic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/splitLogic.ts server/tests/lib/splitLogic.test.ts
git commit -m "Add pure split-logic functions: computeEqualShares, reconcileDebts"
```

---

### Task 3: Shared backend helpers — validators, trip access, soft-auth middleware

**Files:**
- Create: `server/src/lib/validators.ts`, `server/src/lib/tripAccess.ts`, `server/src/auth/attachUserIfPresent.ts`
- Modify: `server/src/routes/trips.ts` (use the extracted `isoDateSchema` and `getTripByPublicId` instead of inline duplicates)
- Test: `server/tests/lib/tripAccess.test.ts`, `server/tests/auth/attachUserIfPresent.test.ts`

**Interfaces:**
- Produces: `isoDateSchema: z.ZodType<string>` from `validators.ts`; `getTripByPublicId(publicId: string): Promise<typeof trips.$inferSelect | null>` and `memberIdsBelongToTrip(tripId: number, memberIds: number[]): Promise<boolean>` from `tripAccess.ts`; `attachUserIfPresent` Express middleware (sets `req.userId` if a valid session cookie is present, never rejects) from `attachUserIfPresent.ts` — all consumed by Tasks 4-7.
- Consumes: `db`, `trips`, `tripMembers` from Tahap 1; `SESSION_COOKIE`, `verifySession` from Tahap 1's `auth/session.ts`.

- [ ] **Step 1: Extract the shared date validator**

`server/src/lib/validators.ts`:
```ts
import { z } from 'zod';

export const isoDateSchema = z
  .string()
  .refine(
    (val) =>
      /^\d{4}-\d{2}-\d{2}$/.test(val) &&
      !Number.isNaN(Date.parse(val)) &&
      new Date(val).toISOString().slice(0, 10) === val,
    { message: 'invalid_date' },
  );
```

- [ ] **Step 2: Update `trips.ts` to use it instead of the inline regex-only version**

In `server/src/routes/trips.ts`, replace the inline date validation inside `createTripSchema` (the `startDate`/`endDate` fields, currently using a `.refine(...)` calendar check added during the final-review fix) with the shared import. Add `import { isoDateSchema } from '../lib/validators';` and change:
```ts
startDate: isoDateSchema,
endDate: isoDateSchema,
```
Keep the existing `.refine((data) => data.startDate <= data.endDate, ...)` chain on the object schema as-is — only the per-field date validators move to the shared module, remove the now-duplicate inline refine logic for individual date shape/calendar validity.

Run `cd server && npx vitest run tests/trips.test.ts` to confirm this refactor didn't break anything — Expected: PASS, same test count as before.

- [ ] **Step 3: Write the failing tripAccess tests**

`server/tests/lib/tripAccess.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/client';
import { trips, tripMembers, users } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { getTripByPublicId, memberIdsBelongToTrip } from '../../src/lib/tripAccess';

async function createTestTrip(publicId: string, memberNames: string[]) {
  await db.insert(users).values({ email: `${publicId}@example.com` });
  const [user] = await db.select().from(users).where(eq(users.email, `${publicId}@example.com`));
  await db.insert(trips).values({
    publicId, name: 'Test', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02',
    creatorUserId: user.id,
  });
  const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
  await db.insert(tripMembers).values(memberNames.map((name) => ({ tripId: trip.id, name })));
  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
  return { trip, members };
}

describe('getTripByPublicId', () => {
  it('returns the trip row for a known publicId', async () => {
    const { trip } = await createTestTrip('access-test-1', ['Budi']);
    const found = await getTripByPublicId('access-test-1');
    expect(found?.id).toBe(trip.id);
  });

  it('returns null for an unknown publicId', async () => {
    const found = await getTripByPublicId('does-not-exist');
    expect(found).toBeNull();
  });
});

describe('memberIdsBelongToTrip', () => {
  it('returns true when all ids belong to the given trip', async () => {
    const { trip, members } = await createTestTrip('access-test-2', ['Budi', 'Aji']);
    const result = await memberIdsBelongToTrip(trip.id, members.map((m) => m.id));
    expect(result).toBe(true);
  });

  it('returns true for an empty id list', async () => {
    const { trip } = await createTestTrip('access-test-3', ['Budi']);
    const result = await memberIdsBelongToTrip(trip.id, []);
    expect(result).toBe(true);
  });

  it('returns false when an id belongs to a different trip', async () => {
    const { trip: tripA } = await createTestTrip('access-test-4', ['Budi']);
    const { members: membersB } = await createTestTrip('access-test-5', ['Citra']);
    const result = await memberIdsBelongToTrip(tripA.id, membersB.map((m) => m.id));
    expect(result).toBe(false);
  });

  it('returns false when an id does not exist at all', async () => {
    const { trip } = await createTestTrip('access-test-6', ['Budi']);
    const result = await memberIdsBelongToTrip(trip.id, [999999]);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 4: Implement tripAccess.ts**

`server/src/lib/tripAccess.ts`:
```ts
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
```

- [ ] **Step 5: Run the tripAccess tests**

Run: `cd server && npx vitest run tests/lib/tripAccess.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing attachUserIfPresent test**

`server/tests/auth/attachUserIfPresent.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { attachUserIfPresent } from '../../src/auth/attachUserIfPresent';
import { signSession, SESSION_COOKIE } from '../../src/auth/session';

function buildTestApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/whoami', attachUserIfPresent, (req, res) => {
    res.json({ userId: req.userId ?? null });
  });
  return app;
}

describe('attachUserIfPresent', () => {
  it('sets req.userId when a valid session cookie is present', async () => {
    const app = buildTestApp();
    const token = signSession({ userId: 42 });
    const res = await request(app).get('/whoami').set('Cookie', `${SESSION_COOKIE}=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(42);
  });

  it('leaves req.userId undefined and does not reject when no cookie is present', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/whoami');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBeNull();
  });

  it('leaves req.userId undefined and does not reject when the cookie is invalid', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/whoami').set('Cookie', `${SESSION_COOKIE}=not-a-real-token`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBeNull();
  });
});
```

- [ ] **Step 7: Implement attachUserIfPresent.ts**

`server/src/auth/attachUserIfPresent.ts`:
```ts
import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE, verifySession } from './session';

export function attachUserIfPresent(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = typeof token === 'string' ? verifySession(token) : null;
  if (session) {
    req.userId = session.userId;
  }
  next();
}
```

- [ ] **Step 8: Run the test and the full suite**

Run: `cd server && npx vitest run`
Expected: PASS — all tests, including the Task 1/2 additions and the Tahap 1 suite, green.

- [ ] **Step 9: Commit**

```bash
git add server/src/lib/validators.ts server/src/lib/tripAccess.ts server/src/auth/attachUserIfPresent.ts server/src/routes/trips.ts server/tests/lib/tripAccess.test.ts server/tests/auth/attachUserIfPresent.test.ts
git commit -m "Add shared validators, trip-access helpers, and soft-auth middleware"
```

---

### Task 4: `GET /api/trips/:publicId/summary` — rollup saldo per anggota

**Files:**
- Modify: `server/src/routes/trips.ts`
- Test: `server/tests/trips.test.ts`

**Interfaces:**
- Consumes: `getTripByPublicId` from Task 3; `subTrips`, `debts`, `tripMembers` from Task 1/Tahap 1.
- Produces: `GET /api/trips/:publicId/summary` returning `{ members: {memberId: number; name: string; rollup: number; status: 'dilunasin'|'ngutang'|'lunas'}[]; tripTotal: number }` — consumed by Task 9 (frontend api.ts) and Task 10 (RingkasanScreen).

- [ ] **Step 1: Write the failing tests**

Add to `server/tests/trips.test.ts` (new `describe` block; reuse the file's existing `createAuthedUser` helper import and `app` instance):
```ts
import { subTrips, debts, tripMembers as tripMembersTable } from '../src/db/schema';
import { eq } from 'drizzle-orm';

describe('GET /api/trips/:publicId/summary', () => {
  it('returns zero rollup for every member when there are no sub trips', async () => {
    const { cookie } = await createAuthedUser('summary-empty@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip Kosong', destination: 'Bogor', startDate: '2026-01-01', endDate: '2026-01-02', members: ['Budi', 'Aji'],
    });
    const { publicId } = createRes.body;

    const res = await request(app).get(`/api/trips/${publicId}/summary`);
    expect(res.status).toBe(200);
    expect(res.body.tripTotal).toBe(0);
    expect(res.body.members).toHaveLength(2);
    for (const m of res.body.members) {
      expect(m.rollup).toBe(0);
      expect(m.status).toBe('lunas');
    }
  });

  it('computes rollup correctly for a payer and a debtor with one unsettled debt', async () => {
    const { cookie } = await createAuthedUser('summary-basic@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip Isi', destination: 'Bandung', startDate: '2026-01-01', endDate: '2026-01-02', members: ['Budi', 'Aji'],
    });
    const { publicId } = createRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const members = await db.select().from(tripMembersTable).where(eq(tripMembersTable.tripId, trip.id));
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    await db.insert(subTrips).values({
      tripId: trip.id, name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, amount: 40000, createdByMemberId: budi.id,
    });
    const [subTrip] = await db.select().from(subTrips).where(eq(subTrips.tripId, trip.id));
    await db.insert(debts).values({ subTripId: subTrip.id, memberId: aji.id, amount: 20000 });

    const res = await request(app).get(`/api/trips/${publicId}/summary`);
    expect(res.status).toBe(200);
    expect(res.body.tripTotal).toBe(40000);
    const budiSummary = res.body.members.find((m: { memberId: number }) => m.memberId === budi.id);
    const ajiSummary = res.body.members.find((m: { memberId: number }) => m.memberId === aji.id);
    expect(budiSummary.rollup).toBe(20000);
    expect(budiSummary.status).toBe('dilunasin');
    expect(ajiSummary.rollup).toBe(-20000);
    expect(ajiSummary.status).toBe('ngutang');
  });

  it('excludes settled debts from the rollup', async () => {
    const { cookie } = await createAuthedUser('summary-settled@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip Lunas', destination: 'Malang', startDate: '2026-01-01', endDate: '2026-01-02', members: ['Budi', 'Aji'],
    });
    const { publicId } = createRes.body;
    const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
    const members = await db.select().from(tripMembersTable).where(eq(tripMembersTable.tripId, trip.id));
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    await db.insert(subTrips).values({
      tripId: trip.id, name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, amount: 40000, createdByMemberId: budi.id,
    });
    const [subTrip] = await db.select().from(subTrips).where(eq(subTrips.tripId, trip.id));
    await db.insert(debts).values({ subTripId: subTrip.id, memberId: aji.id, amount: 20000, settled: true });

    const res = await request(app).get(`/api/trips/${publicId}/summary`);
    const budiSummary = res.body.members.find((m: { memberId: number }) => m.memberId === budi.id);
    expect(budiSummary.rollup).toBe(0);
    expect(budiSummary.status).toBe('lunas');
  });

  it('returns 404 for an unknown publicId', async () => {
    const res = await request(app).get('/api/trips/does-not-exist/summary');
    expect(res.status).toBe(404);
  });
});
```

Check the top of `server/tests/trips.test.ts` for its existing imports (`db`, `trips`) — reuse them; only add the new imports shown above that aren't already present.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/trips.test.ts`
Expected: FAIL — route doesn't exist (404 instead of the expected assertions).

- [ ] **Step 3: Implement the route**

In `server/src/routes/trips.ts`, add these imports:
```ts
import { subTrips, debts } from '../db/schema';
import { getTripByPublicId } from '../lib/tripAccess';
```

Add this route after the existing `router.get('/:publicId', ...)` handler, before `export default router;`:
```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `cd server && npx vitest run tests/trips.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full server suite**

Run: `cd server && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/trips.ts server/tests/trips.test.ts
git commit -m "Add GET /api/trips/:publicId/summary rollup endpoint"
```

---

### Task 5: `POST /api/trips/:publicId/subtrips` — create sub trip (jumlah total mode)

**Files:**
- Create: `server/src/routes/subtrips.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/subtrips.test.ts`

**Interfaces:**
- Consumes: `getTripByPublicId`, `memberIdsBelongToTrip` from Task 3; `computeEqualShares` from Task 2; `subTrips`, `debts` from Task 1; `isoDateSchema` from Task 3.
- Produces: the `subtrips` router (mounted with `{ mergeParams: true }` at `/api/trips/:publicId/subtrips` in `app.ts`), `POST /` returning `{ id: number }` — the sub trip's own numeric id, safe to expose (see Global Constraints) — consumed by Tasks 6-8 (same router file) and Task 9 (frontend).

- [ ] **Step 1: Write the failing tests**

`server/tests/subtrips.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { trips, tripMembers, debts } from '../src/db/schema';
import { createAuthedUser } from './helpers/auth';

const app = createApp();

async function createTestTrip(email: string, memberNames: string[]) {
  const { cookie } = await createAuthedUser(email);
  const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
    name: 'Test Trip', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02', members: memberNames,
  });
  const { publicId } = createRes.body;
  const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
  return { publicId, trip, members };
}

describe('POST /api/trips/:publicId/subtrips', () => {
  it('creates a sub trip and generates debts for participants excluding the payer', async () => {
    const { publicId, members } = await createTestTrip('subtrip-create1@example.com', ['Budi', 'Aji', 'Citra']);
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;
    const citra = members.find((m) => m.name === 'Citra')!;

    const res = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan Siang', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, amount: 90000,
      participantMemberIds: [budi.id, aji.id, citra.id],
      createdByMemberId: budi.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTypeOf('number');

    const debtRows = await db.select().from(debts).where(eq(debts.subTripId, res.body.id));
    expect(debtRows).toHaveLength(2);
    expect(debtRows.every((d) => d.amount === 30000)).toBe(true);
    expect(debtRows.some((d) => d.memberId === budi.id)).toBe(false);
    expect(debtRows.some((d) => d.memberId === aji.id)).toBe(true);
    expect(debtRows.some((d) => d.memberId === citra.id)).toBe(true);
  });

  it('rejects an empty participant list', async () => {
    const { publicId, members } = await createTestTrip('subtrip-create2@example.com', ['Budi']);
    const res = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: members[0].id, amount: 10000, participantMemberIds: [], createdByMemberId: members[0].id,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a payerMemberId that belongs to a different trip', async () => {
    const { publicId } = await createTestTrip('subtrip-create3@example.com', ['Budi']);
    const { members: otherMembers } = await createTestTrip('subtrip-create4@example.com', ['Dedi']);
    const res = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: otherMembers[0].id, amount: 10000,
      participantMemberIds: [otherMembers[0].id], createdByMemberId: otherMembers[0].id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_member');
  });

  it('returns 404 for an unknown trip publicId', async () => {
    const res = await request(app).post('/api/trips/does-not-exist/subtrips').send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: 1, amount: 10000, participantMemberIds: [1], createdByMemberId: 1,
    });
    expect(res.status).toBe(404);
  });

  it('rejects an invalid category', async () => {
    const { publicId, members } = await createTestTrip('subtrip-create5@example.com', ['Budi']);
    const res = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'olahraga', date: '2026-01-01',
      payerMemberId: members[0].id, amount: 10000, participantMemberIds: [members[0].id], createdByMemberId: members[0].id,
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/subtrips.test.ts`
Expected: FAIL — 404 on every request, route doesn't exist.

- [ ] **Step 3: Implement the subtrips router (create only for now)**

`server/src/routes/subtrips.ts`:
```ts
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

router.post('/', async (req, res) => {
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
```

- [ ] **Step 4: Mount the router in app.ts**

Modify `server/src/app.ts` — add the import and mount it with `mergeParams` handled at the router level (already set above), right after the `tripsRouter` mount:
```ts
import subTripsRouter from './routes/subtrips';
// ...
app.use('/api/trips/:publicId/subtrips', subTripsRouter);
```

- [ ] **Step 5: Run the tests**

Run: `cd server && npx vitest run tests/subtrips.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full server suite**

Run: `cd server && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/subtrips.ts server/src/app.ts server/tests/subtrips.test.ts
git commit -m "Add POST /api/trips/:publicId/subtrips (create, jumlah total mode)"
```

---

### Task 6: `GET /api/trips/:publicId/subtrips` (list) and `GET .../subtrips/:subTripId` (detail)

**Files:**
- Modify: `server/src/routes/subtrips.ts`
- Test: `server/tests/subtrips.test.ts`

**Interfaces:**
- Consumes: `subTripInputSchema` (already exported from Task 5), `subTrips`, `debts`, `tripMembers`.
- Produces: `GET /` → `{id, name, category, date, payerMemberId, payerName, amount, unsettledCount}[]`; `GET /:subTripId` → `{id, name, category, date, payerMemberId, payerName, amount, createdByMemberId, debts: {id, memberId, name, amount, settled}[]}` — both consumed by Task 9 (frontend api.ts), Task 11 (RiwayatScreen), Task 12 (SubTripDetailScreen).

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/subtrips.test.ts`:
```ts
describe('GET /api/trips/:publicId/subtrips', () => {
  it('lists sub trips with payer name and unsettled debt count', async () => {
    const { publicId, members } = await createTestTrip('subtrip-list1@example.com', ['Budi', 'Aji']);
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, amount: 40000, participantMemberIds: [budi.id, aji.id], createdByMemberId: budi.id,
    });

    const res = await request(app).get(`/api/trips/${publicId}/subtrips`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Makan');
    expect(res.body[0].payerName).toBe('Budi');
    expect(res.body[0].unsettledCount).toBe(1);
  });

  it('returns an empty array when the trip has no sub trips', async () => {
    const { publicId } = await createTestTrip('subtrip-list2@example.com', ['Budi']);
    const res = await request(app).get(`/api/trips/${publicId}/subtrips`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 404 for an unknown trip publicId', async () => {
    const res = await request(app).get('/api/trips/does-not-exist/subtrips');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/trips/:publicId/subtrips/:subTripId', () => {
  it('returns sub trip detail with named debts', async () => {
    const { publicId, members } = await createTestTrip('subtrip-detail1@example.com', ['Budi', 'Aji']);
    const budi = members.find((m) => m.name === 'Budi')!;
    const aji = members.find((m) => m.name === 'Aji')!;

    const createRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: budi.id, amount: 40000, participantMemberIds: [budi.id, aji.id], createdByMemberId: budi.id,
    });

    const res = await request(app).get(`/api/trips/${publicId}/subtrips/${createRes.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Makan');
    expect(res.body.payerName).toBe('Budi');
    expect(res.body.createdByMemberId).toBe(budi.id);
    expect(res.body.debts).toHaveLength(1);
    expect(res.body.debts[0].memberId).toBe(aji.id);
    expect(res.body.debts[0].name).toBe('Aji');
    expect(res.body.debts[0].settled).toBe(false);
  });

  it('returns 404 for a subTripId that does not belong to the given trip', async () => {
    const { publicId: publicIdA, members: membersA } = await createTestTrip('subtrip-detail2a@example.com', ['Budi']);
    const { publicId: publicIdB } = await createTestTrip('subtrip-detail2b@example.com', ['Dedi']);
    const createRes = await request(app).post(`/api/trips/${publicIdA}/subtrips`).send({
      name: 'Makan', category: 'makan', date: '2026-01-01',
      payerMemberId: membersA[0].id, amount: 10000, participantMemberIds: [membersA[0].id], createdByMemberId: membersA[0].id,
    });

    const res = await request(app).get(`/api/trips/${publicIdB}/subtrips/${createRes.body.id}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-existent subTripId', async () => {
    const { publicId } = await createTestTrip('subtrip-detail3@example.com', ['Budi']);
    const res = await request(app).get(`/api/trips/${publicId}/subtrips/999999`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/subtrips.test.ts`
Expected: FAIL — the two new describe blocks 404 on every request.

- [ ] **Step 3: Implement the two routes**

In `server/src/routes/subtrips.ts`, add these imports alongside the existing ones:
```ts
import { and, eq, inArray } from 'drizzle-orm';
import { tripMembers } from '../db/schema';
```
(merge `debts, subTrips` with `tripMembers` in the single `from '../db/schema'` import line.)

Add these two routes after `router.post('/', ...)`, before `export default router;`:
```ts
router.get('/', async (req, res) => {
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

router.get('/:subTripId', async (req, res) => {
  const trip = await getTripByPublicId(req.params.publicId);
  if (!trip) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const subTripId = Number(req.params.subTripId);
  const [subTrip] = await db.select().from(subTrips).where(and(eq(subTrips.id, subTripId), eq(subTrips.tripId, trip.id)));
  if (!subTrip) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const [payer] = await db.select().from(tripMembers).where(eq(tripMembers.id, subTrip.payerMemberId));
  const debtRows = await db.select().from(debts).where(eq(debts.subTripId, subTripId));
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
    createdByMemberId: subTrip.createdByMemberId,
    debts: debtRows.map((d) => ({ id: d.id, memberId: d.memberId, name: nameById.get(d.memberId) ?? '', amount: d.amount, settled: d.settled })),
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `cd server && npx vitest run tests/subtrips.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full server suite**

Run: `cd server && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/subtrips.ts server/tests/subtrips.test.ts
git commit -m "Add GET list and GET detail endpoints for sub trips"
```

---

### Task 7: `PATCH .../subtrips/:subTripId` (edit) and `DELETE .../subtrips/:subTripId`

**Files:**
- Modify: `server/src/routes/subtrips.ts`
- Test: `server/tests/subtrips-edit-delete.test.ts`

**Interfaces:**
- Consumes: `attachUserIfPresent` from Task 3; `reconcileDebts` from Task 2; `subTripInputSchema` (from Task 5).
- Produces: `PATCH /:subTripId` → `{ id: number }`, 403 if unauthorized; `DELETE /:subTripId` → `{ ok: true }`, 403 if unauthorized — both consumed by Task 9 (frontend), Task 12 (SubTripDetailScreen).

- [ ] **Step 1: Write the failing tests**

`server/tests/subtrips-edit-delete.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { trips, tripMembers, debts } from '../src/db/schema';
import { createAuthedUser } from './helpers/auth';

const app = createApp();

async function createTestTripWithSubTrip(email: string, memberNames: string[]) {
  const { cookie } = await createAuthedUser(email);
  const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
    name: 'Test Trip', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02', members: memberNames,
  });
  const { publicId } = createRes.body;
  const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));
  const payer = members[0];

  const subTripRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
    name: 'Makan', category: 'makan', date: '2026-01-01',
    payerMemberId: payer.id, amount: 40000, participantMemberIds: members.map((m) => m.id), createdByMemberId: payer.id,
  });

  return { publicId, trip, members, subTripId: subTripRes.body.id, cookie, creatorMemberId: payer.id };
}

describe('PATCH /api/trips/:publicId/subtrips/:subTripId', () => {
  it('allows the trip creator (via session cookie) to edit, even without X-Member-Id', async () => {
    const { publicId, subTripId, members, cookie } = await createTestTripWithSubTrip('edit-creator@example.com', ['Budi', 'Aji']);
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('Cookie', cookie)
      .send({
        name: 'Makan Malam', category: 'makan', date: '2026-01-01',
        payerMemberId: members[0].id, amount: 60000, participantMemberIds: members.map((m) => m.id), createdByMemberId: members[0].id,
      });
    expect(res.status).toBe(200);
    const updated = await request(app).get(`/api/trips/${publicId}/subtrips/${subTripId}`);
    expect(updated.body.name).toBe('Makan Malam');
    expect(updated.body.amount).toBe(60000);
  });

  it('allows the original adder (via X-Member-Id) to edit without a session', async () => {
    const { publicId, subTripId, members, creatorMemberId } = await createTestTripWithSubTrip('edit-adder@example.com', ['Budi', 'Aji']);
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(creatorMemberId))
      .send({
        name: 'Makan Malam', category: 'makan', date: '2026-01-01',
        payerMemberId: members[0].id, amount: 50000, participantMemberIds: members.map((m) => m.id), createdByMemberId: members[0].id,
      });
    expect(res.status).toBe(200);
  });

  it('rejects an edit from neither the creator nor the original adder', async () => {
    const { publicId, subTripId, members } = await createTestTripWithSubTrip('edit-unauthorized@example.com', ['Budi', 'Aji']);
    const otherMemberId = members.find((m) => m.name === 'Aji')!.id;
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(otherMemberId))
      .send({
        name: 'Hack', category: 'makan', date: '2026-01-01',
        payerMemberId: members[0].id, amount: 1, participantMemberIds: [members[0].id], createdByMemberId: members[0].id,
      });
    expect(res.status).toBe(403);
  });

  it('preserves settled status for a debtor who remains a participant, but updates the amount', async () => {
    const { publicId, subTripId, members, creatorMemberId } = await createTestTripWithSubTrip('edit-preserve@example.com', ['Budi', 'Aji']);
    const aji = members.find((m) => m.name === 'Aji')!;
    const [debtRow] = await db.select().from(debts).where(eq(debts.subTripId, subTripId));
    await db.update(debts).set({ settled: true }).where(eq(debts.id, debtRow.id));

    await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(creatorMemberId))
      .send({
        name: 'Makan', category: 'makan', date: '2026-01-01',
        payerMemberId: members[0].id, amount: 80000, participantMemberIds: members.map((m) => m.id), createdByMemberId: members[0].id,
      });

    const [updatedDebt] = await db.select().from(debts).where(eq(debts.memberId, aji.id));
    expect(updatedDebt.settled).toBe(true);
    expect(updatedDebt.amount).toBe(40000);
  });

  it('deletes a debt for a participant removed from the sub trip, even if it was settled', async () => {
    const { publicId, subTripId, members, creatorMemberId } = await createTestTripWithSubTrip('edit-remove-participant@example.com', ['Budi', 'Aji']);
    const [debtRow] = await db.select().from(debts).where(eq(debts.subTripId, subTripId));
    await db.update(debts).set({ settled: true }).where(eq(debts.id, debtRow.id));

    await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}`)
      .set('X-Member-Id', String(creatorMemberId))
      .send({
        name: 'Makan', category: 'makan', date: '2026-01-01',
        payerMemberId: members[0].id, amount: 40000, participantMemberIds: [members[0].id], createdByMemberId: members[0].id,
      });

    const remainingDebts = await db.select().from(debts).where(eq(debts.subTripId, subTripId));
    expect(remainingDebts).toHaveLength(0);
  });

  it('returns 404 for a non-existent subTripId', async () => {
    const { publicId, creatorMemberId } = await createTestTripWithSubTrip('edit-404@example.com', ['Budi']);
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/999999`)
      .set('X-Member-Id', String(creatorMemberId))
      .send({
        name: 'X', category: 'makan', date: '2026-01-01',
        payerMemberId: creatorMemberId, amount: 1000, participantMemberIds: [creatorMemberId], createdByMemberId: creatorMemberId,
      });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/trips/:publicId/subtrips/:subTripId', () => {
  it('allows the trip creator to delete, removing its debts too', async () => {
    const { publicId, subTripId, cookie } = await createTestTripWithSubTrip('delete-creator@example.com', ['Budi', 'Aji']);
    const res = await request(app).delete(`/api/trips/${publicId}/subtrips/${subTripId}`).set('Cookie', cookie);
    expect(res.status).toBe(200);

    const remainingDebts = await db.select().from(debts).where(eq(debts.subTripId, subTripId));
    expect(remainingDebts).toHaveLength(0);
    const notFound = await request(app).get(`/api/trips/${publicId}/subtrips/${subTripId}`);
    expect(notFound.status).toBe(404);
  });

  it('allows the original adder to delete', async () => {
    const { publicId, subTripId, creatorMemberId } = await createTestTripWithSubTrip('delete-adder@example.com', ['Budi']);
    const res = await request(app).delete(`/api/trips/${publicId}/subtrips/${subTripId}`).set('X-Member-Id', String(creatorMemberId));
    expect(res.status).toBe(200);
  });

  it('rejects a delete from neither the creator nor the original adder', async () => {
    const { publicId, subTripId, members } = await createTestTripWithSubTrip('delete-unauthorized@example.com', ['Budi', 'Aji']);
    const otherMemberId = members.find((m) => m.name === 'Aji')!.id;
    const res = await request(app).delete(`/api/trips/${publicId}/subtrips/${subTripId}`).set('X-Member-Id', String(otherMemberId));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/subtrips-edit-delete.test.ts`
Expected: FAIL — both routes don't exist (404/mismatched status on every request).

- [ ] **Step 3: Implement the two routes**

In `server/src/routes/subtrips.ts`, add these imports:
```ts
import { attachUserIfPresent } from '../auth/attachUserIfPresent';
import { reconcileDebts } from '../lib/splitLogic';
```

Add a small shared authorization helper near the top of the file (after the schema definitions, before the routes):
```ts
async function canModifySubTrip(req: import('express').Request, trip: NonNullable<Awaited<ReturnType<typeof getTripByPublicId>>>, createdByMemberId: number): Promise<boolean> {
  const isCreatorUser = req.userId !== undefined && req.userId === trip.creatorUserId;
  const claimedMemberIdHeader = req.header('X-Member-Id');
  const isOriginalAdder = claimedMemberIdHeader !== undefined && Number(claimedMemberIdHeader) === createdByMemberId;
  return isCreatorUser || isOriginalAdder;
}
```

Add these two routes after `router.get('/:subTripId', ...)`, before `export default router;`:
```ts
router.patch('/:subTripId', attachUserIfPresent, async (req, res) => {
  const trip = await getTripByPublicId(req.params.publicId);
  if (!trip) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const subTripId = Number(req.params.subTripId);
  const [existing] = await db.select().from(subTrips).where(and(eq(subTrips.id, subTripId), eq(subTrips.tripId, trip.id)));
  if (!existing) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

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

  const allIds = [...new Set([payerMemberId, createdByMemberId, ...participantMemberIds])];
  const valid = await memberIdsBelongToTrip(trip.id, allIds);
  if (!valid) {
    res.status(400).json({ error: 'invalid_member' });
    return;
  }

  const shares = computeEqualShares(amount, participantMemberIds, payerMemberId);
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

router.delete('/:subTripId', attachUserIfPresent, async (req, res) => {
  const trip = await getTripByPublicId(req.params.publicId);
  if (!trip) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const subTripId = Number(req.params.subTripId);
  const [existing] = await db.select().from(subTrips).where(and(eq(subTrips.id, subTripId), eq(subTrips.tripId, trip.id)));
  if (!existing) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const authorized = await canModifySubTrip(req, trip, existing.createdByMemberId);
  if (!authorized) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(debts).where(eq(debts.subTripId, subTripId));
    await tx.delete(subTrips).where(eq(subTrips.id, subTripId));
  });

  res.status(200).json({ ok: true });
});
```

- [ ] **Step 4: Run the tests**

Run: `cd server && npx vitest run tests/subtrips-edit-delete.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full server suite**

Run: `cd server && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/subtrips.ts server/tests/subtrips-edit-delete.test.ts
git commit -m "Add edit/delete endpoints for sub trips with soft-auth"
```

---

### Task 8: `PATCH .../subtrips/:subTripId/debts/:debtId` — toggle tandai lunas

**Files:**
- Modify: `server/src/routes/subtrips.ts`
- Test: `server/tests/subtrips-debts.test.ts`

**Interfaces:**
- Consumes: `debts`, `subTrips` (already imported in the router file).
- Produces: `PATCH .../debts/:debtId` body `{settled: boolean}` → `{ ok: true }` — consumed by Task 9 (frontend), Task 12 (SubTripDetailScreen). No authorization restriction (PRD §5.6 — honor system, anyone in the trip can toggle).

- [ ] **Step 1: Write the failing tests**

`server/tests/subtrips-debts.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { trips, tripMembers, debts } from '../src/db/schema';
import { createAuthedUser } from './helpers/auth';

const app = createApp();

async function createTripWithDebt() {
  const { cookie } = await createAuthedUser(`debts-toggle-${Date.now()}-${Math.random()}@example.com`);
  const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
    name: 'Test Trip', destination: 'Test', startDate: '2026-01-01', endDate: '2026-01-02', members: ['Budi', 'Aji'],
  });
  const { publicId } = createRes.body;
  const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));
  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, trip.id));

  const subTripRes = await request(app).post(`/api/trips/${publicId}/subtrips`).send({
    name: 'Makan', category: 'makan', date: '2026-01-01',
    payerMemberId: members[0].id, amount: 40000, participantMemberIds: members.map((m) => m.id), createdByMemberId: members[0].id,
  });
  const [debtRow] = await db.select().from(debts).where(eq(debts.subTripId, subTripRes.body.id));

  return { publicId, subTripId: subTripRes.body.id, debtId: debtRow.id };
}

describe('PATCH .../subtrips/:subTripId/debts/:debtId', () => {
  it('marks a debt as settled, with no authorization required', async () => {
    const { publicId, subTripId, debtId } = await createTripWithDebt();
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}/debts/${debtId}`)
      .send({ settled: true });
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(debts).where(eq(debts.id, debtId));
    expect(updated.settled).toBe(true);
    expect(updated.settledAt).not.toBeNull();
  });

  it('can toggle a debt back to unsettled', async () => {
    const { publicId, subTripId, debtId } = await createTripWithDebt();
    await request(app).patch(`/api/trips/${publicId}/subtrips/${subTripId}/debts/${debtId}`).send({ settled: true });
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}/debts/${debtId}`)
      .send({ settled: false });
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(debts).where(eq(debts.id, debtId));
    expect(updated.settled).toBe(false);
    expect(updated.settledAt).toBeNull();
  });

  it('returns 404 for a debtId that does not belong to the given subTripId', async () => {
    const { publicId, subTripId } = await createTripWithDebt();
    const { debtId: otherDebtId } = await createTripWithDebt();
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}/debts/${otherDebtId}`)
      .send({ settled: true });
    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-boolean settled value', async () => {
    const { publicId, subTripId, debtId } = await createTripWithDebt();
    const res = await request(app)
      .patch(`/api/trips/${publicId}/subtrips/${subTripId}/debts/${debtId}`)
      .send({ settled: 'yes' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx vitest run tests/subtrips-debts.test.ts`
Expected: FAIL — route doesn't exist.

- [ ] **Step 3: Implement the route**

In `server/src/routes/subtrips.ts`, add this route after the `DELETE /:subTripId` handler, before `export default router;`:
```ts
const toggleDebtSchema = z.object({ settled: z.boolean() });

router.patch('/:subTripId/debts/:debtId', async (req, res) => {
  const trip = await getTripByPublicId(req.params.publicId);
  if (!trip) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const parsed = toggleDebtSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }

  const subTripId = Number(req.params.subTripId);
  const debtId = Number(req.params.debtId);
  const [subTrip] = await db.select().from(subTrips).where(and(eq(subTrips.id, subTripId), eq(subTrips.tripId, trip.id)));
  if (!subTrip) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const [debt] = await db.select().from(debts).where(and(eq(debts.id, debtId), eq(debts.subTripId, subTripId)));
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
```

- [ ] **Step 4: Run the tests**

Run: `cd server && npx vitest run tests/subtrips-debts.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full server suite — this is the last backend task, confirm everything together**

Run: `cd server && npx vitest run && npx tsc --noEmit`
Expected: PASS, clean typecheck. All backend work for this plan is now done.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/subtrips.ts server/tests/subtrips-debts.test.ts
git commit -m "Add debt settle-toggle endpoint"
```

---

### Task 9: Frontend API client extensions + activate the FAB in `BottomNavTripLevel`

**Files:**
- Modify: `client/src/lib/api.ts`, `client/src/components/BottomNavTripLevel.tsx`
- Test: `client/tests/BottomNavTripLevel.test.tsx`

**Interfaces:**
- Consumes: nothing new from this plan — extends Tahap 1's `api.ts` `request<T>` helper.
- Produces: types `SubTripCategory`, `MemberSummary`, `TripSummaryDetail`, `SubTripListItem`, `DebtItem`, `SubTripDetail`, `SubTripInput`; `api.tripSummary`, `api.listSubTrips`, `api.createSubTrip`, `api.getSubTrip`, `api.updateSubTrip`, `api.deleteSubTrip`, `api.toggleDebtSettled` — consumed by Tasks 10-13. `<BottomNavTripLevel publicId active onAddClick />` (FAB now calls `onAddClick`, no longer `disabled`) — consumed by Tasks 10-12.

- [ ] **Step 1: Write the failing BottomNavTripLevel test**

`client/tests/BottomNavTripLevel.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import BottomNavTripLevel from '../src/components/BottomNavTripLevel';

describe('BottomNavTripLevel', () => {
  it('calls onAddClick when the FAB is clicked, and the FAB is not disabled', async () => {
    const onAddClick = vi.fn();
    render(
      <MemoryRouter>
        <BottomNavTripLevel publicId="a1" active="ringkasan" onAddClick={onAddClick} />
      </MemoryRouter>,
    );
    const fab = screen.getByLabelText('Tambah sub trip');
    expect(fab).not.toBeDisabled();
    const user = userEvent.setup();
    await user.click(fab);
    expect(onAddClick).toHaveBeenCalledTimes(1);
  });

  it('highlights the active tab', () => {
    render(
      <MemoryRouter>
        <BottomNavTripLevel publicId="a1" active="riwayat" onAddClick={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Riwayat')).toHaveClass('text-accent');
    expect(screen.getByText('Ringkasan')).toHaveClass('text-sub');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client && npx vitest run tests/BottomNavTripLevel.test.tsx`
Expected: FAIL — `onAddClick` prop doesn't exist yet, FAB is `disabled`.

- [ ] **Step 3: Update BottomNavTripLevel**

Replace `client/src/components/BottomNavTripLevel.tsx` in full:
```tsx
import { Link } from 'react-router-dom';

interface BottomNavTripLevelProps {
  publicId: string;
  active: 'ringkasan' | 'riwayat' | 'saldo';
  onAddClick: () => void;
}

export default function BottomNavTripLevel({ publicId, active, onAddClick }: BottomNavTripLevelProps) {
  const itemClass = (key: string) => `font-inter text-[10px] font-semibold ${active === key ? 'text-accent' : 'text-sub'}`;

  return (
    <div className="fixed inset-x-0 bottom-0 flex items-center justify-around border-t border-border bg-surface px-4 pb-[18px] pt-[10px]">
      <Link to={`/t/${publicId}/ringkasan`} className="flex flex-col items-center gap-[3px]">
        <span className={itemClass('ringkasan')}>Ringkasan</span>
      </Link>
      <Link to={`/t/${publicId}/riwayat`} className="flex flex-col items-center gap-[3px]">
        <span className={itemClass('riwayat')}>Riwayat</span>
      </Link>
      <button
        onClick={onAddClick}
        aria-label="Tambah sub trip"
        className="flex h-12 w-12 flex-none -translate-y-3 items-center justify-center rounded-full bg-accent font-inter text-lg text-onAccent"
      >
        +
      </button>
      <Link to={`/t/${publicId}/riwayat`} className="flex flex-col items-center gap-[3px]">
        <span className={itemClass('saldo')}>Saldo</span>
      </Link>
      <Link to="/profil" className="flex flex-col items-center gap-[3px]">
        <span className="font-inter text-[10px] font-medium text-sub">Profil</span>
      </Link>
    </div>
  );
}
```
(Note: the "Saldo" tab still links to `/riwayat` for now — the real Saldo screen is Tahap 3. This is a deliberate placeholder link, not a bug — Riwayat lets users see and settle debts per sub trip in the meantime.)

- [ ] **Step 4: Run the test**

Run: `cd client && npx vitest run tests/BottomNavTripLevel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Extend the API client**

In `client/src/lib/api.ts`, add these type exports after the existing `TripDetail` interface:
```ts
export type SubTripCategory = 'makan' | 'transport' | 'nginap' | 'tiket_wisata' | 'lainnya';

export interface MemberSummary {
  memberId: number;
  name: string;
  rollup: number;
  status: 'dilunasin' | 'ngutang' | 'lunas';
}

export interface TripSummaryDetail {
  members: MemberSummary[];
  tripTotal: number;
}

export interface SubTripListItem {
  id: number;
  name: string;
  category: SubTripCategory;
  date: string;
  payerMemberId: number;
  payerName: string;
  amount: number;
  unsettledCount: number;
}

export interface DebtItem {
  id: number;
  memberId: number;
  name: string;
  amount: number;
  settled: boolean;
}

export interface SubTripDetail {
  id: number;
  name: string;
  category: SubTripCategory;
  date: string;
  payerMemberId: number;
  payerName: string;
  amount: number;
  createdByMemberId: number;
  debts: DebtItem[];
}

export interface SubTripInput {
  name: string;
  category: SubTripCategory;
  date: string;
  payerMemberId: number;
  amount: number;
  participantMemberIds: number[];
  createdByMemberId: number;
}
```

Add these methods to the `api` object (after `tripDetail`):
```ts
  tripSummary: (publicId: string) => request<TripSummaryDetail>(`/trips/${publicId}/summary`),
  listSubTrips: (publicId: string) => request<SubTripListItem[]>(`/trips/${publicId}/subtrips`),
  createSubTrip: (publicId: string, input: SubTripInput) =>
    request<{ id: number }>(`/trips/${publicId}/subtrips`, { method: 'POST', body: JSON.stringify(input) }),
  getSubTrip: (publicId: string, subTripId: number) => request<SubTripDetail>(`/trips/${publicId}/subtrips/${subTripId}`),
  updateSubTrip: (publicId: string, subTripId: number, input: SubTripInput, memberId: number) =>
    request<{ id: number }>(`/trips/${publicId}/subtrips/${subTripId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
      headers: { 'X-Member-Id': String(memberId) },
    }),
  deleteSubTrip: (publicId: string, subTripId: number, memberId: number) =>
    request<{ ok: true }>(`/trips/${publicId}/subtrips/${subTripId}`, {
      method: 'DELETE',
      headers: { 'X-Member-Id': String(memberId) },
    }),
  toggleDebtSettled: (publicId: string, subTripId: number, debtId: number, settled: boolean) =>
    request<{ ok: true }>(`/trips/${publicId}/subtrips/${subTripId}/debts/${debtId}`, {
      method: 'PATCH',
      body: JSON.stringify({ settled }),
    }),
```

- [ ] **Step 6: Run the full client suite**

Run: `cd client && npx vitest run`
Expected: PASS — no other file consumes `BottomNavTripLevel` yet in this plan (Tahap 1's `RingkasanPlaceholderScreen` still uses the old 2-prop signature and will break — fix this now: update `client/src/screens/RingkasanPlaceholderScreen.tsx`'s usage to pass a no-op `onAddClick={() => {}}`, since Task 10 replaces this whole file shortly but it must not be left broken mid-plan).

Modify `client/src/screens/RingkasanPlaceholderScreen.tsx`'s `<BottomNavTripLevel publicId={publicId ?? ''} active="ringkasan" />` line to `<BottomNavTripLevel publicId={publicId ?? ''} active="ringkasan" onAddClick={() => {}} />`.

Run: `cd client && npx vitest run` again.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/api.ts client/src/components/BottomNavTripLevel.tsx client/src/screens/RingkasanPlaceholderScreen.tsx client/tests/BottomNavTripLevel.test.tsx
git commit -m "Extend API client for sub trips/summary/debts; activate BottomNavTripLevel FAB"
```

---

### Task 10: `AddEditSubTripSheet` — reusable Tambah/Edit pengeluaran form

**Files:**
- Create: `client/src/components/AddEditSubTripSheet.tsx`
- Test: `client/tests/AddEditSubTripSheet.test.tsx`

**Interfaces:**
- Consumes: `api.createSubTrip`, `api.updateSubTrip`, types `SubTripCategory`, `SubTripDetail` from Task 9.
- Produces: `<AddEditSubTripSheet publicId members currentMemberId mode initialData? onClose onSaved />` — consumed by Tasks 11, 12, 13 as a full-screen overlay, not a route.

**Design decisions locked in for this component (resolving ambiguity from the source design file):**
- **No date field.** The Add Expense sheet's field list in the design spec has no date picker — a sub trip's date is always "today" at creation time (`date = new Date().toISOString().slice(0, 10)`), and editing never changes it (edit always resends `initialData.date` unchanged).
- **Single primary action.** Header is `Batal` / title only (no header-level Save button) — the sticky footer `Simpan pengeluaran` button is the one and only submit action, avoiding a duplicate/redundant save control.
- **`createdByMemberId` semantics on edit:** always the *original* creator (`initialData.createdByMemberId`), never the current editor — the editor's identity is conveyed separately via the `X-Member-Id` header that `api.updateSubTrip` already attaches (Task 9). This field exists in the request body purely for the backend's member-scoping validation (Task 5/7), not as an authorization signal.
- **Default participant selection:** all members checked in create mode (matches "Pilih semua" being the natural starting state); in edit mode, reconstructed from `initialData.payerMemberId` + every `initialData.debts[].memberId` (this recovers the original full participant set, since debts only exist for non-payer participants).

- [ ] **Step 1: Write the failing tests**

`client/tests/AddEditSubTripSheet.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddEditSubTripSheet from '../src/components/AddEditSubTripSheet';

vi.mock('../src/lib/api', () => ({
  api: {
    createSubTrip: vi.fn(),
    updateSubTrip: vi.fn(),
  },
}));

import { api } from '../src/lib/api';

const members = [
  { id: 1, name: 'Budi' },
  { id: 2, name: 'Aji' },
  { id: 3, name: 'Citra' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AddEditSubTripSheet — create mode', () => {
  it('defaults to all members checked', () => {
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />,
    );
    expect(screen.getByText('Dibagi ke (3/3)')).toBeInTheDocument();
  });

  it('disables submit until a category is picked and required fields are filled', async () => {
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />,
    );
    const submit = screen.getByText('Simpan pengeluaran');
    expect(submit).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('misal: Makan siang di Resto A'), 'Makan Siang');
    await user.type(screen.getByPlaceholderText('0'), '90000');
    expect(submit).toBeDisabled();

    await user.click(screen.getByText('Makan', { selector: 'button' }));
    expect(submit).not.toBeDisabled();
  });

  it('unchecking a member updates the counter and excludes them from the submitted participants', async () => {
    vi.mocked(api.createSubTrip).mockResolvedValue({ id: 1 });
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('misal: Makan siang di Resto A'), 'Makan');
    await user.type(screen.getByPlaceholderText('0'), '90000');
    await user.click(screen.getByText('Makan', { selector: 'button' }));
    await user.click(screen.getByText('Citra'));
    expect(screen.getByText('Dibagi ke (2/3)')).toBeInTheDocument();

    await user.click(screen.getByText('Simpan pengeluaran'));
    expect(api.createSubTrip).toHaveBeenCalledWith('a1', expect.objectContaining({ participantMemberIds: [1, 2] }));
  });

  it('"Kosongkan" then "Pilih semua" round-trips the participant selection', async () => {
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={() => {}} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('Kosongkan'));
    expect(screen.getByText('Dibagi ke (0/3)')).toBeInTheDocument();
    await user.click(screen.getByText('Pilih semua'));
    expect(screen.getByText('Dibagi ke (3/3)')).toBeInTheDocument();
  });

  it('submits with createdByMemberId and default payer set to the current member', async () => {
    vi.mocked(api.createSubTrip).mockResolvedValue({ id: 1 });
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={2} mode="create" onClose={() => {}} onSaved={() => {}} />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('misal: Makan siang di Resto A'), 'Makan');
    await user.type(screen.getByPlaceholderText('0'), '30000');
    await user.click(screen.getByText('Lainnya'));
    await user.click(screen.getByText('Simpan pengeluaran'));
    expect(api.createSubTrip).toHaveBeenCalledWith('a1', expect.objectContaining({ createdByMemberId: 2, payerMemberId: 2 }));
  });

  it('calls onClose when Batal is clicked', async () => {
    const onClose = vi.fn();
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={onClose} onSaved={() => {}} />,
    );
    await userEvent.setup().click(screen.getByText('Batal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onSaved after a successful submit', async () => {
    vi.mocked(api.createSubTrip).mockResolvedValue({ id: 1 });
    const onSaved = vi.fn();
    render(
      <AddEditSubTripSheet publicId="a1" members={members} currentMemberId={1} mode="create" onClose={() => {}} onSaved={onSaved} />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('misal: Makan siang di Resto A'), 'Makan');
    await user.type(screen.getByPlaceholderText('0'), '10000');
    await user.click(screen.getByText('Lainnya'));
    await user.click(screen.getByText('Simpan pengeluaran'));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

describe('AddEditSubTripSheet — edit mode', () => {
  const initialData = {
    id: 5,
    name: 'Makan Malam',
    category: 'makan' as const,
    date: '2026-01-01',
    payerMemberId: 1,
    payerName: 'Budi',
    amount: 60000,
    createdByMemberId: 1,
    debts: [{ id: 10, memberId: 2, name: 'Aji', amount: 30000, settled: false }],
  };

  it('pre-fills fields from initialData, reconstructing participants from payer + debts', () => {
    render(
      <AddEditSubTripSheet
        publicId="a1" members={members} currentMemberId={1} mode="edit" initialData={initialData}
        onClose={() => {}} onSaved={() => {}}
      />,
    );
    expect(screen.getByDisplayValue('Makan Malam')).toBeInTheDocument();
    expect(screen.getByDisplayValue('60000')).toBeInTheDocument();
    expect(screen.getByText('Dibagi ke (2/3)')).toBeInTheDocument();
  });

  it('submits an update with the original createdByMemberId and unchanged date, using the editor as X-Member-Id', async () => {
    vi.mocked(api.updateSubTrip).mockResolvedValue({ id: 5 });
    render(
      <AddEditSubTripSheet
        publicId="a1" members={members} currentMemberId={2} mode="edit" initialData={initialData}
        onClose={() => {}} onSaved={() => {}}
      />,
    );
    await userEvent.setup().click(screen.getByText('Simpan pengeluaran'));
    expect(api.updateSubTrip).toHaveBeenCalledWith(
      'a1',
      5,
      expect.objectContaining({ createdByMemberId: 1, date: '2026-01-01' }),
      2,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client && npx vitest run tests/AddEditSubTripSheet.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

`client/src/components/AddEditSubTripSheet.tsx`:
```tsx
import { useState } from 'react';
import { api, type SubTripCategory, type SubTripDetail } from '../lib/api';

interface AddEditSubTripSheetProps {
  publicId: string;
  members: { id: number; name: string }[];
  currentMemberId: number;
  mode: 'create' | 'edit';
  initialData?: SubTripDetail;
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORIES: { value: SubTripCategory; label: string }[] = [
  { value: 'makan', label: 'Makan' },
  { value: 'transport', label: 'Transport' },
  { value: 'nginap', label: 'Nginap' },
  { value: 'tiket_wisata', label: 'Tiket wisata' },
  { value: 'lainnya', label: 'Lainnya' },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AddEditSubTripSheet({
  publicId,
  members,
  currentMemberId,
  mode,
  initialData,
  onClose,
  onSaved,
}: AddEditSubTripSheetProps) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [category, setCategory] = useState<SubTripCategory | null>(initialData?.category ?? null);
  const [amountText, setAmountText] = useState(initialData ? String(initialData.amount) : '');
  const [payerMemberId, setPayerMemberId] = useState<number>(initialData?.payerMemberId ?? currentMemberId);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(
    new Set(
      initialData
        ? [...initialData.debts.map((d) => d.memberId), initialData.payerMemberId]
        : members.map((m) => m.id),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = Number.parseInt(amountText, 10);
  const canSubmit = Boolean(name.trim() && category && Number.isFinite(amount) && amount > 0 && checkedIds.size > 0);

  function toggleMember(id: number) {
    const next = new Set(checkedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedIds(next);
  }

  async function handleSubmit() {
    if (!canSubmit || !category) return;
    setSubmitting(true);
    setError(null);
    try {
      const input = {
        name: name.trim(),
        category,
        date: initialData?.date ?? todayIso(),
        payerMemberId,
        amount,
        participantMemberIds: [...checkedIds],
        createdByMemberId: initialData?.createdByMemberId ?? currentMemberId,
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

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-bg">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <button onClick={onClose} className="font-inter text-sm text-sub">
          Batal
        </button>
        <div className="font-manrope text-sm font-bold text-text">
          {mode === 'create' ? 'Tambah pengeluaran' : 'Edit pengeluaran'}
        </div>
        <div className="w-10" />
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 pb-[100px]">
        <label className="flex flex-col gap-1.5">
          <span className="font-inter text-xs font-semibold text-sub">Keterangan</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="misal: Makan siang di Resto A"
            className="rounded-input border border-border bg-surface px-3.5 py-3 font-inter text-sm text-text"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="font-inter text-xs font-semibold text-sub">Kategori</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={`rounded-pill border px-3.5 py-1.5 font-inter text-[12.5px] font-medium ${
                  category === c.value ? 'border-accent bg-accent text-onAccent' : 'border-border bg-surface text-text'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="font-inter text-xs font-semibold text-sub">Nominal</span>
          <div className="flex items-center gap-2 rounded-input border border-border bg-surface px-3.5 py-3">
            <span className="font-mono text-sm text-sub">Rp</span>
            <input
              value={amountText}
              onChange={(e) => setAmountText(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              placeholder="0"
              className="flex-1 border-none bg-transparent font-mono text-sm text-text outline-none"
            />
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-inter text-xs font-semibold text-sub">Dibayar oleh</span>
          <select
            value={payerMemberId}
            onChange={(e) => setPayerMemberId(Number(e.target.value))}
            className="rounded-input border border-border bg-surface px-3.5 py-3 font-inter text-sm text-text"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-inter text-xs font-semibold text-sub">
              Dibagi ke ({checkedIds.size}/{members.length})
            </span>
            <div className="flex gap-3">
              <button onClick={() => setCheckedIds(new Set(members.map((m) => m.id)))} className="font-inter text-xs font-semibold text-accent">
                Pilih semua
              </button>
              <button onClick={() => setCheckedIds(new Set())} className="font-inter text-xs font-semibold text-accent">
                Kosongkan
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2.5 rounded-input border border-border bg-surface px-3.5 py-2.5">
                <input type="checkbox" checked={checkedIds.has(m.id)} onChange={() => toggleMember(m.id)} />
                <span className="font-inter text-sm text-text">{m.name}</span>
              </label>
            ))}
          </div>
        </div>

        {error && <div className="font-inter text-[12.5px] text-neg">{error}</div>}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface px-5 py-3.5">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full rounded-[14px] bg-accent px-4 py-3.5 font-inter text-sm font-bold text-onAccent disabled:opacity-50"
        >
          Simpan pengeluaran
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `cd client && npx vitest run tests/AddEditSubTripSheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full client suite**

Run: `cd client && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/AddEditSubTripSheet.tsx client/tests/AddEditSubTripSheet.test.tsx
git commit -m "Add AddEditSubTripSheet component"
```

---

### Task 11: `RingkasanScreen` (real) — replaces the Tahap 1 placeholder

**Files:**
- Create: `client/src/lib/format.ts`, `client/src/screens/RingkasanScreen.tsx`
- Modify: `client/src/components/TripCard.tsx` (use the extracted `formatDateRange`), `client/src/App.tsx`, `client/tests/Navigation.test.tsx`
- Delete: `client/src/screens/RingkasanPlaceholderScreen.tsx`
- Test: `client/tests/format.test.ts`, `client/tests/RingkasanScreen.test.tsx`

**Interfaces:**
- Consumes: `api.tripDetail`, `api.tripSummary`, `api.listSubTrips` from Tahap 1/Task 9; `getIdentity` from Tahap 1; `<BottomNavTripLevel>`, `<AddEditSubTripSheet>` from Task 9/10.
- Produces: `formatRupiah(amount: number): string`, `formatDateRange(startDate, endDate): string` from `format.ts` — consumed by Tasks 12, 13; `<RingkasanScreen />` mounted at `/t/:publicId/ringkasan` in `App.tsx`.

- [ ] **Step 1: Write the failing format.ts tests**

`client/tests/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatDateRange, formatRupiah } from '../src/lib/format';

describe('formatDateRange', () => {
  it('formats a date range with Indonesian month abbreviations', () => {
    expect(formatDateRange('2026-09-01', '2026-09-04')).toBe('1 Sep–4 Sep');
  });
});

describe('formatRupiah', () => {
  it('formats a positive amount with a Rp prefix and thousands separators', () => {
    expect(formatRupiah(20000)).toBe('Rp20.000');
  });

  it('formats zero without a sign', () => {
    expect(formatRupiah(0)).toBe('Rp0');
  });

  it('formats a negative amount with the minus sign before Rp', () => {
    expect(formatRupiah(-20000)).toBe('-Rp20.000');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client && npx vitest run tests/format.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement format.ts**

`client/src/lib/format.ts`:
```ts
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function formatDateRange(startDate: string, endDate: string): string {
  const fmt = (iso: string) => {
    const [, month, day] = iso.split('-');
    return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
  };
  return `${fmt(startDate)}–${fmt(endDate)}`;
}

export function formatRupiah(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('id-ID').format(abs);
  return amount < 0 ? `-Rp${formatted}` : `Rp${formatted}`;
}
```

- [ ] **Step 4: Run the format tests, then refactor TripCard.tsx to use the extracted formatDateRange**

Run: `cd client && npx vitest run tests/format.test.ts` — Expected: PASS.

In `client/src/components/TripCard.tsx`, remove the local `MONTHS` array and `formatDateRange` function definitions, and add `import { formatDateRange } from '../lib/format';` at the top instead. The call site (`formatDateRange(trip.startDate, trip.endDate)` inside the JSX) stays unchanged.

Run: `cd client && npx vitest run tests/TripListScreen.test.tsx` — Expected: PASS (same behavior, no test changes needed since output is identical).

- [ ] **Step 5: Write the failing RingkasanScreen tests**

`client/tests/RingkasanScreen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RingkasanScreen from '../src/screens/RingkasanScreen';
import { setIdentity } from '../src/lib/localTrips';

vi.mock('../src/lib/api', () => ({
  api: {
    tripDetail: vi.fn(),
    tripSummary: vi.fn(),
    listSubTrips: vi.fn(),
  },
}));

import { api } from '../src/lib/api';

const tripDetail = {
  publicId: 'a1',
  name: 'Trip ke Jogja',
  destination: 'Yogyakarta',
  startDate: '2026-01-01',
  endDate: '2026-01-04',
  members: [
    { id: 1, name: 'Budi' },
    { id: 2, name: 'Aji' },
  ],
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setIdentity('a1', '1');
  vi.mocked(api.tripDetail).mockResolvedValue(tripDetail);
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/t/a1/ringkasan']}>
      <Routes>
        <Route path="/t/:publicId/ringkasan" element={<RingkasanScreen />} />
        <Route path="/t/:publicId/riwayat" element={<div>Riwayat screen</div>} />
        <Route path="/" element={<div>Daftar trip screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RingkasanScreen — empty state', () => {
  it('shows the empty state when there are no sub trips', async () => {
    vi.mocked(api.tripSummary).mockResolvedValue({
      members: [
        { memberId: 1, name: 'Budi', rollup: 0, status: 'lunas' },
        { memberId: 2, name: 'Aji', rollup: 0, status: 'lunas' },
      ],
      tripTotal: 0,
    });
    vi.mocked(api.listSubTrips).mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('Belum ada pengeluaran')).toBeInTheDocument();
    expect(screen.getByText('+ Tambah pengeluaran pertama')).toBeInTheDocument();
  });

  it('opens the add sheet from the empty-state button', async () => {
    vi.mocked(api.tripSummary).mockResolvedValue({ members: [], tripTotal: 0 });
    vi.mocked(api.listSubTrips).mockResolvedValue([]);
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('+ Tambah pengeluaran pertama'));
    expect(screen.getByText('Tambah pengeluaran')).toBeInTheDocument();
  });
});

describe('RingkasanScreen — with sub trips', () => {
  beforeEach(() => {
    vi.mocked(api.tripSummary).mockResolvedValue({
      members: [
        { memberId: 1, name: 'Budi', rollup: 20000, status: 'dilunasin' },
        { memberId: 2, name: 'Aji', rollup: -20000, status: 'ngutang' },
      ],
      tripTotal: 40000,
    });
    vi.mocked(api.listSubTrips).mockResolvedValue([
      { id: 1, name: 'Makan', category: 'makan', date: '2026-01-01', payerMemberId: 1, payerName: 'Budi', amount: 40000, unsettledCount: 1 },
    ]);
  });

  it("shows the current member's rollup in the balance card", async () => {
    renderScreen();
    expect(await screen.findByText('Saldo kamu (Budi) — total semua sub trip')).toBeInTheDocument();
    expect(screen.getByText('Rp20.000')).toBeInTheDocument();
  });

  it("shows every member's status in the list", async () => {
    renderScreen();
    await screen.findByText('Dilunasin');
    expect(screen.getByText('Ngutang')).toBeInTheDocument();
  });

  it('navigates to Riwayat via the CTA button', async () => {
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('Lihat semua tagihan per sub trip →'));
    expect(await screen.findByText('Riwayat screen')).toBeInTheDocument();
  });

  it('navigates to Daftar Trip via "Trip lain"', async () => {
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('Trip lain'));
    expect(await screen.findByText('Daftar trip screen')).toBeInTheDocument();
  });

  it('opens the add sheet from the FAB and can be closed again', async () => {
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Tambah sub trip'));
    expect(screen.getByText('Tambah pengeluaran')).toBeInTheDocument();
    await user.click(screen.getByText('Batal'));
    expect(screen.queryByText('Tambah pengeluaran')).not.toBeInTheDocument();
  });
});

describe('RingkasanScreen — error handling', () => {
  it('shows an error message when loading fails', async () => {
    vi.mocked(api.tripSummary).mockRejectedValue(new Error('network error'));
    vi.mocked(api.listSubTrips).mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('Gagal muat ringkasan. Coba refresh halaman.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd client && npx vitest run tests/RingkasanScreen.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 7: Implement RingkasanScreen**

`client/src/screens/RingkasanScreen.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type SubTripListItem, type TripDetail, type TripSummaryDetail } from '../lib/api';
import { getIdentity } from '../lib/localTrips';
import { formatDateRange, formatRupiah } from '../lib/format';
import BottomNavTripLevel from '../components/BottomNavTripLevel';
import AddEditSubTripSheet from '../components/AddEditSubTripSheet';

export default function RingkasanScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [summary, setSummary] = useState<TripSummaryDetail | null>(null);
  const [subTrips, setSubTrips] = useState<SubTripListItem[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentMemberId = publicId ? Number(getIdentity(publicId)) : null;

  async function load() {
    if (!publicId) return;
    try {
      const [tripData, summaryData, subTripData] = await Promise.all([
        api.tripDetail(publicId),
        api.tripSummary(publicId),
        api.listSubTrips(publicId),
      ]);
      setTrip(tripData);
      setSummary(summaryData);
      setSubTrips(subTripData);
    } catch {
      setError('Gagal muat ringkasan. Coba refresh halaman.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId]);

  function handleSaved() {
    setSheetOpen(false);
    load();
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
        <div className="font-inter text-[13px] text-neg">{error}</div>
      </div>
    );
  }

  if (!trip || !summary || !subTrips || !publicId || currentMemberId === null) return null;

  const myName = trip.members.find((m) => m.id === currentMemberId)?.name ?? '';
  const mySummary = summary.members.find((m) => m.memberId === currentMemberId);
  const isEmpty = subTrips.length === 0;

  return (
    <div className="flex min-h-screen flex-col gap-4 px-5 pb-[100px] pt-2">
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-manrope text-[17px] font-extrabold text-text">{trip.name}</div>
          <div className="truncate font-inter text-xs text-sub">
            {trip.members.length} orang · {formatDateRange(trip.startDate, trip.endDate)} · Total {formatRupiah(summary.tripTotal)}
          </div>
        </div>
        <button
          onClick={() => navigate('/')}
          className="flex flex-none items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-1.5 font-inter text-xs font-semibold text-text"
        >
          Trip lain
        </button>
      </div>

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="font-manrope text-base font-bold text-text">Belum ada pengeluaran</div>
          <div className="max-w-[250px] font-inter text-[13px] leading-relaxed text-sub">
            Trip ini baru dibuat. Tambah sub trip pertama begitu ada yang nalangin sesuatu.
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            className="mt-1 rounded-[12px] bg-accent px-[18px] py-[11px] font-inter text-[13px] font-bold text-onAccent"
          >
            + Tambah pengeluaran pertama
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-card bg-accent px-4 py-4 text-onAccent">
            <div className="font-inter text-xs font-medium text-onAccentSoft">Saldo kamu ({myName}) — total semua sub trip</div>
            <div className="mt-1.5 font-mono text-2xl font-semibold">{formatRupiah(mySummary?.rollup ?? 0)}</div>
            <div className="mt-1.5 font-inter text-[11px] text-onAccentSoft">
              Angka ini rollup aja — tagihan asli tetap per sub trip, lihat di bawah
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">Saldo semua anggota</div>
            {summary.members.map((m) => {
              const statusLabel = m.status === 'dilunasin' ? 'Dilunasin' : m.status === 'ngutang' ? 'Ngutang' : 'Lunas';
              const statusColor = m.status === 'dilunasin' ? 'text-pos' : m.status === 'ngutang' ? 'text-neg' : 'text-sub';
              return (
                <div key={m.memberId} className="flex items-center justify-between rounded-card border border-border bg-surface px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-surfaceAlt font-manrope text-xs font-bold text-text">
                      {m.name.trim().charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="font-inter text-sm font-semibold text-text">{m.name}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-inter text-[11px] font-medium ${statusColor}`}>{statusLabel}</div>
                    <div className={`font-mono text-[13px] font-semibold ${statusColor}`}>{formatRupiah(m.rollup)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => navigate(`/t/${publicId}/riwayat`)}
            className="rounded-input border border-border bg-surface px-4 py-3 text-center font-inter text-[13px] font-semibold text-accent"
          >
            Lihat semua tagihan per sub trip →
          </button>
        </>
      )}

      <BottomNavTripLevel publicId={publicId} active="ringkasan" onAddClick={() => setSheetOpen(true)} />

      {sheetOpen && currentMemberId !== null && (
        <AddEditSubTripSheet
          publicId={publicId}
          members={trip.members}
          currentMemberId={currentMemberId}
          mode="create"
          onClose={() => setSheetOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 8: Wire the route into App.tsx and delete the placeholder**

Delete `client/src/screens/RingkasanPlaceholderScreen.tsx`.

In `client/src/App.tsx`, replace the import and route:
```tsx
import RingkasanScreen from './screens/RingkasanScreen';
// ...
<Route path="/t/:publicId/ringkasan" element={<RingkasanScreen />} />
```
(remove the old `import RingkasanPlaceholderScreen from './screens/RingkasanPlaceholderScreen';` and its route line.)

- [ ] **Step 9: Fix Navigation.test.tsx, which depended on the now-deleted placeholder**

Replace `client/tests/Navigation.test.tsx` in full — it no longer needs to route through Ringkasan to prove the shell works; test the Profil placeholder directly (which has no data-fetching, so it stays a pure smoke test):
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

describe('navigation shell', () => {
  it('renders the Profil placeholder with the app-level bottom nav', async () => {
    render(
      <MemoryRouter initialEntries={['/profil']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Pengaturan segera hadir')).toBeInTheDocument();
    expect(screen.getByText('Beranda')).toBeInTheDocument();
    expect(screen.getByText('Profil')).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run the full client suite**

Run: `cd client && npx vitest run`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add client/src/lib/format.ts client/src/components/TripCard.tsx client/src/screens/RingkasanScreen.tsx client/src/App.tsx client/tests/format.test.ts client/tests/RingkasanScreen.test.tsx client/tests/Navigation.test.tsx
git rm client/src/screens/RingkasanPlaceholderScreen.tsx
git commit -m "Add real RingkasanScreen, replacing the Tahap 1 placeholder"
```

---

### Task 12: `RiwayatScreen`

**Files:**
- Create: `client/src/lib/categories.ts`, `client/src/screens/RiwayatScreen.tsx`
- Modify: `client/src/components/AddEditSubTripSheet.tsx` (use extracted `CATEGORIES`), `client/src/App.tsx`
- Test: `client/tests/RiwayatScreen.test.tsx`

**Interfaces:**
- Consumes: `api.tripDetail`, `api.listSubTrips` from Tahap 1/Task 9; `getIdentity` from Tahap 1; `formatRupiah` from Task 11; `<BottomNavTripLevel>`, `<AddEditSubTripSheet>` from Task 9/10.
- Produces: `CATEGORIES: {value, label}[]`, `categoryLabel(category): string` from `categories.ts` — consumed by Task 10 (refactored) and Task 13. `<RiwayatScreen />` mounted at `/t/:publicId/riwayat` in `App.tsx`.

- [ ] **Step 1: Extract the category label map**

`client/src/lib/categories.ts`:
```ts
import type { SubTripCategory } from './api';

export const CATEGORIES: { value: SubTripCategory; label: string }[] = [
  { value: 'makan', label: 'Makan' },
  { value: 'transport', label: 'Transport' },
  { value: 'nginap', label: 'Nginap' },
  { value: 'tiket_wisata', label: 'Tiket wisata' },
  { value: 'lainnya', label: 'Lainnya' },
];

export function categoryLabel(category: SubTripCategory): string {
  return CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
```

In `client/src/components/AddEditSubTripSheet.tsx`, remove the local `CATEGORIES` array definition and add `import { CATEGORIES } from '../lib/categories';` instead. The rest of the file is unchanged.

Run: `cd client && npx vitest run tests/AddEditSubTripSheet.test.tsx` — Expected: PASS (no behavior change).

- [ ] **Step 2: Write the failing RiwayatScreen tests**

`client/tests/RiwayatScreen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RiwayatScreen from '../src/screens/RiwayatScreen';
import { setIdentity } from '../src/lib/localTrips';

vi.mock('../src/lib/api', () => ({
  api: {
    tripDetail: vi.fn(),
    listSubTrips: vi.fn(),
  },
}));

import { api } from '../src/lib/api';

const tripDetail = {
  publicId: 'a1',
  name: 'Trip ke Jogja',
  destination: 'Yogyakarta',
  startDate: '2026-01-01',
  endDate: '2026-01-04',
  members: [{ id: 1, name: 'Budi' }],
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setIdentity('a1', '1');
  vi.mocked(api.tripDetail).mockResolvedValue(tripDetail);
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/t/a1/riwayat']}>
      <Routes>
        <Route path="/t/:publicId/riwayat" element={<RiwayatScreen />} />
        <Route path="/t/:publicId/subtrip/:subTripId" element={<div>Sub trip detail screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RiwayatScreen', () => {
  it('renders each sub trip row with category, payer, date, unsettled count, and amount', async () => {
    vi.mocked(api.listSubTrips).mockResolvedValue([
      { id: 1, name: 'Makan Siang', category: 'makan', date: '2026-01-01', payerMemberId: 1, payerName: 'Budi', amount: 40000, unsettledCount: 1 },
    ]);
    renderScreen();
    expect(await screen.findByText('Makan Siang')).toBeInTheDocument();
    expect(screen.getByText('Makan · dibayar Budi · 2026-01-01 · 1 belum lunas')).toBeInTheDocument();
    expect(screen.getByText('Rp40.000')).toBeInTheDocument();
  });

  it('shows "Semua lunas" when a sub trip has no unsettled debts', async () => {
    vi.mocked(api.listSubTrips).mockResolvedValue([
      { id: 1, name: 'Makan Siang', category: 'makan', date: '2026-01-01', payerMemberId: 1, payerName: 'Budi', amount: 40000, unsettledCount: 0 },
    ]);
    renderScreen();
    expect(await screen.findByText('Makan · dibayar Budi · 2026-01-01 · Semua lunas')).toBeInTheDocument();
  });

  it('shows an empty message when there are no sub trips', async () => {
    vi.mocked(api.listSubTrips).mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('Belum ada sub trip.')).toBeInTheDocument();
  });

  it('navigates to Sub trip detail when a row is tapped', async () => {
    vi.mocked(api.listSubTrips).mockResolvedValue([
      { id: 7, name: 'Makan Siang', category: 'makan', date: '2026-01-01', payerMemberId: 1, payerName: 'Budi', amount: 40000, unsettledCount: 1 },
    ]);
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('Makan Siang'));
    expect(await screen.findByText('Sub trip detail screen')).toBeInTheDocument();
  });

  it('opens the add sheet from the FAB', async () => {
    vi.mocked(api.listSubTrips).mockResolvedValue([]);
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Tambah sub trip'));
    expect(screen.getByText('Tambah pengeluaran')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.mocked(api.listSubTrips).mockRejectedValue(new Error('network error'));
    renderScreen();
    expect(await screen.findByText('Gagal muat riwayat. Coba refresh halaman.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd client && npx vitest run tests/RiwayatScreen.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Implement RiwayatScreen**

`client/src/screens/RiwayatScreen.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type SubTripListItem, type TripDetail } from '../lib/api';
import { getIdentity } from '../lib/localTrips';
import { formatRupiah } from '../lib/format';
import { categoryLabel } from '../lib/categories';
import BottomNavTripLevel from '../components/BottomNavTripLevel';
import AddEditSubTripSheet from '../components/AddEditSubTripSheet';

export default function RiwayatScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [subTrips, setSubTrips] = useState<SubTripListItem[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentMemberId = publicId ? Number(getIdentity(publicId)) : null;

  async function load() {
    if (!publicId) return;
    try {
      const [tripData, subTripData] = await Promise.all([api.tripDetail(publicId), api.listSubTrips(publicId)]);
      setTrip(tripData);
      setSubTrips(subTripData);
    } catch {
      setError('Gagal muat riwayat. Coba refresh halaman.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId]);

  function handleSaved() {
    setSheetOpen(false);
    load();
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
        <div className="font-inter text-[13px] text-neg">{error}</div>
      </div>
    );
  }

  if (!trip || !subTrips || !publicId || currentMemberId === null) return null;

  return (
    <div className="flex min-h-screen flex-col gap-3 px-5 pb-[100px] pt-2">
      <div className="mt-2.5">
        <div className="font-manrope text-lg font-extrabold text-text">Riwayat</div>
        <div className="mt-1 font-inter text-xs text-sub">Tiap sub trip punya tagihan sendiri, gak digabung sama yang lain.</div>
      </div>

      {subTrips.length === 0 ? (
        <div className="py-8 text-center font-inter text-[13px] text-sub">Belum ada sub trip.</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {subTrips.map((s) => (
            <button
              key={s.id}
              onClick={() => navigate(`/t/${publicId}/subtrip/${s.id}`)}
              className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-3.5 py-3 text-left"
            >
              <div className="min-w-0">
                <div className="truncate font-inter text-sm font-semibold text-text">{s.name}</div>
                <div className="truncate font-inter text-xs text-sub">
                  {categoryLabel(s.category)} · dibayar {s.payerName} · {s.date} ·{' '}
                  {s.unsettledCount > 0 ? `${s.unsettledCount} belum lunas` : 'Semua lunas'}
                </div>
              </div>
              <div className="flex-none font-mono text-sm font-semibold text-text">{formatRupiah(s.amount)}</div>
            </button>
          ))}
        </div>
      )}

      <BottomNavTripLevel publicId={publicId} active="riwayat" onAddClick={() => setSheetOpen(true)} />

      {sheetOpen && currentMemberId !== null && (
        <AddEditSubTripSheet
          publicId={publicId}
          members={trip.members}
          currentMemberId={currentMemberId}
          mode="create"
          onClose={() => setSheetOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire the route into App.tsx**

Modify `client/src/App.tsx` — add the import and route:
```tsx
import RiwayatScreen from './screens/RiwayatScreen';
// ...
<Route path="/t/:publicId/riwayat" element={<RiwayatScreen />} />
```

- [ ] **Step 6: Run the full client suite**

Run: `cd client && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/categories.ts client/src/components/AddEditSubTripSheet.tsx client/src/screens/RiwayatScreen.tsx client/src/App.tsx client/tests/RiwayatScreen.test.tsx
git commit -m "Add RiwayatScreen"
```

---

### Task 13: `SubTripDetailScreen` — tagihan per orang, tandai lunas, edit/hapus

**Files:**
- Create: `client/src/screens/SubTripDetailScreen.tsx`
- Modify: `client/src/App.tsx`
- Test: `client/tests/SubTripDetailScreen.test.tsx`

**Interfaces:**
- Consumes: `api.getSubTrip`, `api.tripDetail`, `api.toggleDebtSettled`, `api.deleteSubTrip` from Task 9; `formatRupiah` from Task 11; `categoryLabel` from Task 12; `getIdentity` from Tahap 1; `<BottomNavTripLevel>`, `<AddEditSubTripSheet>` from Task 9/10.
- Produces: `<SubTripDetailScreen />` mounted at `/t/:publicId/subtrip/:subTripId` in `App.tsx` — completes the Tahap 2 (part 1) route table.

**Known scope narrowing (document, don't silently skip):** Edit/Hapus visibility is driven only by `currentMemberId === subTrip.createdByMemberId` (the client-side local identity). The spec's "or the trip creator" clause is NOT checked client-side in this screen — `GET /api/trips/:publicId` (Tahap 1) doesn't expose `creatorUserId`, so the client has no way to know "is this browser's session the trip creator" without a new endpoint/field. The **server already enforces** the full rule correctly (Task 7's `canModifySubTrip` checks both). This only means a trip creator who didn't personally add an entry won't see the Edit/Hapus buttons in this UI yet — not a security gap, a UI-completeness gap, acceptable for this stage.

The sheet is used from two independent triggers on this screen: the bottom-nav FAB (always **create** mode, for adding an unrelated new sub trip while viewing this one) and the **Edit** button (mode **edit**, pre-filled with the currently viewed sub trip). Track this with a single `sheetMode: 'create' | 'edit' | null` state, not two booleans.

- [ ] **Step 1: Write the failing tests**

`client/tests/SubTripDetailScreen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SubTripDetailScreen from '../src/screens/SubTripDetailScreen';
import { setIdentity } from '../src/lib/localTrips';

vi.mock('../src/lib/api', () => ({
  api: {
    getSubTrip: vi.fn(),
    tripDetail: vi.fn(),
    toggleDebtSettled: vi.fn(),
    deleteSubTrip: vi.fn(),
  },
}));

import { api } from '../src/lib/api';

const tripDetail = {
  publicId: 'a1',
  name: 'Trip ke Jogja',
  destination: 'Yogyakarta',
  startDate: '2026-01-01',
  endDate: '2026-01-04',
  members: [
    { id: 1, name: 'Budi' },
    { id: 2, name: 'Aji' },
  ],
};

const subTripDetail = {
  id: 5,
  name: 'Makan Malam',
  category: 'makan' as const,
  date: '2026-01-01',
  payerMemberId: 1,
  payerName: 'Budi',
  amount: 60000,
  createdByMemberId: 1,
  debts: [{ id: 10, memberId: 2, name: 'Aji', amount: 30000, settled: false }],
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(api.tripDetail).mockResolvedValue(tripDetail);
  vi.mocked(api.getSubTrip).mockResolvedValue(subTripDetail);
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/t/a1/subtrip/5']}>
      <Routes>
        <Route path="/t/:publicId/subtrip/:subTripId" element={<SubTripDetailScreen />} />
        <Route path="/t/:publicId/riwayat" element={<div>Riwayat screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SubTripDetailScreen — display', () => {
  it('renders sub trip header, accent card, and debt rows', async () => {
    setIdentity('a1', '2');
    renderScreen();
    expect(await screen.findByText('Makan Malam')).toBeInTheDocument();
    expect(screen.getByText('Makan · 2026-01-01')).toBeInTheDocument();
    expect(screen.getByText('Total dibayar Budi')).toBeInTheDocument();
    expect(screen.getByText('Rp60.000')).toBeInTheDocument();
    expect(screen.getByText('Aji')).toBeInTheDocument();
    expect(screen.getByText('Belum transfer')).toBeInTheDocument();
    expect(screen.getByText('Rp30.000')).toBeInTheDocument();
  });

  it('navigates back to Riwayat via the back link', async () => {
    setIdentity('a1', '2');
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('← Riwayat'));
    expect(await screen.findByText('Riwayat screen')).toBeInTheDocument();
  });
});

describe('SubTripDetailScreen — toggling debts', () => {
  it('marks a debt as settled and refetches', async () => {
    setIdentity('a1', '2');
    vi.mocked(api.toggleDebtSettled).mockResolvedValue({ ok: true });
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('Tandai lunas'));
    expect(api.toggleDebtSettled).toHaveBeenCalledWith('a1', 5, 10, true);
    expect(api.getSubTrip).toHaveBeenCalledTimes(2);
  });
});

describe('SubTripDetailScreen — edit/delete authorization', () => {
  it('shows Edit and Hapus for the member who created the entry', async () => {
    setIdentity('a1', '1');
    renderScreen();
    expect(await screen.findByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Hapus')).toBeInTheDocument();
  });

  it('hides Edit and Hapus for a member who did not create the entry', async () => {
    setIdentity('a1', '2');
    renderScreen();
    await screen.findByText('Makan Malam');
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Hapus')).not.toBeInTheDocument();
  });

  it('opens the sheet in edit mode, pre-filled, when Edit is clicked', async () => {
    setIdentity('a1', '1');
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('Edit'));
    expect(screen.getByText('Edit pengeluaran')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Makan Malam')).toBeInTheDocument();
  });

  it('shows a confirmation step before deleting, and Batal cancels it', async () => {
    setIdentity('a1', '1');
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('Hapus'));
    expect(screen.getByText('Yakin mau hapus sub trip ini?')).toBeInTheDocument();
    await user.click(screen.getByText('Batal'));
    expect(screen.queryByText('Yakin mau hapus sub trip ini?')).not.toBeInTheDocument();
  });

  it('deletes the sub trip and navigates to Riwayat on confirm', async () => {
    setIdentity('a1', '1');
    vi.mocked(api.deleteSubTrip).mockResolvedValue({ ok: true });
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByText('Hapus'));
    await user.click(screen.getByText('Ya, hapus'));
    expect(api.deleteSubTrip).toHaveBeenCalledWith('a1', 5, 1);
    expect(await screen.findByText('Riwayat screen')).toBeInTheDocument();
  });
});

describe('SubTripDetailScreen — FAB', () => {
  it('opens the sheet in create mode from the FAB', async () => {
    setIdentity('a1', '2');
    renderScreen();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Tambah sub trip'));
    expect(screen.getByText('Tambah pengeluaran')).toBeInTheDocument();
  });
});

describe('SubTripDetailScreen — error handling', () => {
  it('shows an error message when loading fails', async () => {
    setIdentity('a1', '2');
    vi.mocked(api.getSubTrip).mockRejectedValue(new Error('network error'));
    renderScreen();
    expect(await screen.findByText('Gagal muat detail sub trip. Coba refresh halaman.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client && npx vitest run tests/SubTripDetailScreen.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

`client/src/screens/SubTripDetailScreen.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type SubTripDetail as SubTripDetailType } from '../lib/api';
import { getIdentity } from '../lib/localTrips';
import { formatRupiah } from '../lib/format';
import { categoryLabel } from '../lib/categories';
import BottomNavTripLevel from '../components/BottomNavTripLevel';
import AddEditSubTripSheet from '../components/AddEditSubTripSheet';

export default function SubTripDetailScreen() {
  const { publicId, subTripId } = useParams<{ publicId: string; subTripId: string }>();
  const navigate = useNavigate();
  const [subTrip, setSubTrip] = useState<SubTripDetailType | null>(null);
  const [members, setMembers] = useState<{ id: number; name: string }[] | null>(null);
  const [sheetMode, setSheetMode] = useState<'create' | 'edit' | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentMemberId = publicId ? Number(getIdentity(publicId)) : null;

  async function load() {
    if (!publicId || !subTripId) return;
    try {
      const [subTripData, tripData] = await Promise.all([
        api.getSubTrip(publicId, Number(subTripId)),
        api.tripDetail(publicId),
      ]);
      setSubTrip(subTripData);
      setMembers(tripData.members);
    } catch {
      setError('Gagal muat detail sub trip. Coba refresh halaman.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId, subTripId]);

  async function handleToggleSettled(debtId: number, settled: boolean) {
    if (!publicId || !subTripId) return;
    await api.toggleDebtSettled(publicId, Number(subTripId), debtId, settled);
    load();
  }

  function handleSaved() {
    setSheetMode(null);
    load();
  }

  async function handleConfirmDelete() {
    if (!publicId || !subTripId || currentMemberId === null) return;
    try {
      await api.deleteSubTrip(publicId, Number(subTripId), currentMemberId);
      navigate(`/t/${publicId}/riwayat`);
    } catch {
      setError('Gagal hapus sub trip. Coba lagi.');
      setConfirmingDelete(false);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
        <div className="font-inter text-[13px] text-neg">{error}</div>
      </div>
    );
  }

  if (!subTrip || !members || !publicId || currentMemberId === null) return null;

  const canModify = currentMemberId === subTrip.createdByMemberId;

  return (
    <div className="flex min-h-screen flex-col gap-4 px-5 pb-[100px] pt-2">
      <button
        onClick={() => navigate(`/t/${publicId}/riwayat`)}
        className="mt-2.5 flex items-center gap-1.5 self-start border-none bg-transparent"
      >
        <span className="font-inter text-[12.5px] font-medium text-sub">← Riwayat</span>
      </button>

      <div>
        <div className="font-manrope text-lg font-extrabold text-text">{subTrip.name}</div>
        <div className="mt-1 font-inter text-xs text-sub">
          {categoryLabel(subTrip.category)} · {subTrip.date}
        </div>
      </div>

      <div className="rounded-card bg-accent px-4 py-4 text-onAccent">
        <div className="font-inter text-xs font-medium text-onAccentSoft">Total dibayar {subTrip.payerName}</div>
        <div className="mt-1.5 font-mono text-xl font-semibold">{formatRupiah(subTrip.amount)}</div>
      </div>

      <div className="flex h-24 items-center justify-center rounded-card border border-dashed border-border font-inter text-xs text-sub">
        foto struk
      </div>

      <div className="flex flex-col gap-2">
        <div className="font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">Tagihan per orang</div>
        {subTrip.debts.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-surfaceAlt font-manrope text-xs font-bold text-text">
                {d.name.trim().charAt(0).toUpperCase() || '?'}
              </div>
              <div>
                <div className="font-inter text-sm font-semibold text-text">{d.name}</div>
                <div className={`font-inter text-[11px] ${d.settled ? 'text-pos' : 'text-neg'}`}>
                  {d.settled ? 'Lunas' : 'Belum transfer'}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="font-mono text-sm font-semibold text-text">{formatRupiah(d.amount)}</div>
              <button
                onClick={() => handleToggleSettled(d.id, !d.settled)}
                className={`rounded-input border px-2.5 py-1 font-inter text-[11px] font-semibold ${
                  d.settled ? 'border-pos text-pos' : 'border-accent text-accent'
                }`}
              >
                {d.settled ? 'Batalkan' : 'Tandai lunas'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {canModify && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {confirmingDelete ? (
            <div className="flex flex-col gap-2">
              <div className="font-inter text-[12.5px] text-text">Yakin mau hapus sub trip ini?</div>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmDelete}
                  className="flex-1 rounded-input bg-neg px-4 py-2.5 font-inter text-[12.5px] font-bold text-onAccent"
                >
                  Ya, hapus
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="flex-1 rounded-input border border-border px-4 py-2.5 font-inter text-[12.5px] font-semibold text-text"
                >
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setSheetMode('edit')}
                className="flex-1 rounded-input border border-border px-4 py-2.5 font-inter text-[12.5px] font-semibold text-text"
              >
                Edit
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                className="flex-1 rounded-input border border-neg px-4 py-2.5 font-inter text-[12.5px] font-semibold text-neg"
              >
                Hapus
              </button>
            </div>
          )}
          <div className="font-inter text-[11px] text-sub">Cuma yang nambahin entri ini yang bisa edit/hapus.</div>
        </div>
      )}

      <BottomNavTripLevel publicId={publicId} active="riwayat" onAddClick={() => setSheetMode('create')} />

      {sheetMode && (
        <AddEditSubTripSheet
          publicId={publicId}
          members={members}
          currentMemberId={currentMemberId}
          mode={sheetMode}
          initialData={sheetMode === 'edit' ? subTrip : undefined}
          onClose={() => setSheetMode(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire the route into App.tsx**

Modify `client/src/App.tsx` — add the import and route:
```tsx
import SubTripDetailScreen from './screens/SubTripDetailScreen';
// ...
<Route path="/t/:publicId/subtrip/:subTripId" element={<SubTripDetailScreen />} />
```

- [ ] **Step 5: Run the full client suite**

Run: `cd client && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/screens/SubTripDetailScreen.tsx client/src/App.tsx client/tests/SubTripDetailScreen.test.tsx
git commit -m "Add SubTripDetailScreen, completing the Tahap 2 (part 1) route table"
```

---

### Task 14: Final integration — full test suite and manual walkthrough

**Files:** none created; this task verifies Tasks 1–13 work together as a whole.

- [ ] **Step 1: Run the full automated test suite from the repo root**

Run:
```bash
npm run test
```
Expected: every server and client test file passes.

- [ ] **Step 2: Typecheck both packages**

Run:
```bash
cd server && npx tsc --noEmit
cd ../client && npx tsc -b --noEmit
```
Expected: no type errors.

- [ ] **Step 3: Start both dev servers**

In one terminal: `cd server && npm run dev`
In a second terminal: `cd client && npm run dev`

- [ ] **Step 4: Manually walk through the full flow in a browser at the Vite dev URL**

1. Load `/`, click into an existing trip (or create a new one via `+ Buat Trip Baru` if none exists — reuse the Tahap 1 flow), pick an identity at Pilih Identitas.
2. Land on Ringkasan — confirm the **empty state** renders ("Belum ada pengeluaran" + "+ Tambah pengeluaran pertama").
3. Click "+ Tambah pengeluaran pertama" — confirm the sheet slides up with Keterangan/Kategori/Nominal/Dibayar oleh/Dibagi ke, all members checked by default, submit disabled until a category is picked.
4. Fill in a keterangan, pick "Makan", enter a nominal (e.g. 90000), leave all members checked, submit.
5. Confirm the sheet closes and Ringkasan now shows the accent balance card ("Saldo kamu (...)") and the "Saldo semua anggota" list with correct Dilunasin/Ngutang/Lunas statuses and signed Rupiah amounts.
6. Click "Lihat semua tagihan per sub trip →" — confirm Riwayat shows the new sub trip row with the right category/payer/date/unsettled-count text and amount.
7. Tap the row — confirm Sub trip detail shows the accent "Total dibayar {payer}" card, the dashed "foto struk" placeholder, and one debt row per non-payer participant with "Belum transfer" status.
8. Click "Tandai lunas" on a debt row — confirm it flips to "Lunas" (green) with a "Batalkan" button, without a full page reload.
9. Navigate back to Ringkasan (via the FAB's sibling Ringkasan tab or the back link chain) — confirm the rollup numbers updated to reflect the now-settled debt.
10. Back on Sub trip detail (same identity that created it): confirm Edit/Hapus buttons are visible. Click Edit, change the nominal, submit — confirm the amount updates and the debt you settled in step 8 **stays settled** (this is the reconcile-preserves-settled-status rule from spec §3 — verify it live, not just via the automated test).
11. Open Pilih Identitas via the "Trip lain" → trip card path again and select a **different** member — confirm Edit/Hapus are now hidden on that same sub trip (soft-auth working as designed).
12. Switch back to the original identity, open the sub trip, click Hapus — confirm the two-step confirm ("Yakin mau hapus sub trip ini?" / "Ya, hapus" / "Batal"), then confirm deletion navigates back to Riwayat and the sub trip is gone; confirm Ringkasan returns to the empty state if it was the only sub trip.
13. Confirm the FAB opens the **create** sheet correctly from all three screens it appears on (Ringkasan, Riwayat, Sub trip detail) — not just the empty-state button.

- [ ] **Step 5: Fix any discrepancy found during the walkthrough**

If a visual or behavioral mismatch against the design spec turns up, fix it in the relevant task's files and re-run that task's test file before continuing.

- [ ] **Step 6: Final commit**

```bash
git add -A
git status
```
Expected: nothing to commit (everything already committed per-task) — if the walkthrough produced fixes, commit them now:
```bash
git commit -m "Fix visual/behavioral discrepancies found during Tahap 2 (part 1) walkthrough"
```

---

## Self-Review Notes

- **Spec coverage:** design spec §3 (debt formation rules: `Math.ceil` share, no self-debt for payer, settled-status-preserved-on-edit, delete-on-participant-removed) covered by Task 2 (pure logic, unit tested) and Task 7 (integration, `reconcileDebts` wired into the PATCH handler, tested live in `subtrips-edit-delete.test.ts`). §4 rollup formula covered exactly by Task 4, tested with real DB fixtures including the settled-exclusion case. §5 API contract matches the spec's endpoint table field-for-field. §6 route table (Ringkasan/Riwayat/Sub trip detail, no dedicated sheet route) fully built across Tasks 11–13. §2 soft-auth model (creator via JWT, adder via `X-Member-Id`) implemented in Task 3 (`attachUserIfPresent`) + Task 7 (`canModifySubTrip`), tested for both paths and the rejection path. §8 exclusions (per-item/pajak/tagihkan-ke, foto/OCR, Saldo&deposit) have no tasks here — confirmed out of scope.
- **Placeholder scan:** no TBD/TODO; the one deliberate scope-narrowing (Edit/Hapus visibility not checking "or trip creator" client-side) is explicitly documented in Task 13, not silently dropped.
- **Type consistency:** `SubTripCategory`/`MemberSummary`/`TripSummaryDetail`/`SubTripListItem`/`DebtItem`/`SubTripDetail`/`SubTripInput` (Task 9) match the JSON shapes returned by `server/src/routes/trips.ts` (summary) and `subtrips.ts` (list/detail) field-for-field, including the `status` string union (`'dilunasin'|'ngutang'|'lunas'`) matching exactly between server (Task 4) and client (Task 11's status-label/color branching). `computeEqualShares`/`reconcileDebts` (Task 2) signatures match their only call sites (Task 5's create route, Task 7's edit route) exactly. `AddEditSubTripSheetProps` (Task 10) match every call site (Tasks 11, 12, 13) — `mode`/`initialData` combinations are consistent (`create` never passes `initialData`, `edit` always does).
