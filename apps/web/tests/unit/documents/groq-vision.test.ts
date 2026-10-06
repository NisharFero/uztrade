import assert from "node:assert/strict";
import test from "node:test";
import { composeDocument } from "../../../modules/documents/docai/compose";
import { canReadWithVision, parseWithGroqVision } from "../../../modules/documents/docai/groq-vision";
import { documentReaderFrom } from "../../../modules/documents/docai/reader";
import { specFor } from "../../../modules/documents/specs";

const spec = specFor("commercial_invoice");
const image = { bytes: new Uint8Array([137, 80, 78, 71]).buffer, fileName: "invoice.png", contentType: "image/png" };

/** A Groq chat completion carrying one JSON answer. */
const groq = (answer: object, calls: { body: unknown }[] = []) =>
  (async (_url: string, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }));
  }) as unknown as typeof fetch;

const TRANSCRIPT = [
  "INVOICE",
  "Invoice No. INV-4417   Date: 12.03.2026",
  "Seller: Uztea Export LLC, Tashkent",
  "Buyer: Almaty Trading LLP",
  "Total value: 48 000.00 USD",
].join("\n");

const field = (doc: ReturnType<typeof composeDocument>, key: string) => doc.fields.find((f) => f.key === key);

test("a quoted value the page supports is accepted; the same value unquoted is not", async () => {
  const read = await parseWithGroqVision(
    { ...image, spec },
    {
      apiKey: "k",
      fetch: groq({
        transcript: TRANSCRIPT,
        fields: {
          invoice_no: { value: "INV-4417", quote: "Invoice No. INV-4417", confidence: 0.95 },
          total_value: { value: "48 000.00", quote: "Total value: 48 000.00 USD", confidence: 0.93 },
          // Confident, quoted - but neither the quote nor the value is on the page.
          buyer: { value: "Samarkand Silk JSC", quote: "Buyer: Samarkand Silk JSC", confidence: 0.99 },
        },
      }),
    },
  );

  const doc = composeDocument(spec, read);
  assert.equal(field(doc, "invoice_no")?.status, "accepted");
  assert.equal(field(doc, "invoice_no")?.value, "INV-4417");
  assert.equal(field(doc, "total_value")?.status, "accepted");

  const invented = field(doc, "buyer");
  assert.notEqual(invented?.status, "accepted", "a value the transcript does not support is never auto-accepted");
  assert.ok((invented?.confidence ?? 1) < 0.8);
});

test("the transcript is what the rest of the pipeline reads", async () => {
  const read = await parseWithGroqVision(
    { ...image, spec },
    { apiKey: "k", fetch: groq({ transcript: TRANSCRIPT, fields: {} }) },
  );
  assert.equal(read.text, TRANSCRIPT);
  assert.equal(read.readability?.readable, true);

  const blank = await parseWithGroqVision({ ...image, spec }, { apiKey: "k", fetch: groq({ transcript: "", fields: {} }) });
  assert.equal(blank.readability?.readable, false, "nothing transcribed is not a readable page");
});

test("nulls, labels and unparseable answers leave the field for the trader", async () => {
  const read = await parseWithGroqVision(
    { ...image, spec },
    {
      apiKey: "k",
      fetch: groq({
        transcript: TRANSCRIPT,
        fields: {
          invoice_no: { value: null, quote: "", confidence: 0.9 },
          total_value: { value: "n/a", quote: "", confidence: 0.9 },
        },
      }),
    },
  );
  const doc = composeDocument(spec, read);
  assert.equal(field(doc, "invoice_no")?.status, "missing");
  assert.equal(field(doc, "total_value")?.status, "missing");
});

test("the image and the spec's own questions are what get sent", async () => {
  const calls: { body: unknown }[] = [];
  await parseWithGroqVision({ ...image, spec }, { apiKey: "k", fetch: groq({ transcript: TRANSCRIPT, fields: {} }, calls) });

  const body = calls[0].body as { model: string; messages: { role: string; content: unknown }[] };
  const user = body.messages.find((m) => m.role === "user")!.content as { type: string; text?: string; image_url?: { url: string } }[];
  assert.ok(user.some((part) => part.type === "image_url" && part.image_url!.url.startsWith("data:image/png;base64,")));
  assert.match(String(user.find((p) => p.type === "text")?.text), /invoice_no/);
  assert.match(body.model, /llama-4/);
});

test("only images go to the vision model; anything else is the service's job", async () => {
  assert.equal(canReadWithVision("image/jpeg", "scan.jpg"), true);
  assert.equal(canReadWithVision("application/octet-stream", "scan.PNG"), true);
  assert.equal(canReadWithVision("application/pdf", "declaration.pdf"), false);

  await assert.rejects(
    parseWithGroqVision({ bytes: new ArrayBuffer(4), fileName: "d.pdf", contentType: "application/pdf", spec }, { apiKey: "k", fetch: groq({}) }),
    /not an image/,
  );
});

test("which reader an environment gets", () => {
  assert.equal(documentReaderFrom({}), undefined, "no key: the service reads documents");
  assert.equal(documentReaderFrom({ GROQ_API_KEY: "k", DOC_READER: "docai" }), undefined, "DOC_READER=docai keeps documents off Groq");
  assert.equal(typeof documentReaderFrom({ GROQ_API_KEY: "k" }), "function");
});

test("a PDF falls through to the service even when Groq is configured", async () => {
  const read = documentReaderFrom({ GROQ_API_KEY: "k" }, "http://127.0.0.1:1")!;
  await assert.rejects(
    read({ bytes: new ArrayBuffer(4), fileName: "declaration.pdf", contentType: "application/pdf", spec }),
    /document AI service isn't reachable/,
    "the vision model is skipped and the service is called",
  );
});

test("a page too dense to transcribe is still read, but nothing is auto-accepted", async () => {
  const calls: { body: unknown }[] = [];
  // First answer: the model cannot fit its JSON in the budget. Second: the
  // compact pass, fields and quotes with no transcript at all.
  let call = 0;
  const flaky = (async (_url: string, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body ?? "{}")) });
    call += 1;
    if (call === 1) {
      return new Response(JSON.stringify({ error: { message: "Failed to generate JSON. Please adjust your prompt.", code: "json_validate_failed" } }), {
        status: 400,
      });
    }
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                transcript: "",
                fields: {
                  invoice_no: { value: "INV-4417", quote: "Invoice No. INV-4417", confidence: 0.97 },
                  total_value: { value: "48 000.00", quote: "Total value: 48 000.00 USD", confidence: 0.95 },
                },
              }),
            },
          },
        ],
      }),
    );
  }) as unknown as typeof fetch;

  const read = await parseWithGroqVision({ ...image, spec }, { apiKey: "k", fetch: flaky });

  assert.equal(calls.length, 2, "the dense page is asked for a second time");
  const second = calls[1].body as { messages: { role: string; content: unknown }[] };
  assert.match(String(second.messages[0].content), /too dense to transcribe/i);

  // The values come back rather than a blank document...
  const doc = composeDocument(spec, read);
  assert.equal(field(doc, "invoice_no")?.value, "INV-4417");
  assert.equal(field(doc, "total_value")?.value, "48 000.00");

  // ...but with no transcript to confirm them, none may be auto-accepted.
  assert.notEqual(field(doc, "invoice_no")?.status, "accepted");
  assert.notEqual(field(doc, "total_value")?.status, "accepted");
  assert.equal(read.readability?.readable, true);
  assert.match(read.readability?.reason ?? "", /too dense/i);
  assert.match(read.text, /Invoice No\. INV-4417/, "the quotes are the only text there is, and later re-reads need them");
});
