# Production Railway + Vercel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make UzTrade production-ready by deploying the Document AI backend to Railway and the web frontend to Vercel while preserving the current localhost workflow.

**Architecture:** Split deployment by responsibility: `apps/docai` becomes an HTTP Document AI service on Railway, and `apps/web` becomes the Vercel-hosted Next.js frontend/API. Replace CPU-heavy local OCR/LayoutLM defaults with a production model provider path that can run reliably in a hosted environment, while keeping local CPU mode available for development. Replace Cloudflare D1 case/workflow persistence with Postgres for Vercel production while keeping local development deterministic.

**Tech Stack:** FastAPI, Uvicorn, Python, Railway, Next.js 16, Vercel, TypeScript, Drizzle ORM, Neon Postgres or another managed Postgres, Groq/Hugging Face or managed OCR/model APIs, environment variables.

**Spec:** User request on 2026-09-18: production model strategy, Railway backend deployment, Vercel frontend deployment, same consistency as localhost.

## Global Constraints

- Keep local development working with `apps/docai/run.ps1`, `apps/docai/run.sh`, and `DOCAI_URL=http://127.0.0.1:8765`.
- Do not commit real API keys or secrets.
- Railway backend must bind to `0.0.0.0` and `$PORT`.
- Vercel frontend must use the Railway public backend URL through `DOCAI_URL`.
- Production must not depend on `127.0.0.1`, local model files, or Windows-only paths.
- Any model switch must preserve the current `/health` and `/parse` API contract used by `apps/web`.
- Existing Cloudflare/Sites deployment support should not be broken while adding Railway/Vercel support unless the user explicitly chooses to drop Cloudflare hosting.
- Postgres is the chosen production database for Vercel.
- Production MVP may ship only the 10 existing demo workflows/document packs: `57`, `161`, `306`, `325`, `477`, `540`, `707`, `782`, `868`, and `924`.

---

## Files To Create Or Modify

- Modify `apps/docai/docai/app.py`: keep `/health` and `/parse`, add production-safe provider selection if needed.
- Modify `apps/docai/docai/pipeline.py`: introduce a model/provider interface instead of hard-wiring CPU OCR/LayoutLM as the only path.
- Create `apps/docai/docai/providers.py`: define `local_cpu`, `hf_endpoint`, or other provider clients behind one parse interface.
- Modify `apps/docai/requirements.txt`: pin deployable backend dependencies and remove unnecessary production downloads when using remote inference.
- Create `apps/docai/railway.toml` or `apps/docai/Procfile`: define Railway start command.
- Create `apps/docai/Dockerfile` if Railway/Nixpacks is too slow or incompatible with OCR dependencies.
- Create `apps/docai/.env.example`: document required backend variables without secrets.
- Modify `apps/web/modules/documents/docai/client.ts`: keep the same client API, make production URL mandatory or clearly diagnosed.
- Modify web API routes importing `cloudflare:workers`: add a runtime-env compatibility layer so Vercel builds succeed.
- Create `apps/web/modules/runtime/env.ts`: expose env vars from Cloudflare Workers when available and `process.env` on Vercel.
- Create `apps/web/db/schema.pg.ts`: Postgres version of the current case/workflow/catalog schema.
- Modify `apps/web/db/index.ts`: select Postgres when `DATABASE_URL` is present, otherwise keep the current D1 path for Cloudflare/local.
- Create `apps/web/db/migrate-postgres.ts` or update Drizzle migration scripts: apply Postgres migrations with `DATABASE_URL`.
- Modify `apps/web/modules/workflow/d1-repository.ts`: rename or wrap as a generic SQL workflow repository, preserving `createD1WorkflowRepository()` temporarily as a compatibility alias.
- Modify `apps/web/modules/cases/store.ts`, `modules/cases/current-case.ts`, `modules/catalog/bootstrap.ts`, and workflow service imports only if the repository factory name changes.
- Create or modify `apps/web/vercel.json`: set framework/build behavior if Vercel cannot infer the app cleanly.
- Create `apps/web/.env.example`: document frontend variables.
- Modify README docs: add exact Railway and Vercel deployment steps.

---

## Task 1: Freeze Current Local Behavior

**Files:**
- Test: `apps/docai/tests/test_pipeline.py`
- Test: `apps/web/tests/unit/documents/docai.test.ts`

**Interfaces:**
- Consumes: existing `/parse` response shape.
- Produces: test evidence that local behavior is unchanged after production changes.

- [ ] Run backend tests from `apps/docai`.

```powershell
cd apps/docai
python -m pytest
```

- [ ] Run web tests that cover document ingestion.

```powershell
cd apps/web
npm run test:unit -- tests/unit/documents/docai.test.ts tests/unit/documents/pack.test.ts
```

- [ ] Record current expected `/parse` response fields: document type, candidates, confidence, evidence, missing/review statuses.

- [ ] Do not change model behavior until these tests pass or the exact current failures are documented.

## Task 2: Add Production Model Provider Abstraction

**Files:**
- Create: `apps/docai/docai/providers.py`
- Modify: `apps/docai/docai/pipeline.py`
- Test: `apps/docai/tests/test_pipeline.py`

**Interfaces:**
- Produces: `parse_document(data: bytes, filename: str | None, content_type: str | None, spec: dict) -> dict`
- Consumes env:
  - `DOCAI_PROVIDER=local_cpu|hf_endpoint`
  - `HF_API_KEY`
  - `HF_ENDPOINT_URL`

- [ ] Extract current EasyOCR/LayoutLM path as provider `local_cpu`.

- [ ] Add provider selection:

```python
provider = os.environ.get("DOCAI_PROVIDER", "local_cpu")
```

- [ ] Add `hf_endpoint` provider that sends OCR/document QA work to a hosted inference endpoint instead of loading large models inside Railway.

- [ ] Keep returned JSON identical to local CPU mode.

- [ ] Add tests that monkeypatch the provider and assert `/parse` still returns the same contract.

## Task 3: Choose Production Model Path

**Recommendation:** Use a hosted inference endpoint for production first, not CPU LayoutLM inside Railway.

**Reasoning:**
- EasyOCR plus LayoutLM on CPU is slow and memory-heavy.
- Railway can run it, but cold starts, model downloads, memory limits, and request timeouts will be painful.
- A hosted inference endpoint keeps Railway as a thin FastAPI orchestrator and makes the backend easier to scale.

**Preferred production options:**
- Option A: Hugging Face Inference Endpoint running a document OCR/document QA model.
- Option B: Cloud OCR plus LLM extraction, for example a managed OCR API followed by Groq/OpenAI structured extraction.
- Option C: Railway GPU, only if available and cost is acceptable.

**Initial choice:** Option A if you want minimum code churn; Option B if accuracy and operational stability matter most.

- [ ] Decide model/provider.
- [ ] Set `DOCAI_PROVIDER` accordingly.
- [ ] Keep `local_cpu` as fallback for localhost.

## Task 4: Make DocAI Railway-Ready

**Files:**
- Create: `apps/docai/railway.toml`
- Modify: `apps/docai/requirements.txt`
- Modify: `apps/docai/run.sh`
- Create: `apps/docai/.env.example`

**Interfaces:**
- Railway start command:

```bash
uvicorn docai.app:app --host 0.0.0.0 --port $PORT
```

- [ ] Add Railway config with root service behavior:

```toml
[deploy]
startCommand = "uvicorn docai.app:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 300
```

- [ ] Add `.env.example`:

```env
DOCAI_PROVIDER=local_cpu
DOCAI_WARM=1
HF_API_KEY=
HF_ENDPOINT_URL=
```

- [ ] If local CPU dependencies fail on Railway, switch to Dockerfile with explicit Python base image and cached model setup.

- [ ] Verify locally:

```powershell
cd apps/docai
uvicorn docai.app:app --host 0.0.0.0 --port 8765
curl http://127.0.0.1:8765/health
```

## Task 5: Deploy DocAI To Railway

**Railway setup:**
- Service name: `uztrade-docai`
- Root directory: `/apps/docai`
- Start command: `uvicorn docai.app:app --host 0.0.0.0 --port $PORT`
- Public domain: generated Railway domain

**Variables:**
- `DOCAI_PROVIDER=hf_endpoint` or chosen provider
- `HF_API_KEY=<secret>`
- `HF_ENDPOINT_URL=<hosted model endpoint>`
- Optional: `DOCAI_WARM=0` if using remote inference

- [ ] Connect repository to Railway.
- [ ] Set service root directory to `/apps/docai`.
- [ ] Add variables in Railway.
- [ ] Generate public domain.
- [ ] Verify:

```bash
curl https://<railway-docai-domain>/health
```

- [ ] Save the Railway backend URL for Vercel as `DOCAI_URL`.

## Task 6: Add Vercel Runtime Compatibility

**Files:**
- Create: `apps/web/modules/runtime/env.ts`
- Modify: each `apps/web/app/api/**/route.ts` that imports `cloudflare:workers`
- Modify: `apps/web/db/index.ts`
- Modify: `apps/web/modules/procedures/registry.ts`

**Interfaces:**
- Produces: `getRuntimeEnv(): Record<string, unknown>`
- Consumes: Cloudflare `env` when available, otherwise `process.env`.

- [ ] Replace static imports:

```ts
import { env } from "cloudflare:workers";
```

with:

```ts
import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
```

- [ ] Make `getRuntimeEnv()` avoid static `cloudflare:workers` imports so `next build` on Vercel can typecheck.

- [ ] For D1/R2-only features, return clear errors on Vercel until a Vercel-compatible DB/storage path is added.

## Task 7: Replace D1 Persistence With Postgres For Vercel

**Current state:** The web app uses Cloudflare D1 and R2 bindings for cases/workflows/uploads. The database schema is currently declared with `drizzle-orm/sqlite-core` in `apps/web/db/schema.ts`, and the workflow repository uses D1-specific batching and migrations. Vercel does not provide Cloudflare D1 bindings, so Vercel production needs Postgres.

**Chosen production path:** Use managed Postgres, preferably Neon through Vercel Marketplace because it auto-provisions and injects Vercel environment variables. Use `@neondatabase/serverless` with `drizzle-orm/neon-http`.

**Packages:**

```bash
npm install @neondatabase/serverless
```

**Environment variables:**

```env
DATABASE_URL=postgres://...
DB_PROVIDER=postgres
```

**Files:**
- Create: `apps/web/db/schema.pg.ts`
- Create: `apps/web/db/postgres.ts`
- Modify: `apps/web/db/index.ts`
- Modify: `apps/web/drizzle.config.ts`
- Modify: `apps/web/modules/workflow/d1-repository.ts`
- Test: `apps/web/tests/unit/workflow/orchestrator.test.ts`
- Test: `apps/web/tests/unit/cases/block-progress.test.ts`

**Interfaces:**
- Produces: `getDb()` returns a Drizzle database backed by Postgres on Vercel and D1 in Cloudflare/local-D1 mode.
- Produces: `createWorkflowRepository()` as the platform-neutral repository factory.
- Keeps: `createD1WorkflowRepository()` as an alias during migration so existing imports do not all need to change in one pass.

- [ ] Convert `apps/web/db/schema.ts` to a shared table model or create `schema.pg.ts` using `pgTable`, `text`, `integer`, `real`, `boolean`, `timestamp`, `serial`, `index`, and `uniqueIndex`.

- [ ] Preserve the table and column names exactly:

```text
cases
case_blocks
users
entities
procedure_versions
workflow_runs
workflow_nodes
workflow_edges
work_items
agent_runs
artifacts
audit_events
```

- [ ] Convert SQLite booleans:

```ts
// D1/SQLite
integer("optional", { mode: "boolean" }).notNull().default(false)

// Postgres
boolean("optional").notNull().default(false)
```

- [ ] Convert autoincrement IDs:

```ts
// D1/SQLite
id: integer("id").primaryKey({ autoIncrement: true })

// Postgres
id: serial("id").primaryKey()
```

- [ ] Convert timestamp defaults:

```ts
createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow()
```

- [ ] Add lazy Postgres DB initialization so `next build` does not crash before Vercel env vars are present:

```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.pg";

let postgresDb: ReturnType<typeof createPostgresDb> | null = null;

function createPostgresDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required when DB_PROVIDER=postgres");
  return drizzle(neon(url), { schema });
}

export function getPostgresDb() {
  postgresDb ??= createPostgresDb();
  return postgresDb;
}
```

- [ ] Update `getDb()` to choose by environment:

```ts
export function getDb() {
  if (process.env.DB_PROVIDER === "postgres" || process.env.DATABASE_URL) {
    return getPostgresDb();
  }
  return getD1Db();
}
```

- [ ] Replace `ensureSchema()` in production with real Drizzle migrations. Keep D1 `ensureSchema()` only for local/Cloudflare D1 because runtime self-migration is not the right Postgres production behavior.

- [ ] Generate Postgres migrations in a separate directory, for example `drizzle-postgres/`, so D1 migrations remain untouched:

```bash
npx drizzle-kit generate --config drizzle.postgres.config.ts
```

- [ ] Add a deploy-time migration command for Vercel, either manually run before production deploy or as a controlled script:

```bash
npx drizzle-kit migrate --config drizzle.postgres.config.ts
```

- [ ] Update repository code only where D1-specific assumptions exist:
  - remove or bypass `chunkForD1` limits for Postgres inserts;
  - keep JSON serialization format unchanged for API compatibility;
  - keep ISO timestamp parsing compatible with both D1 strings and Postgres timestamp strings.

- [ ] Run:

```powershell
cd apps/web
npx next build
npm run test:unit
```

- [ ] Verify a real Postgres-backed flow:
  - create case;
  - list cases;
  - run workflow;
  - complete work item;
  - reload case page.

## Task 7.5: Replace R2 Document Storage For Vercel

**Current state:** Database persistence can move to Postgres, but uploaded original documents currently use Cloudflare R2 through the `DOCS` binding. Postgres should not store 15 MB document files directly.

**Chosen production path:** Use Vercel Blob or S3-compatible storage for uploaded document originals, and store file metadata/blob URL in Postgres.

**Recommendation:** Use Vercel Blob for the first Vercel deployment unless you already have S3/R2 requirements.

**Packages:**

```bash
npm install @vercel/blob
```

**Environment variables:**

```env
BLOB_READ_WRITE_TOKEN=
DOC_STORAGE_PROVIDER=vercel_blob
```

- [ ] Create `apps/web/modules/documents/storage.ts` with provider methods:

```ts
export interface DocumentStorage {
  putOriginal(key: string, file: File | Blob | ArrayBuffer, contentType?: string): Promise<{ key: string; url?: string }>;
  getOriginal(key: string): Promise<Response | null>;
  deleteOriginal(key: string): Promise<void>;
}
```

- [ ] Implement `r2` provider for current Cloudflare deployment.

- [ ] Implement `vercel_blob` provider for Vercel.

- [ ] Keep the document API route behavior the same from the browser’s point of view.

## Task 8: Make Web Vercel-Ready

**Files:**
- Create: `apps/web/vercel.json`
- Create: `apps/web/.env.example`
- Modify: `apps/web/package.json` only if needed.

**Vercel project settings:**
- Root directory: `apps/web`
- Framework preset: Next.js
- Install command: `npm install`
- Build command: `npm run build` after Vercel compatibility is complete
- Node.js: compatible with package engine, `>=22.13.0`

**Variables:**

```env
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
DOCAI_URL=https://<railway-docai-domain>
```

**MVP workflow corpus:**
- Keep the initial Vercel deployment focused on the existing 10 demo scenarios and document folders:

```text
57, 161, 306, 325, 477, 540, 707, 782, 868, 924
```

- Do not require all 243 public procedure JSON files to be production-validated before the first deployment.

- [ ] Run:

```powershell
cd apps/web
npx next build
```

- [ ] Fix all build failures.
- [ ] Deploy preview:

```bash
vercel deploy --cwd apps/web
```

- [ ] Test preview against Railway backend.
- [ ] Deploy production:

```bash
vercel deploy --cwd apps/web --prod
```

## Task 9: End-To-End Verification

**Checks:**
- [ ] Vercel homepage loads.
- [ ] Procedure pages load.
- [ ] Intake creates or simulates a case according to chosen persistence path.
- [ ] Document upload calls Railway `DOCAI_URL`.
- [ ] Railway `/health` returns healthy.
- [ ] Railway `/parse` handles one sample image.
- [ ] Vercel logs have no runtime errors during the tested flow.
- [ ] Railway logs show the `/parse` request.

## Task 10: Documentation And Operational Notes

**Files:**
- Modify: `apps/docai/README.md`
- Modify: `apps/web/README.md`
- Modify: root deployment notes if present.

- [ ] Document local mode:

```env
DOCAI_URL=http://127.0.0.1:8765
DOCAI_PROVIDER=local_cpu
```

- [ ] Document production mode:

```env
DOCAI_URL=https://<railway-docai-domain>
DOCAI_PROVIDER=hf_endpoint
```

- [ ] Document how to rotate keys in Railway and Vercel.
- [ ] Document how to rollback Vercel and Railway deployments.

## Self-Review

- Spec coverage: model productionization, Railway backend, Vercel frontend, and localhost consistency are all covered.
- Placeholder scan: no task depends on an undefined provider without defining its env contract.
- Type consistency: all runtime env uses flow through `getRuntimeEnv()`; DocAI provider contract remains `/parse` compatible.
