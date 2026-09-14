/* What kind of document the OCR text looks like, from the printed titles seen
 * on the specimens. The step already says which document it expects, so this
 * is a check ("this looks like a packing list"), not a guess at the type. */

import type { DocType } from "../document-specs";

const TITLES: [RegExp, DocType][] = [
  [/упаковочный лист|packing list/i, "packing_list"],
  [/shipper'?s letter of instruction/i, "shippers_letter"],
  [/air\s*waybill/i, "air_waybill"],
  [/смгс|smgs|оригинал накладной/i, "railway_bill"],
  [/phytosanitary certificate|фитосанитарный сертификат|фитосанитария сертификати/i, "phytosanitary_certificate"],
  [/certificate of origin|сертификат о происхождении|форма ст-1|generali[sz]ed system of preferences/i, "certificate_of_origin"],
  [/таможенная декларация|грузовая таможенная/i, "customs_declaration"],
  [/карантинное разрешение|quarantine permit/i, "quarantine_permit"],
  [/доверенност|power of attorney/i, "power_of_attorney"],
  [/оферта/i, "offer_agreement"],
  [/протокол испытани/i, "food_test_report"],
  [/гу-12|заявка на перевозку груз/i, "cargo_transport_application"],
  [/сч[её]т на оплату|предоплата/i, "invoice_for_payment"],
  [/квитанц|\breceipt\b/i, "receipt_of_payment"],
  // No leading word boundary: OCR runs bilingual titles together ("СЧЕТ/INVOICE" -> "CЧЕTIINVOICE").
  [/invoice|инвойс/i, "commercial_invoice"],
  [/\bcontract\b|контракт/i, "trade_contract"],
  [/\bpassport\b|паспорт гражданина/i, "passport"],
];

export function detectDocType(text: string): DocType | null {
  // The earliest title on the page wins. Picking by table order made the
  // synthetic invoice a railway bill: its "Bill of lading № SMGS" line matched
  // a pattern listed above "invoice".
  let best: { type: DocType; index: number } | null = null;
  for (const [re, type] of TITLES) {
    const match = re.exec(text);
    if (match && (!best || match.index < best.index)) best = { type, index: match.index };
  }
  return best?.type ?? null;
}

/** Which certificate-of-origin form a parsed certificate is. */
export function originForm(text: string): "CT-1" | "Form A" | "General form" | null {
  if (/ст-1|ct-1/i.test(text)) return "CT-1";
  if (/form a\b|generali[sz]ed system of preferences/i.test(text)) return "Form A";
  if (/общая форма|general form/i.test(text)) return "General form";
  return null;
}
