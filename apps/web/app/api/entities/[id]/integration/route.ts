import { getEntity } from "../../../../../modules/catalog/catalog";
import { entityIntegrationProfile } from "../../../../../modules/entities/mock-api";
import { routeError } from "../../../../../modules/shared/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const entity = await getEntity((await params).id);
    return entity
      ? Response.json({ integration: entityIntegrationProfile(entity) })
      : Response.json({ error: "entity not found" }, { status: 404 });
  } catch (error) {
    return routeError(error);
  }
}
