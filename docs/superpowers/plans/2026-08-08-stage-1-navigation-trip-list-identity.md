# Tahap 1: Navigasi, Daftar Trip, Buat Trip Baru, Pilih Identitas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working, deployable-shaped slice of Cepatkan Bayar covering app navigation shell, Daftar Trip, Buat Trip Baru (with creator email-magic-link auth), and Pilih Identitas — high-fidelity to `context/Cepat Bayarkan.dc.html` (with "Cepat Bayarkan" recreated as "Cepatkan Bayar"), backed by a real Express + MySQL backend.

**Architecture:** Monorepo with `server/` (Express + TypeScript + Drizzle ORM + MySQL, serves REST API under `/api/*` and the built React app as static files) and `client/` (React + TypeScript + Vite + Tailwind + React Router). Creator auth is a stateless JWT in an httpOnly cookie, issued after an email magic-link is verified. Member "identity" has no server-side auth — it's a `localStorage` selection per device. Full design and rationale: `docs/superpowers/specs/2026-08-08-cepatkan-bayar-architecture-and-stage-1-design.md`.

**Tech Stack:** Node.js 20, Express, TypeScript, Drizzle ORM, MySQL/MariaDB, mysql2, zod, jsonwebtoken, nodemailer, nanoid — React 18, Vite, Tailwind CSS, react-router-dom — Vitest + Supertest (server), Vitest + Testing Library (client).

## Global Constraints

- All product-facing text is Bahasa Indonesia, copied verbatim from `context/Cepat Bayarkan.dc.html` / `context/handoff.md`, except every occurrence of "Cepat Bayarkan" which becomes "Cepatkan Bayar".
- Design tokens (colors as OKLCH, fonts Manrope/Inter/IBM Plex Mono, radii, spacing) come from `context/handoff.md` § Design Tokens — see Task 2 for exact values.
- No debt/deposit/sub-trip features in this plan — those are Tahap 2/3. `unsettledCount` is always `0` for now.
- No PWA manifest/service worker yet — Tahap 4.
- Every backend route file and frontend screen file must have a corresponding test file; no task is complete until its tests pass.
- Trip access is keyed by an unguessable `publicId` (nanoid, 16 chars) — never expose the internal auto-increment `id` in any API response.
- Member "identity" and "joined trip ids" live only in `localStorage`, never sent to the server as auth.

---

## File Structure

```
cepatkan-bayar/
  package.json                  # root convenience scripts only
  .gitignore
  server/
    package.json
    tsconfig.json
    drizzle.config.ts
    .env.example
    src/
      app.ts                    # createApp(): configured Express app (no listen)
      index.ts                  # entrypoint: createApp().listen(PORT)
      mail.ts                   # sendMagicLinkEmail()
      db/
        client.ts               # drizzle db instance
        schema.ts                # users, authTokens, trips, tripMembers
      auth/
        session.ts              # signSession/verifySession, cookie name/maxAge
        requireAuth.ts           # Express middleware
      routes/
        auth.ts                  # /api/auth/*
        trips.ts                 # /api/trips/*
    tests/
      setup.ts                  # loads .env.test, truncates tables before each test
      helpers/auth.ts           # createAuthedUser() test helper
      health.test.ts
      auth.test.ts
      trips.test.ts
      db.test.ts
  client/
    package.json
    tsconfig.json
    vite.config.ts
    tailwind.config.ts
    postcss.config.js
    index.html
    src/
      main.tsx
      App.tsx
      index.css
      lib/
        api.ts                  # typed fetch wrapper
        localTrips.ts           # localStorage helpers
      components/
        BottomNavAppLevel.tsx
        BottomNavTripLevel.tsx
        MemberAvatar.tsx
        TripCard.tsx
      screens/
        TripListScreen.tsx
        NewTripScreen.tsx
        IdentityPickerScreen.tsx
        RingkasanPlaceholderScreen.tsx
        ProfilePlaceholderScreen.tsx
    tests/
      setup.ts                  # imports @testing-library/jest-dom/vitest
      testUtils.tsx             # withRouter() helper
      localTrips.test.ts
      TripListScreen.test.tsx
      NewTripScreen.test.tsx
      IdentityPickerScreen.test.tsx
      Navigation.test.tsx
```

---

### Task 1: Monorepo scaffolding — server & client skeletons

**Files:**
- Create: `package.json` (root)
- Create: `.gitignore`
- Create: `server/package.json`, `server/tsconfig.json`, `server/.env.example`, `server/src/app.ts`, `server/src/index.ts`, `server/tests/health.test.ts`
- Create: `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`, `client/src/main.tsx`, `client/src/App.tsx`, `client/tests/setup.ts`, `client/vitest.config.ts`

**Interfaces:**
- Produces: `createApp(): express.Express` from `server/src/app.ts`, used by every later server test and by `server/src/index.ts`.

- [ ] **Step 1: Create root files**

`package.json`:
```json
{
  "name": "cepatkan-bayar",
  "private": true,
  "scripts": {
    "install:all": "npm install --prefix server && npm install --prefix client",
    "dev:server": "npm run dev --prefix server",
    "dev:client": "npm run dev --prefix client",
    "test:server": "npm test --prefix server",
    "test:client": "npm test --prefix client",
    "test": "npm run test:server && npm run test:client"
  }
}
```

`.gitignore`:
```
node_modules/
dist/
.env
.env.test
*.log
```

- [ ] **Step 2: Scaffold the server package**

`server/package.json`:
```json
{
  "name": "cepatkan-bayar-server",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "db:push": "drizzle-kit push"
  },
  "dependencies": {
    "cookie-parser": "^1.4.6",
    "dotenv": "^16.4.5",
    "drizzle-orm": "^0.33.0",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "mysql2": "^3.11.0",
    "nanoid": "^5.0.7",
    "nodemailer": "^6.9.14",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/cookie-parser": "^1.4.7",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.14.15",
    "@types/nodemailer": "^6.4.15",
    "@types/supertest": "^6.0.2",
    "drizzle-kit": "^0.24.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

`server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

`server/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
  },
});
```

`server/.env.example`:
```
PORT=4000
APP_URL=http://localhost:4000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=cepatkan_bayar
JWT_SECRET=change-me-to-a-long-random-string
# Optional — without these, magic links are logged to the console instead of emailed
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

`server/src/app.ts`:
```ts
import express from 'express';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
```

`server/src/index.ts`:
```ts
import 'dotenv/config';
import { createApp } from './app';

const app = createApp();
const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
```

- [ ] **Step 3: Write the failing health check test**

`server/tests/health.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

`server/tests/setup.ts` (placeholder for now, extended in Task 3):
```ts
// Extended in Task 3 to load .env.test and reset DB tables between tests.
```

- [ ] **Step 4: Install deps and run the test**

Run:
```bash
cd server && npm install
npx vitest run
```
Expected: PASS (this test has no DB dependency yet).

- [ ] **Step 5: Scaffold the client package**

`client/package.json`:
```json
{
  "name": "cepatkan-bayar-client",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "typecheck": "tsc -b --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.45",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.4",
    "vite": "^5.4.2",
    "vitest": "^2.0.5"
  }
}
```

`client/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src", "tests"]
}
```

`client/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
```

`client/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
```

`client/index.html`:
```html
<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />
    <title>Cepatkan Bayar</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`client/src/App.tsx` (temporary placeholder, replaced route-by-route in Tasks 7–10):
```tsx
export default function App() {
  return <div>Cepatkan Bayar</div>;
}
```

`client/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

`client/src/index.css` (minimal for now, replaced with full tokens in Task 2):
```css
body {
  margin: 0;
}
```

`client/tests/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: Write the failing smoke test**

`client/tests/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../src/App';

describe('App', () => {
  it('renders without crashing', () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    expect(screen.getByText('Cepatkan Bayar')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Install deps and run the test**

Run:
```bash
cd client && npm install
npx vitest run
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json .gitignore server client
git commit -m "Scaffold server and client monorepo skeletons"
```

---

### Task 2: Design tokens & Tailwind setup (client)

**Files:**
- Modify: `client/src/index.css`
- Create: `client/tailwind.config.ts`, `client/postcss.config.js`

**Interfaces:**
- Produces: Tailwind color utilities `bg-bg`, `bg-surface`, `bg-surfaceAlt`, `text-text`, `text-sub`, `border-border`, `bg-accent`/`text-accent`, `text-pos`, `text-neg`, `text-onAccent`/`bg-onAccent`, `bg-transferBg`, and font utilities `font-manrope`, `font-inter`, `font-mono`, and radius utilities `rounded-card` (16px), `rounded-input` (12px), `rounded-pill` (20px) — consumed by every screen/component task from Task 7 onward.

- [ ] **Step 1: Write the failing test — a component using a design-token class renders with the expected class name**

`client/tests/tokens.test.tsx`:
```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('design tokens', () => {
  it('applies the accent background utility class', () => {
    const { container } = render(<div className="bg-accent" data-testid="token-box" />);
    expect(container.firstChild).toHaveClass('bg-accent');
  });
});
```

Run: `cd client && npx vitest run tests/tokens.test.tsx`
Expected: PASS even before Tailwind config exists (class presence, not computed style, is what jsdom can check) — this test mainly guards against typos breaking the className in later refactors. The real validation of Tailwind actually generating the CSS happens via the production build in Step 4.

- [ ] **Step 2: Add Tailwind config**

`client/postcss.config.js`:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

`client/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        surfaceAlt: 'var(--color-surface-alt)',
        text: 'var(--color-text)',
        sub: 'var(--color-sub)',
        border: 'var(--color-border)',
        accent: 'var(--color-accent)',
        pos: 'var(--color-pos)',
        neg: 'var(--color-neg)',
        onAccent: 'var(--color-on-accent)',
        onAccentSoft: 'var(--color-on-accent-soft)',
        transferBg: 'var(--color-transfer-bg)',
      },
      fontFamily: {
        manrope: ['Manrope', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      borderRadius: {
        card: '16px',
        input: '12px',
        pill: '20px',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 3: Replace `client/src/index.css` with the full token set**

Values copied verbatim from `context/handoff.md` § Design Tokens.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-bg: oklch(96% 0.005 240);
  --color-surface: oklch(99% 0.003 240);
  --color-surface-alt: oklch(93% 0.006 240);
  --color-text: oklch(22% 0.02 240);
  --color-sub: oklch(48% 0.015 240);
  --color-border: oklch(89% 0.008 240);
  --color-accent: oklch(38% 0.06 200);
  --color-pos: oklch(48% 0.1 165);
  --color-neg: oklch(55% 0.17 25);
  --color-on-accent: oklch(99% 0 0);
  --color-transfer-bg: color-mix(in oklch, var(--color-accent) 16%, var(--color-surface));
  --color-on-accent-soft: color-mix(in oklch, var(--color-on-accent) 70%, var(--color-accent));
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: oklch(15% 0.012 240);
    --color-surface: oklch(20% 0.015 240);
    --color-surface-alt: oklch(25% 0.016 240);
    --color-text: oklch(94% 0.006 240);
    --color-sub: oklch(66% 0.012 240);
    --color-border: oklch(29% 0.015 240);
    --color-accent: oklch(72% 0.1 195);
    --color-pos: oklch(68% 0.1 165);
    --color-neg: oklch(66% 0.16 25);
    --color-on-accent: var(--color-bg);
  }
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: 'Inter', sans-serif;
}

button:focus-visible,
input:focus-visible,
a:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

input::placeholder {
  opacity: 0.7;
}
```

- [ ] **Step 4: Verify the production build actually generates the token CSS**

Run:
```bash
cd client && npm run build
grep -o "accent" dist/assets/*.css | head -1
```
Expected: `accent` found (confirms Tailwind picked up the `bg-accent`/`text-accent` utilities used by the token test and any future component).

- [ ] **Step 5: Run full client test suite**

Run: `cd client && npx vitest run`
Expected: PASS (App.test.tsx and tokens.test.tsx both green).

- [ ] **Step 6: Commit**

```bash
git add client/tailwind.config.ts client/postcss.config.js client/src/index.css client/tests/tokens.test.tsx
git commit -m "Add Cepatkan Bayar design tokens and Tailwind config"
```

---

### Task 3: Database schema, connection, and migration push

**Files:**
- Create: `server/src/db/schema.ts`, `server/src/db/client.ts`, `server/drizzle.config.ts`
- Modify: `server/tests/setup.ts`
- Test: `server/tests/db.test.ts`

**Interfaces:**
- Produces: `db` (Drizzle instance) from `server/src/db/client.ts`; `users`, `authTokens`, `trips`, `tripMembers` tables from `server/src/db/schema.ts` — consumed by every route in Tasks 4–5 and by test helpers.

- [ ] **Step 1: Create the two local MySQL databases used for dev and tests**

Run:
```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS cepatkan_bayar;"
mysql -u root -e "CREATE DATABASE IF NOT EXISTS cepatkan_bayar_test;"
```

- [ ] **Step 2: Create `server/.env` and `server/.env.test` from the example**

```bash
cd server
cp .env.example .env
cp .env.example .env.test
```
Edit `.env.test`'s `DB_NAME` to `cepatkan_bayar_test`. Leave `JWT_SECRET` as any non-empty string for local dev.

- [ ] **Step 3: Write the schema**

`server/src/db/schema.ts`:
```ts
import { mysqlTable, int, varchar, timestamp, date } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const authTokens = mysqlTable('auth_tokens', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('user_id').notNull().references(() => users.id),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const trips = mysqlTable('trips', {
  id: int('id').autoincrement().primaryKey(),
  publicId: varchar('public_id', { length: 21 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  destination: varchar('destination', { length: 255 }).notNull(),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }).notNull(),
  creatorUserId: int('creator_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export const tripMembers = mysqlTable('trip_members', {
  id: int('id').autoincrement().primaryKey(),
  tripId: int('trip_id').notNull().references(() => trips.id),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

`server/src/db/client.ts`:
```ts
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from './schema';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export const db = drizzle(pool, { schema, mode: 'default' });
```

`server/drizzle.config.ts`:
```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  dialect: 'mysql',
  dbCredentials: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'cepatkan_bayar',
  },
});
```

- [ ] **Step 4: Push the schema to both databases**

```bash
cd server
npx drizzle-kit push                                  # uses .env via dotenv in drizzle.config.ts
DB_NAME=cepatkan_bayar_test npx drizzle-kit push       # test database
```
Expected: both commands report the 4 tables created (accept the prompt to create new tables).

- [ ] **Step 5: Extend the test setup to load `.env.test` and reset tables between tests**

`server/tests/setup.ts`:
```ts
import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

import { beforeEach } from 'vitest';
import { db } from '../src/db/client';
import { authTokens, tripMembers, trips, users } from '../src/db/schema';

beforeEach(async () => {
  await db.delete(tripMembers);
  await db.delete(trips);
  await db.delete(authTokens);
  await db.delete(users);
});
```

- [ ] **Step 6: Write the failing round-trip test**

`server/tests/db.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { users } from '../src/db/schema';

describe('database connection', () => {
  it('inserts and reads back a user', async () => {
    await db.insert(users).values({ email: 'test@example.com' });
    const [user] = await db.select().from(users).where(eq(users.email, 'test@example.com'));
    expect(user).toBeDefined();
    expect(user.email).toBe('test@example.com');
  });
});
```

- [ ] **Step 7: Run the test**

Run: `cd server && npx vitest run tests/db.test.ts`
Expected: PASS. If it fails with a connection error, verify `.env.test` credentials and that both databases from Step 1 exist.

- [ ] **Step 8: Run the full server suite to confirm nothing broke**

Run: `cd server && npx vitest run`
Expected: PASS (health.test.ts and db.test.ts both green).

- [ ] **Step 9: Commit**

```bash
git add server/src/db server/drizzle.config.ts server/tests/setup.ts server/tests/db.test.ts server/.env.example
git commit -m "Add database schema, connection, and migration push"
```

**Note:** `.env` and `.env.test` are gitignored — they contain no secrets worth committing for local dev, but this keeps the pattern consistent with production where real credentials must never be committed (see Tahap 5).

---

### Task 4: Auth backend — email magic link

**Files:**
- Create: `server/src/auth/session.ts`, `server/src/auth/requireAuth.ts`, `server/src/mail.ts`, `server/src/routes/auth.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/auth.test.ts`

**Interfaces:**
- Consumes: `db`, `users`, `authTokens` from Task 3.
- Produces: `signSession({userId: number}): string`, `verifySession(token: string): {userId: number} | null`, `SESSION_COOKIE: string`, `SESSION_MAX_AGE_MS: number` from `server/src/auth/session.ts`; `requireAuth` Express middleware (sets `req.userId: number`) from `server/src/auth/requireAuth.ts`; `sendMagicLinkEmail(to: string, link: string): Promise<void>` from `server/src/mail.ts` — all consumed by Task 5 and later.

- [ ] **Step 1: Write session signing/verification**

`server/src/auth/session.ts`:
```ts
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
export const SESSION_COOKIE = 'cb_session';
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionPayload {
  userId: number;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Write the auth middleware**

`server/src/auth/requireAuth.ts`:
```ts
import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE, verifySession } from './session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = typeof token === 'string' ? verifySession(token) : null;
  if (!session) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  req.userId = session.userId;
  next();
}
```

- [ ] **Step 3: Write the mail sender with a console-log dev fallback**

`server/src/mail.ts`:
```ts
import nodemailer from 'nodemailer';

export async function sendMagicLinkEmail(to: string, link: string): Promise<void> {
  if (!process.env.SMTP_HOST) {
    console.log(`[dev] Magic link for ${to}: ${link}`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject: 'Link masuk Cepatkan Bayar',
    text: `Klik link ini buat masuk: ${link}\n\nLink ini berlaku 15 menit.`,
  });
}
```

- [ ] **Step 4: Write the auth routes**

`server/src/routes/auth.ts`:
```ts
import crypto from 'node:crypto';
import { Router } from 'express';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { authTokens, users } from '../db/schema';
import { sendMagicLinkEmail } from '../mail';
import { requireAuth } from '../auth/requireAuth';
import { SESSION_COOKIE, SESSION_MAX_AGE_MS, signSession } from '../auth/session';

const router = Router();

const requestLinkSchema = z.object({
  email: z.string().email(),
  redirect: z.string().startsWith('/').optional(),
});

router.post('/request-link', async (req, res) => {
  const parsed = requestLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_email' });
    return;
  }
  const { email, redirect } = parsed.data;

  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    await db.insert(users).values({ email });
    [user] = await db.select().from(users).where(eq(users.email, email));
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(authTokens).values({ userId: user.id, tokenHash, expiresAt });

  const appUrl = process.env.APP_URL ?? 'http://localhost:4000';
  const link = `${appUrl}/api/auth/verify?token=${rawToken}&redirect=${encodeURIComponent(redirect ?? '/')}`;
  await sendMagicLinkEmail(email, link);

  res.status(200).json({ ok: true });
});

router.get('/verify', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const redirectParam = typeof req.query.redirect === 'string' ? req.query.redirect : '/';
  const safeRedirect = redirectParam.startsWith('/') && !redirectParam.startsWith('//') ? redirectParam : '/';

  if (!token) {
    res.status(400).send('Link tidak valid.');
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const [row] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, tokenHash), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())));

  if (!row) {
    res.status(400).send('Link sudah dipakai atau kedaluwarsa.');
    return;
  }

  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));

  const sessionToken = signSession({ userId: row.userId });
  res.cookie(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS,
  });

  res.redirect(safeRedirect);
});

router.get('/me', requireAuth, async (req, res) => {
  const [user] = await db.select().from(users).where(eq(users.id, req.userId!));
  if (!user) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  res.json({ id: user.id, email: user.email });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.status(200).json({ ok: true });
});

export default router;
```

- [ ] **Step 5: Wire cookie-parser and the auth router into the app**

Modify `server/src/app.ts`:
```ts
import express from 'express';
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);

  return app;
}
```

- [ ] **Step 6: Write the failing auth tests**

`server/tests/auth.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { db } from '../src/db/client';
import { users } from '../src/db/schema';

vi.mock('../src/mail', () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
}));

import { sendMagicLinkEmail } from '../src/mail';

const app = createApp();

describe('POST /api/auth/request-link', () => {
  it('creates a user and sends a magic link email', async () => {
    const res = await request(app).post('/api/auth/request-link').send({ email: 'budi@example.com' });
    expect(res.status).toBe(200);

    const [user] = await db.select().from(users).where(eq(users.email, 'budi@example.com'));
    expect(user).toBeDefined();

    expect(sendMagicLinkEmail).toHaveBeenCalledTimes(1);
    const [, link] = vi.mocked(sendMagicLinkEmail).mock.calls[0];
    expect(link).toContain('/api/auth/verify?token=');
  });

  it('rejects an invalid email', async () => {
    const res = await request(app).post('/api/auth/request-link').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/verify', () => {
  it('sets a session cookie and redirects for a valid token', async () => {
    await request(app).post('/api/auth/request-link').send({ email: 'anton@example.com' });
    const link = vi.mocked(sendMagicLinkEmail).mock.calls[0][1];
    const token = new URL(link).searchParams.get('token')!;

    const res = await request(app).get(`/api/auth/verify?token=${token}`);
    expect(res.status).toBe(302);
    expect(res.headers['set-cookie']?.[0]).toContain('cb_session=');
  });

  it('rejects an invalid token', async () => {
    const res = await request(app).get('/api/auth/verify?token=not-a-real-token');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the user with a valid session cookie', async () => {
    await request(app).post('/api/auth/request-link').send({ email: 'citra@example.com' });
    const link = vi.mocked(sendMagicLinkEmail).mock.calls.at(-1)![1];
    const token = new URL(link).searchParams.get('token')!;
    const verifyRes = await request(app).get(`/api/auth/verify?token=${token}`);
    const cookie = verifyRes.headers['set-cookie']![0];

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('citra@example.com');
  });
});
```

- [ ] **Step 7: Install new dependencies and run the tests**

Run:
```bash
cd server && npm install
npx vitest run tests/auth.test.ts
```
Expected: PASS.

- [ ] **Step 8: Run the full server suite**

Run: `cd server && npx vitest run`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server/src/auth server/src/mail.ts server/src/routes/auth.ts server/src/app.ts server/tests/auth.test.ts server/package.json server/package-lock.json
git commit -m "Add email magic-link auth for trip creators"
```

---

### Task 5: Trips backend — create, mine, summary, detail

**Files:**
- Create: `server/src/routes/trips.ts`, `server/tests/helpers/auth.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/trips.test.ts`

**Interfaces:**
- Consumes: `db`, `trips`, `tripMembers` from Task 3; `requireAuth`, `signSession`, `SESSION_COOKIE` from Task 4.
- Produces: `POST /api/trips`, `GET /api/trips/mine`, `POST /api/trips/summary`, `GET /api/trips/:publicId` — response shapes consumed by `client/src/lib/api.ts` in Task 6. `createAuthedUser(email: string): Promise<{user, cookie: string}>` test helper — consumed by any future server test needing a logged-in user.

- [ ] **Step 1: Write the trips routes**

`server/src/routes/trips.ts`:
```ts
import { Router } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../db/client';
import { tripMembers, trips } from '../db/schema';
import { requireAuth } from '../auth/requireAuth';

const router = Router();

const createTripSchema = z.object({
  name: z.string().trim().min(1),
  destination: z.string().trim().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  members: z.array(z.string().trim().min(1)).min(1),
});

async function summarizeTrips(tripRows: (typeof trips.$inferSelect)[]) {
  if (tripRows.length === 0) return [];
  const ids = tripRows.map((t) => t.id);
  const members = await db.select().from(tripMembers).where(inArray(tripMembers.tripId, ids));
  const countByTripId = new Map<number, number>();
  for (const m of members) {
    countByTripId.set(m.tripId, (countByTripId.get(m.tripId) ?? 0) + 1);
  }
  return tripRows.map((t) => ({
    publicId: t.publicId,
    name: t.name,
    destination: t.destination,
    startDate: t.startDate,
    endDate: t.endDate,
    memberCount: countByTripId.get(t.id) ?? 0,
    unsettledCount: 0,
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

  await db.insert(trips).values({ publicId, name, destination, startDate, endDate, creatorUserId: req.userId! });
  const [trip] = await db.select().from(trips).where(eq(trips.publicId, publicId));

  await db.insert(tripMembers).values(members.map((memberName) => ({ tripId: trip.id, name: memberName })));

  res.status(201).json({ publicId: trip.publicId });
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
  const [trip] = await db.select().from(trips).where(eq(trips.publicId, req.params.publicId));
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

export default router;
```

- [ ] **Step 2: Wire the trips router into the app**

Modify `server/src/app.ts` (add alongside the existing auth router):
```ts
import tripsRouter from './routes/trips';
// ...
app.use('/api/trips', tripsRouter);
```

- [ ] **Step 3: Write the auth test helper**

`server/tests/helpers/auth.ts`:
```ts
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client';
import { users } from '../../src/db/schema';
import { SESSION_COOKIE, signSession } from '../../src/auth/session';

export async function createAuthedUser(email: string) {
  await db.insert(users).values({ email });
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const token = signSession({ userId: user.id });
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}
```

- [ ] **Step 4: Write the failing trips tests**

`server/tests/trips.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { createAuthedUser } from './helpers/auth';

const app = createApp();

describe('POST /api/trips', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/trips').send({});
    expect(res.status).toBe(401);
  });

  it('creates a trip with members for the authenticated user', async () => {
    const { cookie } = await createAuthedUser('dedi@example.com');
    const res = await request(app)
      .post('/api/trips')
      .set('Cookie', cookie)
      .send({
        name: 'Trip ke Jogja',
        destination: 'Yogyakarta',
        startDate: '2026-09-01',
        endDate: '2026-09-04',
        members: ['Dedi', 'Budi'],
      });
    expect(res.status).toBe(201);
    expect(res.body.publicId).toBeTypeOf('string');
    expect(res.body.publicId.length).toBeGreaterThan(10);
  });

  it('rejects a trip with no members', async () => {
    const { cookie } = await createAuthedUser('eka@example.com');
    const res = await request(app)
      .post('/api/trips')
      .set('Cookie', cookie)
      .send({ name: 'Trip', destination: 'Bandung', startDate: '2026-09-01', endDate: '2026-09-02', members: [] });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/trips/mine', () => {
  it('lists only trips created by the authenticated user', async () => {
    const { cookie: cookieA } = await createAuthedUser('fajar@example.com');
    const { cookie: cookieB } = await createAuthedUser('gita@example.com');
    await request(app).post('/api/trips').set('Cookie', cookieA).send({
      name: 'Trip A', destination: 'Bali', startDate: '2026-09-01', endDate: '2026-09-02', members: ['Fajar'],
    });
    await request(app).post('/api/trips').set('Cookie', cookieB).send({
      name: 'Trip B', destination: 'Lombok', startDate: '2026-09-01', endDate: '2026-09-02', members: ['Gita'],
    });

    const res = await request(app).get('/api/trips/mine').set('Cookie', cookieA);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Trip A');
    expect(res.body[0].memberCount).toBe(1);
    expect(res.body[0].unsettledCount).toBe(0);
  });
});

describe('GET /api/trips/:publicId', () => {
  it('returns trip detail with members for a valid publicId', async () => {
    const { cookie } = await createAuthedUser('hana@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip Hana', destination: 'Malang', startDate: '2026-09-01', endDate: '2026-09-02', members: ['Hana', 'Ivan'],
    });
    const { publicId } = createRes.body;

    const res = await request(app).get(`/api/trips/${publicId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Trip Hana');
    expect(res.body.members).toHaveLength(2);
    expect(res.body.members.map((m: { name: string }) => m.name)).toEqual(['Hana', 'Ivan']);
  });

  it('returns 404 for an unknown publicId', async () => {
    const res = await request(app).get('/api/trips/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/trips/summary', () => {
  it('returns summaries for known ids and silently drops unknown ones', async () => {
    const { cookie } = await createAuthedUser('joko@example.com');
    const createRes = await request(app).post('/api/trips').set('Cookie', cookie).send({
      name: 'Trip Joko', destination: 'Solo', startDate: '2026-09-01', endDate: '2026-09-02', members: ['Joko'],
    });
    const { publicId } = createRes.body;

    const res = await request(app).post('/api/trips/summary').send({ publicIds: [publicId, 'unknown-id'] });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].publicId).toBe(publicId);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `cd server && npx vitest run tests/trips.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full server suite**

Run: `cd server && npx vitest run`
Expected: PASS (health, db, auth, trips all green).

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/trips.ts server/src/app.ts server/tests/trips.test.ts server/tests/helpers
git commit -m "Add trips API: create, mine, summary, detail"
```

---

### Task 6: Frontend data layer — API client & local identity storage

**Files:**
- Create: `client/src/lib/api.ts`, `client/src/lib/localTrips.ts`
- Test: `client/tests/localTrips.test.ts`

**Interfaces:**
- Produces: `api.me()`, `api.requestLink(email, redirect?)`, `api.myTrips()`, `api.tripSummaries(publicIds)`, `api.tripDetail(publicId)`, `api.createTrip(input)`, `ApiError` class, and types `TripSummary`, `TripMember`, `TripDetail`, `CurrentUser` from `client/src/lib/api.ts`; `getJoinedTripIds()`, `addJoinedTripId(id)`, `getIdentity(tripPublicId)`, `setIdentity(tripPublicId, memberId)` from `client/src/lib/localTrips.ts` — both consumed by every screen task (7–10).

- [ ] **Step 1: Write the failing localTrips tests**

`client/tests/localTrips.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { addJoinedTripId, getIdentity, getJoinedTripIds, setIdentity } from '../src/lib/localTrips';

beforeEach(() => {
  localStorage.clear();
});

describe('getJoinedTripIds / addJoinedTripId', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(getJoinedTripIds()).toEqual([]);
  });

  it('adds and deduplicates trip ids', () => {
    addJoinedTripId('trip-a');
    addJoinedTripId('trip-b');
    addJoinedTripId('trip-a');
    expect(getJoinedTripIds()).toEqual(['trip-a', 'trip-b']);
  });
});

describe('getIdentity / setIdentity', () => {
  it('returns null when no identity is set for a trip', () => {
    expect(getIdentity('trip-a')).toBeNull();
  });

  it('stores identity per trip and also marks the trip as joined', () => {
    setIdentity('trip-a', '42');
    expect(getIdentity('trip-a')).toBe('42');
    expect(getJoinedTripIds()).toEqual(['trip-a']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client && npx vitest run tests/localTrips.test.ts`
Expected: FAIL — `src/lib/localTrips` does not exist.

- [ ] **Step 3: Implement localTrips.ts**

`client/src/lib/localTrips.ts`:
```ts
const JOINED_TRIPS_KEY = 'cb.joinedTripIds';
const identityKey = (tripPublicId: string) => `cb.identity.${tripPublicId}`;

export function getJoinedTripIds(): string[] {
  try {
    const raw = localStorage.getItem(JOINED_TRIPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function addJoinedTripId(tripPublicId: string): void {
  const ids = getJoinedTripIds();
  if (!ids.includes(tripPublicId)) {
    localStorage.setItem(JOINED_TRIPS_KEY, JSON.stringify([...ids, tripPublicId]));
  }
}

export function getIdentity(tripPublicId: string): string | null {
  return localStorage.getItem(identityKey(tripPublicId));
}

export function setIdentity(tripPublicId: string, memberId: string): void {
  localStorage.setItem(identityKey(tripPublicId), memberId);
  addJoinedTripId(tripPublicId);
}
```

- [ ] **Step 4: Run the test again to verify it passes**

Run: `cd client && npx vitest run tests/localTrips.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the API client (no dedicated unit test — it's a thin fetch wrapper exercised indirectly by every screen test in Tasks 8–10 via `vi.mock`)**

`client/src/lib/api.ts`:
```ts
export interface TripSummary {
  publicId: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  memberCount: number;
  unsettledCount: number;
}

export interface TripMember {
  id: number;
  name: string;
}

export interface TripDetail {
  publicId: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  members: TripMember[];
}

export interface CurrentUser {
  id: number;
  email: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number) {
    super(`API request failed with status ${status}`);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    credentials: 'same-origin',
  });
  if (!res.ok) {
    throw new ApiError(res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  me: () => request<CurrentUser>('/auth/me'),
  requestLink: (email: string, redirect?: string) =>
    request<{ ok: true }>('/auth/request-link', { method: 'POST', body: JSON.stringify({ email, redirect }) }),
  myTrips: () => request<TripSummary[]>('/trips/mine'),
  tripSummaries: (publicIds: string[]) =>
    request<TripSummary[]>('/trips/summary', { method: 'POST', body: JSON.stringify({ publicIds }) }),
  tripDetail: (publicId: string) => request<TripDetail>(`/trips/${publicId}`),
  createTrip: (input: { name: string; destination: string; startDate: string; endDate: string; members: string[] }) =>
    request<{ publicId: string }>('/trips', { method: 'POST', body: JSON.stringify(input) }),
};
```

- [ ] **Step 6: Run the full client suite**

Run: `cd client && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/lib client/tests/localTrips.test.ts
git commit -m "Add frontend API client and local identity storage"
```

---

### Task 7: Navigation shell — bottom navs, permanent placeholders, router skeleton

**Files:**
- Create: `client/src/components/BottomNavAppLevel.tsx`, `client/src/components/BottomNavTripLevel.tsx`, `client/src/screens/RingkasanPlaceholderScreen.tsx`, `client/src/screens/ProfilePlaceholderScreen.tsx`
- Modify: `client/src/App.tsx`
- Test: `client/tests/Navigation.test.tsx`

**Interfaces:**
- Produces: `<BottomNavAppLevel />` (no props), `<BottomNavTripLevel publicId={string} active={'ringkasan'|'riwayat'|'saldo'} />` — both consumed by screens in Tasks 8 and by the placeholder screens here. Routes `/t/:publicId/ringkasan` and `/profil` registered in `App.tsx` — the full route table is completed incrementally through Task 10.

- [ ] **Step 1: Write the failing navigation test**

`client/tests/Navigation.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

describe('navigation shell', () => {
  it('renders the Ringkasan placeholder with its bottom nav', async () => {
    render(
      <MemoryRouter initialEntries={['/t/a1/ringkasan']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Ringkasan segera hadir')).toBeInTheDocument();
    expect(screen.getByText('Ringkasan')).toBeInTheDocument();
    expect(screen.getByText('Riwayat')).toBeInTheDocument();
    expect(screen.getByText('Saldo')).toBeInTheDocument();
  });

  it('navigates from the trip-level bottom nav to the app-level Profil placeholder', async () => {
    render(
      <MemoryRouter initialEntries={['/t/a1/ringkasan']}>
        <App />
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByText('Profil'));
    expect(await screen.findByText('Pengaturan segera hadir')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client && npx vitest run tests/Navigation.test.tsx`
Expected: FAIL — routes/screens do not exist yet.

- [ ] **Step 3: Implement the bottom nav components**

`client/src/components/BottomNavAppLevel.tsx`:
```tsx
import { Link, useLocation } from 'react-router-dom';

export default function BottomNavAppLevel() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="fixed inset-x-0 bottom-0 flex items-center justify-around border-t border-border bg-surface px-4 pb-[18px] pt-[10px]">
      <div className="flex flex-col items-center gap-[3px]">
        <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={isHome ? 'var(--color-accent)' : 'var(--color-sub)'} strokeWidth={2}>
          <path d="M4 11 12 4l8 7" />
          <path d="M6 10v9h12v-9" />
        </svg>
        <span className={`font-inter text-[10px] font-semibold ${isHome ? 'text-accent' : 'text-sub'}`}>Beranda</span>
      </div>
      <Link to="/profil" className="flex flex-col items-center gap-[3px]">
        <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--color-sub)" strokeWidth={2}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c0-4 3-6 7-6s7 2 7 6" />
        </svg>
        <span className="font-inter text-[10px] font-medium text-sub">Profil</span>
      </Link>
    </div>
  );
}
```

`client/src/components/BottomNavTripLevel.tsx`:
```tsx
import { Link } from 'react-router-dom';

interface BottomNavTripLevelProps {
  publicId: string;
  active: 'ringkasan' | 'riwayat' | 'saldo';
}

export default function BottomNavTripLevel({ publicId, active }: BottomNavTripLevelProps) {
  const itemClass = (key: string) => `font-inter text-[10px] font-semibold ${active === key ? 'text-accent' : 'text-sub'}`;

  return (
    <div className="fixed inset-x-0 bottom-0 flex items-center justify-around border-t border-border bg-surface px-4 pb-[18px] pt-[10px]">
      <Link to={`/t/${publicId}/ringkasan`} className="flex flex-col items-center gap-[3px]">
        <span className={itemClass('ringkasan')}>Ringkasan</span>
      </Link>
      <Link to={`/t/${publicId}/ringkasan`} className="flex flex-col items-center gap-[3px]">
        <span className={itemClass('riwayat')}>Riwayat</span>
      </Link>
      <button
        disabled
        aria-label="Tambah sub trip"
        className="flex h-12 w-12 flex-none -translate-y-3 items-center justify-center rounded-full bg-accent font-inter text-lg text-onAccent opacity-50"
      >
        +
      </button>
      <Link to={`/t/${publicId}/ringkasan`} className="flex flex-col items-center gap-[3px]">
        <span className={itemClass('saldo')}>Saldo</span>
      </Link>
      <Link to="/profil" className="flex flex-col items-center gap-[3px]">
        <span className="font-inter text-[10px] font-medium text-sub">Profil</span>
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Implement the two permanent placeholder screens**

`client/src/screens/RingkasanPlaceholderScreen.tsx`:
```tsx
import { useParams } from 'react-router-dom';
import BottomNavTripLevel from '../components/BottomNavTripLevel';

export default function RingkasanPlaceholderScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 pb-[100px] text-center">
      <div className="font-manrope text-base font-bold text-text">Ringkasan segera hadir</div>
      <div className="font-inter text-[13px] text-sub">Fitur ini dibangun di Tahap 2.</div>
      <BottomNavTripLevel publicId={publicId ?? ''} active="ringkasan" />
    </div>
  );
}
```

`client/src/screens/ProfilePlaceholderScreen.tsx`:
```tsx
export default function ProfilePlaceholderScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
      <div className="font-manrope text-base font-bold text-text">Pengaturan segera hadir</div>
      <div className="font-inter text-[13px] text-sub">Fitur ini dibangun di tahap berikutnya.</div>
    </div>
  );
}
```

- [ ] **Step 5: Wire the two routes into App.tsx**

Replace `client/src/App.tsx`:
```tsx
import { Route, Routes } from 'react-router-dom';
import RingkasanPlaceholderScreen from './screens/RingkasanPlaceholderScreen';
import ProfilePlaceholderScreen from './screens/ProfilePlaceholderScreen';

export default function App() {
  return (
    <Routes>
      <Route path="/t/:publicId/ringkasan" element={<RingkasanPlaceholderScreen />} />
      <Route path="/profil" element={<ProfilePlaceholderScreen />} />
    </Routes>
  );
}
```

- [ ] **Step 6: Update the App smoke test (it no longer renders "Cepatkan Bayar" at `/`, since `/` isn't routed until Task 8)**

Replace `client/tests/App.test.tsx` with the navigation test from Step 1 — delete `client/tests/App.test.tsx` since `Navigation.test.tsx` now covers `App`:
```bash
rm client/tests/App.test.tsx
```

- [ ] **Step 7: Run the tests**

Run: `cd client && npx vitest run`
Expected: PASS (Navigation.test.tsx, localTrips.test.ts, tokens.test.tsx all green).

- [ ] **Step 8: Commit**

```bash
git add client/src/components client/src/screens/RingkasanPlaceholderScreen.tsx client/src/screens/ProfilePlaceholderScreen.tsx client/src/App.tsx client/tests/Navigation.test.tsx
git rm client/tests/App.test.tsx
git commit -m "Add navigation shell: bottom navs and permanent placeholder screens"
```

---

### Task 8: Daftar Trip screen

**Files:**
- Create: `client/src/components/TripCard.tsx`, `client/src/screens/TripListScreen.tsx`
- Modify: `client/src/App.tsx`
- Test: `client/tests/TripListScreen.test.tsx`

**Interfaces:**
- Consumes: `api.myTrips()`, `api.tripSummaries()`, `ApiError`, `TripSummary` from Task 6; `getJoinedTripIds()` from Task 6; `<BottomNavAppLevel />` from Task 7.
- Produces: `<TripListScreen />` mounted at `/` in `App.tsx` — the route future tasks and Task 11's manual walkthrough rely on as the app root.

- [ ] **Step 1: Write the failing test**

`client/tests/TripListScreen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TripListScreen from '../src/screens/TripListScreen';

vi.mock('../src/lib/api', () => ({
  api: {
    myTrips: vi.fn(),
    tripSummaries: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super('err');
      this.status = status;
    }
  },
}));

import { api } from '../src/lib/api';

beforeEach(() => {
  localStorage.clear();
  vi.mocked(api.myTrips).mockResolvedValue([
    {
      publicId: 'a1',
      name: 'Trip ke Jogja',
      destination: 'Yogyakarta',
      startDate: '2026-09-01',
      endDate: '2026-09-04',
      memberCount: 4,
      unsettledCount: 2,
    },
  ]);
  vi.mocked(api.tripSummaries).mockResolvedValue([]);
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <TripListScreen />
    </MemoryRouter>,
  );
}

describe('TripListScreen', () => {
  it('renders trip cards from the API', async () => {
    renderScreen();
    expect(await screen.findByText('Trip ke Jogja')).toBeInTheDocument();
    expect(screen.getByText('2 tagihan belum lunas')).toBeInTheDocument();
    expect(screen.getByText('4 orang')).toBeInTheDocument();
  });

  it('shows a green "Semua lunas" status when nothing is unsettled', async () => {
    vi.mocked(api.myTrips).mockResolvedValue([
      {
        publicId: 'b2',
        name: 'Trip ke Bali',
        destination: 'Bali',
        startDate: '2026-10-01',
        endDate: '2026-10-03',
        memberCount: 3,
        unsettledCount: 0,
      },
    ]);
    renderScreen();
    expect(await screen.findByText('Semua lunas')).toBeInTheDocument();
  });

  it('filters trips by search query and shows the empty-result message', async () => {
    renderScreen();
    await screen.findByText('Trip ke Jogja');
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Cari trip…'), 'bandung');
    expect(screen.queryByText('Trip ke Jogja')).not.toBeInTheDocument();
    expect(screen.getByText('Nggak ada trip yang cocok sama "bandung"')).toBeInTheDocument();
  });

  it('merges locally-joined trip ids with the authenticated user\'s own trips', async () => {
    localStorage.setItem('cb.joinedTripIds', JSON.stringify(['c3']));
    vi.mocked(api.tripSummaries).mockResolvedValue([
      {
        publicId: 'c3',
        name: 'Trip ke Malang',
        destination: 'Malang',
        startDate: '2026-11-01',
        endDate: '2026-11-02',
        memberCount: 2,
        unsettledCount: 0,
      },
    ]);
    renderScreen();
    expect(await screen.findByText('Trip ke Malang')).toBeInTheDocument();
    expect(api.tripSummaries).toHaveBeenCalledWith(['c3']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client && npx vitest run tests/TripListScreen.test.tsx`
Expected: FAIL — `TripListScreen` does not exist.

- [ ] **Step 3: Implement TripCard**

`client/src/components/TripCard.tsx`:
```tsx
import type { TripSummary } from '../lib/api';

interface TripCardProps {
  trip: TripSummary;
  onOpen: (publicId: string) => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatDateRange(startDate: string, endDate: string): string {
  const fmt = (iso: string) => {
    const [, month, day] = iso.split('-');
    return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
  };
  return `${fmt(startDate)}–${fmt(endDate)}`;
}

export default function TripCard({ trip, onOpen }: TripCardProps) {
  const statusLabel = trip.unsettledCount > 0 ? `${trip.unsettledCount} tagihan belum lunas` : 'Semua lunas';
  const statusColor = trip.unsettledCount > 0 ? 'text-neg' : 'text-pos';

  return (
    <button
      onClick={() => onOpen(trip.publicId)}
      className="flex flex-col gap-1.5 rounded-card border border-border bg-surface px-[15px] py-3.5 text-left font-inter"
    >
      <div className="font-manrope text-[15px] font-bold text-text">{trip.name}</div>
      <div className="text-xs text-sub">
        {trip.destination} · {formatDateRange(trip.startDate, trip.endDate)}
      </div>
      <div className="mt-1 flex items-center justify-between">
        <div className="text-[11.5px] font-medium text-sub">{trip.memberCount} orang</div>
        <div className={`text-[11.5px] font-semibold ${statusColor}`}>{statusLabel}</div>
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Implement TripListScreen**

`client/src/screens/TripListScreen.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type TripSummary } from '../lib/api';
import { getJoinedTripIds } from '../lib/localTrips';
import TripCard from '../components/TripCard';
import BottomNavAppLevel from '../components/BottomNavAppLevel';

export default function TripListScreen() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const joinedIds = getJoinedTripIds();
      const [mine, joined] = await Promise.all([
        api.myTrips().catch((err) => (err instanceof ApiError && err.status === 401 ? [] : Promise.reject(err))),
        joinedIds.length > 0 ? api.tripSummaries(joinedIds) : Promise.resolve([]),
      ]);
      if (cancelled) return;
      const byId = new Map<string, TripSummary>();
      for (const trip of [...mine, ...joined]) byId.set(trip.publicId, trip);
      setTrips([...byId.values()]);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter((t) => t.name.toLowerCase().includes(q) || t.destination.toLowerCase().includes(q));
  }, [trips, search]);

  return (
    <div className="flex min-h-screen flex-col gap-4 px-5 pb-[100px] pt-2">
      <div className="mt-2.5 flex items-center gap-2.5">
        <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] bg-accent">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg)" strokeWidth={2.2}>
            <path d="M12 2v6" />
            <path d="M5 10h14l-1.5 10a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z" />
          </svg>
        </div>
        <div className="font-manrope text-[17px] font-extrabold text-text">Cepatkan Bayar</div>
      </div>

      <div className="flex items-center gap-2 rounded-input border border-border bg-surface px-3 py-2.5">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-sub)" strokeWidth={2}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari trip…"
          className="flex-1 border-none bg-transparent font-inter text-[13px] font-medium text-text outline-none placeholder:opacity-70"
        />
      </div>

      <button
        onClick={() => navigate('/trip/new')}
        className="flex items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-[13px] font-inter text-[13.5px] font-bold text-onAccent"
      >
        + Buat Trip Baru
      </button>

      <div className="mt-0.5 font-inter text-[11px] font-semibold uppercase tracking-[.04em] text-sub">Trip kamu</div>

      {!loading && (
        <div className="flex flex-col gap-2.5">
          {filtered.map((trip) => (
            <TripCard
              key={trip.publicId}
              trip={trip}
              onOpen={(publicId) => navigate(`/t/${publicId}`, { state: { viaShareLink: false } })}
            />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && search.trim() && (
        <div className="py-5 text-center font-inter text-[12.5px] text-sub">
          Nggak ada trip yang cocok sama "{search}"
        </div>
      )}

      <BottomNavAppLevel />
    </div>
  );
}
```

- [ ] **Step 5: Wire `/` into App.tsx**

Modify `client/src/App.tsx`:
```tsx
import { Route, Routes } from 'react-router-dom';
import TripListScreen from './screens/TripListScreen';
import RingkasanPlaceholderScreen from './screens/RingkasanPlaceholderScreen';
import ProfilePlaceholderScreen from './screens/ProfilePlaceholderScreen';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TripListScreen />} />
      <Route path="/t/:publicId/ringkasan" element={<RingkasanPlaceholderScreen />} />
      <Route path="/profil" element={<ProfilePlaceholderScreen />} />
    </Routes>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `cd client && npx vitest run`
Expected: PASS (all previous tests remain green; TripListScreen.test.tsx passes).

- [ ] **Step 7: Commit**

```bash
git add client/src/components/TripCard.tsx client/src/screens/TripListScreen.tsx client/src/App.tsx client/tests/TripListScreen.test.tsx
git commit -m "Add Daftar Trip screen"
```

---

### Task 9: Buat Trip Baru screen (with creator login gate)

**Files:**
- Create: `client/src/screens/NewTripScreen.tsx`
- Modify: `client/src/App.tsx`
- Test: `client/tests/NewTripScreen.test.tsx`

**Interfaces:**
- Consumes: `api.me()`, `api.requestLink()`, `api.createTrip()`, `ApiError` from Task 6; `addJoinedTripId()` from Task 6.
- Produces: `<NewTripScreen />` mounted at `/trip/new` in `App.tsx`, navigating to `/t/:publicId` with router state `{ viaShareLink: false }` on success — the shape Task 10 reads.

- [ ] **Step 1: Write the failing test**

`client/tests/NewTripScreen.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NewTripScreen from '../src/screens/NewTripScreen';

vi.mock('../src/lib/api', () => ({
  api: {
    me: vi.fn(),
    requestLink: vi.fn(),
    createTrip: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super('err');
      this.status = status;
    }
  },
}));

import { api, ApiError } from '../src/lib/api';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/trip/new']}>
      <Routes>
        <Route path="/trip/new" element={<NewTripScreen />} />
        <Route path="/t/:publicId" element={<div>Identity screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NewTripScreen auth gate', () => {
  it('shows the email step when unauthenticated', async () => {
    vi.mocked(api.me).mockRejectedValue(new ApiError(401));
    renderScreen();
    expect(await screen.findByPlaceholderText('email@kamu.com')).toBeInTheDocument();
  });

  it('sends the magic link and shows a confirmation message', async () => {
    vi.mocked(api.me).mockRejectedValue(new ApiError(401));
    vi.mocked(api.requestLink).mockResolvedValue({ ok: true });
    renderScreen();
    const user = userEvent.setup();
    await user.type(await screen.findByPlaceholderText('email@kamu.com'), 'budi@example.com');
    await user.click(screen.getByText('Kirim link masuk'));
    expect(await screen.findByText('Cek email kamu, klik link buat lanjut.')).toBeInTheDocument();
    expect(api.requestLink).toHaveBeenCalledWith('budi@example.com', '/trip/new');
  });
});

describe('NewTripScreen form', () => {
  beforeEach(() => {
    vi.mocked(api.me).mockResolvedValue({ id: 1, email: 'budi@example.com' });
  });

  it('adds and removes members as chips', async () => {
    renderScreen();
    const user = userEvent.setup();
    const input = await screen.findByPlaceholderText('Tambah nama, enter buat konfirmasi');
    await user.type(input, 'Budi{Enter}');
    expect(screen.getByText('Budi')).toBeInTheDocument();
    await user.click(screen.getByText('×'));
    expect(screen.queryByText('Budi')).not.toBeInTheDocument();
  });

  it('disables submit until required fields are filled', async () => {
    renderScreen();
    const submit = await screen.findByText('Buat trip');
    expect(submit).toBeDisabled();
  });

  it('submits the trip and navigates to the identity screen', async () => {
    vi.mocked(api.createTrip).mockResolvedValue({ publicId: 'a1' });
    renderScreen();
    const user = userEvent.setup();
    await user.type(await screen.findByPlaceholderText('misal: Trip ke Jogja'), 'Trip ke Jogja');
    await user.type(screen.getByPlaceholderText('misal: Yogyakarta'), 'Yogyakarta');
    fireEvent.change(screen.getByLabelText('Mulai'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Selesai'), { target: { value: '2026-09-04' } });
    await user.type(screen.getByPlaceholderText('Tambah nama, enter buat konfirmasi'), 'Budi{Enter}');
    await user.click(screen.getByText('Buat trip'));
    expect(await screen.findByText('Identity screen')).toBeInTheDocument();
    expect(api.createTrip).toHaveBeenCalledWith({
      name: 'Trip ke Jogja',
      destination: 'Yogyakarta',
      startDate: '2026-09-01',
      endDate: '2026-09-04',
      members: ['Budi'],
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client && npx vitest run tests/NewTripScreen.test.tsx`
Expected: FAIL — `NewTripScreen` does not exist.

- [ ] **Step 3: Implement NewTripScreen**

`client/src/screens/NewTripScreen.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { addJoinedTripId } from '../lib/localTrips';

type AuthStage = 'checking' | 'needsEmail' | 'linkSent' | 'authenticated';

export default function NewTripScreen() {
  const navigate = useNavigate();
  const [authStage, setAuthStage] = useState<AuthStage>('checking');
  const [email, setEmail] = useState('');

  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [memberDraft, setMemberDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(() => setAuthStage('authenticated'))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setAuthStage('needsEmail');
        }
      });
  }, []);

  async function handleRequestLink() {
    await api.requestLink(email, '/trip/new');
    setAuthStage('linkSent');
  }

  function addMember() {
    const trimmed = memberDraft.trim();
    if (trimmed && !members.includes(trimmed)) {
      setMembers([...members, trimmed]);
    }
    setMemberDraft('');
  }

  function removeMember(target: string) {
    setMembers(members.filter((m) => m !== target));
  }

  const canSubmit = Boolean(name.trim() && destination.trim() && startDate && endDate && members.length > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { publicId } = await api.createTrip({ name, destination, startDate, endDate, members });
      addJoinedTripId(publicId);
      navigate(`/t/${publicId}`, { state: { viaShareLink: false } });
    } catch {
      setError('Gagal bikin trip. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }

  if (authStage === 'checking') return null;

  if (authStage === 'needsEmail' || authStage === 'linkSent') {
    return (
      <div className="flex min-h-screen flex-col gap-4 px-[22px] pb-8 pt-3.5">
        <div className="mt-3.5">
          <div className="font-manrope text-[21px] font-extrabold text-text">Masuk dulu</div>
          <div className="mt-1.5 font-inter text-[13px] text-sub">Masukin email buat bikin &amp; ngatur trip kamu.</div>
        </div>
        {authStage === 'needsEmail' ? (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@kamu.com"
              className="rounded-input border border-border bg-surface px-3.5 py-3 font-inter text-sm text-text"
            />
            <button
              onClick={handleRequestLink}
              disabled={!email.trim()}
              className="rounded-[14px] bg-accent px-4 py-3.5 font-inter text-sm font-bold text-onAccent disabled:opacity-50"
            >
              Kirim link masuk
            </button>
          </>
        ) : (
          <div className="font-inter text-sm text-sub">Cek email kamu, klik link buat lanjut.</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 px-[22px] pb-8 pt-2">
      <div className="mt-3.5">
        <div className="font-manrope text-[21px] font-extrabold text-text">Buat trip baru</div>
        <div className="mt-1.5 font-inter text-[13px] text-sub">Isi info dasar, anggota bisa ditambah kapan aja nanti.</div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-inter text-xs font-semibold text-sub">Nama trip</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="misal: Trip ke Jogja"
          className="rounded-input border border-border bg-surface px-3.5 py-3 font-inter text-sm text-text"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-inter text-xs font-semibold text-sub">Destinasi</span>
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="misal: Yogyakarta"
          className="rounded-input border border-border bg-surface px-3.5 py-3 font-inter text-sm text-text"
        />
      </label>

      <div className="flex gap-2.5">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="font-inter text-xs font-semibold text-sub">Mulai</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-input border border-border bg-surface px-3.5 py-3 font-inter text-[13px] text-text"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="font-inter text-xs font-semibold text-sub">Selesai</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-input border border-border bg-surface px-3.5 py-3 font-inter text-[13px] text-text"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-inter text-xs font-semibold text-sub">Anggota awal</span>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <div key={m} className="flex items-center gap-1.5 rounded-pill bg-surfaceAlt py-1.5 pl-3 pr-2.5 font-inter text-[12.5px] text-text">
              {m}
              <span onClick={() => removeMember(m)} className="cursor-pointer text-sub">×</span>
            </div>
          ))}
        </div>
        <input
          value={memberDraft}
          onChange={(e) => setMemberDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addMember();
            }
          }}
          placeholder="Tambah nama, enter buat konfirmasi"
          className="rounded-input border border-dashed border-border bg-transparent px-3.5 py-2.5 font-inter text-[13px] text-text"
        />
      </div>

      {error && <div className="font-inter text-[12.5px] text-neg">{error}</div>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className="mt-1.5 w-full rounded-[14px] bg-accent px-4 py-3.5 font-inter text-sm font-bold text-onAccent disabled:opacity-50"
      >
        Buat trip
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Wire `/trip/new` into App.tsx**

Modify `client/src/App.tsx` (add the import and route):
```tsx
import NewTripScreen from './screens/NewTripScreen';
// ...
<Route path="/trip/new" element={<NewTripScreen />} />
```

- [ ] **Step 5: Run the tests**

Run: `cd client && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/screens/NewTripScreen.tsx client/src/App.tsx client/tests/NewTripScreen.test.tsx
git commit -m "Add Buat Trip Baru screen with creator login gate"
```

---

### Task 10: Pilih Identitas screen

**Files:**
- Create: `client/src/components/MemberAvatar.tsx`, `client/src/screens/IdentityPickerScreen.tsx`
- Modify: `client/src/App.tsx`
- Test: `client/tests/IdentityPickerScreen.test.tsx`

**Interfaces:**
- Consumes: `api.tripDetail(publicId)` from Task 6; `setIdentity(tripPublicId, memberId)` from Task 6.
- Produces: `<IdentityPickerScreen />` mounted at `/t/:publicId` in `App.tsx` — this completes the full Tahap 1 route table.

- [ ] **Step 1: Write the failing test**

`client/tests/IdentityPickerScreen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import IdentityPickerScreen from '../src/screens/IdentityPickerScreen';
import { getIdentity, getJoinedTripIds } from '../src/lib/localTrips';

vi.mock('../src/lib/api', () => ({
  api: {
    tripDetail: vi.fn(),
  },
}));

import { api } from '../src/lib/api';

beforeEach(() => {
  localStorage.clear();
  vi.mocked(api.tripDetail).mockResolvedValue({
    publicId: 'a1',
    name: 'Trip ke Jogja',
    destination: 'Yogyakarta',
    startDate: '2026-09-01',
    endDate: '2026-09-04',
    members: [
      { id: 1, name: 'Budi' },
      { id: 2, name: 'Aji' },
    ],
  });
});

function renderScreen(initialEntries: Array<string | { pathname: string; state?: unknown }>) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/t/:publicId" element={<IdentityPickerScreen />} />
        <Route path="/t/:publicId/ringkasan" element={<div>Ringkasan placeholder</div>} />
        <Route path="/" element={<div>Daftar trip screen</div>} />
        <Route path="/trip/new" element={<div>New trip screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('IdentityPickerScreen', () => {
  it('shows the back-to-list link when not arriving via a share link', async () => {
    renderScreen([{ pathname: '/t/a1', state: { viaShareLink: false } }]);
    expect(await screen.findByText('Budi')).toBeInTheDocument();
    expect(screen.getByText('Daftar trip')).toBeInTheDocument();
  });

  it('hides the back-to-list link when arriving via a share link (no router state)', async () => {
    renderScreen(['/t/a1']);
    await screen.findByText('Budi');
    expect(screen.queryByText('Daftar trip')).not.toBeInTheDocument();
  });

  it('selecting a member stores identity locally and navigates to the ringkasan placeholder', async () => {
    renderScreen(['/t/a1']);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Budi'));
    expect(await screen.findByText('Ringkasan placeholder')).toBeInTheDocument();
    expect(getIdentity('a1')).toBe('1');
    expect(getJoinedTripIds()).toEqual(['a1']);
  });

  it('shows the trip name in the subtitle and the "bikin trip baru" link', async () => {
    renderScreen(['/t/a1']);
    expect(await screen.findByText('Trip ke Jogja')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByText('Bikin trip baru →'));
    expect(await screen.findByText('New trip screen')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client && npx vitest run tests/IdentityPickerScreen.test.tsx`
Expected: FAIL — `IdentityPickerScreen` does not exist.

- [ ] **Step 3: Implement MemberAvatar**

`client/src/components/MemberAvatar.tsx`:
```tsx
interface MemberAvatarProps {
  name: string;
  size?: number;
}

export function initialFor(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export default function MemberAvatar({ name, size = 40 }: MemberAvatarProps) {
  return (
    <div
      className="flex flex-none items-center justify-center rounded-full bg-surfaceAlt font-manrope font-bold text-text"
      style={{ width: size, height: size, fontSize: size * 0.375 }}
    >
      {initialFor(name)}
    </div>
  );
}
```

- [ ] **Step 4: Implement IdentityPickerScreen**

`client/src/screens/IdentityPickerScreen.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, type TripDetail } from '../lib/api';
import { setIdentity } from '../lib/localTrips';
import MemberAvatar from '../components/MemberAvatar';

export default function IdentityPickerScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);

  const viaShareLink = (location.state as { viaShareLink?: boolean } | null)?.viaShareLink ?? true;

  useEffect(() => {
    if (!publicId) return;
    api.tripDetail(publicId).then(setTrip);
  }, [publicId]);

  function handleSelect(memberId: number) {
    if (!publicId) return;
    setIdentity(publicId, String(memberId));
    navigate(`/t/${publicId}/ringkasan`);
  }

  if (!trip) return null;

  return (
    <div className="flex min-h-screen flex-col px-[22px] pb-8 pt-2">
      {!viaShareLink && (
        <button onClick={() => navigate('/')} className="mt-2.5 flex items-center gap-1.5 border-none bg-transparent">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-sub)" strokeWidth={2}>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <span className="font-inter text-[12.5px] font-medium text-sub">Daftar trip</span>
        </button>
      )}

      <div className="mb-[22px] mt-[18px]">
        <div className="font-manrope text-[22px] font-extrabold text-text">Kamu yang mana?</div>
        <div className="mt-1.5 font-inter text-[13px] leading-relaxed text-sub">
          Pilih nama kamu buat lanjut ke <strong className="text-text">{trip.name}</strong>. Nggak perlu login.
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {trip.members.map((m) => (
          <button
            key={m.id}
            onClick={() => handleSelect(m.id)}
            className="flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-3.5 text-left"
          >
            <MemberAvatar name={m.name} />
            <div className="flex-1 font-inter text-sm font-semibold text-text">{m.name}</div>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-sub)" strokeWidth={2}>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-4">
        <div className="text-center font-inter text-xs leading-relaxed text-sub">
          Belum ada di daftar? Minta pembuat trip buat nambahin kamu.
        </div>
        <button onClick={() => navigate('/trip/new')} className="border-none bg-transparent font-inter text-xs font-semibold text-accent">
          Bikin trip baru →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire `/t/:publicId` into App.tsx — this completes the Tahap 1 route table**

Replace `client/src/App.tsx`:
```tsx
import { Route, Routes } from 'react-router-dom';
import TripListScreen from './screens/TripListScreen';
import NewTripScreen from './screens/NewTripScreen';
import IdentityPickerScreen from './screens/IdentityPickerScreen';
import RingkasanPlaceholderScreen from './screens/RingkasanPlaceholderScreen';
import ProfilePlaceholderScreen from './screens/ProfilePlaceholderScreen';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TripListScreen />} />
      <Route path="/trip/new" element={<NewTripScreen />} />
      <Route path="/t/:publicId" element={<IdentityPickerScreen />} />
      <Route path="/t/:publicId/ringkasan" element={<RingkasanPlaceholderScreen />} />
      <Route path="/profil" element={<ProfilePlaceholderScreen />} />
    </Routes>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `cd client && npx vitest run`
Expected: PASS — every client test file green.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/MemberAvatar.tsx client/src/screens/IdentityPickerScreen.tsx client/src/App.tsx client/tests/IdentityPickerScreen.test.tsx
git commit -m "Add Pilih Identitas screen, completing the Tahap 1 route table"
```

---

### Task 11: Final integration — full test suite and manual walkthrough

**Files:** none created; this task verifies Tasks 1–10 work together as a whole.

- [ ] **Step 1: Run the full automated test suite from the repo root**

Run:
```bash
npm run test
```
Expected: every server and client test file passes.

- [ ] **Step 2: Typecheck both packages**

Run:
```bash
cd server && npm run typecheck
cd ../client && npm run typecheck
```
Expected: no type errors.

- [ ] **Step 3: Start both dev servers**

In one terminal:
```bash
cd server && npm run dev
```
In a second terminal:
```bash
cd client && npm run dev
```

- [ ] **Step 4: Manually walk through the full flow in a browser at the Vite dev URL (typically `http://localhost:5173`)**

1. Load `/` — confirm Daftar Trip renders (empty list is fine on a fresh database), search box and "+ Buat Trip Baru" button visible, bottom nav shows Beranda/Profil.
2. Click "+ Buat Trip Baru" — confirm the email gate appears (`Masuk dulu`).
3. Enter an email, click "Kirim link masuk" — confirm "Cek email kamu, klik link buat lanjut." appears, and the server terminal logs `[dev] Magic link for <email>: http://localhost:4000/api/auth/verify?token=...` (no `SMTP_HOST` set locally).
4. Copy that logged URL and open it directly in the browser — confirm it redirects back to `/trip/new` and the trip form now renders (no more email gate).
5. Fill in Nama trip, Destinasi, Mulai/Selesai, add at least one member chip (e.g. your own name) — confirm "Buat trip" becomes enabled only once all fields are filled.
6. Submit — confirm navigation to `/t/<publicId>` (Pilih Identitas), the trip name appears in the subtitle, member list shows the chip(s) entered, and there is **no** "← Daftar trip" back link (since this arrived via in-app navigation with `viaShareLink: false` — re-check this against the design: back link is hidden here because the flag is explicitly `false`, matching "navigated from within the app").
7. Click your name — confirm navigation to `/t/<publicId>/ringkasan` showing "Ringkasan segera hadir" with the trip-level bottom nav (Ringkasan/Riwayat/+/Saldo/Profil).
8. Click "Profil" in the bottom nav — confirm navigation to `/profil` showing "Pengaturan segera hadir".
9. Navigate back to `/` — confirm the trip just created now appears in the Daftar Trip list with "Semua lunas" status and the correct member count.
10. Open the trip's identity URL directly (paste `/t/<publicId>` into the address bar as a fresh navigation, simulating a share link) — confirm the "← Daftar trip" back link is now **hidden** (no router state ⇒ `viaShareLink` defaults to `true`).
11. Type a nonsense string into the Daftar Trip search box — confirm the `Nggak ada trip yang cocok sama "..."` empty state appears.
12. Toggle the OS/browser color scheme to dark — confirm colors switch to the dark token set (background, text, accent) without a page reload.

- [ ] **Step 5: Fix any discrepancy found during the walkthrough**

If a visual or behavioral mismatch against `context/Cepat Bayarkan.dc.html` / `context/handoff.md` turns up, fix it in the relevant screen/component file from Tasks 7–10 and re-run that task's test file before continuing.

- [ ] **Step 6: Final commit**

```bash
git add -A
git status
```
Expected: nothing to commit (everything already committed per-task) — if the walkthrough produced fixes, commit them now:
```bash
git commit -m "Fix visual/behavioral discrepancies found during Tahap 1 walkthrough"
```

---

## Self-Review Notes

- **Spec coverage:** §6 route table fully covered (Tasks 7–10 build all 5 routes); §6.2 login gate covered (Task 9); §3.1/3.2 local identity + joined-trip merge covered (Task 6 + Task 8's merge test); §3.3 `publicId` covered (Task 3 schema + Task 5 `nanoid(16)`); §3.4 `viaShareLink` covered (Task 10, tested both states); §5 API contract covered (Task 5, matches §5 exactly). §8 exclusions (Kelola anggota, real Ringkasan, PWA) intentionally have no tasks — confirmed out of scope for this plan.
- **Placeholder scan:** no TBD/TODO; every step has runnable code or an explicit shell command.
- **Type consistency:** `TripSummary`/`TripDetail`/`TripMember`/`CurrentUser` (Task 6) match the JSON shapes returned by `server/src/routes/trips.ts` and `auth.ts` (Task 4/5) field-for-field, including `unsettledCount` always `0`. `setIdentity`/`getIdentity`/`addJoinedTripId`/`getJoinedTripIds` signatures are identical wherever consumed (Tasks 8, 9, 10). `BottomNavTripLevel`'s `active` prop union (`'ringkasan' | 'riwayat' | 'saldo'`) matches its only call site (Task 7's `RingkasanPlaceholderScreen`, passing `active="ringkasan"`); `'riwayat'`/`'saldo'` become reachable once Tahap 2/3 add real screens for them.

