import assert from "node:assert/strict";
import test from "node:test";
import { createPortalApp } from "../src/app.ts";
import { createStore } from "../src/store.ts";

type Call = (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: any }>;

/** A portal with its own registry and a clock the test moves. */
function portal(reviewMs = 0): { call: Call; tick: (ms: number) => void } {
  let clock = Date.parse("2026-09-15T08:00:00Z");
  const handle = createPortalApp({ store: createStore(), reviewMs, now: () => new Date(clock) });
  const call: Call = async (method, path, body, headers = {}) => {
    const response = await handle(
      new Request(`http://portal${path}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }),
    );
    return { status: response.status, body: await response.json() };
  };
  return { call, tick: (ms) => (clock += ms) };
}

const RW = { "x-api-key": "rw-dev-key" };
const CU = { "x-api-key": "cu-dev-key" };

const costCalculation = {
  "applicant.inn": "301 234 567",
  "applicant.name": "Silk Road Tea LLC",
  "shipment.departure_station": "Tashkent",
  "shipment.destination_station": "Urumqi",
  "goods.name": "Black tea",
  "goods.hs_code": "0902",
  "goods.weight_t": "20",
  "shipment.wagons": "1",
  "shipment.wagon_type": "covered wagon",
};

test("every entity publishes its services and the fields each asks for", async () => {
  const { call } = portal();
  const entities = await call("GET", "/entities");
  assert.deepEqual(entities.body.entities.map((e: { id: string }) => e.id), ["single-window", "railway", "customs", "assalom-agro", "expertiza", "payments", "e-tranzit", "sanitary", "medicines", "ecology", "cargo-agent", "edocs"]);

  const declaration = await call("GET", "/customs/v1/services/declaration");
  assert.equal(declaration.status, 200);
  assert.equal(declaration.body.fields.find((f: { key: string }) => f.key === "goods.hs_code").digits, 10);
  assert.equal((await call("GET", "/customs/v1/services/nothing")).status, 404);
});

test("missing and invalid fields are refused with 422 and nothing is registered", async () => {
  const { call } = portal();
  const refused = await call("POST", "/railway/v1/applications", { service: "cost-calculation", fields: { ...costCalculation, "applicant.inn": "12345", "shipment.wagons": "" } }, RW);
  assert.equal(refused.status, 422);
  assert.equal(refused.body.status, "rejected");
  assert.deepEqual(refused.body.missing.map((f: { field: string }) => f.field), ["shipment.wagons"]);
  assert.equal(refused.body.invalid[0].field, "applicant.inn");
  assert.match(refused.body.invalid[0].reason, /9 digits/);
  assert.deepEqual((await call("GET", "/railway/v1/applications", undefined, RW)).body.applications, []);
});

test("a form can be checked without filing it", async () => {
  const { call } = portal();
  const dry = await call("POST", "/railway/v1/services/cost-calculation/validate", { fields: { ...costCalculation, "applicant.inn": "12345" } }, RW);
  assert.equal(dry.status, 200);
  assert.equal(dry.body.ok, false);
  assert.equal(dry.body.invalid[0].field, "applicant.inn");
  assert.deepEqual((await call("GET", "/railway/v1/applications", undefined, RW)).body.applications, [], "nothing was registered");

  assert.equal((await call("POST", "/railway/v1/services/cost-calculation/validate", { fields: costCalculation }, RW)).body.ok, true);
  assert.equal((await call("POST", "/railway/v1/services/cost-calculation/validate", { fields: {} })).status, 401);
});

test("an accepted application is under review, then approved with what the entity issues", async () => {
  const { call, tick } = portal(5000);
  const filed = await call("POST", "/railway/v1/applications", { service: "cost-calculation", fields: costCalculation, caseRef: "UZ-1" }, RW);
  assert.equal(filed.status, 201);
  assert.equal(filed.body.status, "under_review");
  assert.equal(filed.body.reference, "RW-2026-000001");
  assert.equal(filed.body.fields["applicant.inn"], "301234567", "values are stored the way the portal normalises them");
  assert.equal(filed.body.fields["shipment.wagon_type"], "Covered wagon");

  assert.equal((await call("GET", `/railway/v1/applications/${filed.body.id}`, undefined, RW)).body.status, "under_review");
  tick(5000);
  const decided = await call("GET", `/railway/v1/applications/${filed.body.id}`, undefined, RW);
  assert.equal(decided.body.status, "approved");
  assert.equal(decided.body.outputs.calculation_no, "RW-2026-000001");
  assert.equal(decided.body.outputs.amount_usd, "790");
});

test("the reviewer requests changes; the amendment goes back to review and is approved", async () => {
  const { call } = portal();
  const filed = await call("POST", "/railway/v1/applications", { service: "cost-calculation", fields: { ...costCalculation, "goods.weight_t": "140" } }, RW);
  const reviewed = await call("GET", `/railway/v1/applications/${filed.body.id}`, undefined, RW);
  assert.equal(reviewed.body.status, "changes_requested");
  assert.equal(reviewed.body.changes[0].field, "shipment.wagons");
  assert.match(reviewed.body.changes[0].reason, /at least 3 wagons/);

  const invalid = await call("PATCH", `/railway/v1/applications/${filed.body.id}`, { fields: { "shipment.wagons": "three" } }, RW);
  assert.equal(invalid.status, 422, "an amendment is checked like a new form");
  const amended = await call("PATCH", `/railway/v1/applications/${filed.body.id}`, { fields: { "shipment.wagons": "3" } }, RW);
  assert.equal(amended.body.status, "under_review");
  assert.equal(amended.body.revision, 2);
  assert.equal((await call("GET", `/railway/v1/applications/${filed.body.id}`, undefined, RW)).body.status, "approved");
});

test("an obtain service takes only an approved application of the right kind", async () => {
  const { call, tick } = portal(1000);
  const calc = await call("POST", "/railway/v1/applications", { service: "cost-calculation", fields: costCalculation }, RW);
  const certificate = { service: "station-certificate", fields: { "applicant.inn": "301234567", "ref.cost_calculation": calc.body.reference, "payment.confirmed": "Yes" } };

  const early = await call("POST", "/railway/v1/applications", certificate, RW);
  assert.equal(early.status, 422);
  assert.match(early.body.invalid[0].reason, /not approved yet/);

  tick(1000);
  await call("GET", `/railway/v1/applications/${calc.body.id}`, undefined, RW);
  const filed = await call("POST", "/railway/v1/applications", certificate, RW);
  assert.equal(filed.status, 201);

  const other = await call("POST", "/railway/v1/applications", { ...certificate, fields: { ...certificate.fields, "ref.cost_calculation": filed.body.reference } }, RW);
  assert.match(other.body.invalid[0].reason, /different kind/);
});

test("the entity's key is required, and an Idempotency-Key returns the application already filed", async () => {
  const { call } = portal();
  assert.equal((await call("POST", "/railway/v1/applications", { service: "cost-calculation", fields: costCalculation })).status, 401);
  assert.equal((await call("POST", "/railway/v1/applications", { service: "cost-calculation", fields: costCalculation }, CU)).status, 401, "one entity's key doesn't open another");

  const headers = { ...RW, "idempotency-key": "run-1:3:1" };
  const first = await call("POST", "/railway/v1/applications", { service: "cost-calculation", fields: costCalculation }, headers);
  const again = await call("POST", "/railway/v1/applications", { service: "cost-calculation", fields: costCalculation }, headers);
  assert.equal(first.status, 201);
  assert.equal(again.status, 200);
  assert.equal(again.body.id, first.body.id);
});

test("an officer can decide before the rules do", async () => {
  const { call } = portal(60_000);
  const filed = await call("POST", "/railway/v1/applications", { service: "cost-calculation", fields: costCalculation }, RW);
  const path = `/railway/v1/applications/${filed.body.id}/decision`;
  assert.equal((await call("POST", path, { decision: "request_changes", changes: [{ field: "nope" }] }, RW)).status, 400);

  const asked = await call("POST", path, { decision: "request_changes", changes: [{ field: "shipment.destination_station", reason: "Use the border station Altynkol" }] }, RW);
  assert.equal(asked.body.status, "changes_requested");
  assert.equal(asked.body.history.at(-1).by, "officer");

  await call("PATCH", `/railway/v1/applications/${filed.body.id}`, { fields: { "shipment.destination_station": "Altynkol" } }, RW);
  const approved = await call("POST", path, { decision: "approve" }, RW);
  assert.equal(approved.body.status, "approved");
  assert.ok(approved.body.outputs.amount_usd);
});

test("customs checks the declaration's shape, then its content against the other entities' registry", async () => {
  const { call } = portal();
  const fields = {
    regime: "EK10",
    "applicant.inn": "301234567",
    "applicant.name": "Silk Road Tea LLC",
    "contract.number": "UZ-FTC-2026-0142",
    "invoice.number": "INV-17",
    "invoice.date": "12.09.2026",
    "invoice.total": "84 000",
    "invoice.currency": "usd",
    "goods.name": "Black tea",
    "goods.hs_code": "0902",
    "goods.net_weight_kg": "20000",
    "goods.gross_weight_kg": "20600",
    "goods.origin_country": "Uzbekistan",
    "transport.mode": "Rail",
    "transport.document_no": "SMGS 448812",
  };
  const shape = await call("POST", "/customs/v1/applications", { service: "declaration", fields }, CU);
  assert.equal(shape.status, 422);
  assert.deepEqual(shape.body.missing.map((f: { field: string }) => f.field), ["destination.country"], "asked only for an export");
  assert.match(shape.body.invalid.find((f: { field: string }) => f.field === "goods.hs_code").reason, /10-digit/);

  const filed = await call(
    "POST",
    "/customs/v1/applications",
    { service: "declaration", fields: { ...fields, "goods.hs_code": "0902301000", "goods.net_weight_kg": "21000", "destination.country": "China", "permits.phyto": "SW-2026-000999" } },
    CU,
  );
  assert.equal(filed.status, 201);
  assert.equal(filed.body.fields["invoice.date"], "2026-09-12");
  const reviewed = await call("GET", `/customs/v1/applications/${filed.body.id}`, undefined, CU);
  assert.equal(reviewed.body.status, "changes_requested");
  assert.deepEqual(reviewed.body.changes.map((c: { field: string }) => c.field), ["goods.net_weight_kg", "permits.phyto"]);
});

const PG = { "x-api-key": "pg-dev-key" };

const transfer = {
  "payer.inn": "301245678",
  "payer.name": "OOO Samarkand Choy",
  "payer.account": "2020 8000 9001 2345 6001",
  "payer.bank_mfo": "00444",
  "payee.name": "Agency of Plant Quarantine and Protection",
  "payment.amount": "245 000",
  "payment.currency": "UZS",
  "payment.purpose": "UZ-2609-0005-P12 — Pay for internal phytosanitary certificate",
  "basis.document": "26140004512",
  "basis.amount": "245000",
  "payment.authorisation": "Authorised by account holder",
};

test("the payment gateway checks the transfer, books it and issues the receipt", async () => {
  const { call } = portal();
  const refused = await call("POST", "/payments/v1/applications", { service: "transfer", fields: { ...transfer, "payer.account": "2020800090", "payment.authorisation": "" } }, PG);
  assert.equal(refused.status, 422);
  assert.deepEqual(refused.body.missing.map((f: { field: string }) => f.field), ["payment.authorisation"]);
  assert.match(refused.body.invalid[0].reason, /20 digits/);

  const filed = await call("POST", "/payments/v1/applications", { service: "transfer", fields: transfer, caseRef: "UZ-2609-0005" }, PG);
  assert.equal(filed.status, 201);
  const paid = await call("GET", `/payments/v1/applications/${filed.body.id}`, undefined, PG);
  assert.equal(paid.body.status, "approved");
  assert.equal(paid.body.outputs.status, "Paid");
  assert.equal(paid.body.outputs.receipt_no, paid.body.reference);
  assert.equal(paid.body.outputs.amount_paid, "245 000 UZS");
  assert.equal(paid.body.fields["payer.account"], "20208000900123456001");

  // The same offer agreement again is a duplicate.
  const again = await call("POST", "/payments/v1/applications", { service: "transfer", fields: transfer }, PG);
  const second = await call("GET", `/payments/v1/applications/${again.body.id}`, undefined, PG);
  assert.equal(second.body.status, "changes_requested");
  assert.match(second.body.changes[0].reason, new RegExp(`already paid — receipt ${paid.body.reference}`));
});

test("the gateway sends back a wrong amount, a missing reference and an empty account", async () => {
  const { call } = portal();
  const filed = await call(
    "POST",
    "/payments/v1/applications",
    { service: "transfer", fields: { ...transfer, "payment.amount": "240000", "payment.purpose": "phyto certificate", "payer.account": "20208000900123450000" } },
    PG,
  );
  const read = await call("GET", `/payments/v1/applications/${filed.body.id}`, undefined, PG);
  assert.equal(read.body.status, "changes_requested");
  const reasons = Object.fromEntries(read.body.changes.map((c: { field: string; reason: string }) => [c.field, c.reason]));
  assert.match(reasons["payment.amount"], /asks for 245 000 UZS, the transfer is 240 000 UZS/);
  assert.match(reasons["payment.purpose"], /payment reference/);
  assert.match(reasons["payer.account"], /Insufficient funds/);

  const fixed = await call("PATCH", `/payments/v1/applications/${filed.body.id}`, { fields: { "payment.amount": "245000", "payment.purpose": transfer["payment.purpose"], "payer.account": transfer["payer.account"] } }, PG);
  assert.equal(fixed.body.revision, 2);
  assert.equal((await call("GET", `/payments/v1/applications/${filed.body.id}`, undefined, PG)).body.status, "approved");
});

test("a payment of Single Window payment details is checked against the amount it issued", async () => {
  const { call } = portal();
  const SW = { "x-api-key": "sw-dev-key" };
  const details = await call("POST", "/single-window/v1/applications", { service: "payment-details", fields: { "applicant.inn": "301245678", "applicant.name": "OOO Samarkand Choy" } }, SW);
  const issued = await call("GET", `/single-window/v1/applications/${details.body.id}`, undefined, SW);
  assert.equal(issued.body.outputs.amount_uzs, "375 000");
  const filed = await call("POST", "/payments/v1/applications", { service: "transfer", fields: { ...transfer, "basis.document": issued.body.reference, "basis.amount": "", "payment.amount": "300000" } }, PG);
  const read = await call("GET", `/payments/v1/applications/${filed.body.id}`, undefined, PG);
  assert.match(read.body.changes[0].reason, /asks for 375 000 UZS/);
});
