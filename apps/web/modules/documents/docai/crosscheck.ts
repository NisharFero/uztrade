/* Cross-document checks: what a parsed document says against what the case
 * already knows - intake's quantity and route, and the fields of documents
 * already in the ledger. Each check reports the actual values it compared. */

import type { DocType } from "../specs";
import { fmtTonnes } from "../../intake/shipment-plan";
import type { ExtractedField } from "./compose";
import { countryLabel, countryOf, parseTonnes } from "./validate";
import { partyChecks } from "./names";

export type CrossCheck = {
  check: string;
  status: "ok" | "mismatch" | "unknown";
  detail: string;
  /** The two company names a party check compared (names.ts). */
  names?: [string, string];
  /** The two values a mismatch compared. Set only when both are values that
   *  can be written back to `fieldKey`, so the trader can resolve the
   *  disagreement by picking one instead of re-uploading the document. */
  compared?: Compared;
};

/** `here` is what this document says, `there` what the case or another
 *  document says; `thereLabel` names that other source. */
export type Compared = { fieldKey: string; here: string; there: string; thereLabel: string };

export type LedgerDocument = { docType: DocType; label: string; fields: ExtractedField[]; stepNum?: number };

export type CheckContext = {
  intakeTonnes: number | null;
  /** ISO code of the partner end of the route (destination for exports). */
  partnerCountry: string | null;
  direction: "export" | "import" | null;
  goodsCategory: string | null;
  /** The goods as the case names them ("yoghurt"), which is what a document
   *  usually says - the category ("dairy products") rarely appears on one. */
  goodsTerm?: string | null;
  documents: LedgerDocument[];
  /** The step the document being checked was uploaded for. */
  stepNum?: number | null;
};

const TOLERANCE = 0.02;
const WEIGHT_KEYS = ["quantity", "net_weight", "weight", "tonnes", "gross_weight"];
const COUNTRY_KEYS = ["destination_country", "exported_to", "consignee"];

const valueOf = (fields: ExtractedField[], key: string) => fields.find((f) => f.key === key && f.value);

function tonnesIn(fields: ExtractedField[]): { key: string; label: string; tonnes: number } | null {
  for (const key of WEIGHT_KEYS) {
    const f = valueOf(fields, key);
    const t = f ? (typeof f.normalized === "number" ? f.normalized : parseTonnes(f.value ?? "")) : null;
    if (f && t) return { key, label: f.label, tonnes: t };
  }
  return null;
}

/* Russian and Uzbek words for the goods the demo corpus was built around: a
   bilingual invoice says "Чай черный", not "tea". Categories without an entry
   fall back to matching the case's own words (goodsWordsFor below), which is
   why a corpus of 38 categories no longer needs 38 entries here. */
const GOODS_WORDS: Record<string, RegExp> = {
  tea: /\btea\b|чай|choy/i,
  "dried fruits": /dried|сушен|сухофрукт|изюм|кишмиш|курага|raisin|apricot/i,
  "fresh fruits and vegetables": /fresh|свеж|tomato|томат|помидор|grape|виноград|apple|яблок|melon|дын|черешн|cherr/i,
  "dairy products": /dairy|молоч|молоко|сыр|йогурт|kefir|cheese|milk|yogh?urt|butter/i,
  "meat and meat products": /meat|мяс|говядин|баранин|птиц|beef|lamb|mutton|poultry|sausage|колбас/i,
  "pharmaceutical products": /pharmac|medic|лекарств|препарат|dori|tablet|vaccine/i,
  "medical equipment": /medical|медицинск|оборудован|equipment|apparatus/i,
};

/** Does a document's goods line mention what the case is moving? Every word of
 *  four letters or more from the case's goods and category counts, so a case
 *  for "silk scarves" matches "Scarves, 100% silk" without a table entry. */
function mentionsGoods(text: string, ctx: CheckContext): boolean {
  const curated = ctx.goodsCategory ? GOODS_WORDS[ctx.goodsCategory] : null;
  if (curated?.test(text)) return true;
  const haystack = text.toLowerCase();
  const words = `${ctx.goodsTerm ?? ""} ${ctx.goodsCategory ?? ""}`
    .toLowerCase()
    .split(/[^a-z\u0400-\u04ff]+/)
    .filter((w) => w.length >= 4 && !["and", "products", "other", "their", "vegetable", "vegetables"].includes(w));
  // Singular and plural both count: "carpets" on the case, "carpet" on the invoice.
  return words.some((w) => haystack.includes(w) || haystack.includes(w.replace(/s$/, "")));
}

/* The bill a receipt pays is the latest offer agreement or invoice for payment
 * issued after the previous payment and no later than this one. Comparing with
 * the first bill on the case flagged a phytosanitary receipt against a
 * forwarder's invoice. */
function billFor(ctx: CheckContext): ExtractedField | undefined {
  const step = ctx.stepNum ?? Number.POSITIVE_INFINITY;
  const previousPayment = Math.max(
    0,
    ...ctx.documents.filter((d) => d.docType === "receipt_of_payment" && (d.stepNum ?? 0) < step).map((d) => d.stepNum ?? 0),
  );
  return ctx.documents
    .filter((d) => d.docType === "offer_agreement" || d.docType === "invoice_for_payment")
    .filter((d) => d.stepNum == null || (d.stepNum > previousPayment && d.stepNum <= step))
    .sort((a, b) => (b.stepNum ?? 0) - (a.stepNum ?? 0))
    .map((d) => valueOf(d.fields, "amount") ?? valueOf(d.fields, "total"))
    .find(Boolean);
}

export function crossCheck(docType: DocType, fields: ExtractedField[], ctx: CheckContext): CrossCheck[] {
  const checks: CrossCheck[] = [];

  const weight = tonnesIn(fields);
  if (weight && ctx.intakeTonnes) {
    const diff = Math.abs(weight.tonnes - ctx.intakeTonnes) / ctx.intakeTonnes;
    checks.push({
      check: "Quantity vs intake",
      status: diff <= TOLERANCE + Number.EPSILON ? "ok" : "mismatch",
      detail: `${fmtTonnes(weight.tonnes)} on the ${weight.label.toLowerCase()} vs ${fmtTonnes(ctx.intakeTonnes)} declared at intake`,
      compared: { fieldKey: weight.key, here: fmtTonnes(weight.tonnes), there: fmtTonnes(ctx.intakeTonnes), thereLabel: "declared at intake" },
    });
  }

  const hs = valueOf(fields, "hs_code");
  if (hs?.normalized) {
    for (const doc of ctx.documents) {
      const other = valueOf(doc.fields, "hs_code");
      if (!other?.normalized || doc.docType === docType) continue;
      const a = String(hs.normalized).slice(0, 4);
      const b = String(other.normalized).slice(0, 4);
      checks.push({
        check: `HS code vs ${doc.label}`,
        status: a === b ? "ok" : "mismatch",
        detail: `${hs.normalized} here vs ${other.normalized} on the ${doc.label.toLowerCase()}`,
        compared: { fieldKey: "hs_code", here: String(hs.normalized), there: String(other.normalized), thereLabel: `on the ${doc.label.toLowerCase()}` },
      });
    }
  }

  if (ctx.partnerCountry && ctx.direction === "export") {
    for (const key of COUNTRY_KEYS) {
      const f = valueOf(fields, key);
      const code = f ? countryOf(f.value ?? "") : null;
      if (!f || !code) continue;
      checks.push({
        check: "Destination country vs route",
        status: code === ctx.partnerCountry ? "ok" : "mismatch",
        detail: `${f.label}: ${countryLabel(code)} vs route destination ${countryLabel(ctx.partnerCountry)}`,
        compared: { fieldKey: key, here: countryLabel(code), there: countryLabel(ctx.partnerCountry), thereLabel: "the route this case was opened with" },
      });
      break;
    }
  }

  const goods = valueOf(fields, "goods") ?? valueOf(fields, "produce") ?? valueOf(fields, "cargo");
  if (goods?.value && (ctx.goodsTerm || ctx.goodsCategory)) {
    const named = ctx.goodsTerm || ctx.goodsCategory;
    checks.push({
      check: "Goods vs intake",
      status: mentionsGoods(goods.value, ctx) ? "ok" : "unknown",
      detail: `“${goods.value}” for ${named}`,
    });
  }

  if (docType === "receipt_of_payment") {
    const amount = valueOf(fields, "amount");
    const billed = billFor(ctx);
    if (amount?.normalized != null && billed?.normalized != null) {
      checks.push({
        check: "Receipt amount vs bill",
        status: Number(amount.normalized) === Number(billed.normalized) ? "ok" : "mismatch",
        detail: `${amount.normalized} paid vs ${billed.normalized} billed`,
        compared: { fieldKey: "amount", here: String(amount.normalized), there: String(billed.normalized), thereLabel: "billed" },
      });
    }
  }

  const currency = valueOf(fields, "currency");
  if (currency?.normalized) {
    for (const doc of ctx.documents) {
      const other = valueOf(doc.fields, "currency");
      if (!other?.normalized || doc.docType === docType) continue;
      checks.push({
        check: `Currency vs ${doc.label}`,
        status: other.normalized === currency.normalized ? "ok" : "mismatch",
        detail: `${currency.normalized} here vs ${other.normalized}`,
        compared: { fieldKey: "currency", here: String(currency.normalized), there: String(other.normalized), thereLabel: `on the ${doc.label.toLowerCase()}` },
      });
    }
  }

  // Seller and buyer named on earlier documents: transliteration and legal forms aside.
  checks.push(...partyChecks(fields, ctx.documents));
  return checks;
}
