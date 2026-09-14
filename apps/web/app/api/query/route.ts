import { env } from "cloudflare:workers";
import { openCaseFromQuery } from "../../lib/case-orchestration-service";
import { buildDagProjection } from "../../lib/dag-projection";

function toRouteErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (/no such table|D1 binding/i.test(message)) {
    return 'The case tables are unavailable. Set `"d1": "DB"` in .openai/hosting.json and run `npm run db:generate`, then restart the dev server.';
  }
  return message;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { query?: string; followUps?: unknown };
    const query = payload.query?.trim() ?? "";
    if (!query) {
      return Response.json({ error: "query is required" }, { status: 400 });
    }
    const followUps = typeof payload.followUps === "number" && payload.followUps > 0 ? Math.floor(payload.followUps) : 0;

    const apiKey = (env as unknown as { GROQ_API_KEY?: string }).GROQ_API_KEY;
    const result = await openCaseFromQuery(query, apiKey, { followUps });

    if (!result.matched) {
      // Out of scope: name what IS supported rather than guessing a procedure.
      return Response.json(
        {
          matched: false,
          status: result.match.status,
          reason: result.match.reason,
          matchedBy: result.match.matchedBy,
          clarify: result.match.clarify,
          missing: result.match.missing,
          candidates: result.match.candidates,
          slots: result.match.slots,
          rationale: result.match.rationale,
          supported: result.supported,
        },
        { status: 200 },
      );
    }

    return Response.json(
      {
        matched: true,
        caseId: result.case.id,
        procedureId: result.match.procedureId,
        title: result.case.title,
        reason: result.match.reason,
        confidence: result.match.confidence,
        matchedBy: result.match.matchedBy,
        status: result.match.status,
        workflowRunId: result.workflow.run.id,
        shipment: result.match.shipmentFacts,
        slots: result.match.slots,
        rationale: result.match.rationale,
        plan: result.match.plan,
        dag: buildDagProjection(result.workflow),
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
