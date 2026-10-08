/** Confirmation must be the whole reply, never the start of a new request. */
export const confirmsShipment = (message: string): boolean =>
  /^\s*(go|yes|yep|yeah|ok(ay)?|sure|start|begin|do it|go ahead|open it|let'?s go|please do)(?:\s+please)?[.!\s]*$/i.test(message);
