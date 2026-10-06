/* The entity's first look at a form: every required field present, and every
 * value in the shape the portal accepts. Nothing here judges the content -
 * that is the reviewer's job (ServiceDef.review). */

import { REFERENCE, type EntityDef, type FieldDef, type Flag, type ReviewContext, type ServiceDef } from "./contract.ts";

const clean = (value: unknown): string => (value == null ? "" : String(value)).trim();

function isoDate(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dotted = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : dotted ? [dotted[3], dotted[2], dotted[1]] : [];
  if (!y) return null;
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(d) ? null : `${y}-${m}-${d}`;
}

const numberOf = (raw: string) => {
  const n = Number(raw.replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** The value as the entity stores it, or why it can't take it. */
export function checkField(field: FieldDef, raw: string, ctx: ReviewContext): { value: string } | { reason: string } {
  switch (field.type) {
    case "number":
    case "integer": {
      const n = numberOf(raw);
      if (n == null) return { reason: "Must be a number" };
      if (field.type === "integer" && !Number.isInteger(n)) return { reason: "Must be a whole number" };
      if (field.min != null && n < field.min) return { reason: `Must be at least ${field.min}` };
      if (field.max != null && n > field.max) return { reason: `Must be at most ${field.max}` };
      return { value: String(n) };
    }
    case "date": {
      const date = isoDate(raw);
      return date ? { value: date } : { reason: "Must be a date (YYYY-MM-DD or DD.MM.YYYY)" };
    }
    case "enum": {
      const hit = field.options?.find((option) => option.toLowerCase() === raw.toLowerCase());
      return hit ? { value: hit } : { reason: `Must be one of: ${(field.options ?? []).join(", ")}` };
    }
    case "inn": {
      const digits = raw.replace(/\s/g, "");
      if (!/^\d+$/.test(digits)) return { reason: "Digits only" };
      return digits.length === 9 || digits.length === 14
        ? { value: digits }
        : { reason: `An INN has 9 digits (a person's PINFL has 14) — this has ${digits.length}` };
    }
    case "phone": {
      let digits = raw.replace(/\D/g, "");
      if (digits.length === 9) digits = `998${digits}`;
      return /^998\d{9}$/.test(digits)
        ? { value: `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}` }
        : { reason: "An Uzbek number: +998 and 9 digits" };
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw) ? { value: raw.toLowerCase() } : { reason: "Not an email address" };
    case "hs": {
      const digits = raw.replace(/[\s.]/g, "");
      if (!/^\d+$/.test(digits)) return { reason: "Digits only" };
      const need = field.digits ?? 4;
      if (digits.length < need) return { reason: `Needs ${need === 10 ? "the full 10-digit national code" : `at least ${need} digits`} — this has ${digits.length}` };
      return digits.length > 10 ? { reason: "At most 10 digits" } : { value: digits };
    }
    case "account": {
      const digits = raw.replace(/\s/g, "");
      return /^\d{20}$/.test(digits) ? { value: digits } : { reason: `A settlement account has 20 digits — this has ${digits.replace(/\D/g, "").length}` };
    }
    case "mfo": {
      const digits = raw.replace(/\s/g, "");
      return /^\d{5}$/.test(digits) ? { value: digits } : { reason: "A bank MFO has 5 digits" };
    }
    case "country":
      return /^[\p{L}][\p{L} .'-]{1,59}$/u.test(raw) ? { value: raw } : { reason: "A country name" };
    case "reference": {
      // A number issued outside this registry (a paper certificate) is for the officer to check.
      if (!REFERENCE.test(raw)) return { value: raw };
      const referenced = ctx.find(raw);
      if (!referenced) return { reason: `No application ${raw} in the registry` };
      if (field.refService && `${referenced.entity}/${referenced.service}` !== field.refService) return { reason: `${raw} is a different kind of application` };
      if (referenced.status !== "approved") return { reason: `${raw} is not approved yet (${referenced.status.replace("_", " ")})` };
      return { value: raw };
    }
    default:
      return raw.length > 500 ? { reason: "At most 500 characters" } : { value: raw };
  }
}

export type Checked = { fields: Record<string, string>; missing: Flag[]; invalid: Flag[] };

export function checkApplication(service: ServiceDef, input: Record<string, unknown>, ctx: ReviewContext): Checked {
  const raw = Object.fromEntries(service.fields.map((field) => [field.key, clean(input[field.key])]));
  const fields: Record<string, string> = {};
  const missing: Flag[] = [];
  const invalid: Flag[] = [];
  for (const field of service.fields) {
    if (field.when && (raw[field.when.field] ?? "").toLowerCase() !== field.when.equals.toLowerCase()) continue;
    const value = raw[field.key];
    if (!value) {
      if (field.required) missing.push({ field: field.key, label: field.label, kind: "missing", reason: field.hint ? `Required — ${field.hint}` : "Required", value: null });
      continue;
    }
    const result = checkField(field, value, ctx);
    if ("reason" in result) invalid.push({ field: field.key, label: field.label, kind: "invalid", reason: result.reason, value });
    else fields[field.key] = result.value;
  }
  return { fields, missing, invalid };
}

/** The reviewer's findings on an accepted form, as flags on its fields. */
export function reviewApplication(service: ServiceDef, fields: Record<string, string>, ctx: ReviewContext): Flag[] {
  return (service.review?.(fields, ctx) ?? []).map((flag) => ({
    field: flag.field,
    label: service.fields.find((field) => field.key === flag.field)?.label ?? flag.field,
    kind: "change",
    reason: flag.reason,
    value: fields[flag.field] ?? null,
  }));
}

/** A service as published: everything an applicant needs to fill it in. */
export function publicService(entity: EntityDef, service: ServiceDef) {
  return {
    entity: entity.id,
    entityName: entity.name,
    id: service.id,
    ref: `${entity.id}/${service.id}`,
    title: service.title,
    kind: service.kind,
    description: service.description,
    fields: service.fields,
  };
}
