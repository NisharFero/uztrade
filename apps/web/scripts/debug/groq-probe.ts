/* One-off: does this machine's Groq key and model actually answer?
 * Prints the HTTP status and body rather than swallowing them the way
 * modules/ai/llm.ts does.
 *
 *   GROQ_API_KEY=... npx tsx scripts/debug/groq-probe.ts [model]
 */
const key = process.env.GROQ_API_KEY;
if (!key) {
  console.error("no GROQ_API_KEY in the environment");
  process.exit(1);
}

const model = process.argv[2] || process.env.GROQ_MODEL || "openai/gpt-oss-20b";
const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
  body: JSON.stringify({
    model,
    temperature: 0,
    max_tokens: 200,
    reasoning_effort: "low",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Reply with one JSON object and nothing else." },
      { role: "user", content: 'Answer {"ok": true}.' },
    ],
  }),
});

console.log("model:", model);
console.log("status:", response.status, response.statusText);
console.log((await response.text()).slice(0, 600));

export {};
