import { runChat, type ChatEvent, type ChatResult } from "../../modules/assistant/chat";
import { evaluate, type IntakeTurn } from "../../modules/intake/conversation";
import { EMPTY_DRAFT, parseDraft, type IntakeDraft, type Slot } from "../../modules/intake/draft";
import { restoreIntake, saveIntake } from "../../modules/intake/checkpoint";
import { CATALOGUE, PROCEDURE_IDS } from "../../modules/procedures/data/procedures.generated";
import type { CaseResult, Suite } from "../types";

const dependencies = { listCases: async () => [], projection: async () => null };
async function send(message: string, draft: IntakeDraft, expecting: Slot | null) {
  const events: ChatEvent[] = [];
  await runChat({ message, draft: parseDraft(JSON.parse(JSON.stringify(draft))), expecting }, dependencies, (event) => events.push(event));
  const error = events.find((e) => e.type === "error");
  if (error?.type === "error") throw new Error(error.message);
  const result = events.find((e) => e.type === "result");
  return result?.type === "result" ? result.result : null;
}

function intake(result: ChatResult | null): IntakeTurn {
  if (result?.kind !== "intake") throw new Error(`Expected intake, got ${result?.kind ?? "no result"}`);
  return result.turn;
}

export const intakeCorpusSuite: Suite = {
  name: "intake-corpus",
  about: "All published procedures through chat intake, side questions, discarded transcripts, checkpoint restoration and confirmation revalidation; no cases are opened.",
  async run(options) {
    const results: CaseResult[] = [];
    for (const id of PROCEDURE_IDS.slice(0, options.limit ?? PROCEDURE_IDS.length)) {
      const p = CATALOGUE[id];
      if (p.kind === "customs") {
        try {
          const treatment = p.regime === "standard" ? `whole ${p.direction}` : p.regime === "clearance" ? "customs clearance only" : p.regime === "temporary" ? "temporary" : `re-${p.direction}`;
          const route = p.direction === "import" ? "from Almaty to Tashkent" : "from Tashkent to Almaty";
          const turn = intake(await send(`I want to ${p.direction} 5 tonnes of ${p.goods} ${route} by ${p.mode}, ${treatment}`, EMPTY_DRAFT, null));
          const chosen = turn.summary ? CATALOGUE[turn.summary.procedureId] : null;
          if (!chosen || chosen.goods !== p.goods || chosen.direction !== p.direction || chosen.mode !== p.mode || chosen.regime !== p.regime) throw new Error(`${turn.status}: ${turn.message}`);
          results.push({ id: `${id}: shipment wording (goods/direction/mode/treatment)`, ok: true });
        } catch (error) { results.push({ id: `${id}: shipment wording`, ok: false, detail: (error as Error).message }); }
      }
      try {
        const titled = intake(await send(p.title, EMPTY_DRAFT, null));
        if (titled.draft.procedureId !== id && !titled.options.some((o) => o.reply === `Start procedure ${id}`)) throw new Error(`Title selected ${titled.draft.procedureId ?? "none"} without offering ${id}: ${titled.message}`);
        results.push({ id: `${id}: published title or explicit disambiguation`, ok: true });
      } catch (error) { results.push({ id: `${id}: published title or explicit disambiguation`, ok: false, detail: (error as Error).message }); }
      try {
        let turn = intake(await send(`Start procedure ${id}`, EMPTY_DRAFT, null));
        const memory = new Map<string, string>();
        const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); }, removeItem: (key: string) => { memory.delete(key); } };
        saveIntake(storage, turn);
        // A question containing another commodity must never overwrite the shipment.
        const side = await send("Who issues the phytosanitary certificate for tea?", turn.draft, turn.slot ?? null);
        if (side?.kind !== "knowledge") throw new Error(`Side question routed to ${side?.kind}`);
        turn = restoreIntake(storage)!;
        if (!turn || turn.draft.procedureId !== id) throw new Error("Lost selected procedure on restoration");
        if (p.kind !== "service") {
          const route = p.direction === "transit" ? "from Almaty to Moscow" : p.direction === "import" ? "from Almaty to Tashkent" : "from Tashkent to Almaty";
          turn = intake(await send(`5 tonnes ${route}`, turn.draft, turn.slot ?? null));
        }
        const checked = evaluate(parseDraft(JSON.parse(JSON.stringify(turn.draft))));
        if (checked.status !== "confirm" || checked.summary?.procedureId !== id) throw new Error(`${checked.status}: ${checked.message}`);
        if (checked.summary.steps !== p.stepsCount || checked.summary.blocks !== p.blocksCount) throw new Error("Published step counts lost");
        results.push({ id: `${id}: conversation and resume`, ok: true });
      } catch (error) { results.push({ id: `${id}: conversation and resume`, ok: false, detail: (error as Error).message }); }
    }
    return results;
  },
};
