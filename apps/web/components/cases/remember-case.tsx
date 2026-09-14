"use client";

import { useEffect } from "react";
import { rememberCase } from "../../modules/cases/last-case";

/** Marks a case as the one checked last, so the dashboard shows its current step. */
export default function RememberCase({ caseId }: { caseId: string }) {
  useEffect(() => {
    rememberCase(caseId);
  }, [caseId]);
  return null;
}
