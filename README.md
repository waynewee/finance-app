# Finance App

Single-user net worth tracking and FIRE planning built with React, TypeScript, Vite, Tailwind CSS, Neon Postgres, and Vercel serverless functions.

## Local Setup

1. Install dependencies.
2. Copy `.env.example` to `.env.local`.
3. Fill in your Neon `DATABASE_URL` and Finnhub API key.
4. Run the schema in [db/schema.sql](db/schema.sql) against your Neon database.
5. Run `npm run dev`.

Environment variables:

```bash
# Server-side only (Vercel serverless functions) — do NOT prefix with VITE_
DATABASE_URL=postgresql://user:password@your-neon-host/dbname?sslmode=require
```

All net worth and value lock data is read/written through Vercel serverless functions under `api/`, which talk to Neon over `DATABASE_URL`. The browser never holds a database connection string.

## Data Layer

- `db/schema.sql` — single-user Neon Postgres schema (no row-level security, no per-user scoping).
- `api/net-worth.ts` — categories, subcategories, monthly values, and FIRE settings.
- `api/value-lock.ts` — the value lock password (set/clear/verify), hashed with bcrypt.
- `src/lib/apiClient.ts` — shared fetch wrapper used by the frontend repositories to call these endpoints.

## Value Lock

This app has no login. Anyone with access to the deployed URL can open it. The "value lock" is a single password (not tied to any account) that hides/reveals balances in the UI for the current browser session. Set or change it via the "Value Lock" button in the header.

## Deployment (Vercel)

1. Push this repo to a Git provider connected to Vercel.
2. Import the project in Vercel; it will auto-detect the Vite frontend and the `api/` serverless functions.
3. In the Vercel project settings, add the `DATABASE_URL` environment variable (server-side only).
4. Deploy. Vercel builds the static frontend and deploys each file in `api/` as a serverless function.

Vercel is required (instead of a static host like GitHub Pages) because this app depends on serverless functions to reach the Neon database.

## Commands

```bash
npm run dev
npm run build
npm run preview
```
