/* One-off: the real rate limits on this Groq key, read from the API's own
 * headers rather than guessed from documentation.
 *
 *   GROQ_API_KEY=... npx tsx scripts/debug/rate-limits-probe.ts
 *
 * What matters for a demo is not the headline number but which limit binds
 * first: requests per minute, tokens per minute, or the daily cap.
 */
const key = process.env.GROQ_API_KEY;
if (!key) {
  console.error("no GROQ_API_KEY in the environment");
  process.exit(1);
}

const HEADERS = [
  "x-ratelimit-limit-requests",
  "x-ratelimit-remaining-requests",
  "x-ratelimit-reset-requests",
  "x-ratelimit-limit-tokens",
  "x-ratelimit-remaining-tokens",
  "x-ratelimit-reset-tokens",
  "retry-after",
];

async function probe(model: string, body: Record<string, unknown>) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, max_tokens: 16, ...body }),
  });
  const limits = Object.fromEntries(HEADERS.map((h) => [h, response.headers.get(h)]).filter(([, v]) => v));
  console.log(`\n${model}  ->  HTTP ${response.status}`);
  for (const [name, value] of Object.entries(limits)) console.log(`  ${name.replace("x-ratelimit-", "").padEnd(22)} ${value}`);
  if (!response.ok) console.log(`  error: ${(await response.text()).slice(0, 160)}`);
}

// The text model: intake extraction, classification, assistant answers.
await probe(process.env.GROQ_MODEL || "openai/gpt-oss-20b", {
  messages: [{ role: "user", content: "ok" }],
});

// The vision model: reading an uploaded document.
const PIXEL_32 =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAKElEQVR42u3OMQEAAAgDoC251a3gBSRgcrcpCoVCoVAoFAqFQqFQKHwtXmwAAWDWJ0kAAAAASUVORK5CYII=";
await probe(process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b", {
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "One word: what colour?" },
        { type: "image_url", image_url: { url: PIXEL_32 } },
      ],
    },
  ],
});

export {};
