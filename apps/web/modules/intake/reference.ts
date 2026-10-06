import { CATALOGUE, PROCEDURE_IDS } from "../procedures/data/procedures.generated";
import { isProcedureQuestion } from "./relevance";

const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function procedureTitleCandidates(query: string): string[] {
  if (isProcedureQuestion(query)) return [];
  const asked = normalize(query.replace(/^\s*(?:(?:i|we)\s+(?:want|need)\s+to\s+)?(?:start|use|follow|open)\s+(?:the\s+)?/i, ""));
  return PROCEDURE_IDS.filter((id) => normalize(CATALOGUE[id].title) === asked);
}

/** Resolve a deliberate selection. Questions and negated references are never
 * interpreted as instructions to start a procedure. Same-title variants need
 * an id; the catalogue does not contain enough facts to choose between them. */
export function procedureReferenceIn(query: string): { id: string; reason: string } | null {
  if (isProcedureQuestion(query)) return null;
  const refs = [...query.matchAll(/\bprocedure\s*(?:id\s*)?[#:]?\s*(\d{1,6})\b/gi)];
  if (refs.length) {
    if (/\b(not|don['’]?t|cancel|instead of)\b/i.test(query)) return null;
    if (refs.length !== 1 || !CATALOGUE[refs[0][1]]) return null;
    const id = refs[0][1];
    return { id, reason: `Procedure ${id} was named explicitly: ${CATALOGUE[id].title}.` };
  }
  const ids = procedureTitleCandidates(query);
  return ids.length === 1 ? { id: ids[0], reason: `Matched the published procedure title: ${CATALOGUE[ids[0]].title}.` } : null;
}
