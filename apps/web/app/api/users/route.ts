import { createUser, listUsers } from "../../lib/backend-catalog";
import { jsonBody, requiredString, routeError } from "../../lib/http";
export async function GET() { try { return Response.json({ users: await listUsers() }); } catch (e) { return routeError(e); } }
export async function POST(request: Request) { try { const b = await jsonBody(request); return Response.json({ user: await createUser({ displayName: requiredString(b, "displayName"), email: requiredString(b, "email"), role: requiredString(b, "role"), capabilities: Array.isArray(b.capabilities) ? b.capabilities : [] }) }, { status: 201 }); } catch (e) { return routeError(e); } }
