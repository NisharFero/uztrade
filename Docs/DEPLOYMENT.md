# Deploying a second instance

A sequenced runbook for standing up a **new, separate** deployment of the
UzOne Trade Platform without touching the Railway and Vercel deployments that
already exist.

`apps/web/README.md` ("Going live: Vercel + Render") is the reference for what
every environment variable does. This file is the order to do things in, the
three places a first deployment actually fails, and how to keep the new
instance isolated from the old one.

---

## What gets deployed

| Piece | Where | Source | Required? |
|---|---|---|---|
| Web app | Vercel | `apps/web` | yes |
| Entity API sandboxes | Render | `apps/portals` (`render.yaml`) | no — without it, agent steps are simulated |
| Postgres | Neon | — | yes |
| Document AI | *not deployed* | `apps/docai` | no — see `render.yaml` for why |

`apps/docai` has a `railway.toml`, which is what the existing Railway service
runs. **This runbook does not touch Railway.** Leave that service alone; the
new instance does not need it.

---

## The three things that actually break a first deployment

Read these before starting. Everything else is routine.

### 1. The database must be Neon

`db/index.ts` picks its driver from the URL:

```ts
const isNeon = (url: string) => /neon\.tech|neon\.build/i.test(url);
```

A Neon host gets the HTTP driver, which is what works on Vercel's serverless
runtime. **Any other host** — Supabase, Railway Postgres, RDS — falls through
to the TCP socket driver, which will not hold up on Vercel. The build will
still succeed and the site will still deploy; it fails at runtime, on the
first page that reads a case, which is the worst place to find out.

Use Neon, or Vercel Postgres (which is Neon underneath — check the hostname
contains `neon.tech`).

### 2. Migrations never run themselves

`db/migrate.ts` exports `ensureSchema()`, and it is deliberately a no-op.
Nothing in the build or at runtime creates tables. A fresh database that has
not been migrated will deploy cleanly and then error on every page.

Apply them by hand, once, before opening the site (step 2 below).

> **Trap:** the repo has two migration directories. `drizzle/` is dead
> SQLite history; `drizzle-postgres/` is live. `npm run db:migrate` reads
> `drizzle.config.ts`, which points at `drizzle-postgres/` — correct. Do not
> point anything at `drizzle/`.

### 3. The first request writes 243 procedures

Master data is seeded lazily: `ensureBackendCatalog()` runs on the first
request that touches the catalogue and inserts every entity, user and
published procedure in batches of 50. On a cold serverless function that is a
slow first page view and, on a Hobby plan's shorter timeout, can fail outright.

Seed it ahead of time (step 2) so the first real visitor hits a warm database.

---

## The procedure

### Step 0 — gate locally

From a clean checkout of the branch you intend to deploy:

```bash
npm ci --prefix apps/web
npm --prefix apps/web run lint          # must be silent
npm test                                # 329 unit tests
npm --prefix apps/web run test:e2e      # 148 pass, 1 skipped (destructive reset — expected)
npm --prefix apps/web run build:vercel  # must exit 0
```

The build is expected to succeed **with no environment variables set at all** —
that is how Vercel will first run it. If it only builds when your local `.env`
is present, something now reads the database at build time and must be fixed
before deploying.

Commit and push the branch. Nothing deploys from a dirty tree.

### Step 1 — Neon database (new project)

Create a **new Neon project**, not a branch of the existing one. A separate
project is the cleanest guarantee that the new instance cannot write to the
old instance's data.

Copy the pooled connection string. It must look like:

```
postgres://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/DB?sslmode=require
```

### Step 2 — schema and seed (from your machine, once)

```bash
cd apps/web
export DATABASE_URL="postgres://…neon.tech/…?sslmode=require"

npm run db:migrate   # creates the 12 tables
npm run db:sync      # writes entities, users and 243 procedure versions
```

`db:sync` is idempotent — it owns the master data and brings it back in line
on every run, leaving user edits and later procedure versions alone.

Verify before moving on:

```bash
psql "$DATABASE_URL" -c "select count(*) from procedure_versions;"   # expect 243
psql "$DATABASE_URL" -c "select count(*) from entities;"             # expect 50
```

### Step 3 — entity APIs on Render (optional but recommended)

Create a **new** Render service with a name that does not collide with any
existing one, e.g. `uztrade-entity-apis-v2`.

Either point Render at `render.yaml` as a Blueprint, or configure by hand:

- Root directory `apps/portals`
- Build `npm install`, start `npm start`
- Health check `/health`
- `NODE_VERSION=22.13.0`

Note the service URL. On the free plan the instance sleeps when idle; the
first request after a sleep takes a few seconds.

### Step 4 — web app on Vercel (new project)

Create a **new Vercel project** from the same repository. Do not add a second
branch to the existing project — a new project is what keeps the two
deployments independent, with their own domains and their own variables.

- Root Directory: `apps/web`
- Framework: Next.js
- Build command: `npm run build:vercel` (already in `apps/web/vercel.json`)
- Node version: **22.x** (`package.json` sets `engines.node >=22.13.0`; the
  Vercel default may be older)
- Production branch: the branch you are deploying

Environment variables:

| Variable | Set it? | Consequence if missing |
|---|---|---|
| `DATABASE_URL` | **yes** | Every case page errors |
| `BLOB_READ_WRITE_TOKEN` | yes, if documents are uploaded | Uploads fail outright on Vercel |
| `PORTALS_URL` | recommended | Agent steps are simulated instead of filed |
| `GROQ_API_KEY` | optional | Assistant falls back to rules only; documents are not read |
| `GROQ_VISION_MODEL` | optional | Reader auto-selects a model your key can use |

Full descriptions are in `apps/web/README.md`.

### Step 5 — verify the deployment

```bash
cd apps/web
PORTALS_URL="https://…onrender.com" npx tsx scripts/debug/portals-reach-check.ts
# expect 200 for all 12 entities
```

Then, on the deployed URL:

- [ ] `/procedures` lists **243** procedures
- [ ] open one procedure — its dependency graph renders
- [ ] `/configuration` — six registries, three to a row
- [ ] `/entities` — nine kinds; open one, rows are sorted by reach
- [ ] `/map` — cases sit on their corridors
- [ ] ask for something real: *"export 20 tonnes of carpets from Tashkent to
      Moscow by train"* — a case opens
- [ ] ask for something uncovered: *"Tashkent to Frankfurt"* — it says the
      master data has no route, rather than planning one

---

## Keeping the new instance off the old one

The two deployments share a git repository and nothing else, provided:

- a **new Neon project** (step 1), not a branch of the old database
- a **new Vercel project** (step 4), not a new branch in the existing one
- a **new Render service name** (step 3)
- the existing **Railway** `apps/docai` service is left untouched; the new
  instance does not set `DOCAI_URL`

The one genuinely shared resource is the **Groq API key**, if you reuse it.
The free tier is roughly 8,000 tokens per minute across the whole key — about
one document a minute *per key, not per deployment*. Two instances on one key
compete. Use a second key, or accept that document reads on one will rate-limit
the other.

## Rollback

Vercel keeps every build. Promote the previous deployment from the project's
Deployments tab; it is instant and needs no rebuild.

The database does not roll back with it. The migrations in this release are
additive — they create tables rather than dropping or altering columns — so an
older build runs against the newer schema without harm. Do not run `db:migrate`
against a database you intend to roll back behind.

## Notes

- `POST /api/admin/reset` is destructive and is refused when `process.env.VERCEL`
  is set, so it cannot be called against a Vercel deployment.
- Routes that wait on a model declare `maxDuration = 60`. On a Hobby plan the
  ceiling is lower; if document reads time out, that is the limit to check.
- No `.env` file is tracked by git, and no key is committed. Keep it that way:
  every secret belongs in the Vercel and Render dashboards.
