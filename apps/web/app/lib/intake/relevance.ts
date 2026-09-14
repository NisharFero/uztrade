/* Tier-1 relevance gate: is this text about moving goods at all? Runs before
 * any procedure lookup, so small talk never opens a case or asks a question. */

const TRADE =
  /\b(export|import|ship|shipping|shipment|send|move|transport|deliver|bring|sell|buy|purchase|customs|cargo|freight|consignment|goods|train|rail|wagons?|air|plane|truck|lorry|tonnes?|tons?|kg|procedure|clearance|trade)\b/i;

export function isTradeQuery(text: string): boolean {
  return TRADE.test(text);
}
