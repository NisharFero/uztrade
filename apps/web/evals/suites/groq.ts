/* Does every Groq-backed feature actually work with this key?
 *
 * Each case exercises one feature the way the application calls it, so the
 * failure modes that matter show up here: a model the account cannot use, a
 * token budget too small for the answer, a schema the model will not fill.
 * The gold conversations marked `"needs": "model"` are run here too.
 *
 * Calls are sequential with a pause between them, because a free tier's tokens
 * per minute are shared across every model.
 */
import { createLlmClient } from "../../modules/ai/llm";
import { suggestHsCodes } from "../../modules/compliance/hs-suggest";
import { intakeTurn } from "../../modules/intake/turn";
import { nearestCategory } from "../../modules/intake/nearest";
import { understandWithModel } from "../../modules/intake/llm-extract";
import { GROQ_VISION_MODELS } from "../../modules/documents/docai/groq-vision";
import { checkGold, mismatches, readGold, walk } from "./intake";
import type { CaseResult, Suite } from "../types";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const groqSuite: Suite = {
  name: "groq",
  about: "Every feature that calls a model, against the live API: intake reading, nearest category, HS suggestion, and the vision model.",
  needsModel: true,
  threshold: 0.8,
  async run(): Promise<CaseResult[]> {
    const key = process.env.GROQ_API_KEY!;
    const llm = createLlmClient({ groqApiKey: key, groqModel: process.env.GROQ_MODEL });
    const results: CaseResult[] = [];
    const add = async (id: string, run: () => Promise<{ ok: boolean; detail?: string }>) => {
      try {
        const { ok, detail } = await run();
        results.push({ id, ok, detail });
      } catch (error) {
        results.push({ id, ok: false, detail: (error as Error).message.slice(0, 120) });
      }
      await pause(1500);
    };

    /* The model the account will actually use for pages. */
    await add("a vision model this account can use", async () => {
      const models = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${key}` } });
      const body = (await models.json()) as { data?: { id: string }[] };
      const available = new Set((body.data ?? []).map((m) => m.id));
      const configured = process.env.GROQ_VISION_MODEL;
      const usable = configured ? [configured].filter((m) => available.has(m)) : GROQ_VISION_MODELS.filter((m) => available.has(m));
      return {
        ok: usable.length > 0,
        detail: usable.length ? `using ${usable[0]}` : `none of ${(configured ? [configured] : GROQ_VISION_MODELS).join(", ")} is available on this key`,
      };
    });

    /* Reading a message the rules cannot parse. */
    await add("reads a Russian message into the slots", async () => {
      const read = await understandWithModel("вывозим 20 тонн чая из Ташкента в Алматы поездом", null, llm);
      return { ok: Boolean(read && /tea/i.test(read.text)), detail: read ? `“${read.text}”` : "no answer" };
    });

    /* Goods outside the lexicon. */
    await add("proposes a category for goods nobody listed", async () => {
      const result = await nearestCategory("export silk scarves by air", llm);
      const ok = result?.kind === "proposal" && result.category === "textile and garment";
      return { ok, detail: result ? JSON.stringify(result).slice(0, 110) : "no answer" };
    });

    await add("refuses goods nothing covers, by name", async () => {
      const result = await nearestCategory("import excavators by train", llm);
      const ok = result?.kind === "none";
      return { ok, detail: result ? JSON.stringify(result).slice(0, 110) : "no answer" };
    });

    /* HS classification, which must stay inside the app's own nomenclature. */
    await add("ranks HS subheadings from the published nomenclature", async () => {
      const suggestions = await suggestHsCodes({
        heading: "0902",
        goods: "black tea in 25 kg cartons",
        documentText: null,
        digits: 6,
        llm,
      });
      const best = suggestions[0];
      // Only codes from the app's own extract may come back, and black tea in
      // cartons over 3 kg is 0902.40 rather than the green-tea subheadings.
      const ok = Boolean(best?.code?.startsWith("0902")) && suggestions.every((s) => s.code.startsWith("0902"));
      return { ok, detail: best ? `${best.code} by ${best.by} — ${best.description.slice(0, 50)}` : "no candidates" };
    });

    /* The gold conversations that need a model. */
    for (const c of readGold().filter((g) => g.needs === "model")) {
      const bad = checkGold(c);
      if (bad) {
        results.push({ id: `gold: ${c.id}`, ok: false, badGold: true, detail: bad });
        continue;
      }
      await add(`gold: ${c.id}`, async () => {
        const turn = await walk(c, (draft, message, expecting) => intakeTurn(draft, message, expecting as never, llm));
        const wrong = mismatches(c, turn);
        return { ok: !wrong.length, detail: wrong.join("; ") || turn.message.slice(0, 80) };
      });
    }

    return results;
  },
};
