"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "../icons";

export default function EntityAction({ workItemId, entityId }: { workItemId: string; entityId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/work-items/${encodeURIComponent(workItemId)}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completedBy: entityId, result: { outcome: "completed", verified: true, mock: true } }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not complete the step");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not complete the step");
      setBusy(false);
    }
  };

  return (
    <div className="entity-action">
      <button type="button" disabled={busy} onClick={complete} title="Complete mock entity step">
        <span className="btn-icon">{busy ? Icon.loader : Icon.check}</span>
        {busy ? "Completing" : "Complete mock step"}
      </button>
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}
