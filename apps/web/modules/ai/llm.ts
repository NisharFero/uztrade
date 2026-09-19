/* One way for features to ask a language model for JSON, and one rule for
 * which model may see what.
 *
 *   public    text the trader typed, the published procedures, goods named at
 *             intake - may go to Groq (or to the local model)
 *   document  anything read from the trader's documents or derived from them -
 *             only a model on this machine (LLM_LOCAL_URL, loopback only),
 *             unless LLM_DOCUMENT_DATA=external is set on purpose
 *
 * Every answer is validated against a schema. Null means "no model" - no
 * provider allowed, unreachable, or an answer that didn't fit - and each
 * feature then runs on its rules alone. */

import type { z } from "zod";

export type Sensitivity = "public" | "document";

export type LlmProvider = { name: "groq" | "local"; url: string; model: string; apiKey: string | null };

export type LlmClient = {
  groq: LlmProvider | null;
  local: LlmProvider | null;
  documentData: "local" | "external";
  fetch: typeof fetch;
  timeoutMs: number;
};

export type LlmEnv = {
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  /** An OpenAI-compatible endpoint on this machine, e.g. Ollama: http://127.0.0.1:11434/v1 */
  LLM_LOCAL_URL?: string;
  LLM_LOCAL_MODEL?: string;
  /** "external" lets document data reach Groq. Anything else keeps it local. */
  LLM_DOCUMENT_DATA?: string;
  LLM_DISABLED?: string;
};

export type LlmAnswer<T> = { data: T; provider: LlmProvider["name"]; model: string };

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLoopback(url: string): boolean {
  try {
    return LOOPBACK.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function createLlmClient(options: {
  groqApiKey?: string | null;
  groqModel?: string | null;
  localUrl?: string | null;
  localModel?: string | null;
  documentData?: string | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): LlmClient {
  const localUrl = (options.localUrl ?? "").trim().replace(/\/+$/, "");
  return {
    groq: options.groqApiKey ? { name: "groq", url: "https://api.groq.com/openai/v1", model: options.groqModel || "openai/gpt-oss-20b", apiKey: options.groqApiKey } : null,
    // A "local" URL on another host would carry document data off this machine, so it is ignored.
    local: localUrl && isLoopback(localUrl) ? { name: "local", url: localUrl, model: options.localModel || "qwen2.5:7b-instruct", apiKey: null } : null,
    documentData: options.documentData === "external" ? "external" : "local",
    fetch: options.fetch ?? ((input, init) => fetch(input, init)),
    timeoutMs: options.timeoutMs ?? 25_000,
  };
}

export function llmFromEnv(env: LlmEnv): LlmClient | undefined {
  if (env.LLM_DISABLED === "1") return undefined;
  const client = createLlmClient({
    groqApiKey: env.GROQ_API_KEY,
    groqModel: env.GROQ_MODEL,
    localUrl: env.LLM_LOCAL_URL,
    localModel: env.LLM_LOCAL_MODEL,
    documentData: env.LLM_DOCUMENT_DATA,
  });
  return client.groq || client.local ? client : undefined;
}

/** The provider allowed to see a prompt of this sensitivity, if any. */
export function providerFor(client: LlmClient | undefined, sensitivity: Sensitivity): LlmProvider | null {
  if (!client) return null;
  if (sensitivity === "document") return client.local ?? (client.documentData === "external" ? client.groq : null);
  return client.groq ?? client.local;
}

function jsonOf(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export async function llmJson<T>(
  client: LlmClient | undefined,
  request: { sensitivity: Sensitivity; system: string; prompt: string; schema: z.ZodType<T>; maxTokens?: number },
): Promise<LlmAnswer<T> | null> {
  const provider = providerFor(client, request.sensitivity);
  if (!client || !provider) return null;
  try {
    const response = await client.fetch(`${provider.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}) },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0,
        max_tokens: request.maxTokens ?? 1500,
        ...(provider.name === "groq" ? { reasoning_effort: "low" } : {}),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${request.system}\nReply with one JSON object and nothing else.` },
          { role: "user", content: request.prompt },
        ],
      }),
      signal: AbortSignal.timeout(client.timeoutMs),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = request.schema.safeParse(jsonOf(content));
    return parsed.success ? { data: parsed.data, provider: provider.name, model: body.model || provider.model } : null;
  } catch {
    return null;
  }
}
