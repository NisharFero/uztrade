# vinext-starter

## Local database

Production runs on Neon; locally the app runs against a plain Postgres cluster
that lives in the repo, so nothing depends on whatever server is installed on
the machine (and nothing can disturb it - different port, own data directory,
own superuser, loopback only).

```bash
cd apps/web
npm run db:setup     # initdb + createdb + DATABASE_URL + migrations
npm run dev
```

`db:setup` is safe to re-run; it writes `DATABASE_URL` into `apps/.env` (read
by the Worker in dev and by `npm run build`) and `apps/web/.env.local` (read by
Node tooling such as drizzle-kit and `next build`). Both are gitignored, and
the cluster's data directory `.pgdata/` is too.

| Command | What it does |
|---|---|
| `npm run db:setup` | Everything below, in order, then applies migrations |
| `npm run db:start` / `db:stop` | Start or stop the cluster (port 5433) |
| `npm run db:psql` | A `psql` shell on the local database |
| `node scripts/db/local-postgres.mjs reset` | Delete the cluster and start over |
| `npm run db:pull` | Introspect the live database into `.drizzle-pull/` (throwaway) |

`drizzle-postgres/` is the migration history and nothing else. Introspection
(`db:pull`) writes to `.drizzle-pull/` instead, because a pull emits a whole
migration and journal of its own - pulling into the migrations directory would
plant a second `0000_` migration beside the real one. `db:pull` also repairs a
drizzle-kit 0.31.10 bug that writes an empty-string column default as
`.default(')`, which does not parse; it fails loudly if any other unbalanced
quote survives.

It needs PostgreSQL's binaries on the machine (any version 14+; the newest
install is found automatically, or set `PG_BIN`). `UZTRADE_PG_PORT` moves the
port. To use a server you already run instead, skip `db:setup` and put its URL
in `apps/.env` - `db/index.ts` picks the driver from the URL: Neon's HTTP
driver for `*.neon.tech`, a TCP connection for anything else.

## Reading documents

Uploaded documents are read by a Groq vision model in one call: the page image
goes up, a transcript and one answer per field come back, and a field is only
auto-accepted when the quote it cites is found in that transcript. Set
`GROQ_API_KEY` and it is used automatically.

| Variable | Meaning |
|---|---|
| `GROQ_VISION_MODEL` | Pin the model. Otherwise llama-4-scout, llama-4-maverick and qwen/qwen3.8-27b are tried in that order and the first the account has is kept. |
| `GROQ_VISION_MAX_TOKENS` | Output tokens per document (default 1000, which is Groq's free-tier limit per minute). |
| `DOC_READER=docai` | Keep documents off Groq and use the DocAI service instead. |
| `DOCAI_URL` | The DocAI service (`apps/docai`), used for PDFs - a vision model takes images - and whenever Groq fails. |

Note the free tier's limit: 1000 output tokens per minute for a model means
roughly one document a minute, and requests above it are refused rather than
truncated. Those failures fall back to `DOCAI_URL` when it is reachable.

## Going live: Vercel + Render

Two services. The web app on Vercel, the entity APIs on Render (`render.yaml`
at the repo root). The document AI service is not deployed - see "Documents"
below.

### 1. Database (once)

Create a Neon Postgres database, then apply the migrations from a machine with
its URL:

```bash
cd apps/web
DATABASE_URL="postgres://…neon.tech/…?sslmode=require" npm run db:migrate
```

`db/index.ts` picks the driver from the URL: a Neon host gets the HTTP driver
(right for serverless), anything else a TCP connection.

### 2. Entity APIs on Render

Point Render at `render.yaml` (Blueprint), or create a Node web service by hand
with root directory `apps/portals`, build `npm install`, start `npm start`,
health check `/health`, and `NODE_VERSION=22.13.0`. Note the service URL.

The service binds `0.0.0.0` whenever the platform sets `PORT`. Applications are
stored on the instance's own disk and reset on restart, which is what a sandbox
should do. Keys are the shared dev keys unless `PORTAL_KEY_*` is set on both
sides - fine for a demo, and the reason the two services talk with no extra
configuration.

### 3. Web app on Vercel

Root directory `apps/web`, framework Next.js, build command `npm run
build:vercel` (already in `vercel.json`). Variables:

| Variable | Needed | What it does |
|---|---|---|
| `DATABASE_URL` | **yes** | Neon Postgres. Without it every case page errors. |
| `BLOB_READ_WRITE_TOKEN` | **yes, if documents are uploaded** | Vercel Blob keeps the original file. Without it an upload fails outright on Vercel. |
| `PORTALS_URL` | yes, for agent steps | The Render service. **Without it, deployed agent steps are simulated** rather than filed - by design, so nothing waits on a loopback address that isn't there. |
| `GROQ_API_KEY` | optional | Reading documents, and understanding messages the rules can't. Everything still works without it, on rules alone. |
| `GROQ_VISION_MODEL` | optional | Pin the vision model. Accounts differ in what they expose; without it the reader tries llama-4-scout, llama-4-maverick, then qwen/qwen3.8-27b and keeps the first that answers. |
| `DOC_READER` | optional | `docai` keeps uploaded documents off Groq entirely (see the demo note below). |
| `DOCAI_URL` | optional | A deployed document service, for PDFs. |

Routes that wait on a model declare `maxDuration = 60`; the rest answer from
Postgres in milliseconds.

### 4. Before you share the link

- [ ] `npm run build:vercel` locally - it must exit 0 (it does).
- [ ] Migrations applied to the Neon database.
- [ ] `PORTALS_URL` set, and `npx tsx scripts/debug/portals-reach-check.ts`
      against it returns 200 for all 12 entities.
- [ ] Open the deployment, ask for something real ("export 20 tonnes of carpets
      from Tashkent to Moscow by train"), confirm the case opens.
- [ ] Open `/procedures` - all 243 must list - and one procedure page.

### Documents, and the rate limits that decide the demo

Uploaded pages are read by a Groq vision model. Measured on the current free
tier key: **8,000 tokens per minute** shared across every model, and **1,000
output tokens per minute** on the vision model - about **one document a
minute for the whole deployment**, not per user. Five users uploading at once
will meet HTTP 429. One retry on `retry-after` is built in, and a read that
still fails falls back to the document service when one is deployed.

Three ways to run a demo that cannot be rate limited:

1. **Don't upload documents.** Intake, matching, the workflow, the three agents,
   the entity APIs and the ledger are all deterministic - they make no model
   calls at all. This is the bulk of what there is to show.
2. **Use the demo pack with `DOC_READER=docai` and no `DOCAI_URL`.** Uploading a
   file from `/demo/868` then returns its published values (14 of 14 fields on
   the commercial invoice) with **no model call**. Verified by
   `scripts/debug/demo-fallback-check.ts`.
3. **Pay for a Groq tier** if documents must be read live for arbitrary files.

PDFs have no reader unless the document service is deployed: a vision model
takes images, and rasterizing is that service's job. The upload says so and
asks for a photo or PNG instead. `apps/docai`'s deployable image is a proxy to a
Hugging Face endpoint, and running its models directly needs roughly 3 GB of
RAM - which is why it is left out of `render.yaml`.

## Vercel deployment (UzTrade)

Create a Vercel project with root directory `apps/web`, framework `Next.js`,
and build command `npm run build:vercel`. Connect a Neon Postgres database and
a **private** Vercel Blob store to the project. Set `DATABASE_URL`,
`BLOB_READ_WRITE_TOKEN`, `GROQ_API_KEY`, and `DOCAI_URL` (the public Railway
DocAI URL) in the Vercel project variables. Keep these server-side; do not use
`NEXT_PUBLIC_` for secrets. All 243 published procedures are supported; the ten with curated graphs and
demo material are `57`, `161`, `306`, `325`, `477`, `540`, `707`, `782`, `868`
and `924`.

Apply database migrations once before switching traffic to the deployment:

```bash
cd apps/web
npm ci
npm run db:migrate
npm run build:vercel
```

For local testing of the Vercel path, put the same variables in `.env.local`
and set `DOCAI_URL=http://127.0.0.1:8765` when running DocAI locally. The
Postgres path requires a reachable Postgres database even on localhost -
`npm run db:setup` provides one.
`npm run build` remains the Vinext build; Vercel uses `build:vercel`.

To roll back, select a previous deployment in Vercel and Railway. Do not
reverse a database migration until its data impact is reviewed. Rotate API
keys in the Railway and Vercel variable settings, then redeploy both services.

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
