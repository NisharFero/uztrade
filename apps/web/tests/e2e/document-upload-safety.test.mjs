import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BASE = process.env.UZTRADE_URL ?? "http://localhost:3000";
const TIMEOUT = 60_000;

async function caseId() {
  const listed = await fetch(`${BASE}/api/cases`).then((response) => response.json());
  const existing = listed.cases?.find((entry) => entry.procedureId === "868");
  if (existing) return existing.id;
  const opened = await fetch(`${BASE}/api/cases`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "Export 60 tonnes of tea from Tashkent to Moscow by train" }) }).then((response) => response.json());
  assert(opened.case?.id);
  return opened.case.id;
}

async function upload(id, file, label = "Commercial invoice") {
  const form = new FormData();
  form.append("file", file);
  form.append("stepNum", "1");
  form.append("label", label);
  const response = await fetch(`${BASE}/api/cases/${id}/documents`, { method: "POST", body: form, signal: AbortSignal.timeout(TIMEOUT) });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { error: text }; }
  assert(response.status < 500, text);
  if (!response.ok) assert.equal(typeof body.error, "string");
  return { response, body };
}

test("document upload rejects empty, oversized and unsupported files clearly", { timeout: 90_000 }, async () => {
  const id = await caseId();
  const empty = await upload(id, new File([], "empty.png", { type: "image/png" }));
  assert.equal(empty.response.status, 400);
  assert.match(empty.body.error, /empty/i);

  const unsupported = await upload(id, new File(["hello"], "notes.txt", { type: "text/plain" }));
  assert.equal(unsupported.response.status, 415);
  assert.match(unsupported.body.error, /PNG|JPEG|WebP|PDF/);

  const oversized = await upload(id, new File([new Uint8Array(15 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }));
  assert.equal(oversized.response.status, 413);
  assert.match(oversized.body.error, /15 MB|Payload Too Large/i);
});

test("unreadable and wrong-type images return a reviewable result, never a crash", { timeout: 2 * TIMEOUT }, async () => {
  const id = await caseId();
  const unreadable = await upload(id, new File([new Uint8Array([1, 2, 3, 4])], "unreadable.png", { type: "image/png" }));
  assert(unreadable.response.status === 201 || unreadable.response.status === 422);
  assert(unreadable.body.document?.parseError || unreadable.body.error, "Unreadable file lacks a clear message");

  const invoice = await readFile("public/demo/868/21-commercial-invoice.png");
  const wrong = await upload(id, new File([invoice], "21-commercial-invoice.png", { type: "image/png" }), "Passport");
  assert(wrong.response.status === 201 || wrong.response.status === 422);
  const record = wrong.body.document;
  assert(record?.parseError || (record?.detectedType && record.detectedType !== record.docType) || record?.fields?.some((field) => field.status === "missing" || field.status === "review"), "Wrong document type was not identified or sent to review");
});
