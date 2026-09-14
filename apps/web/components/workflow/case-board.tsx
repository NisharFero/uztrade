"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CaseLedger from "./case-ledger";
import CompliancePanel from "../compliance/compliance-panel";
import Dag, { type CaseBlockState, type WorkflowDag } from "./dag";
import DocumentPanel from "../documents/document-panel";
import ShipmentPlanPanel from "./shipment-plan";
import type { ShipmentFacts } from "../../modules/workflow/domain";
import { PROCEDURES } from "../../modules/procedures/data/procedures.generated";
import { AUTO_VERIFIED_NOTE, dueOutputs, stepPhaseResolver } from "../../modules/documents/agent-tasks";
import {
  outputKey,
  parseDocumentState,
  type BlockChecklist,
  type DocumentState,
  type RequiredOutput,
} from "../../modules/documents/checklist";

type Progress = Record<string, CaseBlockState>;

type CaseBody = {
  blocks: { blockId: string; state: string; actualHours: number | null }[];
  documentState: string;
};

/** Long enough for the spinner on a document to register before it ticks;
 *  the write itself is usually faster than a frame or two. */
const VERIFY_MIN_MS = 450;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Thin client wrapper: owns the optimistic progress + document state so
 *  completing a block re-renders without a full page round-trip. The server
 *  remains the source of truth - every PATCH response replaces local state
 *  rather than being merged into it.
 *
 *  It also runs the Document Intelligence agent's auto-verification: when a
 *  step that produces a document completes, the agent verifies that document
 *  itself and persists it - the trader is never asked to confirm it. */
export default function CaseBoard({
  caseId,
  procedureId,
  initialProgress,
  initialDocumentState,
  initialWorkflow,
  shipment,
  query,
}: {
  caseId: string;
  procedureId: string;
  initialProgress: Progress;
  initialDocumentState: DocumentState;
  initialWorkflow?: WorkflowDag;
  /** What the trader said they are moving - sizes the shipment plan. */
  shipment?: ShipmentFacts;
  query?: string;
}) {
  const [progress, setProgress] = useState<Progress>(initialProgress);
  const [documentState, setDocumentState] = useState<DocumentState>(initialDocumentState);
  const busy = false;
  const [error, setError] = useState<string | null>(null);
  const workflow = initialWorkflow;
  const [verifying, setVerifying] = useState<string | null>(null);

  /* documentState is read-modify-written on the server, so two verifications
     in flight at once could drop one. Every write goes through this chain. */
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const serialize = <T,>(job: () => Promise<T>): Promise<T> => {
    const run = writes.current.then(job, job);
    writes.current = run.catch(() => undefined);
    return run;
  };

  const procedure = PROCEDURES[procedureId];

  const phaseOf = useMemo(
    () =>
      stepPhaseResolver({
        blockStates: Object.fromEntries(Object.entries(progress).map(([id, p]) => [id, p.state])),
        workflowNodes: workflow?.nodes,
      }),
    [progress, workflow],
  );

  const due = useMemo(
    () => (procedure ? dueOutputs(procedure, documentState, phaseOf) : []),
    [procedure, documentState, phaseOf],
  );

  const applyCase = (body: { case?: CaseBody }) => {
    if (!body.case) return;
    setProgress(
      Object.fromEntries(
        body.case.blocks.map((b) => [b.blockId, { state: b.state as CaseBlockState["state"], actualHours: b.actualHours }]),
      ),
    );
    setDocumentState(parseDocumentState(body.case.documentState));
  };

  const patch = async (payload: Record<string, unknown>) => {
    const response = await fetch(`/api/cases/${caseId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as {
      case?: CaseBody;
      needsAmendment?: boolean;
      checklist?: BlockChecklist;
      error?: string;
    };
    return { response, body };
  };

  /** The agent verifying one document: spinner on, persist, tick. */
  const verify = async (r: RequiredOutput) => {
    setVerifying(outputKey(r.blockId, r.stepNum));
    try {
      const [{ response, body }] = await Promise.all([
        patch({ action: "provide-output", blockId: r.blockId, stepNum: r.stepNum, provided: true, note: AUTO_VERIFIED_NOTE }),
        pause(VERIFY_MIN_MS),
      ]);
      if (!response.ok || !body.case) throw new Error(body.error ?? "Document Intelligence could not save a verification");
      applyCase(body);
      return parseDocumentState(body.case.documentState);
    } finally {
      setVerifying(null);
    }
  };

  /* Auto-verification runner: one document at a time, in procedure order,
     whenever a finished step leaves a document unverified. Paused while a
     block completion is in flight - that path verifies its own documents. */
  const failed = useRef(false);
  useEffect(() => {
    if (busy || verifying || failed.current || due.length === 0) return;
    const next = due[0];
    serialize(() => verify(next)).catch((e) => {
      failed.current = true; // stop retrying a write the server keeps refusing
      setError(e instanceof Error ? e.message : "Network error");
    });
    // verify/serialize are recreated each render; the queue is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due, busy, verifying]);

  // Steps are completed in the step assistant above, which checks every need
  // first; this board shows the workflow and runs document verification.
  if (!procedure) return null;

  return (
    <>
      {error ? (
        <p className="query-note" data-tone="error">
          {error}
        </p>
      ) : null}

      <ShipmentPlanPanel
        procedure={procedure}
        facts={shipment ?? workflow?.shipment ?? { goods: procedure.goods, quantity: null, unit: null, origin: null, destination: null, mode: null }}
        query={query}
      />

      <Dag
        procedure={procedure}
        progress={progress}
        documentState={documentState}
        busy={busy}
        workflow={workflow}
        caseId={caseId}
      />

      <div className="case-columns">
        <DocumentPanel procedure={procedure} documentState={documentState} phaseOf={phaseOf} verifying={verifying} />
        <CompliancePanel procedure={procedure} facts={shipment ?? workflow?.shipment} query={query} caseId={caseId} />
      </div>

      <CaseLedger caseId={caseId} procedure={procedure} version={workflow} />
    </>
  );
}
