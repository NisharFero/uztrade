/* Tier-1 relevance gate: is this text about moving goods at all? Runs before
 * any procedure lookup, so small talk never opens a case or asks a question. */

const TRADE =
  /\b(export|import|ship|shipping|shipment|send|move|transport|deliver|bring|sell|buy|purchase|customs|cargo|freight|consignment|goods|train|rail|wagons?|air|plane|truck|lorry|tonnes?|tons?|kg|procedure|clearance|trade)\b/i;

const PROCEDURE_QUESTION =
  /\b(documents?|docs?|papers?|requirements?|required|needed|need|provide|details?|fields?|steps?|stages?|stage|procedure|process|approval|approved|approve|entities?|time|duration|how long|status)\b/i;
const QUESTION_SHAPE =
  /\?|\b(what|which|how|when|where|who|why|can|could|should|do|does|is|are)\b/i;
const SHIPMENT_REQUEST =
  /\b(i|we)\s+(want|need|plan|would like|am trying|are trying)\s+to\s+(export|import|ship|send|move|transport)\b|\b(export|import|ship|send|move|transport)\s+\d/i;

export function isTradeQuery(text: string): boolean {
  return TRADE.test(text);
}

/** True when the trader is asking for guidance, not opening a shipment case. */
export function isProcedureQuestion(text: string): boolean {
  return PROCEDURE_QUESTION.test(text) && QUESTION_SHAPE.test(text) && !SHIPMENT_REQUEST.test(text);
}
