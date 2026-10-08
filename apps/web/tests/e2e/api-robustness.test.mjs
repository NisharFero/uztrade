import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const BASE = process.env.UZTRADE_URL ?? "http://localhost:3000";
const API = path.resolve("app/api");
const TIMEOUT = 60_000;
const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

async function files(dir) {
  return (await readdir(dir, { withFileTypes: true })).flatMap((entry) =>
    entry.isDirectory() ? [] : entry.name === "route.ts" ? [path.join(dir, entry.name)] : [],
  );
}

async function routes(dir = API) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? routes(path.join(dir, entry.name)) : []));
  return [...await files(dir), ...nested.flat()];
}

function routePath(file, ids, unknown = false) {
  let route = file.slice(API.length).replaceAll("\\", "/").replace(/\/route\.ts$/, "");
  const values = route.startsWith("/cases/") ? [unknown ? "UZ-0000-0000" : ids.caseId, unknown ? "missing-doc" : ids.docId]
    : route.startsWith("/workflows/") ? [unknown ? "unknown-run" : ids.runId]
    : route.startsWith("/work-items/") ? [unknown ? "unknown-work-item" : ids.workItemId]
    : route.startsWith("/users/") ? [unknown ? "unknown-user" : ids.userId]
    : route.startsWith("/entities/") ? [unknown ? "unknown-entity" : ids.entityId, unknown ? "unknown-work-item" : ids.entityWorkItemId]
    : route.startsWith("/procedures/") ? [unknown ? "UZ-0000-0000" : "868"] : [];
  let index = 0;
  route = route.replace(/\[[^\]]+\]/g, () => encodeURIComponent(values[index++] ?? "unknown"));
  return `/api${route || ""}`;
}

function validBody(route, method, ids) {
  if (method === "DELETE") return undefined;
  if (route === "/api/chat") return { message: "Who issues the phytosanitary certificate for tea?", presentation: "cards" };
  if (route === "/api/query" || route === "/api/cases") return { query: "Export 20 tonnes of tea from Tashkent to Almaty by train" };
  if (route === "/api/intake") return { message: "I want to export dried apricots" };
  if (route === "/api/intake/plan") return { message: "Export 20 tonnes of tea from Tashkent to Almaty by train" };
  if (route === "/api/faq/answer") return { question: "Who issues the phytosanitary certificate for tea?" };
  if (route === "/api/users") return { displayName: "API Test User", email: `api-${Date.now()}@example.test`, role: "trader", capabilities: [] };
  if (route === "/api/entities") return { canonicalName: `API Test Entity ${Date.now()}`, type: "other", capabilities: [], contact: {} };
  if (route === "/api/procedures") return { definition: { ...ids.procedureDefinition, id: `test-${Date.now()}`, title: "API robustness test procedure" } };
  if (/\/assistant\/question$/.test(route)) return { question: "What is needed next?" };
  if (/\/assistant$/.test(route)) return { action: "ask", question: "What is needed next?" };
  if (/\/note$/.test(route)) return { note: "API robustness test note" };
  if (/\/complete$/.test(route)) return { completedBy: "usr-trader", result: { confirmed: true } };
  if (/\/mock-documents$/.test(route)) return { stepNum: 0, label: "Test document" };
  if (/\/submit$/.test(route)) return { status: "accepted" };
  if (/\/procedures\/868$/.test(route) && method === "PATCH") return { status: "published" };
  if (/\/users\//.test(route) && method === "PATCH") return { displayName: "API Test User" };
  if (/\/entities\//.test(route) && method === "PATCH") return { canonicalName: `API Test Entity ${Date.now()}` };
  if (/\/cases\//.test(route) && method === "PATCH") return { blockId: ids.blockId };
  return {};
}

async function call(url, method, body, raw = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${TIMEOUT} ms`)), TIMEOUT);
  try {
    const response = await fetch(`${BASE}${url}`, {
      method,
      headers: MUTATING.has(method) ? { "content-type": "application/json" } : undefined,
      body: MUTATING.has(method) ? raw ? body : JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    assert.notEqual(response.status >= 500, true, `${method} ${url} returned ${response.status}: ${text.slice(0, 500)}`);
    if (response.status >= 400) {
      assert.match(response.headers.get("content-type") ?? "", /json/i, `${method} ${url} returned a non-JSON error page`);
      const parsed = JSON.parse(text);
      assert.equal(typeof parsed.error, "string", `${method} ${url} error response lacks {error}`);
    }
    return response.status;
  } finally {
    clearTimeout(timer);
  }
}

test("all 34 API routes reject bad input without 500, HTML, or hangs", { timeout: 20 * 60_000 }, async (t) => {
  const routeFiles = (await routes()).sort();
  assert.equal(routeFiles.length, 34);

  const [caseData, userData, entityData, itemData, procedureDefinition] = await Promise.all([
    fetch(`${BASE}/api/cases`).then((r) => r.json()),
    fetch(`${BASE}/api/users`).then((r) => r.json()),
    fetch(`${BASE}/api/entities`).then((r) => r.json()),
    fetch(`${BASE}/api/work-items`).then((r) => r.json()),
    fetch(`${BASE}/data/procedures/868.json`).then((r) => r.json()),
  ]);
  const foundCase = caseData.cases?.[0];
  const item = itemData.workItems?.[0];
  assert(foundCase && userData.users?.[0] && entityData.entities?.[0] && item, "Seeded test data is required");
  const ids = {
    caseId: foundCase.id,
    runId: foundCase.workflowRunId,
    blockId: foundCase.blocks?.[0]?.blockId ?? "b1",
    userId: userData.users[0].id,
    entityId: entityData.entities[0].id,
    workItemId: item.id,
    entityWorkItemId: item.id,
    docId: "missing-doc",
    procedureDefinition,
  };

  for (const file of routeFiles) {
    const source = await readFile(file, "utf8");
    const methods = [...source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((match) => match[1]);
    assert(methods.length, `${file} exports no HTTP method`);
    for (const method of methods) {
      const url = routePath(file, ids);
      await t.test(`${method} ${url}`, async (routeTest) => {
        if (url === "/api/admin/reset") return routeTest.skip("destructive reset is skipped outside an explicitly throwaway database");
        const valid = validBody(url, method, ids);
        const status = await call(url, method, valid);
        assert(status >= 200 && status < 500);

        if (MUTATING.has(method) && method !== "DELETE") {
          for (const variant of [
            ["missing body", undefined, true],
            ["malformed JSON", "{", true],
            ["wrong types", { unexpected: 42 }, false],
            ["oversize input", { unexpected: "x".repeat(1024 * 1024 + 1) }, false],
          ]) {
            await routeTest.test(variant[0], async () => {
              const invalidStatus = await call(url, method, variant[1], variant[2]);
              const bodylessAction = /\/workflows\/[^/]+\/run$/.test(url);
              assert(bodylessAction ? invalidStatus < 500 : invalidStatus >= 400 && invalidStatus < 500, `${variant[0]} returned ${invalidStatus}`);
            });
          }
        }

        if (/\[[^\]]+\]/.test(file.slice(API.length))) {
          const unknown = routePath(file, ids, true);
          const unknownStatus = await call(unknown, method, validBody(unknown, method, ids));
          assert(unknownStatus >= 400 && unknownStatus < 500, `unknown id returned ${unknownStatus}`);
        }
      });
    }
  }
});
