import { listProcedureVersions, publishProcedureVersion } from "../../../../modules/catalog/catalog";
import { jsonBody, routeError } from "../../../../modules/shared/http";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_r: Request, { params }: Ctx) { try { const values = await listProcedureVersions((await params).id); return values.length ? Response.json({ procedures: values }) : Response.json({ error: "procedure not found" }, { status: 404 }); } catch (e) { return routeError(e); } }
export async function PATCH(r: Request, { params }: Ctx) { try { const b = await jsonBody(r); if (b.status !== "published") return Response.json({ error: "Only publishing is supported; procedure versions are immutable" }, { status: 400 }); const value = await publishProcedureVersion((await params).id); return value ? Response.json({ procedure: value }) : Response.json({ error: "procedure version not found" }, { status: 404 }); } catch (e) { return routeError(e); } }
