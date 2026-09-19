import assert from "node:assert/strict";
import test from "node:test";
import { createLlmClient } from "../../../modules/ai/llm";
import type { Need } from "../../../modules/steps/next";
import { readNote } from "../../../modules/steps/note";

const need = (label: string, kind: Need["kind"]): Need => ({
  id: `41:${label}`,
  label,
  kind,
  status: "missing",
  optional: false,
  detail: "For this shipment",
  docType: null,
  requiredFields: [],
  document: null,
  producedBy: null,
  value: null,
  autoFilled: false,
  output: false,
  form: null,
  notApplicable: false,
});

const open = [{ stepNum: 41, title: "Create export customs declaration", needs: [need("Wagon number (box 7)", "value"), need("Seals applied", "confirm"), need("Applicant INN", "value")] }];

const model = (answer: object) =>
  createLlmClient({
    groqApiKey: "k",
    fetch: (async () => new Response(JSON.stringify({ model: "test-model", choices: [{ message: { content: JSON.stringify(answer) } }] }))) as unknown as typeof fetch,
  });

test("a line from the trader becomes proposals for the open step's needs", async () => {
  const note = "wagon 5 loaded, seals applied, INN 301234567";
  const reading = await readNote(
    note,
    open,
    model({
      items: [
        { label: "Wagon number (box 7)", value: "5", quote: "wagon 5 loaded" },
        { label: "Seals applied", value: "yes", quote: "seals applied" },
        { label: "Applicant INN", value: "301234567", quote: "INN 301234567" },
      ],
      unmatched: [],
    }),
  );
  assert.deepEqual(
    reading.proposals.map((p) => [p.label, p.kind, p.value]),
    [
      ["Wagon number (box 7)", "value", "5"],
      ["Seals applied", "confirm", "yes"],
      ["Applicant INN", "value", "301234567"],
    ],
  );
  assert.equal(reading.proposals[0].stepNum, 41);
  assert.match(reading.proposals[0].why, /wagon 5 loaded/);
});

test("nothing is proposed that the note doesn't say, or that no open step needs", async () => {
  const reading = await readNote(
    "wagon 5 loaded",
    open,
    model({ items: [{ label: "Wagon number (box 7)", value: "77" }, { label: "Bank account", value: "20208000..." }], unmatched: ["ready Friday"] }),
  );
  assert.deepEqual(reading.proposals, []);
  assert.ok(reading.unmatched.some((u) => /isn't in your note/.test(u)), reading.unmatched.join(" | "));
  assert.ok(reading.unmatched.some((u) => /Bank account/.test(u)));
  assert.ok(reading.unmatched.includes("ready Friday"));
});

test("with no model, or nothing open, nothing is read", async () => {
  assert.deepEqual(await readNote("wagon 5 loaded", open, undefined), { proposals: [], unmatched: [], model: null });
  assert.deepEqual(await readNote("", open, model({ items: [] })), { proposals: [], unmatched: [], model: null });
  assert.deepEqual(await readNote("wagon 5", [], model({ items: [] })), { proposals: [], unmatched: [], model: null });
});
