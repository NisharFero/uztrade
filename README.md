# UzOne Trade Platform

A trader describes a shipment in chat; agents match it to one of 243 published
Uzbek trade procedures, open a case and take it through step by step, filing
online steps with sandbox government-entity APIs.

| Part | Folder | What it is |
|---|---|---|
| Web app | `apps/web` | Next.js (vinext/Vite) app: chat, agents, workflow, API routes |
| Entity APIs | `apps/portals` | 12 sandbox APIs the agents file with (Single Window, Railway, Customs, …) |
| Database | `.pgdata` or Docker | PostgreSQL on `127.0.0.1:5433`, created by setup |
| Document AI (optional) | `apps/docai` | Python OCR service for PDFs; not needed to run the app |

## Run it on a new machine

**You need:** [Node.js 22.13+](https://nodejs.org) and either
[PostgreSQL 14+](https://www.postgresql.org/download/) **or**
[Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone https://github.com/NisharFero/uztrade.git
cd uztrade
npm run setup     # installs dependencies, creates apps/.env, prepares the database
npm start         # starts database + entity APIs + web app
```

Open **http://localhost:3000**. Press `Ctrl+C` to stop the apps.

Setup is safe to run again at any time (for example after `git pull`).

### Optional: AI features

Everything works on rules alone. To let the assistant understand free-text
messages and read uploaded documents, put a Groq key in `apps/.env`:

```
GROQ_API_KEY=gsk_...
```

Get one at https://console.groq.com/keys, then restart with `npm start`.

## Commands

All from the repository root:

| Command | Does |
|---|---|
| `npm run setup` | Install dependencies, create `apps/.env`, start and migrate the database |
| `npm start` | Start the database, entity APIs and web app; waits until each is healthy |
| `npm run status` | Show what is running |
| `npm stop` | Stop the web app, entity APIs and local database |
| `npm test` | Unit tests for the web app and entity APIs |

## The database

`npm run setup` picks one automatically:

1. **Hosted**: if `DATABASE_URL` in `apps/.env` points to another machine (e.g. Neon), that is used.
2. **Installed PostgreSQL**: a private cluster in `.pgdata/` on port 5433. It does not touch any PostgreSQL service you already run.
3. **Docker**: if PostgreSQL is not installed, the `db` service in `docker-compose.yml`.

Force a choice with `UZTRADE_DB=docker npm run setup` (or `native`).
If PostgreSQL is installed somewhere unusual, set `PG_BIN` to its `bin` folder.

## Configuration

`apps/.env` holds local settings and secrets. It is created from
`apps/.env.example` and is **never committed** (see `.gitignore`). Each new
machine needs its own; copy your `GROQ_API_KEY` across by hand.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Pages fail with *"the database system is in recovery mode"* (often after the PC slept) | `npm stop` then `npm start`. `npm start` also detects this and restarts the database itself. |
| `Node.js 22.13 or newer is required` | Install Node 22 (`nvm use` reads `.nvmrc`). |
| `No database available` | Install PostgreSQL 14+ or Docker Desktop, then `npm run setup`. |
| Port 3000, 5433 or 8790 already in use | `npm stop`, or close the program using that port. |
| Agent steps never get filed | Check `npm run status`: the entity APIs must be running. |

## Deploying

Production runs the web app on Vercel with a Neon database and the entity APIs
on Render. See `apps/web/README.md` ("Going live: Vercel + Render") and `render.yaml`.

To stand up a **second, separate** instance without disturbing one that is
already deployed, follow `Docs/DEPLOYMENT.md` — it sequences the steps and
covers the three things that break a first deployment: the database must be
Neon, migrations never run themselves, and the first request seeds 243
procedures.
