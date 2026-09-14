/* Delegation: who EXECUTES each step - User, Agent, or Physical.
 *
 * "Online" does not mean "the agent can do it". Three things decide it:
 *
 *   1. Does the platform actually have access to that portal? Some portals a
 *      broker/agent integrates with as a matter of course (Single Window,
 *      the railway cargo portal, certification-body portals, the customs
 *      cabinet under delegated authority). Others are bound to the trader's
 *      own identity and e-signature - my.gov.uz, a "personal cabinet" whose
 *      credentials are the company's, online banking.
 *
 *   2. Is the act legally the trader's? Concluding a contract, accepting a
 *      public offer, submitting a signed declaration and moving money are
 *      the trader's acts even on a portal the agent can otherwise drive.
 *      The agent prepares them; it does not commit them.
 *
 *   3. Does it need the goods? Inspection, fumigation, loading and dispatch
 *      cannot happen remotely at all.
 *
 * Everything else - retrieving a document, generating a certificate, filing a
 * routine application on an integrated portal - the agent does unattended.
 */

import type { ProcedureBlock, ProcedureStep } from "./procedures.generated";

export type Lane = "user" | "agent" | "physical";

export const LANES: { id: Lane; label: string; blurb: string }[] = [
  { id: "user", label: "User", blurb: "Your signature, money, or presence" },
  { id: "agent", label: "Agent", blurb: "Filed automatically on your behalf" },
  { id: "physical", label: "Physical", blurb: "The goods themselves are handled" },
];

/* Portals the platform holds an integration or delegated filing right for.
 * Anything not listed here, the agent cannot log into. */
const AGENT_INTEGRATED = [
  /one-stop service system single window/i,
  /uzbekistan railways single window/i,
  /uzbekexpertiza.*(service portal|portal)/i,
  /assalom agro/i,
  /personal cabinet of participant of foreign economic activity/i,
];

/* Portals bound to the trader's own identity or e-signature. Listed
 * explicitly so the reason shown to the user names the actual blocker. */
const IDENTITY_BOUND: [RegExp, string][] = [
  [/single portal of interactive state services|my\.gov/i, "my.gov.uz needs your e-signature; the agent has no delegated identity there."],
  [/personal cabinet \(oferta\)|agency of plant quarantine.*personal cabinet/i, "This is your quarantine personal cabinet — accepting the offer is your company's act."],
  [/\bbank\b|banking system/i, "Payment must be authorized by the account holder."],
];

/* Acts that stay with the trader even on an integrated portal, because they
 * commit the company rather than merely lodge information. */
const COMMITTING_ACT: [RegExp, string][] = [
  [/^conclude\b|^contract\b|contract with|offer agreement/i, "Concluding an agreement commits your company — the agent prepares it, you sign."],
  [/^submit\b.*declaration|^submit\b.*customs/i, "Submitting a declaration is a signed legal act; the agent drafts it, you submit."],
  [/^register\b.*contract/i, "Registering the trade contract is a legal filing under your company's signature."],
];

/* Acts performed on the cargo itself. Gated to the "In person" channel, and
 * excluded when the title is really paperwork about a physical act
 * ("Obtain approval for loading" is a permit, not the loading). */
const PHYSICAL_ACT = /\bundergo\b|\bload(ing)?\b|\bunload|\bdispatch\b|\bseal(ing)?\b|\bsampl(e|ing)s?\b|\bfumigat|\bweigh|^place cargo|^arrange cargo|\binspection\b|\bhand over\b/i;
const ADMIN_PREFIX = /^(obtain approval|apply|request|conclude|contract|close|create|generate|register|assessment|finalize|complete mutual)/i;

export type Delegation = { lane: Lane; reason: string };

export function delegationOfStep(step: Pick<ProcedureStep, "title" | "channel" | "entity">): Delegation {
  const { title, channel, entity } = step;

  // 3. The goods must be there.
  if (/^in person/i.test(channel) && PHYSICAL_ACT.test(title) && !ADMIN_PREFIX.test(title)) {
    return { lane: "physical", reason: "The goods must be physically present — this cannot be done remotely." };
  }

  // 2a. Money is always the account holder's.
  if (/^online:\s*pay/i.test(channel)) {
    return { lane: "user", reason: "Payment must be authorized by the account holder." };
  }

  if (/^online:/i.test(channel)) {
    // 1. No access to the portal at all.
    for (const [re, reason] of IDENTITY_BOUND) if (re.test(entity)) return { lane: "user", reason };

    // 2b. Access exists, but the act commits the company.
    for (const [re, reason] of COMMITTING_ACT) if (re.test(title)) return { lane: "user", reason };

    // Integrated portal + routine filing or retrieval: the agent drives it.
    if (AGENT_INTEGRATED.some((re) => re.test(entity))) {
      return { lane: "agent", reason: `The platform files directly on ${entity.replace(/"/g, "")}.` };
    }

    // Online, but on a portal we hold no integration for.
    return { lane: "user", reason: `No delegated access to ${entity.replace(/"/g, "")} — you must file this yourself.` };
  }

  // In-person administrative work: contracts, applications, collecting a
  // document against your own identity.
  return { lane: "user", reason: "Requires your signature, identity, or attendance at the counter." };
}

export type LaneMix = {
  counts: { lane: Lane; count: number }[];
  dominant: Lane;
};

export function blockDelegation(block: Pick<ProcedureBlock, "steps">): LaneMix {
  const tally = new Map<Lane, number>();
  for (const s of block.steps) {
    const { lane } = delegationOfStep(s);
    tally.set(lane, (tally.get(lane) ?? 0) + 1);
  }
  const counts = [...tally.entries()]
    .map(([lane, count]) => ({ lane, count }))
    .sort((a, b) => b.count - a.count || LANES.findIndex((x) => x.id === a.lane) - LANES.findIndex((x) => x.id === b.lane));

  return { counts, dominant: counts[0]?.lane ?? "agent" };
}

/* Which column the block sits in. NOT a majority vote: almost every block
 * contains some in-person admin, so "most steps" collapses everything into
 * User and the diagram loses its meaning. The columns are ordered by how
 * binding the constraint is, so each one says something specific:
 *
 *   Physical - cannot complete without the goods, whatever else it contains.
 *   Agent    - no goods needed, and the platform can drive part of it.
 *   User     - entirely on you: nothing automatable, nothing physical.
 */
export function blockColumn(block: Pick<ProcedureBlock, "steps">): Lane {
  const lanes = new Set(block.steps.map((s) => delegationOfStep(s).lane));
  if (lanes.has("physical")) return "physical";
  if (lanes.has("agent")) return "agent";
  return "user";
}

/** Why the block sits in its column, in one sentence. */
export function blockDelegationReason(block: Pick<ProcedureBlock, "steps">): string {
  const mix = blockDelegation(block);
  if (!mix.counts.length) return "No steps to delegate.";

  const column = blockColumn(block);
  const parts = mix.counts
    .map((c) => `${c.count} ${LANES.find((l) => l.id === c.lane)?.label.toLowerCase()}`)
    .join(", ");

  if (column === "physical") {
    return `Needs the goods present, so it cannot finish remotely (${parts}).`;
  }
  if (column === "agent") {
    return `No physical handling — the platform files part of this for you (${parts}).`;
  }
  return `Entirely on you: nothing here can be automated or done by the goods moving (${parts}).`;
}

/* Majority decides the column, which keeps the diagram readable. Physical
 * work is surfaced separately so a block that is mostly filing but needs one
 * inspection still shows that it cannot finish remotely. */
export function requiresPhysical(block: Pick<ProcedureBlock, "steps">): boolean {
  return block.steps.some((s) => delegationOfStep(s).lane === "physical");
}

export function physicalTouchpoints(blocks: Pick<ProcedureBlock, "steps">[]): number {
  return blocks.filter(requiresPhysical).length;
}

/** The physical steps in a block, for the inspection-scheduling note. */
export function physicalSteps(block: Pick<ProcedureBlock, "steps">) {
  return block.steps.filter((s) => delegationOfStep(s).lane === "physical");
}

export function laneBreakdown(blocks: Pick<ProcedureBlock, "steps">[]) {
  const tally = new Map<Lane, number>();
  let total = 0;
  for (const b of blocks)
    for (const s of b.steps) {
      const { lane } = delegationOfStep(s);
      tally.set(lane, (tally.get(lane) ?? 0) + 1);
      total++;
    }
  return LANES.map((l) => ({
    ...l,
    count: tally.get(l.id) ?? 0,
    pct: total ? Math.round(((tally.get(l.id) ?? 0) / total) * 100) : 0,
  }));
}

/* ------------------------------------------------------------ actions --- */

/* The lane says WHO; the action says WHAT that party has to do - and what
 * the agent still does for them. A "User" step is never one thing: signing,
 * paying, filing on a portal we can't reach, and turning up at a counter are
 * different jobs, and the agent's help differs for each. Sign, pay and
 * physical presence are structural gates - no agent capability removes them. */
export type StepAction = "agent" | "sign" | "pay" | "submit" | "attend" | "goods" | "decide";

export const ACTIONS: Record<StepAction, { label: string; agent: string; confirm: string }> = {
  agent: { label: "Agent runs", agent: "Runs it end to end on an integrated portal.", confirm: "" },
  sign: {
    label: "You sign",
    agent: "Pre-fills everything up to your e-signature — it can't hold or use your key.",
    confirm: "Confirm signed",
  },
  pay: {
    label: "You pay",
    agent: "Generates the payment reference and waits for the receipt — it never moves money.",
    confirm: "Confirm payment receipt",
  },
  submit: {
    label: "You submit",
    agent: "Drafts the entries for you — the platform has no access to this portal.",
    confirm: "Confirm submitted",
  },
  attend: {
    label: "You attend",
    agent: "Prepares the papers you bring and tracks the outcome — you appear at the counter.",
    confirm: "Confirm attended",
  },
  goods: {
    label: "At the goods",
    agent: "Books the slot where a booking flow exists and tracks status — the goods and a person must be there.",
    confirm: "Confirm done",
  },
  decide: {
    label: "You decide",
    agent: "Lays out the options — you choose which route this shipment takes.",
    confirm: "Confirm choice",
  },
};

export function actionOfStep(step: Pick<ProcedureStep, "title" | "channel" | "entity" | "optional" | "alternative">): StepAction {
  if (step.optional || step.alternative) return "decide";
  const { lane } = delegationOfStep(step);
  if (lane === "agent") return "agent";
  if (lane === "physical") return "goods";
  if (/^online:\s*pay/i.test(step.channel) || /\bbank\b|banking system/i.test(step.entity)) return "pay";
  if (COMMITTING_ACT.some(([re]) => re.test(step.title))) return "sign";
  if (/^online:/i.test(step.channel)) {
    return IDENTITY_BOUND.some(([re]) => re.test(step.entity)) ? "sign" : "submit";
  }
  return "attend";
}
