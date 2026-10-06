/** "3–10 days" or "12–30 hours": a range carries its unit once. */
export function hours(range: [number, number] | null | undefined): string {
  if (!range) return "—";
  const days = range[1] >= 48;
  const value = (n: number) => (days ? Math.round(n / 24) : Math.round(n));
  const unit = days ? "days" : "hours";
  const low = value(range[0]);
  const high = value(range[1]);
  return low === high ? `${high} ${unit}` : `${low}–${high} ${unit}`;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const LANE_LABEL: Record<string, string> = { user: "You", agent: "Agent", physical: "At the goods" };

/** JSON from a response, or a readable error. */
export async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || fallback);
  return body;
}
