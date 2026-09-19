"use client";

import { useRouter } from "next/navigation";

/** Which case the ledger page shows. */
export default function CasePicker({ cases, selected }: { cases: { id: string; label: string }[]; selected: string }) {
  const router = useRouter();
  return (
    <label className="ledger-picker">
      <span className="wf-detail-h">Case</span>
      <select value={selected} onChange={(event) => router.push(`/ledger?case=${encodeURIComponent(event.target.value)}`)}>
        {cases.map((c) => (
          <option key={c.id} value={c.id}>
            {c.id} · {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
