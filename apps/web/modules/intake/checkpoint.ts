import { evaluate, type IntakeTurn } from "./conversation";
import { isEmptyDraft, parseDraft } from "./draft";

export const INTAKE_CHECKPOINT_KEY = "uztrade.intake.v1";
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

/** Keep structured intake independently of the visible transcript. Rebuild
 * the next question against today's catalogue; never trust stored summaries. */
export function restoreIntake(storage: Storage): IntakeTurn | null {
  try {
    const raw = JSON.parse(storage.getItem(INTAKE_CHECKPOINT_KEY) ?? "null");
    if (raw?.version !== 1) return null;
    const draft = parseDraft(raw.draft);
    return isEmptyDraft(draft) ? null : evaluate(draft);
  } catch { return null; }
}

export function saveIntake(storage: Storage, turn: IntakeTurn | null): void {
  try {
    if (!turn || isEmptyDraft(turn.draft)) storage.removeItem(INTAKE_CHECKPOINT_KEY);
    else storage.setItem(INTAKE_CHECKPOINT_KEY, JSON.stringify({ version: 1, draft: turn.draft }));
  } catch { /* A storage restriction must not interrupt the current turn. */ }
}
