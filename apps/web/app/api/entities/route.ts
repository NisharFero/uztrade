import { createEntity, listEntities } from "../../lib/backend-catalog";
import { jsonBody, requiredString, routeError } from "../../lib/http";
export async function GET() { try { return Response.json({ entities: await listEntities() }); } catch (e) { return routeError(e); } }
export async function POST(request: Request) { try { const b = await jsonBody(request); return Response.json({ entity: await createEntity({ canonicalName: requiredString(b, "canonicalName"), type: requiredString(b, "type"), capabilities: Array.isArray(b.capabilities) ? b.capabilities : [], contact: b.contact && typeof b.contact === "object" ? b.contact : {} }) }, { status: 201 }); } catch (e) { return routeError(e); } }
