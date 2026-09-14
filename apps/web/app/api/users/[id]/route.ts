import { getUser, updateUser } from "../../../lib/backend-catalog";
import { jsonBody, routeError } from "../../../lib/http";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_r: Request, { params }: Ctx) { try { const value = await getUser((await params).id); return value ? Response.json({ user: value }) : Response.json({ error: "user not found" }, { status: 404 }); } catch (e) { return routeError(e); } }
export async function PATCH(r: Request, { params }: Ctx) { try { const value = await updateUser((await params).id, await jsonBody(r)); return value ? Response.json({ user: value }) : Response.json({ error: "user not found" }, { status: 404 }); } catch (e) { return routeError(e); } }
export async function DELETE(_r: Request, ctx: Ctx) { return PATCH(new Request("http://local", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "inactive" }) }), ctx); }
