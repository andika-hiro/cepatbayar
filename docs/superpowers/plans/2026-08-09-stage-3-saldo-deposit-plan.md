# Tahap 3: Saldo & Deposit, Kelola Anggota & Rekening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the complete Saldo & Deposit dashboard, settled debts history, member-to-member deposit running credit auto-apply logic, and member/bank account management screens.

**Architecture:** Extend Drizzle ORM schema with `member_accounts` and `deposits` tables. Implement dynamic (on-the-fly) deposit auto-apply calculation logic in Express server endpoints so no static deposit notes exist in DB. Add React screens for Saldo, Riwayat Pelunasan, Kelola Anggota, and Rekening Detail.

**Tech Stack:** React 18, Vite, TypeScript, Express, Drizzle ORM, MySQL, Vitest, React Testing Library.

## Global Constraints

- **No Debt Netting:** Debt rows in `debts` table are never merged or simplified across sub-trips or payers.
- **Rollup Informational Only:** Member rollup balance is strictly informational.
- **Dynamic Deposit Auto-Apply:** Deposit calculations are performed on GET requests and not saved as static text in DB.
- **No internal `trips.id` in API:** Only `publicId` and child-resource IDs are exposed and validated in APIs.

---

### Task 1: Database Schema Extension (`member_accounts` & `deposits`)

**Files:**
- Modify: `server/src/db/schema.ts`
- Test: `server/tests/db.test.ts`

**Interfaces:**
- Consumes: existing Drizzle schema tables (`trips`, `tripMembers`)
- Produces: `memberAccounts` and `deposits` Drizzle table definitions exported from `server/src/db/schema.ts`

- [ ] **Step 1: Write failing schema test**

```typescript
// server/tests/db.test.ts
import { describe, it, expect } from 'vitest';
import { memberAccounts, deposits } from '../src/db/schema';

describe('Database Schema Stage 3', () => {
  it('defines memberAccounts and deposits tables', () => {
    expect(memberAccounts).toBeDefined();
    expect(deposits).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run server/tests/db.test.ts`
Expected: FAIL with "memberAccounts is not exported"

- [ ] **Step 3: Add schema definitions**

```typescript
// server/src/db/schema.ts
import { mysqlTable, int, varchar, timestamp, boolean, foreignKey } from 'drizzle-orm/mysql-core';
// Existing imports...

export const memberAccounts = mysqlTable('member_accounts', {
  id: int('id').autoincrement().primaryKey(),
  memberId: int('member_id').notNull().references(() => tripMembers.id),
  label: varchar('label', { length: 255 }).notNull(),
  accountNumber: varchar('account_number', { length: 255 }).notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const deposits = mysqlTable('deposits', {
  id: int('id').autoincrement().primaryKey(),
  tripId: int('trip_id').notNull().references(() => trips.id),
  fromMemberId: int('from_member_id').notNull().references(() => tripMembers.id),
  toMemberId: int('to_member_id').notNull().references(() => tripMembers.id),
  amount: int('amount').notNull(),
  proofNote: varchar('proof_note', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run server/tests/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/db/schema.ts server/tests/db.test.ts
git commit -m "feat(db): add memberAccounts and deposits tables to schema"
```

---

### Task 2: Dynamic Deposit Calculation Logic & Unit Tests

**Files:**
- Create: `server/src/lib/depositLogic.ts`
- Test: `server/tests/lib/depositLogic.test.ts`

**Interfaces:**
- Consumes: Raw debt objects, deposit records
- Produces: `computeDynamicDeposits(debts, deposits)` function returning debts annotated with dynamic `depositNote` and deposit pair summaries with `remainingBalance` & `low`.

- [ ] **Step 1: Write failing test for dynamic deposit calculation**

```typescript
// server/tests/lib/depositLogic.test.ts
import { describe, it, expect } from 'vitest';
import { computeDynamicDeposits } from '../../src/lib/depositLogic';

describe('computeDynamicDeposits', () => {
  it('auto-applies deposit in chronological debt order and generates depositNote', () => {
    const rawDebts = [
      { id: 1, subTripId: 10, subTripName: 'Makan 1', debtorId: 2, debtorName: 'Budi', creditorId: 1, creditorName: 'Adit', amount: 15000, date: '2026-08-01' },
      { id: 2, subTripId: 11, subTripName: 'Makan 2', debtorId: 2, debtorName: 'Budi', creditorId: 1, creditorName: 'Adit', amount: 20000, date: '2026-08-02' },
    ];
    const rawDeposits = [
      { id: 100, fromMemberId: 2, fromName: 'Budi', toMemberId: 1, toName: 'Adit', amount: 20000 },
    ];

    const result = computeDynamicDeposits(rawDebts, rawDeposits);

    // First debt (15k) consumed 15k from 20k deposit, remaining 5k
    expect(result.annotatedDebts[0].depositNote).toBe('Rp15.000 dipotong dari deposit Budi → Adit (sisa Rp5.000)');
    // Second debt (20k) consumed remaining 5k deposit, remaining 0
    expect(result.annotatedDebts[1].depositNote).toBe('Rp5.000 dipotong dari deposit Budi → Adit (sisa Rp0)');
    
    // Deposit summary for Budi -> Adit has remaining balance 0 and low indicator true
    expect(result.depositSummaries[0].remainingBalance).toBe(0);
    expect(result.depositSummaries[0].low).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run server/tests/lib/depositLogic.test.ts`
Expected: FAIL ("computeDynamicDeposits not found")

- [ ] **Step 3: Implement `depositLogic.ts`**

```typescript
// server/src/lib/depositLogic.ts
export interface RawDebt {
  id: number;
  subTripId: number;
  subTripName: string;
  debtorId: number;
  debtorName: string;
  creditorId: number;
  creditorName: string;
  amount: number;
  date: string;
  settled?: boolean;
}

export interface RawDeposit {
  id: number;
  fromMemberId: number;
  fromName: string;
  toMemberId: number;
  toName: string;
  amount: number;
}

export interface AnnotatedDebt extends RawDebt {
  depositNote?: string;
}

export interface DepositSummary {
  fromMemberId: number;
  fromName: string;
  toMemberId: number;
  toName: string;
  totalAmount: number;
  remainingBalance: number;
  low: boolean;
}

function formatRp(val: number): string {
  return new Intl.NumberFormat('id-ID').format(val);
}

export function computeDynamicDeposits(
  unsettledDebts: RawDebt[],
  depositsList: RawDeposit[]
): { annotatedDebts: AnnotatedDebt[]; depositSummaries: DepositSummary[] } {
  // Aggregate total deposits per pair (fromMemberId -> toMemberId)
  const poolMap = new Map<string, { total: number; remaining: number; fromName: string; toName: string; fromId: number; toId: number }>();

  for (const dep of depositsList) {
    const key = `${dep.fromMemberId}->${dep.toMemberId}`;
    const existing = poolMap.get(key) || { total: 0, remaining: 0, fromName: dep.fromName, toName: dep.toName, fromId: dep.fromMemberId, toId: dep.toMemberId };
    existing.total += dep.amount;
    existing.remaining += dep.amount;
    poolMap.set(key, existing);
  }

  // Sort debts chronologically (date, subTripId, debt id)
  const sortedDebts = [...unsettledDebts].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.subTripId !== b.subTripId) return a.subTripId - b.subTripId;
    return a.id - b.id;
  });

  const annotatedDebts: AnnotatedDebt[] = sortedDebts.map((debt) => {
    const key = `${debt.debtorId}->${debt.creditorId}`;
    const pool = poolMap.get(key);

    if (!pool || pool.remaining <= 0) {
      return { ...debt };
    }

    const applied = Math.min(debt.amount, pool.remaining);
    pool.remaining -= applied;

    const depositNote = `Rp${formatRp(applied)} dipotong dari deposit ${debt.debtorName} → ${debt.creditorName} (sisa Rp${formatRp(pool.remaining)})`;

    return {
      ...debt,
      depositNote,
    };
  });

  const depositSummaries: DepositSummary[] = Array.from(poolMap.values()).map((p) => ({
    fromMemberId: p.fromId,
    fromName: p.fromName,
    toMemberId: p.toId,
    toName: p.toName,
    totalAmount: p.total,
    remainingBalance: p.remaining,
    low: p.remaining <= 0 || p.remaining < 0.2 * p.total,
  }));

  return { annotatedDebts, depositSummaries };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run server/tests/lib/depositLogic.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/depositLogic.ts server/tests/lib/depositLogic.test.ts
git commit -m "feat(logic): implement dynamic deposit auto-apply calculation"
```

---

### Task 3: Backend API Routes for Saldo & Deposits (`/api/trips/:publicId/saldo`, `/api/trips/:publicId/deposits`, `/api/trips/:publicId/settled-debts`)

**Files:**
- Create: `server/src/routes/saldo.ts`
- Modify: `server/src/index.ts`
- Test: `server/tests/saldo.test.ts`

**Interfaces:**
- Consumes: Drizzle schema, `computeDynamicDeposits`
- Produces: API endpoints `GET /api/trips/:publicId/saldo`, `GET /api/trips/:publicId/settled-debts`, `POST /api/trips/:publicId/deposits`

- [ ] **Step 1: Write failing API integration test**

```typescript
// server/tests/saldo.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/index';

describe('Saldo & Deposits API', () => {
  it('GET /api/trips/:publicId/saldo returns rollup, debts, deposits, and accounts', async () => {
    // Uses seed trip publicId from test setup
    const res = await request(app).get('/api/trips/test-public-id/saldo');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rollupMembers');
    expect(res.body).toHaveProperty('unsettledDebts');
    expect(res.body).toHaveProperty('deposits');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run server/tests/saldo.test.ts`
Expected: FAIL (404 Not Found)

- [ ] **Step 3: Implement `server/src/routes/saldo.ts` and mount in `index.ts`**

```typescript
// server/src/routes/saldo.ts
import { Router } from 'express';
import { db } from '../db';
import { trips, tripMembers, subTrips, debts, deposits, memberAccounts } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
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

  // Fetch all accounts
  const allAccounts = await db.select().from(memberAccounts);
  const accountsByMember = new Map<number, typeof allAccounts>();
  for (const acc of allAccounts) {
    const list = accountsByMember.get(acc.memberId) || [];
    list.push(acc);
    accountsByMember.set(acc.memberId, list);
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

  const rollupMap = new Map<number, { received: number; owed: number }>();
  for (const m of members) rollupMap.set(m.id, { received: 0, owed: 0 });

  for (const d of allDebts) {
    if (!d.settled) {
      const p = rollupMap.get(d.payerMemberId);
      if (p) p.received += d.amount;
      const o = rollupMap.get(d.memberId);
      if (o) o.owed += d.amount;
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

  // Fetch unsettled debts for dynamic deposit calculation
  const unsettledRaw = allDebts
    .filter(d => !d.settled)
    .map(d => ({
      id: d.id,
      subTripId: d.subTripId,
      subTripName: d.subTripName,
      debtorId: d.memberId,
      debtorName: memberMap.get(d.memberId)?.name || 'Unknown',
      creditorId: d.payerMemberId,
      creditorName: memberMap.get(d.payerMemberId)?.name || 'Unknown',
      amount: d.amount,
      date: d.date,
    }));

  const depositRows = await db
    .select()
    .from(deposits)
    .where(eq(deposits.tripId, trip.id));

  const formattedDeposits = depositRows.map(dp => ({
    id: dp.id,
    fromMemberId: dp.fromMemberId,
    fromName: memberMap.get(dp.fromMemberId)?.name || 'Unknown',
    toMemberId: dp.toMemberId,
    toName: memberMap.get(dp.toMemberId)?.name || 'Unknown',
    amount: dp.amount,
  }));

  const dynamicResult = computeDynamicDeposits(unsettledRaw, formattedDeposits);

  const unsettledDebtsWithAccounts = dynamicResult.annotatedDebts.map(d => ({
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
    .where(and(eq(subTrips.tripId, trip.id), eq(debts.settled, true)));

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

  const inserted = await db.insert(deposits).values({
    tripId: trip.id,
    fromMemberId,
    toMemberId,
    amount,
    proofNote: proofNote || null,
  });

  res.status(201).json({ success: true, id: inserted[0].insertId });
});

export default router;
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run server/tests/saldo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/saldo.ts server/src/index.ts server/tests/saldo.test.ts
git commit -m "feat(api): add Saldo, Settled Debts, and Deposits routes"
```

---

### Task 4: Backend API Routes for Member & Account Management (`/api/trips/:publicId/members*`)

**Files:**
- Create: `server/src/routes/members.ts`
- Modify: `server/src/index.ts`
- Test: `server/tests/members.test.ts`

**Interfaces:**
- Consumes: Drizzle `tripMembers`, `memberAccounts`
- Produces: API endpoints to add trip member, list/add/update/delete member accounts.

- [ ] **Step 1: Write failing API test**

```typescript
// server/tests/members.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/index';

describe('Member & Accounts API', () => {
  it('POST /api/trips/:publicId/members adds a member to trip', async () => {
    const res = await request(app)
      .post('/api/trips/test-public-id/members')
      .send({ name: 'Charlie' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run server/tests/members.test.ts`
Expected: FAIL (404 Not Found)

- [ ] **Step 3: Implement `server/src/routes/members.ts`**

```typescript
// server/src/routes/members.ts
import { Router } from 'express';
import { db } from '../db';
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
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run server/tests/members.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/members.ts server/src/index.ts server/tests/members.test.ts
git commit -m "feat(api): add member addition and account management routes"
```

---

### Task 5: Frontend API Client & State Methods

**Files:**
- Modify: `client/src/lib/api.ts`
- Test: `client/tests/api.test.ts`

**Interfaces:**
- Consumes: Server API endpoints
- Produces: Client functions `getSaldoData()`, `getSettledDebts()`, `createDeposit()`, `addTripMember()`, `getMemberAccounts()`, `addMemberAccount()`, `setDefaultAccount()`, `deleteMemberAccount()`.

- [ ] **Step 1: Write test for new API client methods**

```typescript
// client/tests/api.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getSaldoData, createDeposit } from '../src/lib/api';

describe('API Client Stage 3', () => {
  it('exports getSaldoData and createDeposit functions', () => {
    expect(typeof getSaldoData).toBe('function');
    expect(typeof createDeposit).toBe('function');
  });
});
```

- [ ] **Step 2: Implement API client methods in `client/src/lib/api.ts`**

Add types and fetch wrappers to `client/src/lib/api.ts` for all Stage 3 endpoints.

- [ ] **Step 3: Run test to verify pass**

Run: `npx vitest run client/tests/api.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/api.ts client/tests/api.test.ts
git commit -m "feat(client): add API client methods for Stage 3"
```

---

### Task 6: Frontend Saldo & Deposit Screen & Settled History Screen

**Files:**
- Create: `client/src/screens/SaldoScreen.tsx`
- Create: `client/src/screens/RiwayatPelunasanScreen.tsx`
- Modify: `client/src/App.tsx`
- Test: `client/tests/SaldoScreen.test.tsx`

**Interfaces:**
- Consumes: `getSaldoData()`, `getSettledDebts()`, `toggleDebtSettled()`
- Produces: `/t/:publicId/saldo` & `/t/:publicId/riwayat-pelunasan` React screens matching `handoff.md` pixel fidelity.

- [ ] **Step 1: Write test for SaldoScreen rendering and interaction**

```tsx
// client/tests/SaldoScreen.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SaldoScreen from '../src/screens/SaldoScreen';
import * as api from '../src/lib/api';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../src/lib/api');

describe('SaldoScreen', () => {
  it('renders all debts and deposit summaries', async () => {
    vi.mocked(api.getSaldoData).mockResolvedValue({
      rollupMembers: [{ memberId: 1, name: 'Adit', rollup: 10000, status: 'pos' }],
      unsettledDebts: [
        { id: 1, subTripId: 1, subTripName: 'Makan A', date: '2026-08-08', debtorMemberId: 2, debtorName: 'Budi', creditorMemberId: 1, creditorName: 'Adit', amount: 15000, accounts: [{ id: 1, label: 'BCA', accountNumber: '123', isDefault: true }] }
      ],
      deposits: [{ fromMemberId: 2, fromName: 'Budi', toMemberId: 1, toName: 'Adit', totalAmount: 10000, remainingBalance: 0, low: true }]
    });

    render(
      <MemoryRouter initialEntries={['/t/test-trip/saldo']}>
        <Routes>
          <Route path="/t/:publicId/saldo" element={<SaldoScreen />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Semua tagihan (per sub trip)')).toBeInTheDocument();
      expect(screen.getByText('Makan A')).toBeInTheDocument();
      expect(screen.getByText('Saldo deposit menipis — kirim reminder?')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Implement `SaldoScreen.tsx` & `RiwayatPelunasanScreen.tsx`**

Build React components following `handoff.md` design tokens (OKLCH, typography, badges, debt cards, deposit warning badges, account selector dropdown).

- [ ] **Step 3: Run test to verify pass**

Run: `npx vitest run client/tests/SaldoScreen.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/screens/SaldoScreen.tsx client/src/screens/RiwayatPelunasanScreen.tsx client/src/App.tsx client/tests/SaldoScreen.test.tsx
git commit -m "feat(ui): implement Saldo & Deposit and Settled History screens"
```

---

### Task 7: Frontend Deposit Form Sheet (`AddDepositSheet.tsx`)

**Files:**
- Create: `client/src/components/AddDepositSheet.tsx`
- Test: `client/tests/AddDepositSheet.test.tsx`

**Interfaces:**
- Consumes: Member list, `createDeposit()`
- Produces: Slide-up sheet component to record a new deposit.

- [ ] **Step 1: Write test for AddDepositSheet**

```tsx
// client/tests/AddDepositSheet.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import AddDepositSheet from '../src/components/AddDepositSheet';
import { vi, describe, it, expect } from 'vitest';

describe('AddDepositSheet', () => {
  it('submits deposit when form is filled', () => {
    const onSave = vi.fn();
    render(<AddDepositSheet isOpen={true} members={[{ id: 1, name: 'Adit' }, { id: 2, name: 'Budi' }]} currentMemberId={1} onClose={() => {}} onSave={onSave} />);
    
    fireEvent.change(screen.getByLabelText(/Jumlah/i), { target: { value: '50000' } });
    fireEvent.click(screen.getByText('Simpan deposit'));
    
    expect(onSave).toHaveBeenCalledWith({ fromMemberId: 1, toMemberId: 2, amount: 50000, proofNote: '' });
  });
});
```

- [ ] **Step 2: Implement `AddDepositSheet.tsx`**

Build bottom sheet component with member selector, amount input, proof note input, slide animation, overlay.

- [ ] **Step 3: Run test to verify pass**

Run: `npx vitest run client/tests/AddDepositSheet.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/components/AddDepositSheet.tsx client/tests/AddDepositSheet.test.tsx
git commit -m "feat(ui): add AddDepositSheet component"
```

---

### Task 8: Frontend Member & Accounts Management (`KelolaAnggotaScreen` & `RekeningDetailScreen`)

**Files:**
- Create: `client/src/screens/KelolaAnggotaScreen.tsx`
- Create: `client/src/screens/RekeningDetailScreen.tsx`
- Modify: `client/src/screens/PengaturanScreen.tsx`, `client/src/App.tsx`
- Test: `client/tests/MemberAccounts.test.tsx`

**Interfaces:**
- Consumes: `addTripMember()`, `getMemberAccounts()`, `addMemberAccount()`, `setDefaultAccount()`, `deleteMemberAccount()`
- Produces: Screens to manage members and member bank/e-wallet accounts.

- [ ] **Step 1: Write test for Member & Account management**

```tsx
// client/tests/MemberAccounts.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import KelolaAnggotaScreen from '../src/screens/KelolaAnggotaScreen';
import { vi, describe, it, expect } from 'vitest';

describe('KelolaAnggotaScreen', () => {
  it('renders member list with account count badges', async () => {
    render(
      <MemoryRouter initialEntries={['/t/test-trip/pengaturan/anggota']}>
        <Routes>
          <Route path="/t/:publicId/pengaturan/anggota" element={<KelolaAnggotaScreen />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Kelola anggota')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement `KelolaAnggotaScreen.tsx` & `RekeningDetailScreen.tsx`**

Build Member management and Account detail screens with "+ Tambah Anggota" modal and "+ Tambah Rekening" sheet.

- [ ] **Step 3: Run test to verify pass**

Run: `npx vitest run client/tests/MemberAccounts.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/screens/KelolaAnggotaScreen.tsx client/src/screens/RekeningDetailScreen.tsx client/src/screens/PengaturanScreen.tsx client/src/App.tsx client/tests/MemberAccounts.test.tsx
git commit -m "feat(ui): implement Kelola Anggota and Rekening Detail screens"
```

---

### Task 9: Full Integration Verification

- [ ] **Step 1: Run full server test suite**

Run: `npm run test:server`
Expected: All tests pass.

- [ ] **Step 2: Run full client test suite**

Run: `npm run test:client`
Expected: All tests pass.

- [ ] **Step 3: Run full build check**

Run: `npm run build`
Expected: Production build succeeds with 0 errors.

- [ ] **Step 4: Final commit & ready for merge check**

```bash
git status
```
