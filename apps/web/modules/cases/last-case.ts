/* The case you checked last, remembered in a cookie so the dashboard can show
 * its current step below the chat. No database access: safe on both the
 * server (reads the cookie name) and the client (writes the cookie). */

export const LAST_CASE_COOKIE = "uztrade_last_case";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function rememberCase(caseId: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LAST_CASE_COOKIE}=${encodeURIComponent(caseId)}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}
