import { listPersistedEntityWorkItems } from "../../../../../modules/entities/mock-api";
import { routeError } from "../../../../../modules/shared/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    return Response.json({ workItems: await listPersistedEntityWorkItems((await params).id) });
  } catch (error) {
    return routeError(error);
  }
}
