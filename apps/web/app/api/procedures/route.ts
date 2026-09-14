import type { Procedure } from "../../../modules/procedures/data/procedures.generated";
import { createProcedureVersion, listProcedureVersions } from "../../../modules/catalog/catalog";
import { jsonBody, routeError } from "../../../modules/shared/http";
export async function GET() { try { return Response.json({ procedures: await listProcedureVersions() }); } catch (e) { return routeError(e); } }
export async function POST(request: Request) { try { const body = await jsonBody(request); const definition = (body.definition ?? body) as unknown as Procedure; return Response.json({ procedure: await createProcedureVersion(definition, body.publish === true) }, { status: 201 }); } catch (e) { return routeError(e); } }
