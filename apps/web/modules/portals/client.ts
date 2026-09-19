/* How the agent reaches the entity APIs (apps/portals). One client per
 * request, built from the worker's environment; tests hand it a fetch that
 * calls the portal app in-process. */

import { llmFromEnv, type LlmClient, type LlmEnv } from "../ai/llm";
import type { PortalApplication, PortalEntityId, PortalFlag, PortalRejection, PortalService } from "./contract";

export const PORTALS_URL_DEFAULT = "http://127.0.0.1:8790";

/** The sandbox's development keys - used when the environment sets none. */
const DEV_KEYS: Record<PortalEntityId, string> = {
  "single-window": "sw-dev-key",
  railway: "rw-dev-key",
  customs: "cu-dev-key",
  "assalom-agro": "aa-dev-key",
  expertiza: "ue-dev-key",
  payments: "pg-dev-key",
  "e-tranzit": "et-dev-key",
  sanitary: "se-dev-key",
  medicines: "md-dev-key",
  ecology: "ec-dev-key",
  "cargo-agent": "ca-dev-key",
  edocs: "ed-dev-key",
};

export type PortalClient = {
  baseUrl: string;
  keys: Record<PortalEntityId, string>;
  fetch: typeof fetch;
  timeoutMs: number;
  schemas: Map<string, PortalService>;
  /** The model the agent may use to explain an entity's answer and rank HS codes (modules/ai/llm.ts rules apply). */
  llm?: LlmClient;
};

/** The entity could not be reached - the agent falls back to simulating the step. */
export class PortalUnavailable extends Error {}

/** What the entity said about one filing. */
export type PortalDecision =
  | { status: "rejected"; application: null | { id: string; reference: string }; flags: PortalFlag[]; message: string }
  | { status: PortalApplication["status"]; application: PortalApplication; flags: PortalFlag[]; message: string };

export function createPortalClient(
  options: { baseUrl?: string; keys?: Partial<Record<PortalEntityId, string>>; fetch?: typeof fetch; timeoutMs?: number; llm?: LlmClient } = {},
): PortalClient {
  return {
    baseUrl: (options.baseUrl ?? PORTALS_URL_DEFAULT).replace(/\/+$/, ""),
    keys: { ...DEV_KEYS, ...Object.fromEntries(Object.entries(options.keys ?? {}).filter(([, v]) => v)) } as Record<PortalEntityId, string>,
    fetch: options.fetch ?? ((input, init) => fetch(input, init)),
    timeoutMs: options.timeoutMs ?? 8000,
    schemas: new Map(),
    llm: options.llm,
  };
}

export type PortalEnv = LlmEnv & {
  PORTALS_URL?: string;
  /** "1" turns the entity APIs off: agent steps are simulated as before. */
  PORTALS_DISABLED?: string;
  PORTAL_KEY_SINGLE_WINDOW?: string;
  PORTAL_KEY_RAILWAY?: string;
  PORTAL_KEY_CUSTOMS?: string;
  PORTAL_KEY_ASSALOM_AGRO?: string;
  PORTAL_KEY_EXPERTIZA?: string;
  PORTAL_KEY_PAYMENTS?: string;
  PORTAL_KEY_E_TRANZIT?: string;
  PORTAL_KEY_SANITARY?: string;
  PORTAL_KEY_MEDICINES?: string;
  PORTAL_KEY_ECOLOGY?: string;
  PORTAL_KEY_CARGO_AGENT?: string;
  PORTAL_KEY_EDOCS?: string;
};

export function portalsFromEnv(env: PortalEnv): PortalClient | undefined {
  if (env.PORTALS_DISABLED === "1") return undefined;
  return createPortalClient({
    baseUrl: env.PORTALS_URL || PORTALS_URL_DEFAULT,
    keys: {
      "single-window": env.PORTAL_KEY_SINGLE_WINDOW,
      railway: env.PORTAL_KEY_RAILWAY,
      customs: env.PORTAL_KEY_CUSTOMS,
      "assalom-agro": env.PORTAL_KEY_ASSALOM_AGRO,
      expertiza: env.PORTAL_KEY_EXPERTIZA,
      payments: env.PORTAL_KEY_PAYMENTS,
      "e-tranzit": env.PORTAL_KEY_E_TRANZIT,
      sanitary: env.PORTAL_KEY_SANITARY,
      medicines: env.PORTAL_KEY_MEDICINES,
      ecology: env.PORTAL_KEY_ECOLOGY,
      "cargo-agent": env.PORTAL_KEY_CARGO_AGENT,
      edocs: env.PORTAL_KEY_EDOCS,
    },
    llm: llmFromEnv(env),
  });
}

async function call(client: PortalClient, entity: PortalEntityId, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  let response: Response;
  try {
    response = await client.fetch(`${client.baseUrl}/${entity}/v1${path}`, {
      method,
      headers: { "content-type": "application/json", "x-api-key": client.keys[entity], ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(client.timeoutMs),
    });
  } catch (error) {
    throw new PortalUnavailable(`${entity} API unreachable at ${client.baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    /* an empty or non-JSON body is judged by the status alone */
  }
  if (response.status >= 500 || response.status === 401) {
    throw new PortalUnavailable(`${entity} API answered ${response.status}: ${(parsed as { error?: string } | null)?.error ?? response.statusText}`);
  }
  return { status: response.status, body: parsed as Record<string, unknown> };
}

function decision(status: number, body: Record<string, unknown>): PortalDecision {
  if (status === 422) {
    const r = body as unknown as PortalRejection;
    return {
      status: "rejected",
      application: r.id && r.reference ? { id: r.id, reference: r.reference } : null,
      flags: [...(r.missing ?? []), ...(r.invalid ?? [])],
      message: r.message,
    };
  }
  if (status >= 400) throw new PortalUnavailable(String(body?.error ?? `The entity answered ${status}`));
  const application = body as unknown as PortalApplication;
  return { status: application.status, application, flags: application.changes ?? [], message: "" };
}

/** A service's published fields, read once per client. */
export async function portalService(client: PortalClient, entity: PortalEntityId, service: string): Promise<PortalService> {
  const key = `${entity}/${service}`;
  const cached = client.schemas.get(key);
  if (cached) return cached;
  const { status, body } = await call(client, entity, "GET", `/services/${service}`);
  if (status !== 200) throw new PortalUnavailable(`${entity} has no service ${service} (${status})`);
  client.schemas.set(key, body as unknown as PortalService);
  return body as unknown as PortalService;
}

export type PortalCheck = { ok: boolean; missing: PortalFlag[]; invalid: PortalFlag[] };

/** The entity's form check with nothing filed - what it would say about this form today. */
export async function validateApplication(client: PortalClient, entity: PortalEntityId, service: string, fields: Record<string, string>): Promise<PortalCheck> {
  const { status, body } = await call(client, entity, "POST", `/services/${service}/validate`, { fields });
  if (status !== 200) throw new PortalUnavailable(`${entity} could not check ${service} (${status})`);
  const checked = body as unknown as PortalCheck;
  return { ok: Boolean(checked.ok), missing: checked.missing ?? [], invalid: checked.invalid ?? [] };
}

export async function submitApplication(client: PortalClient, entity: PortalEntityId, service: string, fields: Record<string, string>, caseRef: string, idempotencyKey: string) {
  const { status, body } = await call(client, entity, "POST", "/applications", { service, fields, caseRef }, { "idempotency-key": idempotencyKey });
  return decision(status, body);
}

export async function getApplication(client: PortalClient, entity: PortalEntityId, id: string): Promise<PortalDecision> {
  const { status, body } = await call(client, entity, "GET", `/applications/${id}`);
  if (status === 404) return { status: "rejected", application: null, flags: [], message: "The entity has no record of the application — it is filed again" };
  return decision(status, body);
}

export async function amendApplication(client: PortalClient, entity: PortalEntityId, id: string, fields: Record<string, string>) {
  const { status, body } = await call(client, entity, "PATCH", `/applications/${id}`, { fields });
  if (status === 404) return { status: "rejected", application: null, flags: [], message: "The entity has no record of the application — it is filed again" } satisfies PortalDecision;
  if (status === 409) return getApplication(client, entity, id);
  return decision(status, body);
}
