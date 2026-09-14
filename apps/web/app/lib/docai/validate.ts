/* Field validators for parsed document values. Each kind normalises what OCR
 * and the layout model return ("68000 кг", "13 АВГ 2021", "1 790 128,00") and
 * says whether it is plausibly a value of that kind. Invalid values are not
 * discarded - they lower confidence and go to the trader's review. */

import type { FieldKind } from "../document-specs";

export type Normalized = { ok: boolean; normalized: string | number | null };

const MONTHS: [RegExp, number][] = [
  [/^(jan|янв)/, 1], [/^(feb|фев)/, 2], [/^(mar|мар)/, 3], [/^(apr|апр)/, 4], [/^(may|ма[йя])/, 5], [/^(jun|июн)/, 6],
  [/^(jul|июл)/, 7], [/^(aug|авг)/, 8], [/^(sep|сен)/, 9], [/^(oct|окт)/, 10], [/^(nov|ноя)/, 11], [/^(dec|дек)/, 12],
];

const pad = (n: number) => String(n).padStart(2, "0");

function isoDate(day: number, month: number, year: number): string | null {
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2100) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** OCR reads zero as the letter O - Latin or Cyrillic - inside numbers
 *  ("60 00О kg", "192 0ОО.00" on the synthetic A4 invoice). Only an O that
 *  touches a digit is changed, and only for numeric kinds, so words keep their
 *  letters. */
export function fixDigitConfusions(raw: string): string {
  let s = raw;
  for (let pass = 0; pass < 3; pass++) {
    s = s.replace(/(\d[\s.,]?)[OoОо]|[OoОо](?=[\s.,]?\d)/g, (match) => match.replace(/[OoОо]/, "0"));
  }
  return s;
}

export function normalizeDate(raw: string): string | null {
  const t = fixDigitConfusions(raw).toLowerCase();
  let m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return isoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = t.match(/\b(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{2,4})\b/);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/\b(\d{1,2})\s+([a-zа-яё]{3,})\.?\s+(\d{4})\b/);
  if (m) {
    const month = MONTHS.find(([re]) => re.test(m![2]))?.[1];
    if (month) return isoDate(Number(m[1]), month, Number(m[3]));
  }
  return null;
}

/** "1 790 128,00" -> 1790128; "245000" -> 245000; "68.75" -> 68.75. */
export function parseNumber(raw: string): number | null {
  const m = fixDigitConfusions(raw).replace(/[  ]/g, " ").match(/\d[\d\s.,']*/);
  if (!m) return null;
  let s = m[0].trim().replace(/[\s']/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    s = s.replace(decimal === "," ? /\./g : /,/g, "").replace(decimal, ".");
  } else if (lastComma >= 0) {
    s = /,\d{1,2}$/.test(s) ? s.replace(/,/g, (c, i) => (i === lastComma ? "." : "")) : s.replace(/,/g, "");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s.replace(/[.,]$/, ""));
  return Number.isFinite(n) ? n : null;
}

/** Weight in tonnes. A bare number above 1,000 is read as kilograms. */
export function parseTonnes(raw: string): number | null {
  const n = parseNumber(raw);
  if (n == null || n <= 0) return null;
  const t = raw.toLowerCase();
  if (/\b(kg|кг|kgs)\b|кг/.test(t)) return n / 1000;
  if (/\b(t|т|mt|tonnes?|tons?|тонн?)\b/.test(t)) return n;
  return n > 1000 ? n / 1000 : n;
}

const CURRENCIES: [RegExp, string][] = [
  [/\busd\b|\b840\b|доллар/i, "USD"],
  [/\beur\b|\b978\b|евро/i, "EUR"],
  [/\brub\b|\b643\b|руб/i, "RUB"],
  [/\buzs\b|\b860\b|\bсум\b|so'm/i, "UZS"],
  [/\bkzt\b|\b398\b|тенге/i, "KZT"],
  [/\bcny\b|\b156\b|юан/i, "CNY"],
  [/\btry\b|\b949\b|лир/i, "TRY"],
];

const COUNTRY_WORDS: [RegExp, string][] = [
  [/uzbekistan|o'zbekiston|узбекистан|ўзбекистон/i, "UZ"],
  [/kazakhstan|казахстан|қазақстан/i, "KZ"],
  [/kyrgyz|кыргыз|киргиз/i, "KG"],
  [/russia|росси/i, "RU"],
  [/china|китай/i, "CN"],
  [/turkey|t[üu]rkiye|турци/i, "TR"],
  [/afghanistan|афганистан/i, "AF"],
];

export function countryOf(raw: string): string | null {
  return COUNTRY_WORDS.find(([re]) => re.test(raw))?.[1] ?? null;
}

export function normalizeValue(kind: FieldKind, raw: string): Normalized {
  const value = raw.trim();
  if (!value) return { ok: false, normalized: null };
  switch (kind) {
    case "date": {
      const d = normalizeDate(value);
      return { ok: Boolean(d), normalized: d };
    }
    case "inn": {
      const digits = fixDigitConfusions(value).replace(/\D/g, "");
      const inn = digits.match(/\d{9}/)?.[0] ?? null;
      return { ok: digits.length === 9, normalized: inn };
    }
    case "hs": {
      const digits = fixDigitConfusions(value).replace(/[\s.]/g, "").match(/\d{4,10}/)?.[0] ?? null;
      return { ok: Boolean(digits), normalized: digits };
    }
    case "amount": {
      const n = parseNumber(value);
      return { ok: n != null && n > 0, normalized: n };
    }
    case "weight": {
      const t = parseTonnes(value);
      return { ok: t != null, normalized: t };
    }
    case "number":
      return { ok: /\d/.test(value) && value.replace(/\D/g, "").length >= 1, normalized: value };
    case "currency": {
      const c = CURRENCIES.find(([re]) => re.test(value))?.[1] ?? null;
      return { ok: Boolean(c), normalized: c };
    }
    case "incoterm": {
      const m = value.toUpperCase().match(/\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP|DAT)\b/);
      return { ok: Boolean(m), normalized: m?.[1] ?? null };
    }
    case "country": {
      const c = countryOf(value);
      // Countries outside the fixture are real too - keep them, just unnormalised.
      return { ok: Boolean(c) || /[a-zа-яё]{3,}/i.test(value), normalized: c };
    }
    case "text":
    default:
      return { ok: /[a-zа-яёўқғҳ]{2,}/i.test(value), normalized: value.replace(/\s+/g, " ") };
  }
}
