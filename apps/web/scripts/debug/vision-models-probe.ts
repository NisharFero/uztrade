/* One-off: which models this Groq key can actually send an image to.
 *
 *   GROQ_API_KEY=... npx tsx scripts/debug/vision-models-probe.ts
 */
const key = process.env.GROQ_API_KEY;
if (!key) {
  console.error("no GROQ_API_KEY in the environment");
  process.exit(1);
}

// A 1x1 red PNG.
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const models = (await (await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${key}` } })).json()) as {
  data?: { id: string }[];
};

for (const { id } of models.data ?? []) {
  if (/whisper|orpheus|prompt-guard|safeguard/.test(id)) continue; // audio and classifiers
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: id,
      max_tokens: 20,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What colour is this image? One word." },
            { type: "image_url", image_url: { url: PIXEL } },
          ],
        },
      ],
    }),
  });
  const body = (await response.json()) as { error?: { message?: string }; choices?: { message?: { content?: string } }[] };
  console.log(
    `${id.padEnd(34)} ${String(response.status).padEnd(4)} ${
      response.ok ? `OK -> ${JSON.stringify(body.choices?.[0]?.message?.content ?? "")}` : (body.error?.message ?? "").slice(0, 90)
    }`,
  );
}

export {};
