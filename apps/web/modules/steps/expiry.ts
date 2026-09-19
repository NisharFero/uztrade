/* What expires, against the time the case still needs.
 *
 * Entities issue things with their own validity - a railway cost calculation
 * lasts days, an internal phytosanitary certificate weeks, a quarantine permit
 * months - and uploaded documents carry validity dates of their own. If one
 * runs out before the shipment finishes, the step that produced it has to be
 * done again, which is the most expensive kind of delay. Every date here is
 * one an entity or a document stated; nothing is assumed. */

import { normalizeDate } from "../documents/docai/validate";
import { latestRecords } from "../portals/records";
import type { Hours } from "../intake/shipment-plan";
import type { WorkflowProjection } from "../workflow/repository";
import type { Ledger } from "./ledger";

export type ExpiryStatus = "expired" | "before_completion" | "soon" | "ok";

export type ExpiringItem = {
  label: string;
  reference: string | null;
  validUntil: string;
  daysLeft: number;
  status: ExpiryStatus;
  /** Where the date came from. */
  source: string;
  stepNum: number | null;
  action: string;
};

const DAY = 86_400_000;
const VALIDITY_KEY = /valid[_ ]?(until|till|to)|expir/i;
const SOON_DAYS = 7;

const dayOf = (iso: string) => Date.parse(`${iso}T23:59:59Z`);

function statusOf(validUntil: string, now: Date, completion: Date): ExpiryStatus {
  const ends = dayOf(validUntil);
  if (ends < now.getTime()) return "expired";
  if (ends < completion.getTime()) return "before_completion";
  return ends - now.getTime() < SOON_DAYS * DAY ? "soon" : "ok";
}

/** Everything with a stated validity date, worst first. */
export function expiringItems(input: { projection: WorkflowProjection; ledger: Ledger; remainingHours: Hours; now?: Date }): ExpiringItem[] {
  const now = input.now ?? new Date();
  const completion = new Date(now.getTime() + input.remainingHours[1] * 3_600_000);
  const items: ExpiringItem[] = [];

  for (const record of latestRecords(input.projection).values()) {
    if (record.status !== "approved") continue;
    for (const [key, value] of Object.entries(record.outputs)) {
      if (!VALIDITY_KEY.test(key)) continue;
      const validUntil = normalizeDate(value);
      if (!validUntil) continue;
      items.push({
        label: record.serviceTitle,
        reference: record.reference,
        validUntil,
        daysLeft: Math.floor((dayOf(validUntil) - now.getTime()) / DAY),
        status: statusOf(validUntil, now, completion),
        source: `${record.entityName}, step ${record.stepNum}`,
        stepNum: record.stepNum,
        action: `File step ${record.stepNum} again to get a current one`,
      });
    }
  }

  for (const doc of input.ledger.documents) {
    for (const field of doc.fields) {
      if (!VALIDITY_KEY.test(field.key) || !field.value) continue;
      const validUntil = normalizeDate(String(field.normalized ?? field.value));
      if (!validUntil) continue;
      items.push({
        label: doc.label,
        reference: null,
        validUntil,
        daysLeft: Math.floor((dayOf(validUntil) - now.getTime()) / DAY),
        status: statusOf(validUntil, now, completion),
        source: `${field.label} on ${doc.fileName}`,
        stepNum: doc.stepNum,
        action: "Check it still covers the shipment when it arrives",
      });
    }
  }

  const rank: Record<ExpiryStatus, number> = { expired: 0, before_completion: 1, soon: 2, ok: 3 };
  return items.sort((a, b) => rank[a.status] - rank[b.status] || a.daysLeft - b.daysLeft);
}
