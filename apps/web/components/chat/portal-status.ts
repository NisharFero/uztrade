import type { AssistantView } from "../../modules/steps/assistant";

/** One entity API application as the case view reports it. */
export type PortalRow = AssistantView["portals"][number];

/** What each decision is called on screen. Lived in the step assistant until
 *  the dashboard became a chat; the ledger still shows these. */
export const PORTAL_STATUS: Record<PortalRow["status"], string> = {
  rejected: "Not accepted",
  under_review: "Under review",
  changes_requested: "Changes requested",
  approved: "Approved",
};
