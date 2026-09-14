/* Demo pack: invented documents and values that walk a case through every
 * step. The scenario JSON is the single source - the Python generator renders
 * the documents from it, and this module maps each step need to its demo. */

import scenario868 from "./data/scenario-868.json";
import type { Need } from "../steps/next";

export type DemoDocument = {
  id: string;
  file: string;
  template: string;
  title: string;
  docType: string | null;
  labels: string[];
  steps: number[];
  output: boolean;
  fields: Record<string, string>;
  body?: string;
  stamp?: string;
};

export type DemoScenario = {
  procedureId: string;
  title: string;
  note: string;
  shipment: Record<string, string | string[]>;
  values: Record<string, string>;
  documents: DemoDocument[];
};

const SCENARIOS: Record<string, DemoScenario> = { "868": scenario868 as unknown as DemoScenario };

export const demoFor = (procedureId: string): DemoScenario | null => SCENARIOS[procedureId] ?? null;

export const demoFileUrl = (procedureId: string, doc: DemoDocument) => `/demo/${procedureId}/${doc.file}`;

export type DemoMatch = { kind: "document"; document: DemoDocument; url: string } | { kind: "value"; value: string };

/** The demo that satisfies one need at one step, if the procedure has a demo pack. */
export function demoForNeed(procedureId: string, need: Need, stepNum: number): DemoMatch | null {
  const scenario = demoFor(procedureId);
  if (!scenario) return null;

  if (need.kind === "value") {
    const value = scenario.values[need.label];
    return value ? { kind: "value", value } : null;
  }
  if (need.kind !== "document") return null;

  const labelled = scenario.documents.filter((d) => d.labels.includes(need.label));
  // A step's output belongs to that step (each payment has its own receipt);
  // an input document is shared by every step that names it.
  const pool = need.output ? labelled.filter((d) => d.output && d.steps.includes(stepNum)) : labelled.filter((d) => !d.output);
  const pick =
    pool.find((d) => d.steps.includes(stepNum)) ??
    pool[0] ??
    (!need.output && need.docType ? scenario.documents.find((d) => !d.output && d.docType === need.docType) : undefined);
  return pick ? { kind: "document", document: pick, url: demoFileUrl(procedureId, pick) } : null;
}
