/* Document Intelligence agent.
 *
 * Modelled on the platform pattern this app follows: "AI checks completeness
 * and extracts values; flags missing or inconsistent fields" - then the
 * broker supplies what's missing before the case can move on. This app has
 * no file storage, so "extraction" here means checking off the procedure's
 * own declared step outputs against what the trader has confirmed as
 * supplied, rather than reading a real uploaded file. The gate this produces
 * is real: a block cannot complete while a required output is outstanding.
 */

import type { Procedure, ProcedureBlock, ProcedureStep } from "../data/procedures.generated";

export type RequiredOutput = {
  blockId: string;
  stepNum: number;
  title: string;
  output: string;
  optional: boolean;
};

export type OutputState = { provided: boolean; note?: string };
export type DocumentState = Record<string, OutputState>;

const key = (blockId: string, stepNum: number) => `${blockId}:${stepNum}`;

/** A step counts as producing a document worth tracking when it declares a
 *  non-empty output and isn't itself an optional/alternative route. */
function isTrackedOutput(step: ProcedureStep): boolean {
  return step.output.trim().length > 0;
}

export function requiredOutputsOf(block: ProcedureBlock): RequiredOutput[] {
  return block.steps
    .filter(isTrackedOutput)
    .map((s) => ({ blockId: block.id, stepNum: s.num, title: s.title, output: s.output, optional: s.optional }));
}

export function requiredOutputsForProcedure(procedure: Procedure): RequiredOutput[] {
  return procedure.blocks.flatMap(requiredOutputsOf);
}

export type BlockChecklist = {
  required: RequiredOutput[];
  missing: RequiredOutput[];
  complete: boolean;
};

/** The checklist for one block: which of its non-optional outputs are still
 *  outstanding. Optional-route outputs never block completion - the source
 *  data marks them optional precisely because the procedure has another path. */
export function checklistFor(block: ProcedureBlock, state: DocumentState): BlockChecklist {
  const required = requiredOutputsOf(block);
  const missing = required.filter((r) => !r.optional && !state[key(r.blockId, r.stepNum)]?.provided);
  return { required, missing, complete: missing.length === 0 };
}

/** Every block's checklist for a procedure, keyed by block id - what the
 *  Document Intelligence panel on a case page renders. */
export function caseChecklist(procedure: Procedure, state: DocumentState): Map<string, BlockChecklist> {
  return new Map(procedure.blocks.map((b) => [b.id, checklistFor(b, state)]));
}

export function parseDocumentState(raw: string): DocumentState {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as DocumentState) : {};
  } catch {
    return {};
  }
}

/** Marks one output provided (or notes why it doesn't apply) - the trader
 *  resolving the agent's amendment request. */
export function markOutput(
  state: DocumentState,
  blockId: string,
  stepNum: number,
  provided: boolean,
  note?: string,
): DocumentState {
  return { ...state, [key(blockId, stepNum)]: { provided, note } };
}

export function outputKey(blockId: string, stepNum: number): string {
  return key(blockId, stepNum);
}
