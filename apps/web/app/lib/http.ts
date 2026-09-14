export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "A JSON object body is required");
  }
}

export function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (error instanceof HttpError) return Response.json({ error: message }, { status: error.status });
  if (/not found/i.test(message)) return Response.json({ error: message }, { status: 404 });
  if (/already completed|already exists|invalid transition/i.test(message)) return Response.json({ error: message }, { status: 409 });
  if (/cycle|dependency|procedure/i.test(message)) return Response.json({ error: message }, { status: 422 });
  return Response.json({ error: message }, { status: 500 });
}

export const requiredString = (body: Record<string, unknown>, key: string) => {
  const value = typeof body[key] === "string" ? body[key].trim() : "";
  if (!value) throw new HttpError(400, `${key} is required`);
  return value;
};
