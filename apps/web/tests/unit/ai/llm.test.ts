import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { createLlmClient, llmFromEnv, llmJson, providerFor } from "../../../modules/ai/llm";

function model(content: string) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ model: "test-model", choices: [{ message: { content } }] }));
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

const Schema = z.object({ ok: z.boolean() });
const ask = (client: ReturnType<typeof createLlmClient>, sensitivity: "public" | "document") => llmJson(client, { sensitivity, system: "s", prompt: "p", schema: Schema });

test("document data reaches only a model on this machine", async () => {
  const { calls, fetch } = model('{"ok": true}');
  const groqOnly = createLlmClient({ groqApiKey: "k", fetch });
  assert.equal(providerFor(groqOnly, "document"), null);
  assert.equal(await ask(groqOnly, "document"), null);
  assert.equal(calls.length, 0, "nothing was sent");

  assert.equal(createLlmClient({ groqApiKey: "k", localUrl: "http://10.0.0.5:11434/v1", fetch }).local, null, "a 'local' URL on another host is ignored");

  const both = createLlmClient({ groqApiKey: "k", localUrl: "http://127.0.0.1:11434/v1/", fetch });
  assert.equal(providerFor(both, "document")?.name, "local");
  assert.equal(providerFor(both, "public")?.name, "groq");
  assert.deepEqual((await ask(both, "document"))?.data, { ok: true });
  assert.equal(calls[0].url, "http://127.0.0.1:11434/v1/chat/completions");

  assert.equal(providerFor(createLlmClient({ groqApiKey: "k", documentData: "external", fetch }), "document")?.name, "groq", "only when set on purpose");
  assert.equal(llmFromEnv({}), undefined);
  assert.equal(llmFromEnv({ GROQ_API_KEY: "k", LLM_DISABLED: "1" }), undefined);
});

test("answers must fit the schema; fenced JSON is read, anything else is no answer", async () => {
  assert.deepEqual((await ask(createLlmClient({ groqApiKey: "k", fetch: model('```json\n{"ok": false}\n```').fetch }), "public"))?.data, { ok: false });
  assert.equal(await ask(createLlmClient({ groqApiKey: "k", fetch: model('{"ok": "yes"}').fetch }), "public"), null);
  assert.equal(await ask(createLlmClient({ groqApiKey: "k", fetch: model("not json").fetch }), "public"), null);
  const offline = createLlmClient({ groqApiKey: "k", fetch: (async () => { throw new Error("offline"); }) as unknown as typeof fetch });
  assert.equal(await ask(offline, "public"), null);
});
