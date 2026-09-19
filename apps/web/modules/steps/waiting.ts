/* Who a step is waiting on - shared by the measured timing and the schedule
 * so both name the same four parties. */

export type WaitingOn = "you" | "entity" | "goods" | "agent";

export const WAITING_LABEL: Record<WaitingOn, string> = {
  you: "You",
  entity: "An entity",
  goods: "At the goods",
  agent: "The agent",
};

export function laneWaitingOn(lane: string, state?: string): WaitingOn {
  if (lane === "physical") return "goods";
  if (lane === "user") return "you";
  // An agent step sits with an entity while its application is under review.
  return state === "running" ? "entity" : state === "needs_input" ? "you" : "agent";
}
