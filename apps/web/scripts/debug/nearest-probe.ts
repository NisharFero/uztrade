/* One-off: what the model returns for goods outside the corpus, with the exact
 * prompt nearest.ts uses, so a schema mismatch is visible rather than silent.
 *
 *   GROQ_API_KEY=... npx tsx scripts/debug/nearest-probe.ts "export saffron by air"
 */
import { z } from "zod";
import { createLlmClient, llmJson } from "../../modules/ai/llm";
import { nearestCategory } from "../../modules/intake/nearest";
import { CATEGORIES } from "../../modules/intake/taxonomy";

const llm = createLlmClient({ groqApiKey: process.env.GROQ_API_KEY, groqModel: process.env.GROQ_MODEL });
if (!llm) {
  console.error("no GROQ_API_KEY in the environment");
  process.exit(1);
}

const SYSTEM = [
  "You match a product a trader wants to move to the goods category its trade procedure is published under, in Uzbekistan.",
  "Choose from the published categories given to you, spelled exactly as listed. Never invent a category.",
  "Judge by how the goods are actually classified and handled: what the product is made of, whether it is food, a chemical, a textile, equipment.",
  "close=false when no category genuinely fits - a category that merely sounds similar is not a fit.",
  "hs: the WCO Harmonized System heading for the product, 2 to 6 digits, no tariff rate.",
  "reason: one short sentence a trader would accept, naming the product and the category.",
  "JSON keys: product, category, hs, reason, close.",
].join("\n");

for (const text of process.argv.slice(2).length ? process.argv.slice(2) : ["export saffron by air"]) {
  const proposal = await nearestCategory(text, llm);
  const raw = await llmJson(llm, {
    sensitivity: "public",
    system: SYSTEM,
    prompt: [`Trader's words: ${text}`, "", "Published categories:", ...CATEGORIES.map((c) => `- ${c}`)].join("\n"),
    schema: z.object({}).passthrough(),
    maxTokens: 900,
  });
  console.log(text);
  console.log("  proposal:", proposal ? JSON.stringify(proposal) : "none");
  if (raw) {
    const data = raw.data as Record<string, unknown>;
    console.log("  raw:", JSON.stringify(data));
    console.log("  types:", Object.entries(data).map(([k, v]) => `${k}=${typeof v}`).join(" "));
  } else {
    console.log("  raw: null (no provider, HTTP error, or schema mismatch)");
  }
}
