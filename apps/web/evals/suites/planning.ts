/* What the agents say about a shipment once the case exists.
 *
 * These are properties rather than snapshots: a cold chain must reach the
 * equipment, a load must be sized by something, and an agent must never claim
 * a rule it does not have. Asserting the numbers themselves would only assert
 * that the table still says what the table says.
 */
import { assessCompliance, CERTIFICATE_RULES } from "../../modules/compliance/compliance";
import { isPerishable } from "../../modules/intake/goods-handling";
import { CATEGORIES } from "../../modules/intake/taxonomy";
import { unitsFor } from "../../modules/intake/shipment-plan";
import { requireProcedure } from "../../modules/procedures/registry";
import { CATALOGUE, PROCEDURE_IDS } from "../../modules/procedures/data/procedures.generated";
import { buildLedger } from "../../modules/steps/ledger";
import { transitView } from "../../modules/transit/transit";
import type { CaseResult, Suite } from "../types";

/** One published procedure per goods category, so every category is exercised. */
function oneProcedurePerCategory(): { id: string; goods: string }[] {
  const seen = new Map<string, string>();
  for (const id of PROCEDURE_IDS) {
    const row = CATALOGUE[id];
    if (row.direction === "transit" || seen.has(row.goods)) continue;
    seen.set(row.goods, id);
  }
  return [...seen].map(([goods, id]) => ({ id, goods }));
}

export const planningSuite: Suite = {
  name: "planning",
  about: "Capacity, cold chain and compliance across every goods category: properties that must hold, not numbers that happen to hold today.",
  async run(): Promise<CaseResult[]> {
    const results: CaseResult[] = [];
    const rows = oneProcedurePerCategory();

    /* 1. Every category can be planned, in every mode. */
    const unplannable: string[] = [];
    for (const goods of CATEGORIES) {
      for (const mode of ["train", "road", "air"] as const) {
        const units = unitsFor(mode, goods, 24);
        if (!(units.count >= 1 && units.perUnitT > 0 && units.kind)) unplannable.push(`${goods} by ${mode}`);
      }
    }
    results.push({ id: "every category sizes a load in every mode", ok: !unplannable.length, detail: unplannable.slice(0, 4).join(", ") });

    /* 2. A cold chain reaches the equipment, whatever carries it. */
    const coldMisses: string[] = [];
    for (const goods of CATEGORIES) {
      if (!isPerishable(goods)) continue;
      for (const mode of ["train", "road", "air"] as const) {
        if (!/refrigerated/i.test(unitsFor(mode, goods, 24).kind)) coldMisses.push(`${goods} by ${mode}`);
      }
    }
    results.push({ id: "perishable goods travel refrigerated in every mode", ok: !coldMisses.length, detail: coldMisses.join(", ") });

    /* 3. Nothing ambient is refrigerated by accident. */
    const falseCold = CATEGORIES.filter((g) => !isPerishable(g) && /refrigerated/i.test(unitsFor("train", g, 24).kind));
    results.push({ id: "ambient goods are not sent in a reefer", ok: !falseCold.length, detail: falseCold.join(", ") });

    /* 4. Compliance answers for every category without inventing a rule. */
    const invented: string[] = [];
    const silent: string[] = [];
    for (const { id, goods } of rows) {
      const procedure = await requireProcedure(id);
      const assessment = assessCompliance(procedure, { goods, quantity: 20, unit: "tonnes" });
      const hasRule = Boolean(CERTIFICATE_RULES[assessment.ruleKey]);
      const saysSo = assessment.unresolved.some((u) => /Certificate rule/i.test(u.input));
      if (!hasRule && !saysSo) silent.push(`${id} ${goods}`);
      if (hasRule && saysSo) invented.push(`${id} ${goods}`);
      // A certificate a rule names must be the declared output of a step.
      const rule = CERTIFICATE_RULES[assessment.ruleKey];
      if (rule) {
        const outputs = procedure.blocks.flatMap((b) => b.steps.map((s) => s.output.toLowerCase()));
        for (const certificate of rule.certificates) {
          if (!outputs.includes(certificate.toLowerCase())) invented.push(`${id} names "${certificate}" with no step producing it`);
        }
      }
    }
    results.push({ id: "a missing certificate rule is stated, not left blank", ok: !silent.length, detail: silent.slice(0, 4).join(", ") });
    results.push({ id: "every certificate a rule names is produced by a step", ok: !invented.length, detail: invented.slice(0, 3).join(", ") });

    /* 5. The transit agent plans a movement for every category. */
    const transitBroken: string[] = [];
    for (const { id, goods } of rows) {
      const procedure = await requireProcedure(id);
      try {
        const state = transitView({
          caseId: "EVAL",
          procedure,
          facts: { goods, quantity: 20, unit: "tonnes", origin: "Tashkent", destination: "Almaty", mode: procedure.mode },
          query: `${procedure.direction} 20 tonnes of ${goods}`,
          // An empty run: the movement has not started, which is exactly the
          // state a case is in when it opens.
          projection: {
            run: { id: "eval", procedureId: id, status: "running" },
            shipmentFacts: { goods, quantity: 20, unit: "tonnes", origin: "Tashkent", destination: "Almaty", mode: procedure.mode },
            nodes: [],
            edges: [],
            workItems: [],
            agentRuns: [],
            artifacts: [],
            auditEvents: [],
          } as never,
          ledger: buildLedger([]),
        });
        if (!state.capacity.units.count || !state.status.milestone) transitBroken.push(`${id} ${goods}`);
        if (isPerishable(goods) && !/refrigerated|reefer/i.test(state.capacity.equipment)) transitBroken.push(`${id} ${goods}: equipment "${state.capacity.equipment}"`);
      } catch (error) {
        transitBroken.push(`${id} ${goods}: ${(error as Error).message.slice(0, 60)}`);
      }
    }
    results.push({ id: "the transit agent plans every kind of cargo", ok: !transitBroken.length, detail: transitBroken.slice(0, 3).join(", ") });

    return results;
  },
};
