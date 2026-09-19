/* Shipment workflow: the published procedure, tailored to one shipment.
 *
 * Procedures 306, 325 and 868 are written for a goods category ("fresh fruits
 * and vegetables"), a mode and a direction - not for "20 t of tomatoes from
 * Andijan to Almaty". This compiles the shipment's own workflow from the
 * published procedure and the case context. Every published step stays, with
 * its number, entity, channel and input labels; what changes is what the
 * context decides, each change with its reason and source:
 *
 *   naming       - the goods instead of the category; the load on wagon steps
 *   quantity     - transport units pre-filled; goods-handling blocks re-timed
 *   route        - route-only inputs marked not needed (Iran approval letter);
 *                  transit, crossings and the exporter's country as notes
 *   origin-proof - only the certificate-of-origin form the partner accepts
 *   destination  - the partner's requirements marked on the steps that meet
 *                  them, or added as tracked needs on the step they gate
 *   goods        - perishability; the HS heading on the declaration
 *
 * A pure function of (procedure, facts, query): the orchestrator, the step
 * engine and every view compute the same workflow from the case's facts. */

import type { DocType } from "../documents/specs";
import { COUNTRIES, type CountryProfile } from "../intake/data/countries";
import { buildShipmentPlan, countryName, fmtTonnes } from "../intake/shipment-plan";
import { commodityOf } from "../intake/taxonomy";
import type { Procedure, ProcedureBlock, ProcedureStep } from "../procedures/data/procedures.generated";
import type { ShipmentFacts } from "./domain";

export type ChangeKind = "naming" | "quantity" | "route" | "origin-proof" | "destination" | "goods";
export type TailoringChange = { kind: ChangeKind; target: string; change: string; reason: string; source: string };
export type NotNeeded = { label: string; reason: string };
export type ExtraNeed = { label: string; kind: "confirm" | "document"; docType: DocType | null; reason: string; source: string };
export type Prefill = { value: string; source: string };

export type StepExtras = {
  publishedTitle: string;
  notes: string[];
  /** Published inputs this shipment doesn't need - kept, but no longer gating. */
  notNeeded: NotNeeded[];
  /** Requirements the context adds to this step - gating like any other need. */
  extraNeeds: ExtraNeed[];
  /** Values the context already knows, keyed by the published input label. */
  prefill: Record<string, Prefill>;
};
export type BlockExtras = { publishedName: string; publishedDuration: [number, number]; notes: string[] };
export type ShipmentSummary = { title: string; publishedTitle: string; line: string; commodity: string; hs: string | null; partner: string | null };

export type TailoredStep = ProcedureStep & StepExtras;
export type TailoredBlock = Omit<ProcedureBlock, "steps"> & BlockExtras & { steps: TailoredStep[] };
export type ShipmentWorkflow = Omit<Procedure, "blocks"> & { blocks: TailoredBlock[]; shipment: ShipmentSummary; changes: TailoringChange[] };

/** A step's shipment extras; empty for an untailored (published) step. */
export function stepExtras(step: ProcedureStep): StepExtras {
  const s = step as Partial<TailoredStep>;
  return { publishedTitle: s.publishedTitle ?? step.title, notes: s.notes ?? [], notNeeded: s.notNeeded ?? [], extraNeeds: s.extraNeeds ?? [], prefill: s.prefill ?? {} };
}

export function blockExtras(block: ProcedureBlock): BlockExtras {
  const b = block as Partial<TailoredBlock>;
  return { publishedName: b.publishedName ?? block.name, publishedDuration: b.publishedDuration ?? block.estDuration, notes: b.notes ?? [] };
}

export const shipmentOf = (procedure: Procedure): ShipmentSummary | null => (procedure as Partial<ShipmentWorkflow>).shipment ?? null;
export const changesOf = (procedure: Procedure): TailoringChange[] => (procedure as Partial<ShipmentWorkflow>).changes ?? [];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const range = ([a, b]: [number, number]) => `${a}–${b} h`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const days = ([a, b]: [number, number]) => `${Math.round(a / 24)}–${Math.round(b / 24)} days`;

/** The country list's requirements that can apply to the goods in scope (none are animal products). */
function requirementApplies(requirement: string, goods: string): boolean {
  if (/animal products/i.test(requirement)) return false;
  if (/fresh produce/i.test(requirement)) return goods === "fresh fruits and vegetables";
  return true;
}

function requirementLabel(requirement: string): string {
  if (/ispm ?15|wooden packaging/i.test(requirement)) return "Wooden packaging treated to ISPM 15, or none used";
  if (/gacc/i.test(requirement)) return "Exporter registered with China's GACC for foodstuffs";
  if (/transit declaration/i.test(requirement)) return "Transit declaration for onward movement arranged";
  return requirement;
}

export function tailorProcedure(procedure: Procedure, facts?: Partial<ShipmentFacts> | null, query = ""): ShipmentWorkflow {
  if (shipmentOf(procedure)) return procedure as ShipmentWorkflow;

  const f: ShipmentFacts = {
    goods: facts?.goods ?? "",
    quantity: facts?.quantity ?? null,
    unit: facts?.unit ?? null,
    origin: facts?.origin ?? null,
    destination: facts?.destination ?? null,
    mode: facts?.mode ?? null,
  };
  const plan = buildShipmentPlan(procedure, f, query);
  const hit = commodityOf(f.goods || query);
  const known = hit.kind === "known" && hit.category === procedure.goods;
  const term = known ? hit.term : procedure.goods;
  const hs = known ? hit.hs : null;
  const exporting = procedure.direction === "export";
  const route = plan.route;
  const partnerIso = route ? (exporting ? route.destination.place.country : route.origin.place.country) : null;
  const profile: CountryProfile | null = partnerIso ? COUNTRIES[partnerIso] ?? null : null;
  const partnerName = partnerIso ? countryName(partnerIso) : null;
  const mode = procedure.mode;

  const changes: TailoringChange[] = [];
  const blocks: TailoredBlock[] = procedure.blocks.map((b) => ({
    ...b,
    publishedName: b.name,
    publishedDuration: b.estDuration,
    notes: [] as string[],
    steps: b.steps.map((s) => ({ ...s, publishedTitle: s.title, notes: [] as string[], notNeeded: [] as NotNeeded[], extraNeeds: [] as ExtraNeed[], prefill: {} as Record<string, Prefill> })),
  }));
  const steps = blocks.flatMap((b) => b.steps).sort((a, b) => a.num - b.num);
  const note = (target: { notes: string[] }, text: string) => {
    if (!target.notes.includes(text)) target.notes.push(text);
  };
  const stepRef = (s: TailoredStep) => `Step ${s.num} · ${s.publishedTitle}`;
  const blockRef = (b: TailoredBlock) => `Block ${b.id} · ${b.publishedName}`;

  /* naming ---------------------------------------------------------------- */
  const title = `${cap(procedure.direction)} of ${term} by ${mode}`;
  if (term !== procedure.goods) {
    changes.push({
      kind: "naming",
      target: "Workflow",
      change: `“${procedure.title}” → “${title}”`,
      reason: `${cap(term)}${hs ? ` (HS ${hs})` : ""} is covered by the ${procedure.goods} procedure`,
      source: "Intake — commodity table",
    });
    const category = new RegExp(`\\b${procedure.goods}\\b`, "i");
    let renamed = 0;
    for (const b of blocks) {
      if (category.test(b.name)) {
        b.name = b.name.replace(category, term);
        renamed++;
      } else if (/phytosanitary|quarantine|sanitary|certificate of origin/i.test(b.name)) {
        b.name = `${b.name} — ${term}`;
        renamed++;
      }
      for (const s of b.steps) {
        if (category.test(s.title)) {
          s.title = s.title.replace(category, term);
          renamed++;
        }
      }
    }
    if (renamed) {
      changes.push({ kind: "naming", target: plural(renamed, "block and step name"), change: `name ${term} instead of “${procedure.goods}”`, reason: "Certificates and filings are issued for the actual goods", source: "Intake — commodity table" });
    }
  }

  /* quantity -------------------------------------------------------------- */
  const units = plan.units;
  if (plan.tonnes != null) {
    const load = plural(units.count, units.kind);
    const basis = `${fmtTonnes(plan.tonnes)} at about ${units.perUnitT} t per ${units.kind}`;
    for (const s of steps) {
      if (mode === "train" && /\bwagons?\b/i.test(s.publishedTitle) && !/empty wagons/i.test(s.publishedTitle)) {
        s.title = `${s.title} — ${load}`;
        changes.push({ kind: "quantity", target: stepRef(s), change: `names the load: ${load}`, reason: basis, source: "Intake — quantity" });
      }
      for (const input of new Set(s.inputs)) {
        if (/^quantity of transport units$/i.test(input)) {
          s.prefill[input] = { value: String(units.count), source: `intake (${basis})` };
          changes.push({ kind: "quantity", target: stepRef(s), change: `“${input}” pre-filled: ${units.count}`, reason: basis, source: "Intake — quantity" });
        } else if (/^amount of consignment$/i.test(input)) {
          s.prefill[input] = { value: fmtTonnes(plan.tonnes), source: "intake" };
          changes.push({ kind: "quantity", target: stepRef(s), change: `“${input}” pre-filled: ${fmtTonnes(plan.tonnes)}`, reason: "Quantity given at intake", source: "Intake — quantity" });
        }
      }
    }
    for (const a of plan.adjustments) {
      const b = blocks.find((x) => x.id === a.blockId);
      if (!b) continue;
      b.estDuration = a.adjusted;
      note(b, `${a.reason}: ${range(a.published)} published, ${range(a.adjusted)} planned`);
      changes.push({ kind: "quantity", target: blockRef(b), change: `${range(a.published)} → ${range(a.adjusted)}`, reason: a.reason, source: "Shipment plan — handling allowance per unit" });
    }
  }

  /* route ----------------------------------------------------------------- */
  if (route) {
    const path = `${route.origin.place.name} → ${route.destination.place.name}`;
    const via = route.via.length ? `via ${route.via.map(countryName).join(", ")}` : "direct";
    const crossesIran = route.via.includes("IR") || partnerIso === "IR";
    let exporterCountrySteps = 0;

    for (const s of steps) {
      let namesExporter = false;
      for (const input of new Set(s.inputs)) {
        if (mode === "train" && /iran approval letter/i.test(input) && !crossesIran) {
          s.notNeeded.push({ label: input, reason: `the rail route ${path} runs ${via} and doesn't cross Iran` });
          changes.push({ kind: "route", target: stepRef(s), change: `“${input}” not needed`, reason: `Rail route ${path} runs ${via}`, source: "Shipment plan — rail corridors" });
        }
        if (!exporting && partnerName && /exporter's country/i.test(input)) namesExporter = true;
      }
      if (namesExporter) {
        note(s, `Exporter's country: ${partnerName} — its documents come from there`);
        exporterCountrySteps++;
      }
    }
    if (exporterCountrySteps) {
      changes.push({ kind: "route", target: plural(exporterCountrySteps, "step"), change: `name ${partnerName} as the exporter's country`, reason: `The goods come from ${route.origin.place.name}`, source: "Intake — route" });
    }

    const handover = steps.find((s) => (exporting ? /dispatch/i.test(s.publishedTitle) : /arrival/i.test(s.publishedTitle)));
    if (handover && route.borders > 0) {
      const crossing = profile?.crossingPoints.length ? `crossing points ${profile.crossingPoints.join(", ")}` : profile?.crossingNote && !/^via /i.test(profile.crossingNote) ? profile.crossingNote : null;
      const transit = [
        route.via.length ? `transit ${via}, ${plural(route.borders, "border crossing")}` : plural(route.borders, "border crossing"),
        crossing,
        route.gaugeBreak ? `break of gauge ${route.gaugeBreak}` : null,
        route.sea,
        route.road,
        `${days(route.transit)} in transit`,
      ]
        .filter(Boolean)
        .join("; ");
      note(handover, `${path}: ${transit}`);
      changes.push({ kind: "route", target: stepRef(handover), change: "transit and crossings noted", reason: `${path}: ${transit}`, source: "Shipment plan and country list" });
      if (mode === "train" && profile?.crossingNote && /sea and air/i.test(profile.crossingNote)) {
        note(handover, `The country list gives ${profile.name} sea and air routes only — plan the leg beyond the rail network`);
      }
    }

    /* origin proof -------------------------------------------------------- */
    if (exporting && profile?.originProof) {
      const proof = profile.originProof;
      for (const s of steps) {
        const labels = [...new Set(s.inputs)];
        const formA = labels.find((l) => /^certificate of origin form a$/i.test(l));
        const general = labels.find((l) => /^certificate of origin general form$/i.test(l));
        const drop = [!/form a/i.test(proof) ? formA : undefined, !/general form/i.test(proof) ? general : undefined].filter((l): l is string => Boolean(l));
        for (const label of drop) {
          s.notNeeded.push({ label, reason: `${profile.name} takes ${proof} (country list)` });
          changes.push({ kind: "origin-proof", target: stepRef(s), change: `“${label}” not needed`, reason: `${profile.name} takes ${proof}`, source: `Country list — ${profile.name}` });
        }
      }
      for (const b of blocks) if (/certificate of origin/i.test(b.publishedName)) note(b, `${profile.name} accepts ${proof} (country list)`);
    }

    /* destination requirements -------------------------------------------- */
    if (exporting && profile) {
      const loadingBlock = blocks.find((b) => /loading/i.test(b.publishedName));
      const loadingStep = loadingBlock?.steps.find((s) => /\bload/i.test(s.publishedTitle) && !/wagons?|approval/i.test(s.publishedTitle)) ?? loadingBlock?.steps.at(-1) ?? null;
      const declarationStep = steps.find((s) => /customs declaration/i.test(s.publishedTitle) && /create|submit/i.test(s.publishedTitle)) ?? null;
      const dispatchStep = steps.find((s) => /dispatch/i.test(s.publishedTitle)) ?? null;
      const source = `Country list — ${profile.name}`;

      for (const requirement of profile.destinationRequirements.filter((r) => requirementApplies(r, procedure.goods))) {
        const reason = `Required by ${profile.name}`;
        if (/phytosanitary certificate/i.test(requirement)) {
          const covering = blocks.filter((b) => /phytosanitary certificate/i.test(b.publishedName) && !/internal/i.test(b.publishedName));
          if (covering.length) {
            for (const b of covering) note(b, `${reason}: ${requirement.toLowerCase()}`);
            changes.push({ kind: "destination", target: covering.map(blockRef).join(", "), change: "marked as required by the destination", reason: `${reason}: ${requirement}`, source });
            continue;
          }
        }
        const gate = /ispm ?15|wooden packaging/i.test(requirement) ? loadingStep ?? dispatchStep : /transit declaration/i.test(requirement) ? dispatchStep : declarationStep;
        if (!gate) continue;
        const extra: ExtraNeed = /food test report/i.test(requirement)
          ? { label: "Food test report from an accredited laboratory", kind: "document", docType: "food_test_report", reason, source }
          : { label: requirementLabel(requirement), kind: "confirm", docType: null, reason, source };
        if (gate.extraNeeds.some((e) => e.label === extra.label)) continue;
        gate.extraNeeds.push(extra);
        changes.push({ kind: "destination", target: stepRef(gate), change: `adds “${extra.label}”`, reason: `${reason}: ${requirement}`, source });
      }
    }
  }

  /* goods ------------------------------------------------------------------ */
  if (procedure.goods === "fresh fruits and vegetables") {
    const text = `Perishable ${term}: ${units.kind}, pre-cooled and kept cold from loading to arrival — ${route ? `${days(route.transit)} in transit` : "transit time depends on the route"}`;
    const targets = blocks.filter((b) => /loading|dispatch/i.test(b.publishedName));
    for (const b of targets) note(b, text);
    if (targets.length) changes.push({ kind: "goods", target: targets.map(blockRef).join(", "), change: "marked perishable", reason: text, source: "Commodity table — fresh produce" });
  }
  if (hs) {
    const declaration = steps.find((s) => /customs declaration/i.test(s.publishedTitle) && /create/i.test(s.publishedTitle));
    if (declaration) {
      note(declaration, `${cap(term)} — HS ${hs}; the declaration's commodity code (box 33) needs all 10 digits`);
      changes.push({ kind: "goods", target: stepRef(declaration), change: `HS ${hs} noted for ${term}`, reason: "The heading is known from intake; the full code is confirmed on the declaration", source: "Intake — commodity table" });
    }
  }

  const line = [
    plan.tonnes != null ? `${fmtTonnes(plan.tonnes)} · ${plural(units.count, units.kind)}` : null,
    route ? `${route.origin.place.name} → ${route.destination.place.name}${partnerName ? ` (${exporting ? "to" : "from"} ${partnerName})` : ""}` : null,
    hs ? `HS ${hs}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    ...procedure,
    title,
    blocks,
    shipment: { title, publishedTitle: procedure.title, line, commodity: term, hs, partner: partnerName },
    changes,
  };
}
