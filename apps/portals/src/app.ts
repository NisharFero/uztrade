/* The entity APIs as one fetch handler: GET/POST/PATCH on Web Requests, so the
 * same code runs behind node:http (server.ts) and inside tests.
 *
 *   GET   /entities                                   every entity and its services
 *   GET   /{entity}/v1/services[/{service}]           published field schemas
 *   POST  /{entity}/v1/applications                   file: 201 under review | 422 missing/invalid
 *   GET   /{entity}/v1/applications[?caseRef=]        the applicant's applications
 *   GET   /{entity}/v1/applications/{id}              status: under review → approved | changes requested
 *   PATCH /{entity}/v1/applications/{id}              amend and resubmit
 *   POST  /{entity}/v1/applications/{id}/decision     an officer approves or requests changes
 *   GET   /                                           officer console (sandbox)
 *
 * Applications need the entity's key in x-api-key; an Idempotency-Key header
 * makes a repeated POST return the application it already created. */

import type { Application, ApplicationStatus, EntityDef, Flag, ReviewContext, ServiceDef } from "./contract.ts";
import { consolePage } from "./console.ts";
import { ENTITIES, entityById } from "./entities/index.ts";
import { createStore, type Store } from "./store.ts";
import { checkApplication, publicService, reviewApplication } from "./validate.ts";

export type PortalAppOptions = {
  store?: Store;
  /** How long an accepted application waits before the reviewer decides. */
  reviewMs?: number;
  now?: () => Date;
  /** API key per entity id; an entity without one accepts its development key. */
  keys?: Record<string, string | undefined>;
};

class BadRequest extends Error {}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const problem = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

async function objectBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new BadRequest("A JSON object body is required");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequest("A JSON object body is required");
  return body as Record<string, unknown>;
}

const fieldsOf = (body: Record<string, unknown>) =>
  body.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? (body.fields as Record<string, unknown>) : {};

export function createPortalApp(options: PortalAppOptions = {}) {
  const store = options.store ?? createStore();
  const reviewMs = options.reviewMs ?? 4000;
  const now = options.now ?? (() => new Date());
  const context = (): ReviewContext => ({ now: now(), find: (reference) => store.byReference(reference), all: () => store.list() });
  const keyOf = (entity: EntityDef) => options.keys?.[entity.id] || entity.devKey;
  const serviceOf = (entity: EntityDef, id: string) => entity.services.find((service) => service.id === id);

  const record = (app: Application, status: ApplicationStatus, by: "applicant" | "rules" | "officer", note: string, patch: Partial<Application> = {}): Application => {
    const at = now().toISOString();
    const next = { ...app, ...patch, status, updatedAt: at };
    return { ...next, history: [...app.history, { at, status, revision: next.revision, by, note }] };
  };

  /** The reviewer's turn: once the review time has passed, the entity's rules decide. */
  function settle(app: Application): Application {
    if (app.status !== "under_review" || now().getTime() - Date.parse(app.submittedAt) < reviewMs) return app;
    const service = serviceOf(entityById(app.entity)!, app.service)!;
    const ctx = context();
    const changes = reviewApplication(service, app.fields, ctx);
    const next = changes.length
      ? record(app, "changes_requested", "rules", changes.map((c) => `${c.label}: ${c.reason}`).join("; "), { changes })
      : record(app, "approved", "rules", "Approved", { changes: [], outputs: service.issue(app, ctx) });
    store.save(next);
    return next;
  }

  const view = (app: Application) => {
    const entity = entityById(app.entity)!;
    return {
      ...app,
      entityName: entity.name,
      serviceTitle: serviceOf(entity, app.service)?.title ?? app.service,
      reviewDueAt: app.status === "under_review" ? new Date(Date.parse(app.submittedAt) + reviewMs).toISOString() : null,
    };
  };

  const rejected = (entity: EntityDef, service: ServiceDef, missing: Flag[], invalid: Flag[], extra: Record<string, unknown> = {}) =>
    json(
      {
        status: "rejected",
        entity: entity.id,
        service: service.id,
        message: `${entity.name} did not accept the application: ${[missing.length ? `${missing.length} missing` : "", invalid.length ? `${invalid.length} invalid` : ""].filter(Boolean).join(", ")}`,
        missing,
        invalid,
        ...extra,
      },
      422,
    );

  async function submit(entity: EntityDef, request: Request) {
    const body = await objectBody(request);
    const service = serviceOf(entity, String(body.service ?? ""));
    if (!service) return problem(404, `${entity.name} has no service “${String(body.service ?? "")}”`, { services: entity.services.map((s) => s.id) });
    const key = request.headers.get("idempotency-key");
    const repeat = key ? store.byIdempotencyKey(entity.id, key) : undefined;
    if (repeat) return json(view(settle(repeat)), 200);

    const checked = checkApplication(service, fieldsOf(body), context());
    if (checked.missing.length || checked.invalid.length) return rejected(entity, service, checked.missing, checked.invalid);

    const at = now().toISOString();
    const app: Application = {
      id: crypto.randomUUID(),
      reference: `${entity.prefix}-${now().getUTCFullYear()}-${String(store.next(entity.prefix)).padStart(6, "0")}`,
      entity: entity.id,
      service: service.id,
      status: "under_review",
      revision: 1,
      fields: checked.fields,
      changes: [],
      outputs: {},
      caseRef: typeof body.caseRef === "string" ? body.caseRef : null,
      idempotencyKey: key,
      submittedAt: at,
      updatedAt: at,
      history: [{ at, status: "under_review", revision: 1, by: "applicant", note: "Submitted" }],
    };
    store.save(app);
    return json(view(app), 201);
  }

  async function amend(entity: EntityDef, app: Application, request: Request) {
    if (app.status === "approved") return problem(409, `${app.reference} is already approved`);
    const service = serviceOf(entity, app.service)!;
    const merged = { ...app.fields, ...fieldsOf(await objectBody(request)) };
    const checked = checkApplication(service, merged, context());
    if (checked.missing.length || checked.invalid.length) {
      return rejected(entity, service, checked.missing, checked.invalid, { id: app.id, reference: app.reference, currentStatus: app.status });
    }
    const changed = Object.keys(checked.fields).filter((k) => checked.fields[k] !== app.fields[k]);
    const next = record(app, "under_review", "applicant", changed.length ? `Amended ${changed.join(", ")}` : "Resubmitted unchanged", {
      fields: checked.fields,
      revision: app.revision + 1,
      changes: [],
      submittedAt: now().toISOString(),
    });
    store.save(next);
    return json(view(next));
  }

  async function decide(entity: EntityDef, app: Application, request: Request) {
    if (app.status === "approved") return problem(409, `${app.reference} is already approved`);
    const body = await objectBody(request);
    const service = serviceOf(entity, app.service)!;
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    let next: Application;
    if (body.decision === "approve") {
      next = record(app, "approved", "officer", note ?? "Approved by officer", { changes: [], outputs: service.issue(app, context()) });
    } else if (body.decision === "request_changes") {
      const asked = Array.isArray(body.changes) ? (body.changes as { field?: unknown; reason?: unknown }[]) : [];
      const changes: Flag[] = asked.flatMap((item) => {
        const field = service.fields.find((f) => f.key === item?.field);
        return field ? [{ field: field.key, label: field.label, kind: "change" as const, reason: String(item.reason ?? "Please correct this field"), value: app.fields[field.key] ?? null }] : [];
      });
      if (!changes.length) return problem(400, "request_changes needs changes: [{ field, reason }] naming this service's fields", { fields: service.fields.map((f) => f.key) });
      next = record(app, "changes_requested", "officer", note ?? changes.map((c) => `${c.label}: ${c.reason}`).join("; "), { changes });
    } else {
      return problem(400, 'decision must be "approve" or "request_changes"');
    }
    store.save(next);
    return json(view(next));
  }

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const method = request.method.toUpperCase();
    try {
      if (!parts.length) {
        const entities = ENTITIES.map((e) => ({ id: e.id, name: e.name, site: e.site, key: keyOf(e) === e.devKey ? e.devKey : null }));
        return new Response(consolePage(entities, reviewMs), { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      if (parts[0] === "health") return json({ ok: true, entities: ENTITIES.map((e) => e.id), reviewMs });
      if (parts[0] === "entities" && parts.length === 1) {
        return json({
          entities: ENTITIES.map((e) => ({ id: e.id, name: e.name, site: e.site, services: e.services.map((s) => ({ id: s.id, title: s.title, kind: s.kind })) })),
        });
      }
      if (parts[0] === "registry" && parts.length === 1) {
        return json({ applications: store.list().map(settle).map(view).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
      }

      const entity = entityById(parts[0]);
      if (!entity || parts[1] !== "v1") return problem(404, "Not found");
      const [, , resource, id, action, ...rest] = parts;
      if (rest.length) return problem(404, "Not found");

      if (resource === "services") {
        if (action && action !== "validate") return problem(404, "Not found");
        if (action === "validate") {
          // A dry run: the same form check as filing, with nothing registered.
          if (method !== "POST") return problem(405, "Method not allowed");
          if (request.headers.get("x-api-key") !== keyOf(entity)) return problem(401, `A valid x-api-key for ${entity.name} is required`);
          const service = serviceOf(entity, id);
          if (!service) return problem(404, `${entity.name} has no service “${id}”`);
          const checked = checkApplication(service, fieldsOf(await objectBody(request)), context());
          return json({ ok: !checked.missing.length && !checked.invalid.length, entity: entity.id, service: service.id, missing: checked.missing, invalid: checked.invalid });
        }
        if (method !== "GET") return problem(405, "Method not allowed");
        if (!id) return json({ entity: entity.id, name: entity.name, site: entity.site, services: entity.services.map((s) => publicService(entity, s)) });
        const service = serviceOf(entity, id);
        return service ? json(publicService(entity, service)) : problem(404, `${entity.name} has no service “${id}”`);
      }
      if (resource !== "applications") return problem(404, "Not found");
      if (request.headers.get("x-api-key") !== keyOf(entity)) return problem(401, `A valid x-api-key for ${entity.name} is required`);

      if (!id) {
        if (method === "POST") return await submit(entity, request);
        if (method !== "GET") return problem(405, "Method not allowed");
        const caseRef = url.searchParams.get("caseRef");
        return json({ applications: store.list().filter((a) => a.entity === entity.id && (!caseRef || a.caseRef === caseRef)).map(settle).map(view) });
      }

      const app = store.get(id);
      if (!app || app.entity !== entity.id) return problem(404, `${entity.name} has no application ${id}`);
      if (action === "decision") return method === "POST" ? await decide(entity, settle(app), request) : problem(405, "Method not allowed");
      if (action) return problem(404, "Not found");
      if (method === "GET") return json(view(settle(app)));
      if (method === "PATCH") return await amend(entity, settle(app), request);
      return problem(405, "Method not allowed");
    } catch (error) {
      if (error instanceof BadRequest) return problem(400, error.message);
      return problem(500, error instanceof Error ? error.message : "Internal error");
    }
  };
}
