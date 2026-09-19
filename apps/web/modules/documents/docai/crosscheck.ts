/* Cross-document checks: what a parsed document says against what the case
 * already knows - intake's quantity and route, and the fields of documents
 * already in the ledger. Each check reports the actual values it compared. */

import type { DocType } from "../specs";
import { fmtTonnes } from "../../intake/shipment-plan";
import type { ExtractedField } from "./compose";
import { countryOf, parseTonnes } from "./validate";
import { partyChecks } from "./names";

export type CrossCheck = {
  check: string;
  status: "ok" | "mismatch" | "unknown";
  detail: string;
  /** The two company names a party check compared (names.ts). */
  names?: [string, string];
};

export type LedgerDocument = { docType: DocType; label: string; fields: ExtractedField[]; stepNum?: number };

export type CheckContext = {
  intakeTonnes: number | null;
  /** ISO code of the partner end of the route (destination for exports). */
  partnerCountry: string | null;
  direction: "export" | "import" | null;
  goodsCategory: string | null;
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

const GOODS_WORDS: Record<string, RegExp> = {
  tea: /\btea\b|чай|choy/i,
  "dried fruits": /dried|сушен|сухофрукт|изюм|кишмиш|курага|raisin|apricot/i,
  "fresh fruits and vegetables": /fresh|свеж|tomato|томат|помидор|grape|виноград|apple|яблок|melon|дын|черешн|cherr/i,
};

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
      status: diff <= TOLERANCE ? "ok" : "mismatch",
      detail: `${fmtTonnes(weight.tonnes)} on the ${weight.label.toLowerCase()} vs ${fmtTonnes(ctx.intakeTonnes)} declared at intake`,
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
        detail: `${f.label}: ${code} vs route destination ${ctx.partnerCountry}`,
      });
      break;
    }
  }

  const goods = valueOf(fields, "goods") ?? valueOf(fields, "produce") ?? valueOf(fields, "cargo");
  const goodsRe = ctx.goodsCategory ? GOODS_WORDS[ctx.goodsCategory] : null;
  if (goods?.value && goodsRe) {
    checks.push({
      check: "Goods vs intake",
      status: goodsRe.test(goods.value) ? "ok" : "unknown",
      detail: `“${goods.value}” for ${ctx.goodsCategory}`,
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
      });
    }
  }

  // Seller and buyer named on earlier documents: transliteration and legal forms aside.
  checks.push(...partyChecks(fields, ctx.documents));
  return checks;
}
