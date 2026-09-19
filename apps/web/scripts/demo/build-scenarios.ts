/* Builds the demo scenario for every procedure except 868 (whose scenario is
 * written by hand) into modules/demo/data/scenario-<id>.json.
 *
 * A scenario is generated from what a walk-through of the procedure actually
 * asks for - every document and value the step views need - and one invented
 * shipment per procedure (below). Documents a step produces get one page per
 * step; documents the trader supplies get one page shared by every step that
 * names them. Every payment receipt carries the amount of the offer or invoice
 * it pays, and every weight agrees with the shipment, so the cross-checks pass.
 *
 * Then render the pages:
 *   apps/docai/.venv/Scripts/python apps/docai/demo/generate_demo.py
 *
 * Run: npx tsx scripts/demo/build-scenarios.ts
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { specFor, type DocType } from "../../modules/documents/specs";
import { PROCEDURES } from "../../modules/procedures/sync";
import { buildLedger } from "../../modules/steps/ledger";
import { stepViewFor } from "../../modules/steps/next";
import { instantiateWorkflow } from "../../modules/workflow/domain";
import type { WorkflowProjection } from "../../modules/workflow/repository";

const OUT = fileURLToPath(new URL("../../modules/demo/data/", import.meta.url));

type Party = { name: string; address: string; tin: string; manager: string; phone: string; email: string; bank: string };

type Profile = {
  id: string;
  query: string;
  goods: string;
  goodsRu: string;
  hs: string;
  netKg: number;
  packages: number;
  packaging: string;
  unitKind: "wagon" | "truck" | "air pallet";
  units: string[];
  seals: string[];
  from: string;
  to: string;
  fromCountry: string;
  toCountry: string;
  departure: string;
  destination: string;
  border: string;
  valueUsd: number;
  incoterms: string;
  /** The Uzbek company the case is for. */
  trader: Party;
  /** The foreign party: buyer on an export, seller on an import. */
  partner: Party;
  representative: { name: string; passport: string };
  carrier: string;
  botanical?: string;
};

const UZ = (name: string, city: string, tin: string, manager: string, phone: string, mail: string, account: string): Party => ({
  name,
  address: `${city}, Uzbekistan`,
  tin,
  manager,
  phone,
  email: `${mail}@demo.uz`,
  bank: `Demo Bank JSCB, account ${account}, MFO 00444`,
});
const FOREIGN = (name: string, address: string): Party => ({ name, address, tin: "—", manager: "A. Demo", phone: "—", email: "—", bank: "—" });

const PROFILES: Profile[] = [
  {
    id: "306",
    query: "Export 40 t of raisins from Samarkand to Moscow by train",
    goods: "Raisins (dried grapes)", goodsRu: "Изюм", hs: "0806 20 100 0", netKg: 40_000, packages: 4000, packaging: "Cartons, 10 kg",
    unitKind: "wagon", units: ["52816610"], seals: ["UZ 220301"],
    from: "Samarkand", to: "Moscow", fromCountry: "Uzbekistan", toCountry: "Russia",
    departure: "Samarkand-Tovarny", destination: "Moscow-Tovarnaya", border: "Keles, Sary-Agash",
    valueUsd: 96_000, incoterms: "FCA Samarkand",
    trader: UZ("OOO \"Zarafshon Mevalari\"", "Samarkand, Dagbitskaya street 4", "302118457", "Nodira Yusupova", "+998 91 204 11 22", "export.zarafshon", "20208000900222333001"),
    partner: FOREIGN("OOO \"Moskovskie Sukhofrukty\"", "Moscow, Profsoyuznaya street 21, Russia"),
    representative: { name: "Jasur Karimov", passport: "AC 3344556" },
    carrier: "JSC Uzbekistan Temir Yo'llari", botanical: "Vitis vinifera",
  },
  {
    id: "325",
    query: "Export 22 t of fresh grapes from Andijan to Almaty by train",
    goods: "Fresh table grapes", goodsRu: "Виноград свежий", hs: "0806 10 101 0", netKg: 22_000, packages: 2750, packaging: "Ventilated crates, 8 kg",
    unitKind: "wagon", units: ["55012873"], seals: ["UZ 230417"],
    from: "Andijan", to: "Almaty", fromCountry: "Uzbekistan", toCountry: "Kazakhstan",
    departure: "Andijan-1", destination: "Almaty-1", border: "Keles, Sary-Agash",
    valueUsd: 30_800, incoterms: "FCA Andijan",
    trader: UZ("OOO \"Fergana Uzum Eksport\"", "Andijan, Navoi avenue 55", "303456781", "Otabek Mirzaev", "+998 93 455 18 90", "sales.ferganauzum", "20208000900333444001"),
    partner: FOREIGN("TOO \"Almaty Fresh Market\"", "Almaty, Raiymbek avenue 348, Kazakhstan"),
    representative: { name: "Sardor Tursunov", passport: "AD 5566778" },
    carrier: "JSC Uzbekistan Temir Yo'llari", botanical: "Vitis vinifera",
  },
  {
    id: "477",
    query: "Import 30 t of black tea from Almaty to Tashkent by train",
    goods: "Black tea, bulk", goodsRu: "Чай черный", hs: "0902 40 000 0", netKg: 30_000, packages: 1500, packaging: "Paper sacks, 20 kg",
    unitKind: "wagon", units: ["52917340"], seals: ["KZ 771204"],
    from: "Almaty", to: "Tashkent", fromCountry: "Kazakhstan", toCountry: "Uzbekistan",
    departure: "Almaty-1", destination: "Tashkent-Tovarny", border: "Sary-Agash, Keles",
    valueUsd: 84_000, incoterms: "CPT Tashkent",
    trader: UZ("OOO \"Toshkent Choy Savdo\"", "Tashkent, Amir Temur street 108", "304567812", "Malika Akhmedova", "+998 90 777 31 45", "import.choysavdo", "20208000900444555001"),
    partner: FOREIGN("TOO \"Almaty Tea Packers\"", "Almaty, Suyunbay avenue 2, Kazakhstan"),
    representative: { name: "Rustam Aliev", passport: "AE 1122334" },
    carrier: "JSC Kazakhstan Temir Zholy", botanical: "Camellia sinensis",
  },
  {
    id: "540",
    query: "Export 2 t of green tea from Tashkent to Istanbul by air",
    goods: "Green tea in packets", goodsRu: "Чай зеленый", hs: "0902 10 000 0", netKg: 2_000, packages: 200, packaging: "Cartons, 10 kg",
    unitKind: "air pallet", units: ["PMC 40211 TK"], seals: [],
    from: "Tashkent", to: "Istanbul", fromCountry: "Uzbekistan", toCountry: "Türkiye",
    departure: "Tashkent International (TAS)", destination: "Istanbul (IST)", border: "Tashkent airport customs post",
    valueUsd: 18_000, incoterms: "FCA Tashkent Airport",
    trader: UZ("OOO \"Silk Road Tea\"", "Tashkent, Shota Rustaveli street 41", "305678923", "Aziza Rakhmonova", "+998 97 610 22 04", "cargo.silkroadtea", "20208000900555666001"),
    partner: FOREIGN("Anadolu Çay Ticaret A.Ş.", "Istanbul, Kazım Karabekir cad. 18, Türkiye"),
    representative: { name: "Timur Saidov", passport: "AF 9988776" },
    carrier: "Uzbekistan Airways (demo)", botanical: "Camellia sinensis",
  },
  {
    id: "161",
    query: "Export 20 t of apple juice from Namangan to Almaty by road",
    goods: "Apple juice, not concentrated", goodsRu: "Сок яблочный", hs: "2009 71 200 0", netKg: 20_000, packages: 20, packaging: "Bag-in-box in 1000 l IBC",
    unitKind: "truck", units: ["01 A 777 BA / trailer 01 1234 XA"], seals: ["UZ 330118"],
    from: "Namangan", to: "Almaty", fromCountry: "Uzbekistan", toCountry: "Kazakhstan",
    departure: "Namangan", destination: "Almaty", border: "Yallama – Zhibek Zholy",
    valueUsd: 16_000, incoterms: "DAP Almaty",
    trader: UZ("OOO \"Namangan Sharbatlari\"", "Namangan, Uychi street 12", "306789034", "Bobur Khodjaev", "+998 94 300 55 71", "export.sharbat", "20208000900666777001"),
    partner: FOREIGN("TOO \"Almaty Juice Distribution\"", "Almaty, Tole Bi street 286, Kazakhstan"),
    representative: { name: "Ilhom Nazarov", passport: "AA 2233445" },
    carrier: "OOO \"Demo Trans Logistic\" (TIR carrier)",
  },
  {
    id: "57",
    query: "Import 22 t of organic fertilizer from Bishkek to Tashkent by road",
    goods: "Biohumus (vermicompost), organic fertilizer", goodsRu: "Биогумус", hs: "3101 00 000 0", netKg: 22_000, packages: 880, packaging: "Polypropylene bags, 25 kg",
    unitKind: "truck", units: ["01 KG 555 ABC / trailer 01 KG 99 AB"], seals: ["KG 440210"],
    from: "Bishkek", to: "Tashkent", fromCountry: "Kyrgyzstan", toCountry: "Uzbekistan",
    departure: "Bishkek", destination: "Tashkent", border: "Dostuk – Dustlik",
    valueUsd: 6_600, incoterms: "DAP Tashkent",
    trader: UZ("OOO \"Agro Yer Unumdorlik\"", "Tashkent region, Zangiota district, Eshonguzar 3", "307890145", "Sherzod Umarov", "+998 95 144 60 02", "supply.agroyer", "20208000900777888001"),
    partner: FOREIGN("OcOO \"Kyrgyz Bio Organic\"", "Bishkek, Chui avenue 190, Kyrgyzstan"),
    representative: { name: "Doniyor Rakhimov", passport: "AB 4455667" },
    carrier: "OcOO \"Demo Kyrgyz Transit\" (TIR carrier)",
  },
  {
    id: "707",
    query: "Import 60 t of organic fertilizer from Moscow to Tashkent by train",
    goods: "Granulated poultry manure, organic fertilizer", goodsRu: "Помет птичий гранулированный", hs: "3101 00 000 0", netKg: 60_000, packages: 60, packaging: "Big bags, 1 t",
    unitKind: "wagon", units: ["54410087"], seals: ["RU 5520731"],
    from: "Moscow", to: "Tashkent", fromCountry: "Russia", toCountry: "Uzbekistan",
    departure: "Moscow-Tovarnaya", destination: "Tashkent-Tovarny", border: "Sary-Agash, Keles",
    valueUsd: 21_000, incoterms: "CPT Tashkent",
    trader: UZ("OOO \"Bogdorchilik Resurs\"", "Tashkent, Chilonzor 9 kvartal 14", "308901256", "Kamola Nurmatova", "+998 99 802 17 38", "import.bogresurs", "20208000900888999001"),
    partner: FOREIGN("OOO \"Podmoskovnye Udobreniya\"", "Moscow region, Klin, Zavodskaya street 5, Russia"),
    representative: { name: "Akmal Ergashev", passport: "AB 6677889" },
    carrier: "JSC Russian Railways",
  },
  {
    id: "782",
    query: "Dispatch 40 t of ceramic tiles from Tashkent to Almaty by rail",
    goods: "Ceramic floor tiles", goodsRu: "Плитка керамическая", hs: "6907 21 000 0", netKg: 40_000, packages: 40, packaging: "Wooden pallets",
    unitKind: "wagon", units: ["60218844"], seals: ["UZ 118790"],
    from: "Tashkent", to: "Almaty", fromCountry: "Uzbekistan", toCountry: "Kazakhstan",
    departure: "Tashkent-Tovarny", destination: "Almaty-1", border: "Keles, Sary-Agash",
    valueUsd: 52_000, incoterms: "FCA Tashkent",
    trader: UZ("OOO \"Kulol Keramika\"", "Tashkent, Sergeli district, Yangi Sergeli 7", "309012367", "Umid Sobirov", "+998 90 911 40 50", "logistics.kulol", "20208000900999000001"),
    partner: FOREIGN("TOO \"Almaty Stroy Snab\"", "Almaty, Ryskulov avenue 101, Kazakhstan"),
    representative: { name: "Farrukh Juraev", passport: "AC 7788990" },
    carrier: "JSC Uzbekistan Temir Yo'llari",
  },
  {
    id: "924",
    query: "Take delivery of 60 t of steel pipes arriving from Moscow at Tashkent by rail",
    goods: "Seamless steel pipes", goodsRu: "Трубы стальные бесшовные", hs: "7304 19 100 0", netKg: 60_000, packages: 24, packaging: "Bundles",
    unitKind: "wagon", units: ["62055013"], seals: ["RU 5530912"],
    from: "Moscow", to: "Tashkent", fromCountry: "Russia", toCountry: "Uzbekistan",
    departure: "Moscow-Tovarnaya", destination: "Tashkent-Tovarny", border: "Sary-Agash, Keles",
    valueUsd: 78_000, incoterms: "CPT Tashkent",
    trader: UZ("OOO \"Quvur Qurilish Ta'minot\"", "Tashkent, Yashnobod district, Parkent street 250", "310123478", "Zafar Tojiev", "+998 93 118 72 64", "supply.quvur", "20208000900111222001"),
    partner: FOREIGN("OOO \"Volzhsky Trubny Demo\"", "Moscow, Leninsky avenue 30, Russia"),
    representative: { name: "Olim Hasanov", passport: "AD 9900112" },
    carrier: "JSC Russian Railways",
  },
];

/* ---------------------------------------------------------------- needs --- */

type NeedRow = { step: number; title: string; kind: "document" | "value"; label: string; docType: DocType | null; output: boolean };

function needsOf(id: string): NeedRow[] {
  const procedure = PROCEDURES[id];
  const workflow = instantiateWorkflow(procedure, `demo:${id}`);
  const projection: WorkflowProjection = {
    run: { id: `demo:${id}`, caseId: "demo", procedureVersionId: `procedure:${id}:v1`, status: "running", cycle: 0 },
    shipmentFacts: { goods: "", quantity: null, unit: null, origin: null, destination: null, mode: null },
    nodes: workflow.nodes, edges: workflow.edges, workItems: [], agentRuns: [], artifacts: [], auditEvents: [],
  };
  const rows: NeedRow[] = [];
  for (const node of workflow.nodes) {
    const view = stepViewFor(procedure, projection, buildLedger([]), node);
    for (const need of [...view.needs, ...view.variants.flatMap((v) => v.needs)]) {
      if (need.kind !== "document" && need.kind !== "value") continue;
      rows.push({ step: view.stepNum, title: view.title, kind: need.kind, label: need.label, docType: need.docType, output: need.output });
    }
  }
  return rows;
}

/* --------------------------------------------------------------- values --- */

const kg = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");
const date = (day: number) => {
  const d = new Date(Date.UTC(2026, 8, 1 + day));
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
};
const uzs = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");

function valuesFor(p: Profile): Record<string, string> {
  const t = p.trader;
  const byRoad = p.unitKind === "truck";
  return {
    "Tax Identification Number of the organization or individual": t.tin,
    "Personal identification number of an individual": "31503850210045",
    "Bank details": t.bank,
    "Name of the organization": t.name,
    "Full name of an organization's manager": t.manager,
    "Contact phone number": t.phone,
    Email: t.email,
    "Agency region": `${p.fromCountry === "Uzbekistan" ? p.from : p.to} region`,
    "Payment sum": "245 000 UZS",
    "Type of organization (business entity, budgetary)": "Business entity",
    "Cost on the contract": "1 120 000 UZS",
    "Quantity of transport units": String(p.units.length),
    "Amount of consignment": `${kg(p.netKg)} kg`,
    "Warehouse license number": "CW-0417 (demo customs warehouse, Tashkent)",
    "General Information": `Transit from ${p.from} (${p.fromCountry}) to ${p.to} customs post, ${byRoad ? "by road under TIR" : "by rail"}, entry at ${p.border}`,
    "Information about carrier (for legal entities)": p.carrier,
    "Information about the carrier (for physical entities)": "Not applicable — the carrier is a company",
    "Information about driver": `${p.representative.name}, passport ${p.representative.passport}`,
    "Information about shipping documents": `CMR ${p.id}-2026/014, invoice INV-${p.id}/2026-031`,
  };
}

/* ------------------------------------------------------------ documents --- */

type Doc = {
  id: string;
  file: string;
  template: string;
  title: string;
  docType: DocType | null;
  labels: string[];
  steps: number[];
  output: boolean;
  fields: Record<string, string>;
  body?: string;
  stamp?: string;
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

const TEMPLATE: Partial<Record<DocType, string>> = {
  commercial_invoice: "commercial_invoice",
  trade_contract: "contract",
  passport: "passport",
  power_of_attorney: "poa",
  invoice_for_payment: "invoice_for_payment",
  receipt_of_payment: "receipt",
  offer_agreement: "offer",
  cargo_transport_application: "gu12",
  railway_bill: "smgs",
  phytosanitary_certificate: "phyto",
  certificate_of_origin: "ct1",
  cmr_note: "cmr",
  air_waybill: "awb",
  customs_declaration: "declaration",
  food_test_report: "lab_report",
  packing_list: "packing_list",
  veterinary_certificate: "vet_cert",
  certificate_of_conformity: "conformity",
  quarantine_permit: "quarantine_permit",
  shippers_letter: "shippers_letter",
  quarantine_permit_application: "letter",
};

/* Input documents of these types are one page shared by every label and step. */
const SHARED: DocType[] = ["commercial_invoice", "trade_contract", "passport", "power_of_attorney", "cmr_note", "packing_list", "air_waybill"];

function build(p: Profile) {
  const procedure = PROCEDURES[p.id];
  const exporting = procedure.direction === "export";
  const seller = exporting ? p.trader : p.partner;
  const buyer = exporting ? p.partner : p.trader;
  const rows = needsOf(p.id);
  const gross = Math.round(p.netKg * 1.02);
  const contractNo = `UZ-${p.id}/2026-01`;
  const invoiceNo = `INV-${p.id}/2026-031`;
  const transportNo = p.unitKind === "truck" ? `CMR ${p.id}-2026/014` : p.unitKind === "wagon" ? `SMGS 77${p.id.padStart(3, "0")}451` : `AWB 250-${p.id}88213`;
  const route = `${p.unitKind === "truck" ? "Road" : p.unitKind === "wagon" ? "Rail" : "Air"}, ${p.from} – ${p.border} – ${p.to}`;
  const stepDay = (step: number) => Math.min(28, Math.round(step / 2));

  const common = {
    seller: seller.name,
    buyer: buyer.name,
    goods: p.goods,
    hs_code: p.hs,
    quantity: `${kg(p.netKg)} kg`,
    total_value: `${p.valueUsd.toLocaleString("en-US").replace(/,/g, " ")}.00 USD`,
  };

  /** Fields for a document of this type, as its spec names them. */
  function fieldsFor(type: DocType | null, step: number, label: string, amount: string): Record<string, string> {
    const d = date(stepDay(step));
    switch (type) {
      case "commercial_invoice":
        return { invoice_no: invoiceNo, invoice_date: date(3), ...common, origin_country: p.fromCountry, gross_weight: `${kg(gross)} kg`, currency: "USD", contract_no: contractNo, incoterms: p.incoterms, transport_doc: transportNo };
      case "trade_contract":
        return { contract_no: contractNo, contract_date: date(0), ...common, incoterms: p.incoterms };
      case "passport":
        return { full_name: `${p.representative.name.split(" ")[1].toUpperCase()} ${p.representative.name.split(" ")[0].toUpperCase()}`, passport_no: p.representative.passport, expiry: "14.03.2031" };
      case "power_of_attorney":
        return { poa_no: String(10 + Number(p.id) % 50), issue_date: date(1), representative: p.representative.name, passport: p.representative.passport, valid_until: "31.12.2026", scope: "Customs operations, cargo handling, signing and receiving documents" };
      case "packing_list":
        return { list_no: `PL-${p.id}/2026-031`, list_date: date(3), seller: seller.name, consignee: buyer.name, goods: p.goods, packaging: p.packaging, packages: String(p.packages), net_weight: `${kg(p.netKg)} kg`, gross_weight: `${kg(gross)} kg`, hs_code: p.hs, seller_inn: seller.tin };
      case "cmr_note":
        return { cmr_no: `${p.id}-2026/014`, sender: seller.name, consignee: buyer.name, delivery_place: `${p.to}, ${p.toCountry}`, loading_place: `${p.from}, ${p.fromCountry}, ${date(4)}`, goods: p.goods, places: String(p.packages), weight: `${kg(gross)} kg`, carrier: p.carrier, vehicle: p.units[0], issue_date: date(4) };
      case "air_waybill":
        return { awb_no: `250-${p.id}88213`, shipper: seller.name, consignee: buyer.name, departure_airport: p.departure, destination_airport: p.destination, flight_date: `HY 7021 / ${date(10)}`, pieces: String(p.packages), gross_weight: `${kg(gross)} kg`, goods: p.goods, declared_customs: "NCV", executed_on: date(10) };
      case "railway_bill":
        return { dispatch_no: `77${p.id.padStart(3, "0")}451`, sender: seller.name, consignee: buyer.name, departure_station: p.departure, destination_station: p.destination, border_stations: p.border, wagon_no: p.units.join(", "), cargo: `${p.goodsRu} / ${p.goods}`, packaging: p.packaging, places: String(p.packages), weight: kg(gross), seals: p.seals.join(", "), documents_attached: `Invoice ${invoiceNo}` };
      case "phytosanitary_certificate":
        return { cert_no: `${exporting ? "UZ-EX" : "KZ-EX"} 2026/${p.id}12`, exporter: seller.name, consignee: buyer.name, destination_country: p.toCountry, point_of_entry: p.border, place_of_origin: p.fromCountry, produce: p.goods, botanical_name: p.botanical ?? "—", quantity: `${kg(p.netKg)} kg`, treatment: "Not treated", issue_date: d };
      case "certificate_of_origin":
        return { cert_no: `${p.fromCountry.slice(0, 2).toUpperCase()} 04${p.id}811`, exporter: seller.name, consignee: buyer.name, transport_route: route, goods: `${p.goods}, ${p.packages} places`, weight: `${kg(gross)} kg`, invoice_ref: `${invoiceNo} of ${date(3)}`, exported_to: p.toCountry };
      case "receipt_of_payment":
        return { receipt_no: `R-${p.id}-${String(step).padStart(3, "0")}`, payer: p.trader.name, payer_inn: p.trader.tin, recipient: recipientOf(label, step), payment_type: paymentOf(step), amount, date: d };
      case "invoice_for_payment":
        return { invoice_no: `IP-${p.id}/${String(step).padStart(3, "0")}`, invoice_date: d, contract_no: `SRV-${p.id}-${step}`, supplier: recipientOf(label, step), supplier_inn: "200933140", customer: p.trader.name, vat_rate: "12", total: amount };
      case "offer_agreement":
        return { agreement_no: `2614${p.id.padStart(3, "0")}${String(step).padStart(4, "0")}`, agreement_date: d, amount, service: label.replace(/^offer agreement( for)?/i, "").trim() || "Inspection services", units: String(p.units.length) };
      case "cargo_transport_application":
        return { shipper: p.trader.name, departure_station: p.departure, cargo: p.goods, etsng: "214095", destination_station: p.destination, consignee: buyer.name, tonnes: String(p.netKg / 1000), wagons: String(p.units.length) };
      case "customs_declaration":
        return { decl_type: exporting ? "EK10" : /cargo/i.test(label) ? "IM70" : "IM40", exporter: seller.name, consignee: buyer.name, origin_country: p.fromCountry, destination_country: p.toCountry, delivery_terms: p.incoterms, invoice_amount: common.total_value, hs_code: p.hs, gross_weight: kg(gross), net_weight: kg(p.netKg), procedure_code: exporting ? "10" : "40", customs_value: common.total_value };
      case "food_test_report":
        return { protocol_no: `LAB-${p.id}/2026-07`, protocol_date: date(6), lab_accreditation: "KZ.T.02.0011 (demo)", sample: p.goods, manufacturer: seller.name, test_period: `${date(4)} – ${date(6)}` };
      case "veterinary_certificate":
        return { cert_no: /exporter/i.test(label) ? `VC-${p.fromCountry.slice(0, 2).toUpperCase()}-${p.id}07` : `F3-${p.id}-2026`, issue_date: d, consignor: seller.name, consignee: buyer.name, goods: p.goods, quantity: `${kg(p.netKg)} kg`, origin_country: p.fromCountry, vet_permit_no: `VP-${p.id}-2026` };
      case "certificate_of_conformity":
        return { cert_no: `UZ.SMT.${p.id}.2026`, issue_date: d, valid_until: "31.12.2027", applicant: p.trader.name, product: p.goods, hs_code: p.hs, standard: "O'z DSt 3182 (demo)", body: "Certification body of fertilizers (demo)" };
      case "quarantine_permit":
        return { permit_no: `QP-${p.id}-2026`, issued_date: date(2), valid_until: "31.12.2026", issued_to: p.trader.name, exporter: seller.name, product: p.goods, hs_code: p.hs, origin: p.fromCountry, entry_post: p.border };
      default:
        return {};
    }
  }

  function recipientOf(label: string, step: number): string {
    const s = procedure.blocks.flatMap((b) => b.steps).find((x) => x.num === step);
    const title = `${s?.title ?? ""} ${label}`.toLowerCase();
    if (/railway|code assignment|wagon/.test(title)) return /forwarder|code/.test(title) ? "OOO \"Demo Forwarding\"" : "JSC Uzbekistan Temir Yo'llari";
    if (/phyto|quarantine|fumigat|transport unit opening/.test(title)) return "Agency of Plant Quarantine and Protection";
    if (/veterinar/.test(title)) return "State Committee of Veterinary (demo)";
    if (/origin|expertiza/.test(title)) return "Uzbekexpertiza JSC (demo)";
    if (/conformity|certification/.test(title)) return "Certification body of fertilizers (demo)";
    if (/warehouse/.test(title)) return "Demo Customs Warehouse LLC";
    if (/customs|fee|entrance|transit/.test(title)) return "State Customs Committee (demo)";
    if (/sanitary|laborator/.test(title)) return "Sanitary-epidemiological service (demo)";
    return "Service provider (demo)";
  }
  const paymentOf = (step: number) => procedure.blocks.flatMap((b) => b.steps).find((x) => x.num === step)?.title.replace(/^pay(ment)?\s+(for\s+)?/i, "") ?? "Payment";

  const docs: Doc[] = [];
  const add = (doc: Omit<Doc, "file" | "id"> & { id?: string }) => {
    const n = String(docs.length + 1).padStart(2, "0");
    const id = doc.id ?? slug(doc.title);
    docs.push({ ...doc, id: docs.some((d) => d.id === id) ? `${id}-${n}` : id, file: `${p.id}-${n}-${slug(doc.title)}.png` });
  };

  // Amounts: each payment step pays the nearest earlier offer or invoice.
  let amountSeq = 0;
  const nextAmount = () => uzs([245_000, 1_120_000, 490_000, 780_000, 1_500_000, 2_350_000, 375_000, 18_400_000][amountSeq++ % 8]);
  const outputs = rows.filter((r) => r.kind === "document" && r.output).sort((a, b) => a.step - b.step);
  const lastPriced: string[] = [];

  // Shared input documents first, then everything in step order.
  const inputs = rows.filter((r) => r.kind === "document" && !r.output);
  for (const type of SHARED) {
    const typed = inputs.filter((r) => r.docType === type);
    if (!typed.length) continue;
    const spec = specFor(type);
    add({
      id: type.replace(/_/g, "-"),
      template: TEMPLATE[type] ?? "letter",
      title: spec.name,
      docType: type,
      labels: [...new Set(typed.map((r) => r.label))],
      steps: [...new Set(typed.map((r) => r.step))].sort((a, b) => a - b),
      output: false,
      fields: fieldsFor(type, typed[0].step, typed[0].label, ""),
    });
  }

  const byLabel = new Map<string, NeedRow[]>();
  for (const r of inputs.filter((r) => !r.docType || !SHARED.includes(r.docType))) byLabel.set(r.label, [...(byLabel.get(r.label) ?? []), r]);
  const events = [
    ...[...byLabel.values()].map((group) => ({ step: group[0].step, input: group })),
    ...outputs.map((r) => ({ step: r.step, output: r })),
  ].sort((a, b) => a.step - b.step || ("input" in a ? -1 : 1));

  for (const e of events) {
    if ("input" in e && e.input) {
      const r = e.input[0];
      const amount = r.docType === "invoice_for_payment" ? nextAmount() : "";
      if (amount) lastPriced.push(amount);
      add({
        template: r.docType ? TEMPLATE[r.docType] ?? "letter" : "letter",
        title: r.label,
        docType: r.docType,
        labels: [r.label],
        steps: [...new Set(e.input.map((x) => x.step))].sort((a, b) => a - b),
        output: false,
        fields: fieldsFor(r.docType, r.step, r.label, amount),
        body: r.docType ? undefined : bodyFor(r.label),
      });
      continue;
    }
    const r = (e as { output: NeedRow }).output;
    let amount = "";
    if (r.docType === "offer_agreement" || r.docType === "invoice_for_payment") {
      amount = nextAmount();
      lastPriced.push(amount);
    } else if (r.docType === "receipt_of_payment") {
      amount = lastPriced.pop() ?? nextAmount();
    }
    const stamp = /stamped by customs/i.test(r.label) ? "customs" : /datestamp/i.test(r.label) ? "datestamp" : undefined;
    add({
      id: `${slug(r.label)}-${r.step}`,
      template: r.docType ? TEMPLATE[r.docType] ?? "letter" : "letter",
      title: `${r.label} — step ${r.step}`,
      docType: r.docType,
      labels: [r.label],
      steps: [r.step],
      output: true,
      fields: fieldsFor(r.docType, r.step, r.label, amount),
      body: r.docType ? undefined : bodyFor(r.label),
      ...(stamp ? { stamp } : {}),
    });
  }

  function bodyFor(label: string): string {
    const shipment = `${kg(p.netKg)} kg of ${p.goods.toLowerCase()}, ${p.from} (${p.fromCountry}) → ${p.to} (${p.toCountry}), ${p.units.length} ${p.unitKind}${p.units.length > 1 ? "s" : ""} ${p.units.join(", ")}`;
    if (/driver|international passport/i.test(label)) return `${label} of ${p.representative.name}, driver of the shipment (passport ${p.representative.passport}). Shipment: ${shipment}.`;
    if (/vehicle|\batp\b|tir carnet|control book|carriage of goods/i.test(label)) return `${label} for ${p.units.join(", ")}, operated by ${p.carrier}. Shipment: ${shipment}.`;
    if (/application|request|letter/i.test(label)) return `${p.trader.name} (TIN ${p.trader.tin}) applies for: ${label.toLowerCase()}. Shipment: ${shipment}. Contract ${contractNo} of ${date(0)}.`;
    if (/certificate|licen[cs]e|registration/i.test(label)) return `${label} issued to ${p.trader.name} (TIN ${p.trader.tin}). Demo record for the shipment: ${shipment}.`;
    return `${label} for the shipment ${shipment}, contract ${contractNo} of ${date(0)}.`;
  }

  return {
    procedureId: p.id,
    title: `${procedure.title} — demo scenario`,
    note: "Fictional demo data. Every company, person, number, amount and stamp is invented; nothing here is a real document.",
    shipment: {
      query: p.query,
      goods: p.goods,
      goodsRu: p.goodsRu,
      hs: p.hs,
      netKg: kg(p.netKg),
      grossKg: kg(gross),
      cartons: String(p.packages),
      packaging: p.packaging,
      unitKind: p.unitKind,
      wagons: p.units,
      seals: p.seals,
      departureStation: p.departure,
      destinationStation: p.destination,
      borderStations: p.border,
      from: `${p.from}, ${p.fromCountry}`,
      to: `${p.to}, ${p.toCountry}`,
      valueUsd: common.total_value.replace(" USD", ""),
      incoterms: p.incoterms,
      contractNo,
      contractDate: date(0),
      invoiceNo,
      invoiceDate: date(3),
      caseLine: `${procedure.title.toLowerCase()}, ${kg(p.netKg)} kg of ${p.goods.toLowerCase()}`,
    },
    parties: { exporter: p.trader, trader: p.trader, seller, buyer, representative: p.representative },
    values: Object.fromEntries(Object.entries(valuesFor(p)).filter(([label]) => rows.some((r) => r.kind === "value" && r.label === label))),
    documents: docs,
  };
}

for (const profile of PROFILES) {
  const scenario = build(profile);
  const missingValues = [...new Set(needsOf(profile.id).filter((r) => r.kind === "value" && !scenario.values[r.label]).map((r) => r.label))];
  if (missingValues.length) throw new Error(`${profile.id}: no demo value for ${missingValues.join(", ")}`);
  writeFileSync(`${OUT}scenario-${profile.id}.json`, JSON.stringify(scenario, null, 1) + "\n");
  console.log(`${profile.id}: ${scenario.documents.length} documents, ${Object.keys(scenario.values).length} values`);
}
