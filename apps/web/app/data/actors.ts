/* Who is involved in a step.
 *
 * `performedBy` is blank on 226 of the 244 steps, so the actor has to be
 * derived from the entity you deal with plus the channel you deal through.
 * Two different questions are answered here and they must not be conflated:
 *
 *   counterpartyOf(entity) - WHO you are dealing with (bank, ministry, carrier)
 *   actorOfStep(step)      - WHO does the work, which is what the swimlanes show
 *
 * An online filing at Single Window has a GOVERNMENT counterparty but is
 * performed by our AGENT; that distinction is the whole point of the product.
 */

import type { ProcedureBlock, ProcedureStep } from "./procedures.generated";

export type Actor = "trader" | "agent" | "bank" | "government" | "transport";

export const ACTORS: { id: Actor; label: string; blurb: string }[] = [
  { id: "trader", label: "Trader", blurb: "You and your premises" },
  { id: "agent", label: "Agent", blurb: "Automated by UzTrade" },
  { id: "bank", label: "Bank", blurb: "Payments" },
  { id: "government", label: "Government", blurb: "Ministries & customs" },
  { id: "transport", label: "Transport", blurb: "Carriers & terminals" },
];

/* Rule order is load-bearing. `Customs post "Avia yuklar" at the airport's
   warehouse` must match customs before warehouse, and `Customs warehouse` is a
   bonded cargo facility (unloading, placement, departure) rather than a
   government office - so it is matched explicitly before both. */
const COUNTERPARTY_RULES: [RegExp, Exclude<Actor, "agent">][] = [
  [/\bbank\b|banking system/i, "bank"],
  // Bonded/again physical cargo facilities that happen to contain "customs".
  [/customs warehouse/i, "transport"],
  // Government offices, including customs posts.
  [/customs post|customs control|group of customs/i, "government"],
  [
    /quarantine|karantin|expertiza|single window|singlewindow|state services|my\.gov|sanitary|epidemiolog|ministry|committee|agency of plant|border checkpoint|assalom agro|standard/i,
    "government",
  ],
  [
    /railway|temir yo|forwarding|freight|station|airport|airline|terminal|junction|cargo sales agent|postal cargo|place of loading|branch line|transport/i,
    "transport",
  ],
  // The trader's own filings and premises.
  [/personal cabinet of participant|customs broker|warehouse|location of goods/i, "trader"],
];

/** Who the step is transacted with. Falls back to government (the residual
 *  category for official bodies) rather than throwing, so an unrecognised
 *  entity degrades to a sensible column instead of breaking the page. */
export function counterpartyOf(entity: string): Exclude<Actor, "agent"> {
  for (const [re, actor] of COUNTERPARTY_RULES) if (re.test(entity)) return actor;
  return "government";
}

/** Who performs the work - this is what the swimlane column represents. */
export function actorOfStep(step: Pick<ProcedureStep, "entity" | "channel">): Actor {
  // A payment always involves the bank, whoever the money goes to.
  if (/^online:\s*pay/i.test(step.channel)) return "bank";
  // Any other online channel is a filing our agents can drive.
  if (/^online:/i.test(step.channel)) return "agent";
  return counterpartyOf(step.entity);
}

export type ActorMix = {
  /** Step count per actor, highest first. */
  counts: { actor: Actor; count: number }[];
  /** The actor doing most of the work - decides the block's column. */
  dominant: Actor;
};

export function blockActors(block: Pick<ProcedureBlock, "steps">): ActorMix {
  const tally = new Map<Actor, number>();
  for (const s of block.steps) {
    const a = actorOfStep(s);
    tally.set(a, (tally.get(a) ?? 0) + 1);
  }
  const counts = [...tally.entries()]
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || ACTORS.findIndex((x) => x.id === a.actor) - ACTORS.findIndex((x) => x.id === b.actor));

  return { counts, dominant: counts[0]?.actor ?? "agent" };
}

/** Share of steps a given actor performs across a whole procedure. */
export function actorBreakdown(blocks: Pick<ProcedureBlock, "steps">[]) {
  const tally = new Map<Actor, number>();
  let total = 0;
  for (const b of blocks)
    for (const s of b.steps) {
      const a = actorOfStep(s);
      tally.set(a, (tally.get(a) ?? 0) + 1);
      total++;
    }
  return ACTORS.map((a) => ({
    ...a,
    count: tally.get(a.id) ?? 0,
    pct: total ? Math.round(((tally.get(a.id) ?? 0) / total) * 100) : 0,
  }));
}
