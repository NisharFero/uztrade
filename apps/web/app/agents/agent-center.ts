/* The five agents, as the prototype specifies them — UI only.
 *
 * These are role agents (intake, documents, sequencing, assurance, movement),
 * which is a different cut from the portal agents further down the page: those
 * are assigned from the live corpus by the entity they file against, and their
 * "handling now" is read from the database.
 *
 * The figures here are the specification's, not this build's. They are quoted
 * from a 245-procedure snapshot totalling 5,601 steps; this corpus holds 243
 * procedures and 5,539 steps, so they will not add up to what the live
 * sections report, and the page says so rather than implying otherwise.
 *
 * The stop rules and this file's lane words are also the specification's and
 * do NOT mean what `modules/procedures/delegation.ts` means by a lane. There,
 * `agent` is "the platform holds a delegated filing right", which covers 1,825
 * steps; here, "agent runs it" is "nothing published stands in the way", which
 * is 59. Two different questions, deliberately not conflated — which is why
 * none of this is computed from the corpus. */

export type RoleAgent = {
  id: string;
  name: string;
  /** The one word the prototype files it under. */
  role: string;
  blurb: string;
  /** Null for the agent that acts before a case has any steps. */
  steps: number | null;
  procedures: number | null;
  /** Autonomy split, in the specification's own words. */
  split: { label: string; count: number }[];
};

export const ROLE_AGENTS: RoleAgent[] = [
  {
    id: "concierge",
    name: "Shipment Concierge",
    role: "Intake",
    blurb: "Turns one sentence into the right procedure out of 245, and opens the case.",
    steps: null,
    procedures: null,
    split: [],
  },
  {
    id: "documents",
    name: "Document Intelligence",
    role: "Documents",
    blurb: "Reads what the trader already has, and fills what the state asks for.",
    steps: 1710,
    procedures: 239,
    split: [
      { label: "auto", count: 49 },
      { label: "sign", count: 1161 },
      { label: "physical", count: 500 },
    ],
  },
  {
    id: "orchestrator",
    name: "Orchestrator",
    role: "Sequencing",
    blurb: "Runs independent tracks in parallel and settles every fee on time.",
    steps: 2009,
    procedures: 237,
    split: [
      { label: "auto", count: 6 },
      { label: "sign", count: 323 },
      { label: "pay", count: 649 },
      { label: "physical", count: 1031 },
    ],
  },
  {
    id: "risk",
    name: "Risk & Exception",
    role: "Assurance",
    blurb: "Predicts the rejection while the cargo can still be fixed.",
    steps: 379,
    procedures: 136,
    split: [
      { label: "auto", count: 3 },
      { label: "sign", count: 48 },
      { label: "decide", count: 79 },
      { label: "physical", count: 249 },
    ],
  },
  {
    id: "transit",
    name: "Transit & Capacity",
    role: "Movement",
    blurb: "Chooses the crossing, the carrier and the hour to arrive.",
    steps: 1503,
    procedures: 210,
    split: [
      { label: "auto", count: 1 },
      { label: "sign", count: 120 },
      { label: "pay", count: 41 },
      { label: "physical", count: 1341 },
    ],
  },
];

/** Where an agent stops, and why it has to. */
export const STOP_RULES = [
  { id: "sign", rule: "Agent prepares · you sign", steps: 1652, why: "A signature is an act of a person holding a key." },
  { id: "pay", rule: "Agent prepares · you pay", steps: 690, why: "Money leaving an account is authorised by whoever owns it." },
  { id: "attend", rule: "Agent prepares · someone attends", steps: 3121, why: "The procedure offers no remote route." },
  { id: "choose", rule: "Agent advises · you choose", steps: 79, why: "The procedure forks. An agent recommends; the trader chooses." },
  { id: "alone", rule: "Agent runs it", steps: 59, why: "Nothing published stands in the way." },
];

export const SPEC_STEPS = 5601;
export const SPEC_PROCEDURES = 245;
/** Steps that need a person somewhere in them: everything but "agent runs it". */
export const SPEC_ATTENDED = 5542;
