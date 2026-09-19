/* Help with a field an entity refused or sent back: values that would fix it,
 * and a plain-words explanation.
 *
 * Values come only from rules and data, never from a model's imagination:
 * the number or option the entity itself named, the HS nomenclature (a model
 * may re-rank those codes), the trader's own value in the right shape, and the
 * other values the case holds for the field. A model writes the explanation
 * from those facts; if the field's values came from documents, only a local
 * model may. The trader picks a value - nothing is filled in for them. */

import { z } from "zod";
import { llmJson, type LlmClient } from "../ai/llm";
import { suggestHsCodes } from "../compliance/hs-suggest";
import { normalizeDate } from "../documents/docai/validate";
import { commodityOf } from "../intake/taxonomy";
import type { FlaggedField } from "./records";
import { alternativesFor, resolveField, type SourceContext } from "./sources";

export type FixSuggestion = { value: string; label: string; source: string };
export type FlagHelp = { suggestions: FixSuggestion[]; explanation: string | null };

type Candidate = FixSuggestion & { document: boolean };

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const Explained = z.object({ explanation: z.string().min(1).max(400) });

export async function helpForFlag(
  flag: Omit<FlaggedField, "suggestions" | "explanation">,
  ctx: SourceContext,
  entityName: string,
  llm?: LlmClient,
): Promise<FlagHelp> {
  const found: Candidate[] = [];
  const add = (value: string | null | undefined, label: string, source: string, document = false) => {
    const v = value?.trim();
    if (!v || v === (flag.value ?? "") || found.some((c) => c.value === v)) return;
    found.push({ value: v, label, source, document });
  };

  // What the entity itself said it needs.
  const wagons = flag.reason.match(/at least (\d+) wagons/i);
  if (wagons) add(wagons[1], `${wagons[1]} wagons`, entityName);
  for (const option of flag.options) {
    if (new RegExp(`(^|[^\\w])${escapeRe(option)}([^\\w]|$)`, "i").test(flag.reason)) add(option, option, entityName);
  }

  // An HS code with the digits this entity needs, from the nomenclature.
  if (flag.type === "hs" && (flag.digits ?? 4) > 4) {
    const intake = ctx.facts.goods ? commodityOf(ctx.facts.goods) : null;
    const described = ctx.ledger.documents
      .filter((d) => d.docType === "commercial_invoice" || d.docType === "packing_list")
      .flatMap((d) => d.fields.filter((f) => (f.key === "goods" || f.key === "packaging") && f.value).map((f) => f.value!))
      .join("; ");
    const codes = await suggestHsCodes({
      heading: intake?.kind === "known" ? intake.hs : flag.value,
      goods: ctx.facts.goods,
      documentText: described || null,
      digits: flag.digits ?? 6,
      llm,
    });
    for (const s of codes) add(s.code, `${s.code} — ${s.description}`, s.by === "model" ? "a model, within the HS nomenclature" : "the HS nomenclature", s.by === "model" && Boolean(described));
  }

  // The trader's own value, in the shape the entity accepts.
  if (flag.value && flag.kind === "invalid") {
    const digits = flag.value.replace(/\D/g, "");
    if (flag.type === "inn" && (digits.length === 9 || digits.length === 14)) add(digits, digits, "your value, digits only");
    if (flag.type === "phone" && (digits.length === 9 || (digits.length === 12 && digits.startsWith("998")))) add(`+998${digits.slice(-9)}`, `+998${digits.slice(-9)}`, "your value, as an Uzbek number");
    if (flag.type === "date") {
      const iso = normalizeDate(flag.value);
      if (iso) add(iso, iso, "your value, as a date");
    }
    if (flag.type === "number" || flag.type === "integer") {
      const n = Number(flag.value.replace(/\s/g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/[^\d.-]/g, ""));
      if (Number.isFinite(n) && n > 0) add(String(flag.type === "integer" ? Math.round(n) : n), String(n), "your value, as a number");
    }
    for (const option of flag.options) if (option.toLowerCase().startsWith(flag.value.trim().toLowerCase().slice(0, 3))) add(option, option, "the entity's options");
  }

  // Other values the case holds for this field.
  const ref = { key: flag.field, label: flag.label, type: flag.type, refService: flag.refService ?? undefined };
  const held = alternativesFor(ref, ctx);
  for (const hit of held) add(hit.value, hit.value, hit.from, Boolean(hit.document));

  const suggestions = found.slice(0, 4);
  // "Required" explains itself; a refused value or a requested change gets a sentence.
  let explanation: string | null = null;
  if (flag.kind !== "missing") {
    // The value sent, or any value offered, read from a document keeps the explanation on a local model.
    const sentFromDocument = held.some((h) => h.document && h.value === flag.value);
    const fromDocuments = sentFromDocument || Boolean(resolveField(ref, ctx)?.document) || suggestions.some((s) => s.document);
    const answer = await llmJson(llm, {
      sensitivity: fromDocuments ? "document" : "public",
      system:
        "Explain to an exporter, in one or two plain sentences, why a government portal flagged a field on their application and what to change. Use only the facts given. Don't invent rules, numbers, documents or deadlines.",
      prompt: JSON.stringify({
        portal: entityName,
        field: flag.label,
        problem: flag.kind === "invalid" ? "the value is not accepted" : "the reviewer requests a change",
        portalReason: flag.reason,
        sentValue: flag.value,
        allowedValues: flag.options.length ? flag.options : undefined,
        candidateFixes: suggestions.map((s) => ({ value: s.value, from: s.source })),
      }),
      schema: Explained,
      maxTokens: 500,
    });
    explanation = answer?.data.explanation ?? null;
  }

  return { suggestions: suggestions.map((s) => ({ value: s.value, label: s.label, source: s.source })), explanation };
}
