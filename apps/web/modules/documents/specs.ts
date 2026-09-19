/* Document Intelligence - what each DOCUMENT must contain.
 *
 * Field lists come from the R&D on the specimen images the procedures publish
 * (Docs/research/2026-09-13-document-specimens-rnd.md). Every field says where
 * it comes from:
 *   - "specimen":  seen on the published specimen of that document;
 *   - "procedure": named in the procedure's own section 5 inputs;
 *   - "reference": standard practice, not on the specimen.
 *
 * Each field also carries what the document AI needs to read it: its kind
 * (validated in modules/documents/docai/validate.ts), whether a step may proceed without it,
 * the questions asked of the layout QA model, and bilingual label anchors
 * taken from the specimen's printed labels. Anchors are plain regular
 * expressions valid in both JavaScript and Python.
 *
 * `checks` are the cross-document consistency rules the agent runs once the
 * document is in the case ledger.
 */

export type DocType =
  | "commercial_invoice"
  | "packing_list"
  | "trade_contract"
  | "railway_bill"
  | "air_waybill"
  | "cmr_note"
  | "shippers_letter"
  | "phytosanitary_certificate"
  | "certificate_of_origin"
  | "receipt_of_payment"
  | "invoice_for_payment"
  | "power_of_attorney"
  | "offer_agreement"
  | "quarantine_permit_application"
  | "quarantine_permit"
  | "veterinary_certificate"
  | "certificate_of_conformity"
  | "customs_declaration"
  | "cargo_transport_application"
  | "food_test_report"
  | "passport";

export type FieldSource = "specimen" | "procedure" | "reference";
export type FieldKind = "text" | "date" | "inn" | "hs" | "amount" | "weight" | "number" | "currency" | "incoterm" | "country";

export type DocField = {
  key: string;
  name: string;
  source: FieldSource;
  kind: FieldKind;
  /** A step that needs this document cannot proceed until the field is confirmed. */
  required: boolean;
  questions: string[];
  anchors: string[];
};

export type DocSpec = {
  type: DocType;
  name: string;
  purpose: string;
  /** Where the field list was read from. */
  specimen: string;
  fields: DocField[];
  /** Other documents the procedure says must accompany this one. */
  supporting: string[];
  checks: string[];
};

const make =
  (source: FieldSource) =>
  (key: string, name: string, kind: FieldKind, required: boolean, questions: string[] = [], anchors: string[] = []): DocField => ({
    key,
    name,
    source,
    kind,
    required,
    questions,
    anchors,
  });
const s = make("specimen");
const p = make("procedure");

export const DOC_SPECS: Record<DocType, DocSpec> = {
  commercial_invoice: {
    type: "commercial_invoice",
    name: "Commercial invoice",
    purpose: "Value and description of the goods — the document most other filings are checked against.",
    specimen: "Bilingual СЧЕТ/INVOICE template (306/325/868)",
    fields: [
      s("invoice_no", "Invoice number", "number", true, ["What is the invoice number?"], ["номер сч[её]та", "invoice\\s*(no|number|№)"]),
      s("invoice_date", "Invoice date", "date", true, ["What is the invoice date?", "What is the date?"], ["место и дата", "place and date", "дата", "date"]),
      s("seller", "Sent by (seller)", "text", true, ["Who is the sender company?", "What is the seller name?"], ["отправитель", "sent by", "seller", "продавец"]),
      s("buyer", "Sent to (buyer)", "text", true, ["Who is the recipient company?", "What is the buyer name?"], ["получатель", "sent to", "buyer", "покупатель"]),
      s("goods", "Description of goods", "text", true, ["What is the description of goods?"], ["описание товар", "description of goods"]),
      s("hs_code", "Customs commodity code", "hs", false, ["What is the customs commodity code?", "What is the HS code?"], ["commodity code", "таможенная спецификация", "код тн вэд"]),
      s("origin_country", "Country of origin", "country", false, ["What is the country of origin?"], ["country of origin", "страна происхождения"]),
      s("quantity", "Quantity / total net weight", "weight", true, ["What is the total net weight?", "What is the quantity?"], ["total net weight", "вес нетто", "quantity", "количество"]),
      s("gross_weight", "Total gross weight", "weight", false, ["What is the total gross weight?"], ["total gross weight", "вес брутто"]),
      s("total_value", "Total value", "amount", true, ["What is the total value?"], ["total value", "общая стоимость", "всего"]),
      s("currency", "Currency of invoice", "currency", true, ["What is the currency of invoice?"], ["currency of invoice", "валюта инвойса", "валюта"]),
      s("contract_no", "Contract number/date", "number", false, ["What is the contract number?"], ["number/date of contract", "дата контракта", "номер/дата контракта"]),
      s("incoterms", "Terms of delivery (Incoterms)", "incoterm", false, ["What are the terms of transportation?"], ["incoterms", "инкотермс", "условия поставки"]),
      s("transport_doc", "Transport document no.", "number", false, ["What is the waybill number?"], ["waybill", "bill of lading", "транспортный документ"]),
    ],
    supporting: [],
    checks: [
      "Quantity and total value match the customs declaration",
      "Quantity matches what intake recorded for the shipment",
      "Buyer matches the counterparty in the registered foreign trade contract",
      "Goods description and HS code match the certificate of origin and phytosanitary certificate",
    ],
  },
  packing_list: {
    type: "packing_list",
    name: "Packing list",
    purpose: "How the goods are packed — what inspectors count against.",
    specimen: "Bilingual УПАКОВОЧНЫЙ ЛИСТ / PACKING LIST (477, 540)",
    fields: [
      s("list_no", "Packing list number", "number", true, ["What is the packing list number?"], ["packing list\\s*№", "упаковочный лист\\s*№"]),
      s("list_date", "Date", "date", false, ["What is the date?"], ["от\\s*/\\s*dd", "dd\\."]),
      s("seller", "Seller", "text", true, ["Who is the seller?"], ["seller", "продавец"]),
      s("consignee", "Buyer / consignee", "text", true, ["Who is the consignee?", "Who is the buyer?"], ["consignee", "грузополучатель", "buyer", "покупатель"]),
      s("goods", "Name of product", "text", true, ["What is the name of product?"], ["name of product", "наименование товара"]),
      s("packaging", "Packaging", "text", false, ["What is the packaging?"], ["packaging", "упаковка"]),
      s("packages", "Number of packages", "number", true, ["What is the number of packages?"], ["number of packages", "количество упаковок"]),
      s("net_weight", "Net weight", "weight", true, ["What is the net weight?"], ["net weight", "вес нетто"]),
      s("gross_weight", "Gross weight", "weight", true, ["What is the gross weight?"], ["gross weight", "вес брутто"]),
      s("hs_code", "HS code", "hs", false, ["What is the HS code?"], ["h\\.s\\. code", "код тн вэд"]),
      s("seller_inn", "Seller INN", "inn", false, ["What is the INN?"], ["инн"]),
    ],
    supporting: [],
    checks: [
      "Net and gross weight match the invoice and the railway bill / air waybill",
      "Packaging material is declared — wooden packaging needs an ISPM 15 mark",
    ],
  },
  trade_contract: {
    type: "trade_contract",
    name: "Foreign trade contract",
    purpose: "The deal itself; registered in UEISFTO before anything is declared.",
    specimen: "Bilingual EN/RU contract (306/325/868)",
    fields: [
      s("contract_no", "Contract number", "number", true, ["What is the contract number?"], ["contract\\s*№", "контракт\\s*№"]),
      s("contract_date", "Contract date", "date", true, ["What is the contract date?"], ["date", "дата"]),
      s("seller", "Seller", "text", true, ["Who is the seller?"], ["called further .?seller", "продавц", "seller\\s*/\\s*продавец"]),
      s("buyer", "Buyer", "text", true, ["Who is the buyer?"], ["called further .?buyer", "покупател", "buyer\\s*/\\s*покупатель"]),
      s("incoterms", "Delivery terms (Incoterms)", "incoterm", false, ["What are the delivery terms?"], ["incoterms", "инкотермс"]),
      s("goods", "Product", "text", false, ["What is the product?"], ["referred to as", "именуемое"]),
      s("quantity", "Quantity", "weight", false, ["What is the quantity of product?"], ["quantity of product", "количество товара"]),
      s("total_value", "Contract cost", "amount", false, ["What is the contract cost?"], ["contract cost", "стоимость контракта"]),
      p("ueisfto_id", "Identification number of foreign trade contract", "number", false, ["What is the registration number?"], ["идентификационный номер", "identification number"]),
    ],
    supporting: [],
    checks: [
      "Registered in UEISFTO — the identification number exists before the customs declaration is created",
      "Contract is valid on the shipment date",
    ],
  },
  railway_bill: {
    type: "railway_bill",
    name: "Railway bill (SMGS consignment note)",
    purpose: "Contract of carriage by rail; travels with the wagon across borders.",
    specimen: "SMGS blank (325) and filled KZ→UZ bill (477)",
    fields: [
      s("dispatch_no", "Dispatch number (box 29)", "number", true, ["What is the dispatch number?"], ["отправка\\s*№"]),
      s("sender", "Sender (box 1)", "text", true, ["Who is the sender?"], ["отправитель"]),
      s("consignee", "Consignee (box 4)", "text", true, ["Who is the consignee?"], ["получатель"]),
      s("departure_station", "Departure station (box 2)", "text", true, ["What is the departure station?"], ["станция отправления"]),
      s("destination_station", "Destination station (box 5)", "text", true, ["What is the destination station?"], ["станция назначения"]),
      s("border_stations", "Border crossing stations (box 6)", "text", false, ["What are the border stations?"], ["пограничные станции"]),
      s("wagon_no", "Wagon number (box 7)", "number", true, ["What is the wagon number?"], ["вагон"]),
      s("cargo", "Name of cargo (box 15)", "text", true, ["What is the name of the cargo?"], ["наименование груза"]),
      s("packaging", "Type of packaging (box 16)", "text", false, ["What is the type of packaging?"], ["род упаковки"]),
      s("places", "Number of places (box 17)", "number", false, ["What is the number of places?"], ["к-во мест"]),
      s("weight", "Weight, kg (box 18)", "weight", true, ["What is the weight in kg?"], ["масса\\s*\\(в кг\\)", "масса"]),
      s("seals", "Seals (box 19)", "text", false, ["What are the seal numbers?"], ["пломбы"]),
      s("documents_attached", "Documents attached (box 24)", "text", false, ["Which documents are attached?"], ["документы, приложенные"]),
    ],
    supporting: [],
    checks: [
      "Consignee and destination station match the contract and invoice",
      "Weight matches the packing list and what intake recorded",
      "Seal numbers match those applied after customs inspection",
    ],
  },
  cmr_note: {
    type: "cmr_note",
    name: "CMR consignment note",
    purpose: "Contract of carriage by road under the CMR Convention; travels with the truck across borders.",
    specimen: "International consignment note CMR (161, 57) — box numbers as printed on the standard form",
    fields: [
      s("cmr_no", "CMR number", "number", true, ["What is the CMR number?"], ["cmr\s*№", "международная товарно-транспортная накладная"]),
      s("sender", "Sender (box 1)", "text", true, ["Who is the sender?"], ["отправитель", "sender"]),
      s("consignee", "Consignee (box 2)", "text", true, ["Who is the consignee?"], ["получатель", "consignee"]),
      s("delivery_place", "Place of delivery (box 3)", "text", true, ["What is the place of delivery?"], ["место разгрузки", "place of delivery"]),
      s("loading_place", "Place and date of taking over (box 4)", "text", true, ["Where were the goods taken over?"], ["место и дата погрузки", "taking over"]),
      s("goods", "Nature of the goods (box 9)", "text", true, ["What is the nature of the goods?"], ["наименование груза", "nature of the goods"]),
      s("places", "Number of packages (box 7)", "number", false, ["How many packages?"], ["количество мест", "number of packages"]),
      s("weight", "Gross weight, kg (box 11)", "weight", true, ["What is the gross weight?"], ["вес брутто", "gross weight"]),
      s("carrier", "Carrier (box 16)", "text", true, ["Who is the carrier?"], ["перевозчик", "carrier"]),
      s("vehicle", "Vehicle registration", "text", false, ["What is the vehicle registration number?"], ["регистрационный номер", "vehicle"]),
      s("issue_date", "Established on (box 21)", "date", false, ["What is the date the note was established?"], ["составлена", "established"]),
    ],
    supporting: [],
    checks: [
      "Sender, consignee and goods match the contract and invoice",
      "Gross weight matches the invoice and what intake recorded",
      "Place of delivery is in the destination country of the case",
    ],
  },
  air_waybill: {
    type: "air_waybill",
    name: "Air waybill",
    purpose: "Contract of carriage by air; stamped at each airport control.",
    specimen: "IATA air waybill (540)",
    fields: [
      s("awb_no", "Air waybill number", "number", true, ["What is the air waybill number?"], ["air waybill", "awb"]),
      s("shipper", "Shipper's name and address", "text", true, ["Who is the shipper?"], ["shipper'?s name and address"]),
      s("consignee", "Consignee's name and address", "text", true, ["Who is the consignee?"], ["consignee'?s name and address"]),
      s("departure_airport", "Airport of departure", "text", true, ["What is the airport of departure?"], ["airport of departure"]),
      s("destination_airport", "Airport of destination", "text", true, ["What is the airport of destination?"], ["airport of destination"]),
      s("flight_date", "Flight / date", "text", false, ["What is the flight and date?"], ["flight/date"]),
      s("pieces", "No. of pieces", "number", true, ["How many pieces?"], ["no\\.? of pieces"]),
      s("gross_weight", "Gross weight", "weight", true, ["What is the gross weight?"], ["gross weight"]),
      s("goods", "Nature and quantity of goods", "text", true, ["What is the nature and quantity of goods?"], ["nature and quantity of goods"]),
      s("declared_customs", "Declared value for customs", "amount", false, ["What is the declared value for customs?"], ["declared value for customs"]),
      s("executed_on", "Executed on (date)", "date", false, ["When was it executed?"], ["executed on"]),
    ],
    supporting: [],
    checks: ["Pieces and weight match the packing list", "Consignee matches the contract"],
  },
  shippers_letter: {
    type: "shippers_letter",
    name: "Shipper's letter of instruction",
    purpose: "Instructs the carrier's agent to issue the air waybill.",
    specimen: "Uzbekistan Airways form, boxes 1–19 (540)",
    fields: [
      s("shipper", "Shipper (1)", "text", true, ["Who is the shipper?"], ["^shipper$", "shipper"]),
      s("consignee", "Consignee (2)", "text", true, ["Who is the consignee?"], ["consignee"]),
      s("departure_airport", "Airport of departure (3)", "text", true, ["What is the airport of departure?"], ["airport of departure"]),
      s("destination_airport", "Airport of destination (4)", "text", true, ["What is the airport of destination?"], ["airport of destination"]),
      s("packages", "No. and kind of packages (9)", "number", true, ["How many packages?"], ["no\\. & kind of pkgs"]),
      s("goods", "Description of goods (10)", "text", true, ["What is the description of goods?"], ["description of goods"]),
      s("gross_weight", "Gross weight (11)", "weight", true, ["What is the gross weight?"], ["gross weight"]),
      s("declared_customs", "Declared value for customs (17)", "amount", false, ["What is the declared value for customs?"], ["for customs"]),
      s("date", "Date (19)", "date", false, ["What is the date?"], ["^date$"]),
    ],
    supporting: [],
    checks: ["Shipper, consignee and weight match the air waybill and packing list"],
  },
  phytosanitary_certificate: {
    type: "phytosanitary_certificate",
    name: "Phytosanitary certificate",
    purpose: "Plant-health clearance for plant products, issued after inspection.",
    specimen: "UZ blank IPPC form (325) and filled KZ certificate (477)",
    fields: [
      s("cert_no", "Certificate number", "number", true, ["What is the certificate number?"], ["phytosanitary certificate", "фитосанитарный сертификат", "uz-ex"]),
      s("exporter", "Name and address of exporter (1)", "text", true, ["What is the name and address of exporter?"], ["name and address of exporter", "экспортер"]),
      s("consignee", "Declared consignee (3)", "text", true, ["What is the declared name and address of consignee?"], ["declared name and address of consignee", "получатель"]),
      s("destination_country", "To plant protection organisation of (4)", "country", true, ["To which country's plant protection organization?"], ["plant protection organi[sz]ation", "организация по карантину"]),
      s("point_of_entry", "Declared point of entry (5)", "text", false, ["What is the declared point of entry?"], ["point of entry", "пункт ввоза"]),
      s("place_of_origin", "Place of origin (6)", "country", false, ["What is the place of origin?"], ["place of origin", "место происхождения"]),
      s("produce", "Name of produce (8)", "text", true, ["What is the name of produce?"], ["name of produce", "наименование продукции"]),
      s("botanical_name", "Botanical name of plants (8)", "text", false, ["What is the botanical name of plants?"], ["botanical name", "ботаническое название"]),
      s("quantity", "Quantity declared (9)", "weight", true, ["What is the quantity declared?"], ["quantity declared", "заявленное количество"]),
      s("treatment", "Treatment method (12)", "text", false, ["What is the treatment?"], ["treatment", "способ обработки"]),
      s("chemical", "Chemical, active ingredient (13)", "text", false, ["What is the chemical?"], ["chemical", "химикат"]),
      s("issue_date", "Date of issue", "date", true, ["What is the date of issue?"], ["^date$", "дата"]),
    ],
    supporting: [],
    checks: [
      "Produce, quantity and consignee match the invoice and contract",
      "Issued on or after the inspection (and fumigation, if any) date",
      "Destination country matches the route",
    ],
  },
  certificate_of_origin: {
    type: "certificate_of_origin",
    name: "Certificate of origin",
    purpose: "Proves where the goods were produced; issued by Uzbekexpertiza after goods expertise.",
    specimen: "Forms CT-1, Form A and general form (306/325/540/868)",
    fields: [
      s("cert_no", "Certificate number (4)", "number", true, ["What is the certificate number?"], ["reference no", "4\\.\\s*№"]),
      s("exporter", "Exporter / consignor (1)", "text", true, ["Who is the exporter?"], ["consignor", "goods consigned from", "экспортер", "отправитель"]),
      s("consignee", "Consignee / importer (2)", "text", true, ["Who is the consignee?"], ["consigned to", "consignee", "получатель"]),
      s("transport_route", "Means of transport and route (3)", "text", false, ["What is the means of transport and route?"], ["means of transport and route", "средства транспорта"]),
      s("goods", "Description of goods", "text", true, ["What is the description of goods?"], ["description of goods", "описание товара"]),
      s("origin_criterion", "Origin criterion", "text", false, ["What is the origin criterion?"], ["origin criterion", "критерий происхождения"]),
      s("weight", "Gross/net weight", "weight", true, ["What is the gross weight?"], ["gross weight", "вес брутто"]),
      s("invoice_ref", "Number and date of invoices", "text", false, ["What is the number and date of invoice?"], ["number and date of invoices", "номер и дата сч"]),
      s("exported_to", "Exported to / for presentation in", "country", false, ["To which country is it exported?"], ["exported to", "для представления в"]),
    ],
    supporting: [
      "Commercial invoice",
      "Any document confirming the exporter's right to use a land plot",
      "Any document confirming purchase of agricultural products",
    ],
    checks: [
      "Goods description and weight match the invoice",
      "The form (CT-1, Form A, general) matches the destination country's origin proof",
    ],
  },
  receipt_of_payment: {
    type: "receipt_of_payment",
    name: "Receipt of payment",
    purpose: "Proof a fee was paid — the platform never pays, it matches the receipt.",
    specimen: "Treasury КВИТАНЦИЯ (325) and generic bank receipt (540)",
    fields: [
      s("receipt_no", "Receipt number", "number", false, ["What is the receipt number?"], ["квитанция", "receipt", "^no\\.?"]),
      s("payer", "Payer", "text", true, ["Who is the payer?"], ["ф\\.и\\.о", "payer name", "плательщик"]),
      s("payer_inn", "Payer INN", "inn", false, ["What is the INN?"], ["инн"]),
      s("recipient", "Recipient", "text", false, ["Who is the recipient?"], ["получатель платежа", "казначейство"]),
      s("payment_type", "Type of payment", "text", false, ["What is the type of payment?"], ["вид налога", "description"]),
      s("amount", "Total amount", "amount", true, ["What is the total amount?"], ["итого", "total", "amount"]),
      s("date", "Date", "date", true, ["What is the date?"], ["дата", "date"]),
    ],
    supporting: [],
    checks: [
      "Payment purpose carries the platform reference <case>-P<step>, so the receipt matches this case and step",
      "Amount equals the invoice or offer agreement being paid",
      "Payer INN matches the company profile",
    ],
  },
  invoice_for_payment: {
    type: "invoice_for_payment",
    name: "Invoice for payment",
    purpose: "What a service provider bills before its service; the receipt must match it.",
    specimen: "СЧЕТ на оплату (325) and airport СЧЁТ ПРЕДОПЛАТА (540)",
    fields: [
      s("invoice_no", "Invoice number", "number", true, ["What is the invoice number?"], ["сч[её]т на оплату\\s*№", "сч[её]т\\s*№"]),
      s("invoice_date", "Invoice date", "date", true, ["What is the invoice date?"], ["^от$", "дата"]),
      s("contract_no", "Contract number", "number", false, ["What is the contract number?"], ["к договору", "договор\\s*№"]),
      s("supplier", "Supplier", "text", true, ["Who is the supplier?"], ["поставщик", "обслуживающая сторона"]),
      s("supplier_inn", "Supplier INN", "inn", false, ["What is the INN?"], ["инн"]),
      s("customer", "Customer", "text", true, ["Who is the customer?"], ["заказчик"]),
      s("vat_rate", "VAT rate", "number", false, ["What is the VAT rate?"], ["ставка"]),
      s("total", "Total to pay", "amount", true, ["What is the total to pay?"], ["всего к оплате", "итого"]),
    ],
    supporting: [],
    checks: ["Receipt amount equals this total", "Customer matches the company profile"],
  },
  power_of_attorney: {
    type: "power_of_attorney",
    name: "Power of attorney",
    purpose: "Lets a representative act for the company at a counter.",
    specimen: "ДОВЕРЕННОСТЬ blank (325)",
    fields: [
      s("poa_no", "Power of attorney number", "number", true, ["What is the power of attorney number?"], ["доверенность\\s*№"]),
      s("issue_date", "Date of issue", "date", true, ["What is the date?"], ["^г\\.", "дата"]),
      s("representative", "Issued to", "text", true, ["To whom is the power of attorney issued?"], ["доверенность выдана"]),
      s("passport", "Passport series and number", "text", true, ["What is the passport series?"], ["серия паспорта"]),
      s("valid_until", "Valid until", "date", true, ["Until when is it valid?"], ["сроком до"]),
      p("scope", "Scope naming the counterparty (e.g. railway station, Transportation Unit)", "text", false, [], []),
    ],
    supporting: [],
    checks: ["Representative's name matches the passport presented", "Valid on the date of the visit"],
  },
  offer_agreement: {
    type: "offer_agreement",
    name: "Offer agreement",
    purpose: "Public-offer contract generated by the quarantine or sanitary portal before its service is paid.",
    specimen: "Оферта шартномаси, Uzbek (325) — agreement no, date, service table",
    fields: [
      s("agreement_no", "Agreement number", "number", true, ["What is the agreement number?"], ["оферта шартномаси\\s*№", "оферта\\s*№"]),
      s("agreement_date", "Agreement date", "date", true, ["What is the date?"], ["шаҳар", "город"]),
      s("amount", "Amount", "amount", true, ["What is the total amount?"], ["сумма", "суммаси"]),
      p("Tax Identification Number of the organization or individual", "Tax Identification Number of the organization or individual", "inn", false),
      p("Name of the organization", "Name of the organization", "text", false),
      p("Full name of an organization's manager", "Full name of an organization's manager", "text", false),
      p("Type of organization (business entity, budgetary)", "Type of organization (business entity, budgetary)", "text", false),
      p("Contact phone number", "Contact phone number", "text", false),
      p("Agency region", "Agency region", "text", false),
      p("Payment sum", "Payment sum", "amount", false),
      p("Cost on the contract", "Cost on the contract", "amount", false),
      p("Quantity of transport units", "Quantity of transport units", "number", false),
      p("Amount of consignment", "Amount of consignment", "weight", false),
    ],
    supporting: [],
    checks: [
      "TIN and organisation name match the company profile",
      "Payment sum matches the receipt paid against it",
      "Quantity of transport units matches the wagons ordered",
    ],
  },
  quarantine_permit_application: {
    type: "quarantine_permit_application",
    name: "Quarantine permit application",
    purpose: "Requested before import; the permit must exist before the goods arrive.",
    specimen: "Single Window form — screenshot in procedure 477, section 7 (fields: modules/steps/application-forms.ts)",
    fields: [
      p("applicant", "Applicant: taxpayer type, INN, name, director, address, phone, fax; passport and patent for a private person", "text", true),
      p("importer", "Importer: same as applicant, or its own taxpayer type, INN, name, address, phone", "text", true),
      p("exporter", "Exporter: name, exporting country, address", "text", true),
      p("general", "General: destination address, transit countries, transport method, customs clearance point, border crossing, purpose of import", "text", true),
      p("product", "Product: HS code, product name, quantity and unit, gross weight", "text", true),
    ],
    supporting: [],
    checks: ["Product information matches the contract and invoice", "Importer matches the company profile"],
  },
  quarantine_permit: {
    type: "quarantine_permit",
    name: "Quarantine permit",
    purpose: "Authorises plant products to enter Uzbekistan.",
    specimen: "КАРАНТИННОЕ РАЗРЕШЕНИЕ, trilingual (477)",
    fields: [
      s("permit_no", "Permit number", "number", true, ["What is the permit number?"], ["quarantine permit", "карантинное разрешение"]),
      s("issued_date", "Issued", "date", true, ["When was it issued?"], ["issued", "выдано"]),
      s("valid_until", "Valid until", "date", true, ["Until when is it valid?"], ["valid", "срок до"]),
      s("issued_to", "Given to", "text", true, ["To whom is the permit given?"], ["license is given to", "разрешение выдано"]),
      s("exporter", "Exporter country, region and organisation", "text", false, ["Who is the exporter?"], ["name of exporter country", "экспортирующей страны"]),
      s("product", "Product name, HS code, quantity", "text", true, ["What is the product?"], ["product information", "информация о продукции"]),
      s("hs_code", "HS code", "hs", false, ["What is the HS code?"], ["hs code", "код тн вэд"]),
      s("origin", "Country and region of origin", "country", false, ["What is the country of origin?"], ["country and region of origin", "страна и регион происхождения"]),
      s("entry_post", "Border post and route of entry", "text", false, ["What is the border post of entry?"], ["border post", "пограничный пост"]),
    ],
    supporting: [],
    checks: ["Valid on the arrival date", "Product and quantity match the invoice"],
  },
  customs_declaration: {
    type: "customs_declaration",
    name: "Customs declaration",
    purpose: "The filing that clears the goods — assembled from everything above.",
    specimen: "ГТД / TD1, 54 boxes — filled (325) and blank IM70 (477)",
    fields: [
      s("decl_type", "Declaration type (box 1)", "text", true, ["What is the declaration type?"], ["тип декларации"]),
      s("exporter", "Sender / exporter (box 2)", "text", true, ["Who is the exporter?"], ["отправитель/экспортер"]),
      s("consignee", "Consignee / importer (box 8)", "text", true, ["Who is the importer?"], ["получатель/импортер"]),
      s("origin_country", "Country of origin (box 16)", "country", false, ["What is the country of origin?"], ["страна происхождения"]),
      s("destination_country", "Country of destination (box 17)", "country", true, ["What is the country of destination?"], ["страна назначения"]),
      s("delivery_terms", "Delivery terms (box 20)", "incoterm", false, ["What are the delivery terms?"], ["условия поставки"]),
      s("invoice_amount", "Currency and total invoiced amount (box 22)", "amount", true, ["What is the total invoiced amount?"], ["валюта и общая сумма"]),
      s("hs_code", "Commodity code (box 33)", "hs", true, ["What is the commodity code?"], ["код товара"]),
      s("gross_weight", "Gross weight, kg (box 35)", "weight", true, ["What is the gross weight?"], ["вес брутто"]),
      s("net_weight", "Net weight, kg (box 38)", "weight", false, ["What is the net weight?"], ["вес нетто"]),
      s("procedure_code", "Procedure (box 37)", "number", false, ["What is the procedure code?"], ["процедура"]),
      s("customs_value", "Customs value (box 45)", "amount", false, ["What is the customs value?"], ["таможенная стоимость"]),
    ],
    supporting: ["Identification number of foreign trade contract", "Commercial invoice", "Railway bill or air waybill"],
    checks: [
      "HS code consistent with the invoice and certificate of origin",
      "Contract identification number matches the UEISFTO registration",
      "Every permit or certificate it cites is in the case ledger",
      "The procedure lists the phytosanitary certificate and certificate of origin as not obligatory to attach to an export declaration",
    ],
  },
  cargo_transport_application: {
    type: "cargo_transport_application",
    name: "Application for cargo transportation (GU-12)",
    purpose: "Monthly request to the railway for wagons and a route.",
    specimen: "Form GU-12, filled (325)",
    fields: [
      s("shipper", "Shipper", "text", true, ["Who is the shipper?"], ["наименование и почтовый адрес отправителя"]),
      s("departure_station", "Station of departure", "text", true, ["What is the station of departure?"], ["наименование станции отправления"]),
      s("cargo", "Exact name of cargo", "text", true, ["What is the name of cargo?"], ["точное наименование груза"]),
      s("etsng", "Cargo code (ETSNG)", "number", false, ["What is the ETSNG code?"], ["етснг"]),
      s("destination_station", "Destination station", "text", true, ["What is the destination station?"], ["станции и дороги назначения"]),
      s("consignee", "Consignee", "text", false, ["Who is the consignee?"], ["наименование грузополучателя"]),
      s("tonnes", "Tonnes", "weight", true, ["How many tonnes?"], ["кол-во тонн"]),
      s("wagons", "Number of wagons", "number", true, ["How many wagons?"], ["количество вагонов"]),
    ],
    supporting: [],
    checks: ["Tonnes and wagons match what intake recorded", "Destination station matches the route"],
  },
  food_test_report: {
    type: "food_test_report",
    name: "Food test report",
    purpose: "Laboratory evidence for the sanitary-epidemiological conclusion.",
    specimen: "Протокол испытаний, accredited laboratory (477)",
    fields: [
      s("protocol_no", "Protocol number", "number", true, ["What is the protocol number?"], ["протокол испытаний\\s*№"]),
      s("protocol_date", "Protocol date", "date", true, ["What is the protocol date?"], ["протокол испытаний"]),
      s("lab_accreditation", "Laboratory accreditation", "text", false, ["What is the accreditation number?"], ["аттестат аккредитации"]),
      s("sample", "Sample name", "text", true, ["What is the sample name?"], ["наименование образца"]),
      s("manufacturer", "Manufacturer", "text", false, ["Who is the manufacturer?"], ["изготовитель"]),
      s("test_period", "Tests carried out", "text", false, ["When were the tests carried out?"], ["испытания проведены"]),
    ],
    supporting: [],
    checks: ["Sample matches the imported product", "Report date precedes the conclusion application"],
  },
  veterinary_certificate: {
    type: "veterinary_certificate",
    name: "Veterinary certificate",
    purpose: "Animal-health clearance for goods of animal origin, issued by the veterinary service after inspection.",
    specimen: "Veterinary certificate Form-3 (57, 707) and the exporter-country certificate named in section 5",
    fields: [
      s("cert_no", "Certificate number", "number", true, ["What is the certificate number?"], ["ветеринарный сертификат\s*№", "veterinary certificate"]),
      s("issue_date", "Date of issue", "date", true, ["What is the date of issue?"], ["дата выдачи", "date of issue"]),
      s("consignor", "Consignor", "text", true, ["Who is the consignor?"], ["отправитель", "consignor"]),
      s("consignee", "Consignee", "text", true, ["Who is the consignee?"], ["получатель", "consignee"]),
      s("goods", "Name of goods", "text", true, ["What are the goods?"], ["наименование продукции", "name of goods"]),
      s("quantity", "Quantity", "weight", true, ["What is the quantity?"], ["количество", "quantity"]),
      s("origin_country", "Country of origin", "country", false, ["What is the country of origin?"], ["страна происхождения", "country of origin"]),
      s("vet_permit_no", "Import permit number", "text", false, ["What is the veterinary permit number?"], ["разрешение на ввоз", "import permit"]),
    ],
    supporting: [],
    checks: ["Goods and quantity match the invoice", "Issued after the veterinary permit and on or before the declaration"],
  },
  certificate_of_conformity: {
    type: "certificate_of_conformity",
    name: "Certificate of conformity",
    purpose: "States the goods meet Uzbekistan's technical regulations; required before an import is released.",
    specimen: "Certificate of conformity from the certification body for fertilizers (57, 707)",
    fields: [
      s("cert_no", "Certificate number", "number", true, ["What is the certificate number?"], ["сертификат соответствия\s*№", "certificate of conformity"]),
      s("issue_date", "Date of issue", "date", true, ["What is the date of issue?"], ["дата выдачи", "date of issue"]),
      s("valid_until", "Valid until", "date", false, ["Until when is it valid?"], ["действителен до", "valid until"]),
      s("applicant", "Applicant", "text", true, ["Who is the applicant?"], ["заявитель", "applicant"]),
      s("product", "Product", "text", true, ["What is the product?"], ["продукция", "product"]),
      s("hs_code", "HS code", "hs", false, ["What is the HS code?"], ["код тн вэд", "hs code"]),
      s("standard", "Conforms to", "text", false, ["Which standard does it conform to?"], ["соответствует требованиям", "conforms to"]),
      s("body", "Certification body", "text", false, ["Which body issued it?"], ["орган по сертификации", "certification body"]),
    ],
    supporting: [],
    checks: ["Product and HS code match the declaration", "Valid on the date of release"],
  },
  passport: {
    type: "passport",
    name: "Passport",
    purpose: "Identity of whoever attends in person.",
    specimen: "Personal document (not parsed beyond identity fields)",
    fields: [
      s("full_name", "Full name", "text", true, ["What is the full name?"], ["surname", "фамилия"]),
      s("passport_no", "Series and number", "number", true, ["What is the passport number?"], ["passport no", "номер паспорта"]),
      s("expiry", "Expiry date", "date", false, ["What is the date of expiry?"], ["date of expiry", "срок действия"]),
    ],
    supporting: [],
    checks: ["Name matches the power of attorney", "Not expired on the date of the visit"],
  },
};

/* Order matters: an "Offer agreement for phytosanitary certificate" is an
 * offer agreement, and an application FOR a certificate is not the certificate. */
const PATTERNS: [RegExp, DocType][] = [
  [/offer agreement/i, "offer_agreement"],
  [/gu-12|application for cargo transportation/i, "cargo_transport_application"],
  [/^quarantine permit application$/i, "quarantine_permit_application"],
  [/^quarantine permit$/i, "quarantine_permit"],
  [/shipper'?s letter of instruction/i, "shippers_letter"],
  [/food test report/i, "food_test_report"],
  [/invoice for (payment|prepayment)/i, "invoice_for_payment"],
  [/commercial invoice/i, "commercial_invoice"],
  [/packing list/i, "packing_list"],
  [/foreign trade contract|foreign economic activity contract|^supply contract$/i, "trade_contract"],
  [/railway bill|\bsmgs\b/i, "railway_bill"],
  [/carriage of goods by road|\bcmr\b/i, "cmr_note"],
  [/veterinary certificate/i, "veterinary_certificate"],
  [/certificate of conformity/i, "certificate_of_conformity"],
  [/air ?waybill/i, "air_waybill"],
  [/phytosanitary certificate/i, "phytosanitary_certificate"],
  [/certificate of origin/i, "certificate_of_origin"],
  [/receipt/i, "receipt_of_payment"],
  [/power of attorney/i, "power_of_attorney"],
  [/customs declaration|\bim70\b/i, "customs_declaration"],
  [/^passport$/i, "passport"],
];

export function docTypeOf(label: string): DocType | null {
  if (/gu-12|application for cargo transportation/i.test(label)) return "cargo_transport_application";
  // "Identification number of foreign trade contract" is a registration number, not the contract.
  // "Customs declaration submitted" is an event on the portal, not a document to upload.
  if (/^(online |electronic )?application\b|^instruction\b|^identification number\b|\bsubmitted$/i.test(label)) return null;
  return PATTERNS.find(([re]) => re.test(label))?.[1] ?? null;
}

export function specFor(type: DocType): DocSpec {
  return DOC_SPECS[type];
}
