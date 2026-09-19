import { getRuntimeEnv } from "@/modules/runtime/env";
const env = getRuntimeEnv();
import { resetAllCases } from "../../../../modules/cases/current-case";
import { HttpError, jsonBody, routeError } from "../../../../modules/shared/http";

/** Deletes all cases, workflow state, ledger entries and uploaded originals.
 *  Irreversible, so the body must spell it out. */
export async function POST(request: Request) {
  try {
    if (process.env.VERCEL) throw new HttpError(403, "Reset is disabled on Vercel");
    const body = await jsonBody(request);
    if (body.confirm !== "delete all cases") throw new HttpError(400, 'Send {"confirm":"delete all cases"} to reset');
    const bucket = (env as unknown as { DOCS?: Parameters<typeof resetAllCases>[0] }).DOCS;
    return Response.json(await resetAllCases(bucket));
  } catch (error) {
    return routeError(error);
  }
}
