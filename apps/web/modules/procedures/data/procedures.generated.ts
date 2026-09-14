/* GENERATED FILE - do not edit by hand.
 * Source: scripts/data/dag-data.json + scripts/data/inputs-data.json (parsed from Docs/Procedures/*.docx)
 * Regenerate: node scripts/data/build-procedures.mjs
 */

export type Channel =
  | "Online: apply"
  | "Online: obtain"
  | "Online: pay"
  | "Online: submit"
  | "In person";

export type ProcedureStep = {
  num: number;
  title: string;
  output: string;
  entity: string;
  channel: Channel | string;
  where: string;
  performedBy: string;
  optional: boolean;
  alternative: boolean;
  /** Section 5 "Inputs required per step", in published order. Headers such as
   *  "For physical payment" are kept; modules/procedures/requirements.ts interprets them. */
  inputs: string[];
};

export type ProcedureBlock = {
  id: string;
  name: string;
  dependsOn: string[];
  level: number;
  /** [min, max] hours for the whole block. */
  estDuration: [number, number];
  dependencyReason: string;
  lane: string;
  entities: string[];
  stepRange: [number, number];
  optionalSteps: number[];
  altSteps: number[];
  steps: ProcedureStep[];
};

export type EntityRef = {
  name: string;
  steps: string;
  lane: string;
  contact: string;
};

export type Procedure = {
  id: string;
  title: string;
  direction: "import" | "export";
  goods: string;
  mode: "train" | "air" | "road";
  /** [min, max] hours end to end, as published. */
  timeframe: [number, number];
  stepsCount: number;
  blocks: ProcedureBlock[];
  entityDirectory: EntityRef[];
};

/** The only procedures this application supports. */
export const PROCEDURE_IDS = ["306","325","477","540","868"] as const;

export type ProcedureId = (typeof PROCEDURE_IDS)[number];

export const PROCEDURES: Record<string, Procedure> = {
 "306": {
  "id": "306",
  "title": "Export of dried fruits by train",
  "direction": "export",
  "goods": "dried fruits",
  "mode": "train",
  "timeframe": [
   81,
   241
  ],
  "stepsCount": 48,
  "blocks": [
   {
    "id": "b1",
    "name": "Registration of export contract",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     2,
     8
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Other government",
    "entities": [
     "Single portal of interactive state services"
    ],
    "stepRange": [
     1,
     1
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 1,
      "title": "Register foreign trade contract in UEISFTO",
      "output": "Identification number of foreign trade contract",
      "entity": "Single portal of interactive state services",
      "channel": "Online: apply",
      "where": "my.gov.uz — unified state services my.gov.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Electronic copy of foreign trade contract"
      ]
     }
    ]
   },
   {
    "id": "b2",
    "name": "Prepare for railway transportation online",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     10,
     30
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Single Window & certification",
    "entities": [
     "Bank",
     "Tashkent regional railway junction",
     "Uzbekistan railways Single window"
    ],
    "stepRange": [
     2,
     6
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 2,
      "title": "Conclude online agreement with Technological Center and contract with Regional railway junction",
      "output": "Agreement with Technological center (single window)",
      "entity": "Uzbekistan railways Single window",
      "channel": "Online: obtain",
      "where": "Railway electronic waybill e-nakl.railway.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "One ID account"
      ]
     },
     {
      "num": 3,
      "title": "Obtain cost calculation for railway services",
      "output": "Information on cost amount",
      "entity": "Uzbekistan railways Single window",
      "channel": "Online: obtain",
      "where": "Railway electronic waybill e-nakl.railway.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "One ID account"
      ]
     },
     {
      "num": 4,
      "title": "Prepay for railway services (dried fruits)",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for payment for railway services",
       "Agreement with Technological center",
       "For physical payment",
       "Physical presence",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 5,
      "title": "Generate electronic certificate for railway station",
      "output": "Electronic certificate for railway station",
      "entity": "Uzbekistan railways Single window",
      "channel": "Online: obtain",
      "where": "Railway electronic waybill e-nakl.railway.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature"
      ]
     },
     {
      "num": 6,
      "title": "Obtain approval for loading and unloading",
      "output": "Passing examination",
      "entity": "Tashkent regional railway junction",
      "channel": "In person",
      "where": "Inspectors of the Department on freight and commerce Room 402, 4th floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     }
    ]
   },
   {
    "id": "b3",
    "name": "Obtain code notification",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     12,
     36
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Bank",
     "Freight forwarding company"
    ],
    "stepRange": [
     7,
     10
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 7,
      "title": "Request for freight transportation by railway",
      "output": "Transportation request",
      "entity": "Freight forwarding company",
      "channel": "In person",
      "where": "Freight forwarding company",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Foreign economic activity contract",
       "Supply contract"
      ]
     },
     {
      "num": 8,
      "title": "Contract with freight forwarder",
      "output": "Agreement on railway transportation services",
      "entity": "Freight forwarding company",
      "channel": "In person",
      "where": "Freight forwarding company",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Passport",
       "Power of attorney",
       "Tax Identification Number of the organization or individual",
       "Personal identification number of an individual",
       "Bank details"
      ]
     },
     {
      "num": 9,
      "title": "Pay for code assignment and freight forwarder service",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for payment",
       "Agreement on railway transportation services",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 10,
      "title": "Obtain code notification",
      "output": "Telegram on payment for the railway tariff by telegraph",
      "entity": "Freight forwarding company",
      "channel": "In person",
      "where": "Freight forwarding company",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Receipt of payment",
       "Agreement on railway transportation services"
      ]
     }
    ]
   },
   {
    "id": "b4",
    "name": "Arrange freight transportation by railway",
    "dependsOn": [
     "b2",
     "b3"
    ],
    "level": 1,
    "estDuration": [
     16,
     48
    ],
    "dependencyReason": "Needs the rail agreement/cert from b2 and the forwarder code notification from b3 before Uzbekistan Railways will accept a transport application.",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Joint Stock Company \"O'zbekiston temir yo'llari\""
    ],
    "stepRange": [
     11,
     14
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 11,
      "title": "Apply for good transportation on specific conditions",
      "output": "Acceptance of application",
      "entity": "Joint Stock Company \"O'zbekiston temir yo'llari\"",
      "channel": "In person",
      "where": "Department of carriage conditions \"Room 313, 3rd Floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Application for good transportation on specific conditions"
      ]
     },
     {
      "num": 12,
      "title": "Apply for freight transportation by railway",
      "output": "Acceptance of application",
      "entity": "Joint Stock Company \"O'zbekiston temir yo'llari\"",
      "channel": "In person",
      "where": "Transportation  Unit \"Room 128, 1st Floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "For submitting application by emails mpo@uzrailway.uz, mpo1@uzrailway.uz, mpo2@uzrailway.uz",
       "Application for cargo transportation GU-12",
       "Application for obtaining approval of cargo transportation",
       "Islamic Republic of Iran approval letter",
       "For submitting application physically",
       "Application for cargo transportation GU-12",
       "Application for obtaining approval of cargo transportation",
       "Islamic Republic of Iran approval letter"
      ]
     },
     {
      "num": 13,
      "title": "Obtain approval for freight transportation by railway",
      "output": "Coordination of transportation with other countries",
      "entity": "Joint Stock Company \"O'zbekiston temir yo'llari\"",
      "channel": "In person",
      "where": "Transportation  Unit \"Room 128, 1st Floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Availability by phone"
      ]
     },
     {
      "num": 14,
      "title": "Obtain order for wagon supply",
      "output": "Order for wagon supply for loading",
      "entity": "Joint Stock Company \"O'zbekiston temir yo'llari\"",
      "channel": "In person",
      "where": "Transportation  Unit \"Room 128, 1st Floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "For submitting application by emails mpo@uzrailway.uz, mpo1@uzrailway.uz, mpo2@uzrailway.uz",
       "Application on letterhead",
       "Application on letterhead (own wagons)",
       "Code notification from the forwarder that concluded the contract with JSC \"Uzbekistan railways\"",
       "For submitting application physically",
       "Power of attorney for Transportation Unit",
       "Passport",
       "Application on letterhead",
       "Application on letterhead (own wagons)",
       "Code notification from the forwarder that concluded the contract with JSC \"Uzbekistan railways\""
      ]
     }
    ]
   },
   {
    "id": "b5",
    "name": "Obtain internal phytosanitary certificate",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     24,
     72
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Single Window & certification",
    "entities": [
     "Agency of plant quarantine and protection Personal cabinet (Oferta)",
     "Assalom Agro",
     "Bank",
     "Territorial Department of plant quarantine and protection",
     "Warehouse / Location of goods"
    ],
    "stepRange": [
     15,
     22
    ],
    "optionalSteps": [
     19,
     20,
     21
    ],
    "altSteps": [],
    "steps": [
     {
      "num": 15,
      "title": "Obtain offer agreement",
      "output": "Offer agreement for internal phytosanitary certificate",
      "entity": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
      "channel": "Online: obtain",
      "where": "eFito (phytosanitary) efito.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Internet access",
       "Data required to complete offer agreement",
       "Tax Identification Number of the organization or individual",
       "Name of the organization",
       "Full name of an organization's manager",
       "Contact phone number",
       "Agency region",
       "Payment sum"
      ]
     },
     {
      "num": 16,
      "title": "Pay for internal phytosanitary certificate",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Offer agreement for internal phytosanitary certificate",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 17,
      "title": "Apply for internal phytosanitary certificate",
      "output": "Appointment for inspection",
      "entity": "Assalom Agro",
      "channel": "Online: apply",
      "where": "assalomagro.uz assalomagro.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "To access the platform",
       "One ID account",
       "Contact phone number",
       "Email"
      ]
     },
     {
      "num": 18,
      "title": "Undergo phytosanitary inspection",
      "output": "Sealing",
      "entity": "Warehouse / Location of goods",
      "channel": "In person",
      "where": "Warehouse / Location of goods",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 19,
      "title": "Obtain offer agreement for fumigation",
      "output": "Fumigation offer agreement",
      "entity": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
      "channel": "Online: obtain",
      "where": "eFito (phytosanitary) efito.uz",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Internet access",
       "Data required to complete offer agreement",
       "Tax Identification Number of the organization or individual",
       "Name of the organization",
       "Full name of an organization's manager",
       "Type of organization (business entity, budgetary)",
       "Contact phone number",
       "Agency region",
       "Cost on the contract"
      ]
     },
     {
      "num": 20,
      "title": "Pay for fumigation",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Fumigation offer agreement",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 21,
      "title": "Undergo fumigation",
      "output": "Certificate of disinfestation",
      "entity": "Territorial Department of plant quarantine and protection",
      "channel": "In person",
      "where": "Fumigation (disinfection) division",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 22,
      "title": "Obtain internal phytosanitary certificate",
      "output": "Internal phytosanitary certificate",
      "entity": "Assalom Agro",
      "channel": "Online: obtain",
      "where": "assalomagro.uz assalomagro.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "One ID account",
       "Contact phone number",
       "Email"
      ]
     }
    ]
   },
   {
    "id": "b6",
    "name": "Obtain certificate of origin",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     24,
     72
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Single Window & certification",
    "entities": [
     "Bank",
     "One-stop service system Single window",
     "Warehouse / Location of goods",
     "“Uzbekexpertiza” JSC",
     "“Uzbekexpertiza” JSC service portal"
    ],
    "stepRange": [
     23,
     31
    ],
    "optionalSteps": [],
    "altSteps": [
     27,
     31
    ],
    "steps": [
     {
      "num": 23,
      "title": "Conclude contract for services",
      "output": "Contract with Uzbekexpertiza",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Deputy Chief of the Department of examination of preferential goods \"Room 36, 3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     },
     {
      "num": 24,
      "title": "Pay for certificate of origin",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for prepayment",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 25,
      "title": "Apply for certificate of origin",
      "output": "Assignment of expert on certification",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Deputy Chief of the Department of examination of preferential goods \"Room 36, 3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Application for obtaining of Certificate of origin for exported goods",
       "Application for obtaining of Certificate of origin for exported goods",
       "Commercial invoice",
       "Any document confirming the exporter's right to use a land plot",
       "Any document confirming purchase of agricultural products"
      ]
     },
     {
      "num": 26,
      "title": "Apply for certificate of origin via Uzbekexpertiza service portal",
      "output": "Appointment with an expert on certification",
      "entity": "“Uzbekexpertiza” JSC service portal",
      "channel": "Online: apply",
      "where": "Uzbekexpertiza service portal application.expertiza.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "One ID account",
       "Online application for certificate of origin",
       "Commercial invoice",
       "Any document confirming the exporter's right to use a land plot",
       "Any document confirming purchase of agricultural products"
      ]
     },
     {
      "num": 27,
      "title": "Apply for certificate of origin via Single Window",
      "output": "Application registration number",
      "entity": "One-stop service system Single window",
      "channel": "Online: apply",
      "where": "Single Window singlewindow.uz",
      "performedBy": "",
      "optional": false,
      "alternative": true,
      "inputs": [
       "Electronic digital signature",
       "Online application for certificate of origin",
       "Commercial invoice",
       "Any document confirming the exporter's right to use a land plot",
       "Any document confirming purchase of agricultural products"
      ]
     },
     {
      "num": 28,
      "title": "Assessment of application",
      "output": "Appointment for cargo expertise",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Department of Examination of Preferential Goods \"3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 29,
      "title": "Undergo expertise of goods",
      "output": "Act of expertise",
      "entity": "Warehouse / Location of goods",
      "channel": "In person",
      "where": "Warehouse / Location of goods",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 30,
      "title": "Obtain certificate of origin",
      "output": "Certificate of origin",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Department of Examination of Preferential Goods \"3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 31,
      "title": "Obtain expert conclusion",
      "output": "Expert conclusion",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Department of Examination of Preferential Goods \"3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": true,
      "inputs": [
       "Physical presence"
      ]
     }
    ]
   },
   {
    "id": "b7",
    "name": "Complete freight loading",
    "dependsOn": [
     "b4",
     "b5"
    ],
    "level": 2,
    "estDuration": [
     10,
     30
    ],
    "dependencyReason": "Loading can't start until wagons are ordered (b4) and the goods are sealed/certified fit for transport (b5).",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Place of loading / branch line",
     "Railway station"
    ],
    "stepRange": [
     32,
     35
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 32,
      "title": "Apply for allotment of wagons",
      "output": "Permit for allotment of wagons",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Commodity cash desk",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Application on letterhead for allotment of wagons",
       "Order for wagon supply for loading",
       "Certificate on availability of funds at client's account",
       "Passport",
       "Power of attorney for railway station",
       "Certificate on passing examination"
      ]
     },
     {
      "num": 33,
      "title": "Obtain wagons for loading",
      "output": "Signed GU-45 form",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Freight acceptance and handover Room",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 34,
      "title": "Loading",
      "output": "Report of the work done",
      "entity": "Place of loading / branch line",
      "channel": "In person",
      "where": "Place of loading / branch line",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Power of attorney"
      ]
     },
     {
      "num": 35,
      "title": "Obtain railway bill of lading",
      "output": "Export railway bill (SMGS)",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Commodity cash desk",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Commercial invoice"
      ]
     }
    ]
   },
   {
    "id": "b8",
    "name": "Obtain phytosanitary certificate",
    "dependsOn": [
     "b7"
    ],
    "level": 3,
    "estDuration": [
     10,
     30
    ],
    "dependencyReason": "Border phytosanitary inspection is carried out on the loaded, sealed wagon using the export railway bill produced in b7.",
    "lane": "Single Window & certification",
    "entities": [
     "Agency of plant quarantine and protection Personal cabinet (Oferta)",
     "Bank",
     "Border checkpoint for plant quarantine",
     "One-stop service system Single window"
    ],
    "stepRange": [
     36,
     40
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 36,
      "title": "Obtain offer agreement",
      "output": "Offer agreement for phytosanitary certificate",
      "entity": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
      "channel": "Online: obtain",
      "where": "Quarantine cabinet cabinet.karantin.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Data required to complete offer agreement",
       "Tax Identification Number of the organization or individual",
       "Name of the organization",
       "Full name of an organization's manager",
       "Type of organization (business entity, budgetary)",
       "Contact phone number",
       "Agency region",
       "Payment sum",
       "Quantity of transport units"
      ]
     },
     {
      "num": 37,
      "title": "Pay for phytosanitary certificate",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Offer agreement for phytosanitary certificate",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 38,
      "title": "Apply for phytosanitary certificate",
      "output": "Appointment for phytosanitary control",
      "entity": "One-stop service system Single window",
      "channel": "Online: apply",
      "where": "Single Window singlewindow.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Online application for phytosanitary certificate"
      ]
     },
     {
      "num": 39,
      "title": "Undergo phytosanitary inspection",
      "output": "Visual inspection",
      "entity": "Border checkpoint for plant quarantine",
      "channel": "In person",
      "where": "Office of the inspector on the border checkpoint for plant quarantine",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 40,
      "title": "Obtain phytosanitary certificate",
      "output": "Phytosanitary certificate",
      "entity": "Border checkpoint for plant quarantine",
      "channel": "In person",
      "where": "Office of the inspector on the border checkpoint for plant quarantine",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     }
    ]
   },
   {
    "id": "b9",
    "name": "Undergo customs clearance",
    "dependsOn": [
     "b6",
     "b8"
    ],
    "level": 4,
    "estDuration": [
     12,
     40
    ],
    "dependencyReason": "Customs declaration needs both the certificate of origin (b6) and the border phytosanitary certificate (b8) as supporting documents.",
    "lane": "Customs / SCC",
    "entities": [
     "Bank",
     "Customs post of foreign trade activity",
     "Personal cabinet of participant of foreign economic activity",
     "Warehouse / Location of goods"
    ],
    "stepRange": [
     41,
     46
    ],
    "optionalSteps": [
     44
    ],
    "altSteps": [],
    "steps": [
     {
      "num": 41,
      "title": "Create export customs declaration",
      "output": "Electronic form of customs declaration",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: apply",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Identification number of foreign trade contract",
       "Commercial invoice",
       "Export railway bill (SMGS)",
       "Documents that are not obligatory to submit for export declaration",
       "Phytosanitary certificate",
       "Certificate of origin",
       "Certificate of origin form A",
       "Certificate of origin General form"
      ]
     },
     {
      "num": 42,
      "title": "Pay for customs fee",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Trade info portal uztradeinfo.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Bank details of territorial customs departments",
       "For physical payment",
       "Physical presence",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 43,
      "title": "Submit export customs declaration",
      "output": "Customs declaration submitted",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: submit",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Electronic form of customs declaration"
      ]
     },
     {
      "num": 44,
      "title": "Undergo customs inspection in red corridor",
      "output": "Undergo documentary control",
      "entity": "Warehouse / Location of goods",
      "channel": "In person",
      "where": "Warehouse / Location of goods",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Export customs declaration",
       "Export railway bill (SMGS)",
       "Commercial invoice",
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     },
     {
      "num": 45,
      "title": "Obtain export customs declaration",
      "output": "Export customs declaration",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: obtain",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature"
      ]
     },
     {
      "num": 46,
      "title": "Obtain stamps on shipping documents",
      "output": "Export railway bill stamped by customs inspector",
      "entity": "Customs post of foreign trade activity",
      "channel": "In person",
      "where": "Group of customs control and customs clearance",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Export railway bill (SMGS)",
       "Commercial invoice",
       "Export customs declaration"
      ]
     }
    ]
   },
   {
    "id": "b10",
    "name": "Dispatch freight",
    "dependsOn": [
     "b9"
    ],
    "level": 5,
    "estDuration": [
     4,
     12
    ],
    "dependencyReason": "Freight can only be dispatched after customs has stamped the shipping documents in b9.",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Railway station"
    ],
    "stepRange": [
     47,
     48
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 47,
      "title": "Close memo of handover specialist",
      "output": "Signed GU-45 form",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Freight acceptance and handover Room",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Application for wagon handover"
      ]
     },
     {
      "num": 48,
      "title": "Dispatch freight",
      "output": "Duplicate of railway bill with datestamp",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Commodity cash desk",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Export railway bill (SMGS)",
       "Package of documents"
      ]
     }
    ]
   }
  ],
  "entityDirectory": [
   {
    "name": "Single portal of interactive state services",
    "steps": "1",
    "lane": "Other government",
    "contact": "✉ epigu@egov.uz ☎ +998 55 501 36 19,  +998 55 501 36 17 🌐 https://my.gov.uz/, https://my.gov.uz/ru/site/feedback"
   },
   {
    "name": "Uzbekistan railways Single window",
    "steps": "2, 3, 5",
    "lane": "Single Window & certification",
    "contact": "✉ git@railway.uz ☎ +998 71 238 88 02 🌐 https://e-nakl.railway.uz/"
   },
   {
    "name": "Bank",
    "steps": "4, 9, 16, 20, 24, 37, 42",
    "lane": "Bank",
    "contact": ""
   },
   {
    "name": "Tashkent regional railway junction",
    "steps": "6",
    "lane": "Transport & E-Tranzit",
    "contact": "✉ rju-1@railway.uz ☎ +998 71 299 96 20 🌐 http://tashkent.railway.uz/en/"
   },
   {
    "name": "Freight forwarding company",
    "steps": "7, 8, 10",
    "lane": "Transport & E-Tranzit",
    "contact": ""
   },
   {
    "name": "Joint Stock Company \"O'zbekiston temir yo'llari\"",
    "steps": "11, 12, 13, 14",
    "lane": "Transport & E-Tranzit",
    "contact": "✉ info@uzrailway.uz ☎ +998 71 237 99 98, 1005 🌐 https://railway.uz/en/"
   },
   {
    "name": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
    "steps": "15, 19, 36",
    "lane": "Single Window & certification",
    "contact": "✉ info@karantin.uz 🌐 https://efito.uz/invoice/, http://karantin.uz/"
   },
   {
    "name": "Assalom Agro",
    "steps": "17, 22",
    "lane": "Single Window & certification",
    "contact": "✉ assalomagro@gmail.com, info@5x5.uz ☎ +998 55 502 55 75, +998 98 198 14 02 🌐 https://assalomagro.uz/en"
   },
   {
    "name": "Warehouse / Location of goods",
    "steps": "18, 29, 44",
    "lane": "Transport & E-Tranzit",
    "contact": ""
   },
   {
    "name": "Territorial Department of plant quarantine and protection",
    "steps": "21",
    "lane": "Single Window & certification",
    "contact": ""
   },
   {
    "name": "“Uzbekexpertiza” JSC",
    "steps": "23, 25, 28, 30, 31",
    "lane": "Single Window & certification",
    "contact": "✉ info1@expertiza.uz, expertiza@exat.uz ☎ +998 71 230 23 64, +998 71 230 23 60 🌐 http://www.expertiza.uz/, http://t.me/uzbekexpertiza_bot"
   },
   {
    "name": "“Uzbekexpertiza” JSC service portal",
    "steps": "26",
    "lane": "Single Window & certification",
    "contact": "🌐 http://application.expertiza.uz/expertiza/#/, http://www.expertiza.uz/"
   },
   {
    "name": "One-stop service system Single window",
    "steps": "27, 38",
    "lane": "Single Window & certification",
    "contact": "☎ +998 78 120 76 08 (Int. 5603, 5646, 5606, 5885) , +998 78 120 76 00 (Int. 5603, 5646, 5606, 5885) 🌐 http://singlewindow.uz/index.jsp, http://sw2.customs.uz/"
   },
   {
    "name": "Railway station",
    "steps": "32, 33, 35, 47, 48",
    "lane": "Transport & E-Tranzit",
    "contact": ""
   },
   {
    "name": "Place of loading / branch line",
    "steps": "34",
    "lane": "Transport & E-Tranzit",
    "contact": ""
   },
   {
    "name": "Border checkpoint for plant quarantine",
    "steps": "39, 40",
    "lane": "Single Window & certification",
    "contact": ""
   },
   {
    "name": "Personal cabinet of participant of foreign economic activity",
    "steps": "41, 43, 45",
    "lane": "Customs / SCC",
    "contact": "🌐 http://ed1.customs.uz, http://ed2.customs.uz"
   },
   {
    "name": "Customs post of foreign trade activity",
    "steps": "46",
    "lane": "Customs / SCC",
    "contact": ""
   }
  ]
 },
 "325": {
  "id": "325",
  "title": "Export of fresh fruits and vegetables by train",
  "direction": "export",
  "goods": "fresh fruits and vegetables",
  "mode": "train",
  "timeframe": [
   81,
   241
  ],
  "stepsCount": 48,
  "blocks": [
   {
    "id": "b1",
    "name": "Registration of export contract",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     2,
     8
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Other government",
    "entities": [
     "Single portal of interactive state services"
    ],
    "stepRange": [
     1,
     1
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 1,
      "title": "Register foreign trade contract in UEISFTO",
      "output": "Identification number of foreign trade contract",
      "entity": "Single portal of interactive state services",
      "channel": "Online: apply",
      "where": "my.gov.uz — unified state services my.gov.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Electronic copy of foreign trade contract"
      ]
     }
    ]
   },
   {
    "id": "b2",
    "name": "Prepare for railway transportation online",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     10,
     30
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Single Window & certification",
    "entities": [
     "Bank",
     "Tashkent regional railway junction",
     "Uzbekistan railways Single window"
    ],
    "stepRange": [
     2,
     6
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 2,
      "title": "Conclude online agreement with Technological Center and contract with Regional railway junction",
      "output": "Agreement with Technological center (single window)",
      "entity": "Uzbekistan railways Single window",
      "channel": "Online: obtain",
      "where": "Railway electronic waybill e-nakl.railway.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "One ID account"
      ]
     },
     {
      "num": 3,
      "title": "Obtain cost calculation for railway services",
      "output": "Information on cost amount",
      "entity": "Uzbekistan railways Single window",
      "channel": "Online: obtain",
      "where": "Railway electronic waybill e-nakl.railway.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "One ID account"
      ]
     },
     {
      "num": 4,
      "title": "Prepay for railway services (tomatoes)",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for payment for railway services",
       "Agreement with Technological center",
       "For physical payment",
       "Physical presence",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 5,
      "title": "Generate electronic certificate for railway station",
      "output": "Electronic certificate for railway station",
      "entity": "Uzbekistan railways Single window",
      "channel": "Online: obtain",
      "where": "Railway electronic waybill e-nakl.railway.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature"
      ]
     },
     {
      "num": 6,
      "title": "Obtain approval for loading and unloading",
      "output": "Passing examination",
      "entity": "Tashkent regional railway junction",
      "channel": "In person",
      "where": "Inspectors of the Department on freight and commerce Room 402, 4th floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     }
    ]
   },
   {
    "id": "b3",
    "name": "Obtain code notification",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     12,
     36
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Bank",
     "Freight forwarding company"
    ],
    "stepRange": [
     7,
     10
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 7,
      "title": "Request for freight transportation by railway",
      "output": "Transportation request",
      "entity": "Freight forwarding company",
      "channel": "In person",
      "where": "Freight forwarding company",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Foreign economic activity contract",
       "Supply contract"
      ]
     },
     {
      "num": 8,
      "title": "Contract with freight forwarder",
      "output": "Agreement on railway transportation services",
      "entity": "Freight forwarding company",
      "channel": "In person",
      "where": "Freight forwarding company",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Passport",
       "Power of attorney",
       "Tax Identification Number of the organization or individual",
       "Personal identification number of an individual",
       "Bank details"
      ]
     },
     {
      "num": 9,
      "title": "Pay for code assignment and freight forwarder service",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for payment",
       "Agreement on railway transportation services",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 10,
      "title": "Obtain code notification",
      "output": "Code notification from the forwarder that concluded the contract with JSC \"Uzbekistan railways\"",
      "entity": "Freight forwarding company",
      "channel": "In person",
      "where": "Freight forwarding company",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Receipt of payment",
       "Agreement on railway transportation services"
      ]
     }
    ]
   },
   {
    "id": "b4",
    "name": "Arrange freight transportation by railway",
    "dependsOn": [
     "b2",
     "b3"
    ],
    "level": 1,
    "estDuration": [
     16,
     48
    ],
    "dependencyReason": "Needs the rail agreement/cert from b2 and the forwarder code notification from b3.",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Joint Stock Company \"O'zbekiston temir yo'llari\""
    ],
    "stepRange": [
     11,
     14
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 11,
      "title": "Apply for good transportation on specific conditions",
      "output": "Acceptance of application",
      "entity": "Joint Stock Company \"O'zbekiston temir yo'llari\"",
      "channel": "In person",
      "where": "Department of carriage conditions \"Room 313, 3rd Floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Application for good transportation on specific conditions"
      ]
     },
     {
      "num": 12,
      "title": "Apply for freight transportation by railway",
      "output": "Acceptance of application",
      "entity": "Joint Stock Company \"O'zbekiston temir yo'llari\"",
      "channel": "In person",
      "where": "Transportation  Unit \"Room 128, 1st Floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "For submitting application by emails mpo@uzrailway.uz, mpo1@uzrailway.uz, mpo2@uzrailway.uz",
       "Application for cargo transportation GU-12",
       "Application for obtaining approval of cargo transportation",
       "Islamic Republic of Iran approval letter",
       "For submitting application physically",
       "Application for cargo transportation GU-12",
       "Application for obtaining approval of cargo transportation",
       "Islamic Republic of Iran approval letter"
      ]
     },
     {
      "num": 13,
      "title": "Obtain approval for freight transportation by railway",
      "output": "Coordination of transportation with other countries",
      "entity": "Joint Stock Company \"O'zbekiston temir yo'llari\"",
      "channel": "In person",
      "where": "Transportation  Unit \"Room 128, 1st Floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Availability by phone"
      ]
     },
     {
      "num": 14,
      "title": "Obtain order for wagon supply",
      "output": "Order for wagon supply for loading",
      "entity": "Joint Stock Company \"O'zbekiston temir yo'llari\"",
      "channel": "In person",
      "where": "Transportation  Unit \"Room 128, 1st Floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "For submitting application by emails mpo@uzrailway.uz, mpo1@uzrailway.uz, mpo2@uzrailway.uz",
       "Application on letterhead",
       "Application on letterhead (own wagons)",
       "Code notification from the forwarder that concluded the contract with JSC \"Uzbekistan railways\"",
       "For submitting application physically",
       "Power of attorney for Transportation Unit",
       "Passport",
       "Application on letterhead",
       "Application on letterhead (own wagons)",
       "Code notification from the forwarder that concluded the contract with JSC \"Uzbekistan railways\""
      ]
     }
    ]
   },
   {
    "id": "b5",
    "name": "Obtain internal phytosanitary certificate",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     24,
     72
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Single Window & certification",
    "entities": [
     "Agency of plant quarantine and protection Personal cabinet (Oferta)",
     "Assalom Agro",
     "Bank",
     "Territorial Department of plant quarantine and protection",
     "Warehouse / Location of goods"
    ],
    "stepRange": [
     15,
     22
    ],
    "optionalSteps": [
     19,
     20,
     21
    ],
    "altSteps": [],
    "steps": [
     {
      "num": 15,
      "title": "Obtain offer agreement",
      "output": "Offer agreement for internal phytosanitary certificate",
      "entity": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
      "channel": "Online: obtain",
      "where": "eFito (phytosanitary) efito.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Internet access",
       "Data required to complete offer agreement",
       "Tax Identification Number of the organization or individual",
       "Name of the organization",
       "Full name of an organization's manager",
       "Contact phone number",
       "Agency region",
       "Payment sum"
      ]
     },
     {
      "num": 16,
      "title": "Pay for internal phytosanitary certificate",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Offer agreement for internal phytosanitary certificate",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 17,
      "title": "Apply for internal phytosanitary certificate",
      "output": "Appointment for inspection",
      "entity": "Assalom Agro",
      "channel": "Online: apply",
      "where": "assalomagro.uz assalomagro.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "To access the platform",
       "One ID account",
       "Contact phone number",
       "Email"
      ]
     },
     {
      "num": 18,
      "title": "Undergo phytosanitary inspection",
      "output": "Product sampling label",
      "entity": "Warehouse / Location of goods",
      "channel": "In person",
      "where": "Warehouse / Location of goods",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 19,
      "title": "Obtain offer agreement for fumigation",
      "output": "Fumigation offer agreement",
      "entity": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
      "channel": "Online: obtain",
      "where": "eFito (phytosanitary) efito.uz",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Internet access",
       "Data required to complete offer agreement",
       "Tax Identification Number of the organization or individual",
       "Name of the organization",
       "Full name of an organization's manager",
       "Type of organization (business entity, budgetary)",
       "Contact phone number",
       "Agency region",
       "Cost on the contract"
      ]
     },
     {
      "num": 20,
      "title": "Pay for fumigation",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Fumigation offer agreement",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 21,
      "title": "Undergo fumigation",
      "output": "Certificate of disinfestation",
      "entity": "Territorial Department of plant quarantine and protection",
      "channel": "In person",
      "where": "Fumigation (disinfection) division",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 22,
      "title": "Obtain internal phytosanitary certificate",
      "output": "Internal phytosanitary certificate",
      "entity": "Assalom Agro",
      "channel": "Online: obtain",
      "where": "assalomagro.uz assalomagro.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "One ID account",
       "Contact phone number",
       "Email"
      ]
     }
    ]
   },
   {
    "id": "b6",
    "name": "Obtain certificate of origin",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     24,
     72
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Single Window & certification",
    "entities": [
     "Bank",
     "One-stop service system Single window",
     "Warehouse / Location of goods",
     "“Uzbekexpertiza” JSC",
     "“Uzbekexpertiza” JSC service portal"
    ],
    "stepRange": [
     23,
     31
    ],
    "optionalSteps": [],
    "altSteps": [
     27,
     31
    ],
    "steps": [
     {
      "num": 23,
      "title": "Conclude contract for services",
      "output": "Contract with Uzbekexpertiza",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Deputy Chief of the Department of examination of preferential goods \"Room 36, 3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     },
     {
      "num": 24,
      "title": "Pay for certificate of origin",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for prepayment",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 25,
      "title": "Apply for certificate of origin",
      "output": "Assignment of expert on certification",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Deputy Chief of the Department of examination of preferential goods \"Room 36, 3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Application for obtaining of Certificate of origin for exported goods",
       "Application for obtaining of Certificate of origin for exported goods",
       "Commercial invoice",
       "Any document confirming the exporter's right to use a land plot",
       "Any document confirming purchase of agricultural products"
      ]
     },
     {
      "num": 26,
      "title": "Apply for certificate of origin via Uzbekexpertiza service portal",
      "output": "Appointment with an expert on certification",
      "entity": "“Uzbekexpertiza” JSC service portal",
      "channel": "Online: apply",
      "where": "Uzbekexpertiza service portal application.expertiza.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "One ID account",
       "Online application for certificate of origin",
       "Commercial invoice",
       "Any document confirming the exporter's right to use a land plot",
       "Any document confirming purchase of agricultural products"
      ]
     },
     {
      "num": 27,
      "title": "Apply for certificate of origin via Single Window",
      "output": "Application registration number",
      "entity": "One-stop service system Single window",
      "channel": "Online: apply",
      "where": "Single Window singlewindow.uz",
      "performedBy": "",
      "optional": false,
      "alternative": true,
      "inputs": [
       "Electronic digital signature",
       "Online application for certificate of origin",
       "Commercial invoice",
       "Any document confirming the exporter's right to use a land plot",
       "Any document confirming purchase of agricultural products"
      ]
     },
     {
      "num": 28,
      "title": "Assessment of application",
      "output": "Appointment for cargo expertise",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Department of Examination of Preferential Goods \"3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 29,
      "title": "Undergo expertise of goods",
      "output": "Undergo expertise",
      "entity": "Warehouse / Location of goods",
      "channel": "In person",
      "where": "Warehouse / Location of goods",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 30,
      "title": "Obtain certificate of origin",
      "output": "Certificate of origin",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Department of Examination of Preferential Goods \"3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 31,
      "title": "Obtain expert conclusion",
      "output": "Expert conclusion",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Department of Examination of Preferential Goods \"3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": true,
      "inputs": [
       "Physical presence"
      ]
     }
    ]
   },
   {
    "id": "b7",
    "name": "Obtain phytosanitary certificate",
    "dependsOn": [
     "b5"
    ],
    "level": 1,
    "estDuration": [
     10,
     30
    ],
    "dependencyReason": "Border phytosanitary cert is obtained on the sealed goods right after the internal cert (b5) — before the wagons are loaded.",
    "lane": "Single Window & certification",
    "entities": [
     "Agency of plant quarantine and protection Personal cabinet (Oferta)",
     "Bank",
     "Border checkpoint for plant quarantine",
     "One-stop service system Single window"
    ],
    "stepRange": [
     32,
     36
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 32,
      "title": "Obtain offer agreement",
      "output": "Offer agreement for phytosanitary certificate",
      "entity": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
      "channel": "Online: obtain",
      "where": "Quarantine cabinet cabinet.karantin.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Data required to complete offer agreement",
       "Tax Identification Number of the organization or individual",
       "Name of the organization",
       "Full name of an organization's manager",
       "Type of organization (business entity, budgetary)",
       "Contact phone number",
       "Agency region",
       "Payment sum",
       "Quantity of transport units"
      ]
     },
     {
      "num": 33,
      "title": "Pay for phytosanitary certificate",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Offer agreement for phytosanitary certificate",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 34,
      "title": "Apply for phytosanitary certificate",
      "output": "Appointment for phytosanitary control",
      "entity": "One-stop service system Single window",
      "channel": "Online: apply",
      "where": "Single Window singlewindow.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Online application for phytosanitary certificate"
      ]
     },
     {
      "num": 35,
      "title": "Undergo phytosanitary inspection",
      "output": "Visual inspection",
      "entity": "Border checkpoint for plant quarantine",
      "channel": "In person",
      "where": "Office of the inspector on the border checkpoint for plant quarantine",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 36,
      "title": "Obtain phytosanitary certificate",
      "output": "Phytosanitary certificate",
      "entity": "Border checkpoint for plant quarantine",
      "channel": "In person",
      "where": "Office of the inspector on the border checkpoint for plant quarantine",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     }
    ]
   },
   {
    "id": "b8",
    "name": "Complete freight loading",
    "dependsOn": [
     "b4",
     "b7"
    ],
    "level": 2,
    "estDuration": [
     10,
     30
    ],
    "dependencyReason": "Loading requires the wagons ordered in b4 and the phytosanitary clearance already obtained in b7.",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Place of loading / branch line",
     "Railway station"
    ],
    "stepRange": [
     37,
     40
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 37,
      "title": "Apply for allotment of wagons",
      "output": "Permit for allotment of wagons",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Commodity cash desk",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Application on letterhead for allotment of wagons",
       "Order for wagon supply for loading",
       "Certificate on availability of funds at client's account",
       "Passport",
       "Power of attorney for railway station",
       "Certificate on passing examination"
      ]
     },
     {
      "num": 38,
      "title": "Obtain wagons for loading",
      "output": "Signed GU-45 form",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Freight acceptance and handover Room",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 39,
      "title": "Loading",
      "output": "Report of the work done",
      "entity": "Place of loading / branch line",
      "channel": "In person",
      "where": "Place of loading / branch line",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Power of attorney"
      ]
     },
     {
      "num": 40,
      "title": "Obtain railway bill of lading",
      "output": "Export railway bill (SMGS)",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Commodity cash desk",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Commercial invoice"
      ]
     }
    ]
   },
   {
    "id": "b9",
    "name": "Undergo customs clearance",
    "dependsOn": [
     "b6",
     "b8"
    ],
    "level": 3,
    "estDuration": [
     12,
     40
    ],
    "dependencyReason": "Customs declaration needs the certificate of origin (b6) and the loaded/dispatched cargo documents (b8).",
    "lane": "Customs / SCC",
    "entities": [
     "Bank",
     "Customs post of foreign trade activity",
     "Personal cabinet of participant of foreign economic activity",
     "Warehouse / Location of goods"
    ],
    "stepRange": [
     41,
     46
    ],
    "optionalSteps": [
     44
    ],
    "altSteps": [],
    "steps": [
     {
      "num": 41,
      "title": "Create export customs declaration",
      "output": "Electronic form of customs declaration",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: apply",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Identification number of foreign trade contract",
       "Commercial invoice",
       "Export railway bill (SMGS)",
       "Documents that are not obligatory to submit for export declaration",
       "Phytosanitary certificate",
       "Certificate of origin",
       "Certificate of origin form A",
       "Certificate of origin General form"
      ]
     },
     {
      "num": 42,
      "title": "Pay for customs fee",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Trade info portal uztradeinfo.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Bank details of territorial customs departments",
       "For physical payment",
       "Physical presence",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 43,
      "title": "Submit export customs declaration",
      "output": "Customs declaration submitted",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: submit",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Electronic form of customs declaration"
      ]
     },
     {
      "num": 44,
      "title": "Undergo customs inspection in red corridor",
      "output": "Sealing with special customs seals",
      "entity": "Warehouse / Location of goods",
      "channel": "In person",
      "where": "Warehouse / Location of goods",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Export customs declaration",
       "Export railway bill (SMGS)",
       "Commercial invoice",
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     },
     {
      "num": 45,
      "title": "Obtain export customs declaration",
      "output": "Export customs declaration",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: obtain",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature"
      ]
     },
     {
      "num": 46,
      "title": "Obtain stamps on shipping documents",
      "output": "Commercial invoice stamped by customs inspector",
      "entity": "Customs post of foreign trade activity",
      "channel": "In person",
      "where": "Group of customs control and customs clearance",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Export railway bill (SMGS)",
       "Commercial invoice",
       "Export customs declaration"
      ]
     }
    ]
   },
   {
    "id": "b10",
    "name": "Dispatch freight",
    "dependsOn": [
     "b9"
    ],
    "level": 4,
    "estDuration": [
     4,
     12
    ],
    "dependencyReason": "Dispatch follows the customs stamp obtained in b9.",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Railway station"
    ],
    "stepRange": [
     47,
     48
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 47,
      "title": "Close memo of handover specialist",
      "output": "Signed GU-45 form",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Freight acceptance and handover Room",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Application for wagon handover"
      ]
     },
     {
      "num": 48,
      "title": "Dispatch freight",
      "output": "Duplicate of railway bill with datestamp",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Commodity cash desk",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Export railway bill (SMGS)",
       "Package of documents"
      ]
     }
    ]
   }
  ],
  "entityDirectory": [
   {
    "name": "Single portal of interactive state services",
    "steps": "1",
    "lane": "Other government",
    "contact": "✉ epigu@egov.uz ☎ +998 55 501 36 19,  +998 55 501 36 17 🌐 https://my.gov.uz/, https://my.gov.uz/ru/site/feedback"
   },
   {
    "name": "Uzbekistan railways Single window",
    "steps": "2, 3, 5",
    "lane": "Single Window & certification",
    "contact": "✉ git@railway.uz ☎ +998 71 238 88 02 🌐 https://e-nakl.railway.uz/"
   },
   {
    "name": "Bank",
    "steps": "4, 9, 16, 20, 24, 33, 42",
    "lane": "Bank",
    "contact": ""
   },
   {
    "name": "Tashkent regional railway junction",
    "steps": "6",
    "lane": "Transport & E-Tranzit",
    "contact": "✉ rju-1@railway.uz ☎ +998 71 299 96 20 🌐 http://tashkent.railway.uz/en/"
   },
   {
    "name": "Freight forwarding company",
    "steps": "7, 8, 10",
    "lane": "Transport & E-Tranzit",
    "contact": ""
   },
   {
    "name": "Joint Stock Company \"O'zbekiston temir yo'llari\"",
    "steps": "11, 12, 13, 14",
    "lane": "Transport & E-Tranzit",
    "contact": "✉ info@uzrailway.uz ☎ +998 71 237 99 98, 1005 🌐 https://railway.uz/en/"
   },
   {
    "name": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
    "steps": "15, 19, 32",
    "lane": "Single Window & certification",
    "contact": "✉ info@karantin.uz 🌐 https://efito.uz/invoice/, http://karantin.uz/"
   },
   {
    "name": "Assalom Agro",
    "steps": "17, 22",
    "lane": "Single Window & certification",
    "contact": "✉ assalomagro@gmail.com, info@5x5.uz ☎ +998 55 502 55 75, +998 98 198 14 02 🌐 https://assalomagro.uz/en"
   },
   {
    "name": "Warehouse / Location of goods",
    "steps": "18, 29, 44",
    "lane": "Transport & E-Tranzit",
    "contact": ""
   },
   {
    "name": "Territorial Department of plant quarantine and protection",
    "steps": "21",
    "lane": "Single Window & certification",
    "contact": ""
   },
   {
    "name": "“Uzbekexpertiza” JSC",
    "steps": "23, 25, 28, 30, 31",
    "lane": "Single Window & certification",
    "contact": "✉ info1@expertiza.uz, expertiza@exat.uz ☎ +998 71 230 23 64, +998 71 230 23 60 🌐 http://www.expertiza.uz/, http://t.me/uzbekexpertiza_bot"
   },
   {
    "name": "“Uzbekexpertiza” JSC service portal",
    "steps": "26",
    "lane": "Single Window & certification",
    "contact": "🌐 http://application.expertiza.uz/expertiza/#/, http://www.expertiza.uz/"
   },
   {
    "name": "One-stop service system Single window",
    "steps": "27, 34",
    "lane": "Single Window & certification",
    "contact": "☎ +998 78 120 76 08 (Int. 5603, 5646, 5606, 5885) , +998 78 120 76 00 (Int. 5603, 5646, 5606, 5885) 🌐 http://singlewindow.uz/index.jsp, http://sw2.customs.uz/"
   },
   {
    "name": "Border checkpoint for plant quarantine",
    "steps": "35, 36",
    "lane": "Single Window & certification",
    "contact": ""
   },
   {
    "name": "Railway station",
    "steps": "37, 38, 40, 47, 48",
    "lane": "Transport & E-Tranzit",
    "contact": ""
   },
   {
    "name": "Place of loading / branch line",
    "steps": "39",
    "lane": "Transport & E-Tranzit",
    "contact": ""
   },
   {
    "name": "Personal cabinet of participant of foreign economic activity",
    "steps": "41, 43, 45",
    "lane": "Customs / SCC",
    "contact": "🌐 http://ed1.customs.uz, http://ed2.customs.uz"
   },
   {
    "name": "Customs post of foreign trade activity",
    "steps": "46",
    "lane": "Customs / SCC",
    "contact": ""
   }
  ]
 },
 "477": {
  "id": "477",
  "title": "Import of tea by train",
  "direction": "import",
  "goods": "tea",
  "mode": "train",
  "timeframe": [
   34,
   183
  ],
  "stepsCount": 53,
  "blocks": [
   {
    "id": "b1",
    "name": "Obtain quarantine permit for tea not in consumer packaging",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     12,
     36
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Single Window & certification",
    "entities": [
     "Agency of plant quarantine and protection Personal cabinet (Oferta)",
     "Bank",
     "One-stop service system Single window"
    ],
    "stepRange": [
     1,
     4
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 1,
      "title": "Obtain offer agreement",
      "output": "Offer agreement",
      "entity": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
      "channel": "Online: obtain",
      "where": "eFito (phytosanitary) efito.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Internet access",
       "Data required to complete offer agreement",
       "Tax Identification Number of the organization or individual",
       "Name of the organization",
       "Full name of an organization's manager",
       "Type of organization (business entity, budgetary)",
       "Contact phone number",
       "Amount of consignment"
      ]
     },
     {
      "num": 2,
      "title": "Pay for quarantine permit",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Offer agreement for quarantine permit",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 3,
      "title": "Apply for quarantine permit",
      "output": "Application registration number",
      "entity": "One-stop service system Single window",
      "channel": "Online: apply",
      "where": "Single Window singlewindow.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Quarantine permit application",
       "Data required to complete application",
       "Information about applicant",
       "Information about importer",
       "Information about exporter",
       "General information",
       "Information about product"
      ]
     },
     {
      "num": 4,
      "title": "Obtain quarantine permit",
      "output": "Quarantine permit",
      "entity": "One-stop service system Single window",
      "channel": "Online: obtain",
      "where": "Single Window singlewindow.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature"
      ]
     }
    ]
   },
   {
    "id": "b2",
    "name": "Registration of import contract",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     2,
     8
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Other government",
    "entities": [
     "Single portal of interactive state services"
    ],
    "stepRange": [
     5,
     5
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 5,
      "title": "Register foreign trade contract in UEISFTO",
      "output": "Identification number of foreign trade contract",
      "entity": "Single portal of interactive state services",
      "channel": "Online: apply",
      "where": "my.gov.uz — unified state services my.gov.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Electronic copy of foreign trade contract"
      ]
     }
    ]
   },
   {
    "id": "b3",
    "name": "Prepare for cargo delivery by train online",
    "dependsOn": [
     "b2"
    ],
    "level": 1,
    "estDuration": [
     10,
     30
    ],
    "dependencyReason": "Rail-side receiving prep references the registered import contract from b2.",
    "lane": "Single Window & certification",
    "entities": [
     "Bank",
     "Tashkent regional railway junction",
     "Uzbekistan railways Single window"
    ],
    "stepRange": [
     6,
     10
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 6,
      "title": "Conclude online agreement with Technological Center and contract with Regional railway junction",
      "output": "Agreement with Technological center (single window)",
      "entity": "Uzbekistan railways Single window",
      "channel": "Online: obtain",
      "where": "Railway electronic waybill e-nakl.railway.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "One ID account"
      ]
     },
     {
      "num": 7,
      "title": "Obtain cost calculation for railway services",
      "output": "Information on cost amount",
      "entity": "Uzbekistan railways Single window",
      "channel": "Online: obtain",
      "where": "Railway electronic waybill e-nakl.railway.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "One ID account"
      ]
     },
     {
      "num": 8,
      "title": "Prepay for railway services (for green tea)",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for payment for railway services",
       "Agreement with Technological center",
       "For physical payment",
       "Physical presence",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 9,
      "title": "Generate electronic certificate for railway station",
      "output": "Electronic certificate for railway station",
      "entity": "Uzbekistan railways Single window",
      "channel": "Online: obtain",
      "where": "Railway electronic waybill e-nakl.railway.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature"
      ]
     },
     {
      "num": 10,
      "title": "Obtain approval for loading and unloading",
      "output": "Passing examination",
      "entity": "Tashkent regional railway junction",
      "channel": "In person",
      "where": "Inspectors of the Department on freight and commerce Room 402, 4th floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     }
    ]
   },
   {
    "id": "b4",
    "name": "Obtain guiding letter",
    "dependsOn": [
     "b2"
    ],
    "level": 1,
    "estDuration": [
     10,
     24
    ],
    "dependencyReason": "Booking customs-warehouse storage also references the contract from b2 — runs in parallel with b3.",
    "lane": "Customs / SCC",
    "entities": [
     "Bank",
     "Customs warehouse"
    ],
    "stepRange": [
     11,
     13
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 11,
      "title": "Contract customs warehouse",
      "output": "Invoice for payment",
      "entity": "Customs warehouse",
      "channel": "In person",
      "where": "Administration department",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Passport",
       "Power of attorney",
       "Certificate of state registration"
      ]
     },
     {
      "num": 12,
      "title": "Prepay for customs warehouse services",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for payment",
       "For physical payment",
       "Physical presence",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 13,
      "title": "Obtain authorization of customs warehouse",
      "output": "Guiding letter",
      "entity": "Customs warehouse",
      "channel": "In person",
      "where": "Administration department",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Guiding letter (template)",
       "Letter to railway station"
      ]
     }
    ]
   },
   {
    "id": "b5",
    "name": "Obtain cargo transportation documents",
    "dependsOn": [
     "b3",
     "b4"
    ],
    "level": 2,
    "estDuration": [
     8,
     24
    ],
    "dependencyReason": "Picking up the arriving wagon needs both the rail prep (b3) and the customs-warehouse guiding letter (b4).",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Railway station"
    ],
    "stepRange": [
     14,
     16
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 14,
      "title": "Obtain information on freight arrival",
      "output": "Information on cargo arrival",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Freight acceptance and handover Room",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Availability by phone"
      ]
     },
     {
      "num": 15,
      "title": "Submit guiding letter",
      "output": "Acceptance of guiding letter",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Freight acceptance and handover Room",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Guiding letter",
       "Letter to railway station"
      ]
     },
     {
      "num": 16,
      "title": "Obtain package of documents",
      "output": "Import railway bill",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Commodity cash desk",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Guiding letter",
       "Certificate on availability of funds at client's account",
       "Passport",
       "Power of attorney for railway station"
      ]
     }
    ]
   },
   {
    "id": "b6",
    "name": "Check in at customs post",
    "dependsOn": [
     "b5"
    ],
    "level": 3,
    "estDuration": [
     4,
     12
    ],
    "dependencyReason": "Check-in at the customs post needs the import railway bill obtained in b5.",
    "lane": "Customs / SCC",
    "entities": [
     "Customs post of foreign trade activity"
    ],
    "stepRange": [
     17,
     17
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 17,
      "title": "Obtain confirmation on cargo delivery to Customs post of destination",
      "output": "Customs stamps and marks on documents",
      "entity": "Customs post of foreign trade activity",
      "channel": "In person",
      "where": "Group of customs control and customs clearance",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Import railway bill",
       "Commercial invoice",
       "Packing list"
      ]
     }
    ]
   },
   {
    "id": "b7",
    "name": "Undergo customs clearance (Temporary storage)",
    "dependsOn": [
     "b6",
     "b1"
    ],
    "level": 4,
    "estDuration": [
     16,
     48
    ],
    "dependencyReason": "Temporary-storage customs declaration follows check-in (b6); the quarantine-controlled goods also need the pre-arrival quarantine permit (b1).",
    "lane": "Customs / SCC",
    "entities": [
     "Customs post of foreign trade activity",
     "Personal cabinet of participant of foreign economic activity"
    ],
    "stepRange": [
     18,
     23
    ],
    "optionalSteps": [
     18,
     19,
     22
    ],
    "altSteps": [],
    "steps": [
     {
      "num": 18,
      "title": "Apply for preliminary visual inspection",
      "output": "Application registration number (preliminary inspection)",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: apply",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Electronic application for preliminary visual inspection",
       "Documents required to fill the Application",
       "Application for preliminary visual inspection",
       "Warehouse license number",
       "Import railway bill",
       "Commercial invoice"
      ]
     },
     {
      "num": 19,
      "title": "Preliminary visual inspection",
      "output": "Preliminary inspection report",
      "entity": "Customs post of foreign trade activity",
      "channel": "In person",
      "where": "Customs control zone",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Power of attorney",
       "Physical presence",
       "Physical presence",
       "Required documents",
       "Import railway bill",
       "Commercial invoice",
       "Packing list",
       "Application for preliminary visual inspection"
      ]
     },
     {
      "num": 20,
      "title": "Create cargo customs declaration",
      "output": "Electronic form of customs declaration",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: apply",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Documents requried to complete declaration",
       "Commercial invoice",
       "Import railway bill",
       "Contract for customs warehouse services",
       "Passport",
       "Power of attorney",
       "Application for preliminary visual inspection"
      ]
     },
     {
      "num": 21,
      "title": "Submit customs declaration",
      "output": "Customs declaration submitted",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: submit",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Electronic form of customs declaration"
      ]
     },
     {
      "num": 22,
      "title": "Undergo customs inspection in red corridor",
      "output": "Unsealing of goods",
      "entity": "Customs post of foreign trade activity",
      "channel": "In person",
      "where": "Customs control zone",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Cargo customs declaration (IM70)",
       "Import railway bill",
       "Commercial invoice",
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     },
     {
      "num": 23,
      "title": "Obtain customs declaration",
      "output": "Cargo customs declaration (IM70)",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: obtain",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature"
      ]
     }
    ]
   },
   {
    "id": "b8",
    "name": "Arrange cargo unloading",
    "dependsOn": [
     "b7"
    ],
    "level": 5,
    "estDuration": [
     6,
     18
    ],
    "dependencyReason": "Unloading follows the temporary-storage customs clearance in b7.",
    "lane": "Customs / SCC",
    "entities": [
     "Customs warehouse",
     "Railway station"
    ],
    "stepRange": [
     24,
     25
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 24,
      "title": "Obtain wagons for unloading",
      "output": "Signed GU-45 form",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Freight acceptance and handover Room",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 25,
      "title": "Arrange cargo unloading",
      "output": "Report of the work done",
      "entity": "Customs warehouse",
      "channel": "In person",
      "where": "Customs warehouse",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Power of attorney",
       "Certificate on passing examination"
      ]
     }
    ]
   },
   {
    "id": "b9",
    "name": "Place cargo at customs warehouse (train)",
    "dependsOn": [
     "b8"
    ],
    "level": 6,
    "estDuration": [
     2,
     8
    ],
    "dependencyReason": "Goods are physically placed at the warehouse once unloaded (b8).",
    "lane": "Customs / SCC",
    "entities": [
     "Customs warehouse"
    ],
    "stepRange": [
     26,
     26
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 26,
      "title": "Place cargo at customs warehouse (train)",
      "output": "Place cargo at warehouse",
      "entity": "Customs warehouse",
      "channel": "In person",
      "where": "Storage",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Import railway bill",
       "Commercial invoice",
       "Packing list",
       "Cargo customs declaration (IM70)",
       "Cargo delivery control book (railway)"
      ]
     }
    ]
   },
   {
    "id": "b10",
    "name": "Obtain quarantine inspection act for tea not in consumer packaging",
    "dependsOn": [
     "b9"
    ],
    "level": 7,
    "estDuration": [
     24,
     72
    ],
    "dependencyReason": "Quarantine inspectors need physical access to the goods, so this waits on b9.",
    "lane": "Customs / SCC",
    "entities": [
     "Agency of plant quarantine and protection Personal cabinet (Oferta)",
     "Bank",
     "Customs warehouse",
     "One-stop service system Single window",
     "Territorial Department of plant quarantine and protection"
    ],
    "stepRange": [
     27,
     34
    ],
    "optionalSteps": [
     31,
     32,
     33
    ],
    "altSteps": [],
    "steps": [
     {
      "num": 27,
      "title": "Obtain offer agreement",
      "output": "Offer agreement",
      "entity": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
      "channel": "Online: obtain",
      "where": "eFito (phytosanitary) efito.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Data required to complete offer agreement",
       "Tax Identification Number of the organization or individual",
       "Name of the organization",
       "Full name of an organization's manager",
       "Type of organization (business entity, budgetary)",
       "Contact phone number",
       "Amount of consignment"
      ]
     },
     {
      "num": 28,
      "title": "Pay for transport unit opening act",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Offer agreement for transport unit opening act",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 29,
      "title": "Apply for quarantine inspection act and transport unit opening act",
      "output": "Appointment for inspection",
      "entity": "One-stop service system Single window",
      "channel": "Online: apply",
      "where": "Single Window singlewindow.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Online application for quarantine inspection certificate",
       "Quarantine permit",
       "Phytosanitary certificate of the exporter's country",
       "Data required to complete application",
       "Information about applicant",
       "Information about importer",
       "Information about exporter",
       "General information",
       "Information about product"
      ]
     },
     {
      "num": 30,
      "title": "Undergo quarantine inspection",
      "output": "Transport unit opening act",
      "entity": "Customs warehouse",
      "channel": "In person",
      "where": "Customs warehouse",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Physical presence",
       "Phytosanitary certificate of the exporter's country",
       "Quarantine permit"
      ]
     },
     {
      "num": 31,
      "title": "Obtain offer agreement for fumigation",
      "output": "Fumigation offer agreement",
      "entity": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
      "channel": "Online: obtain",
      "where": "eFito (phytosanitary) efito.uz",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Internet access",
       "Data required to complete offer agreement",
       "Tax Identification Number of the organization or individual",
       "Name of the organization",
       "Full name of an organization's manager",
       "Type of organization (business entity, budgetary)",
       "Contact phone number",
       "Agency region",
       "Cost on the contract"
      ]
     },
     {
      "num": 32,
      "title": "Pay for fumigation",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Fumigation offer agreement",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 33,
      "title": "Undergo fumigation",
      "output": "Certificate of disinfestation",
      "entity": "Territorial Department of plant quarantine and protection",
      "channel": "In person",
      "where": "Fumigation (disinfection) division",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 34,
      "title": "Obtain quarantine inspection act",
      "output": "Quarantine inspection act",
      "entity": "One-stop service system Single window",
      "channel": "Online: obtain",
      "where": "Single Window singlewindow.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature"
      ]
     }
    ]
   },
   {
    "id": "b11",
    "name": "Arrange return of empty wagons",
    "dependsOn": [
     "b8"
    ],
    "level": 6,
    "estDuration": [
     6,
     18
    ],
    "dependencyReason": "Wagons are only empty and returnable once unloading (b8) is complete — runs parallel to b9/b10.",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Railway station"
    ],
    "stepRange": [
     35,
     36
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 35,
      "title": "Hand over empty wagons",
      "output": "Signed GU-45 form",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Freight acceptance and handover Room",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Application for wagon handover"
      ]
     },
     {
      "num": 36,
      "title": "Arrange return of empty wagons",
      "output": "Duplicate of railway bill with datestamp",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Commodity cash desk",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Application for returning empty wagons",
       "Instruction on completing railway bill",
       "Export railway bill (SMGS)"
      ]
     }
    ]
   },
   {
    "id": "b12",
    "name": "Finalize mutual settlements with railway station",
    "dependsOn": [
     "b11"
    ],
    "level": 7,
    "estDuration": [
     2,
     8
    ],
    "dependencyReason": "Settlement with the railway station closes out once the empty wagons are handed back (b11).",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Railway station"
    ],
    "stepRange": [
     37,
     37
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 37,
      "title": "Finalize mutual settlements with railway station",
      "output": "Complete procedure",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Commodity cash desk",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Import railway bill"
      ]
     }
    ]
   },
   {
    "id": "b13",
    "name": "Obtain sanitary-epidemiological conclusion",
    "dependsOn": [
     "b9"
    ],
    "level": 7,
    "estDuration": [
     24,
     72
    ],
    "dependencyReason": "Sanitary-epidemiological sampling needs the goods at the warehouse (b9) — runs parallel to the quarantine-inspection track (b10).",
    "lane": "Customs / SCC",
    "entities": [
     "Bank",
     "Customs warehouse",
     "One-stop service system Single window",
     "Regional center for sanitary-epidemiological service",
     "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan"
    ],
    "stepRange": [
     38,
     44
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 38,
      "title": "Obtain offer agreement",
      "output": "Offer agreement for sanitary-epidemiological conclusion",
      "entity": "One-stop service system Single window",
      "channel": "Online: obtain",
      "where": "Single Window singlewindow.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Bank details"
      ]
     },
     {
      "num": 39,
      "title": "Apply for sanitary-epidemiological conclusion",
      "output": "Obtain application's registration number",
      "entity": "One-stop service system Single window",
      "channel": "Online: apply",
      "where": "Single Window singlewindow.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Food test report from international accredited laboratories",
       "Online application for sanitary-epidemiologocal conclusion",
       "Data required to complete application",
       "Information about applicant",
       "Information about importer",
       "Information about exporter",
       "Supplier information",
       "Payment information",
       "General information",
       "Information about product"
      ]
     },
     {
      "num": 40,
      "title": "Select products samples",
      "output": "Product sampling label",
      "entity": "Customs warehouse",
      "channel": "In person",
      "where": "Customs warehouse",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Power of attorney"
      ]
     },
     {
      "num": 41,
      "title": "Submit product samples for laboratory tests",
      "output": "Submission of samples for testing",
      "entity": "Regional center for sanitary-epidemiological service",
      "channel": "In person",
      "where": "Sanitary-epidemiological service laboratory",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Product sampling label"
      ]
     },
     {
      "num": 42,
      "title": "Obtain invoice for payment",
      "output": "Invoice for payment",
      "entity": "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
      "channel": "Online: obtain",
      "where": "Tax portal (soliq) my.soliq.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Product sampling label",
       "Electronic digital signature"
      ]
     },
     {
      "num": 43,
      "title": "Pay for sanitary-epidemiological conclusion",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for payment",
       "Offer agreement for sanitary-epidemiological conclusion",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 44,
      "title": "Obtain sanitary-epidemiological conclusion",
      "output": "Sanitary-epidemiological conclusion",
      "entity": "One-stop service system Single window",
      "channel": "Online: obtain",
      "where": "Single Window singlewindow.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature"
      ]
     }
    ]
   },
   {
    "id": "b14",
    "name": "Undergo customs clearance (Import)",
    "dependsOn": [
     "b10",
     "b13"
    ],
    "level": 8,
    "estDuration": [
     16,
     48
    ],
    "dependencyReason": "Final import declaration needs both certifying documents: the quarantine inspection act (b10) and the sanitary-epidemiological conclusion (b13).",
    "lane": "Customs / SCC",
    "entities": [
     "Customs warehouse",
     "Online banking system",
     "Personal cabinet of participant of foreign economic activity"
    ],
    "stepRange": [
     45,
     49
    ],
    "optionalSteps": [
     48
    ],
    "altSteps": [],
    "steps": [
     {
      "num": 45,
      "title": "Create import customs declaration",
      "output": "Electronic form of customs declaration",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: apply",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Documents required to complete declaration",
       "Import railway bill",
       "Commercial invoice",
       "Identification number of foreign trade contract",
       "Export declaration of the exporter's country",
       "Certificates and permits",
       "Certificate of origin of the exporter's country",
       "Quarantine permit",
       "Sanitary-epidemiological conclusion"
      ]
     },
     {
      "num": 46,
      "title": "Pay Customs Payments And Taxes (General step)",
      "output": "Payment cleared",
      "entity": "Online banking system",
      "channel": "In person",
      "where": "Online banking system",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Bank details of territorial customs departments",
       "Online banking account"
      ]
     },
     {
      "num": 47,
      "title": "Submit import customs declaration",
      "output": "Customs declaration submitted",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: submit",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Electronic form of customs declaration"
      ]
     },
     {
      "num": 48,
      "title": "Undergo customs inspection in red corridor",
      "output": "Undergo documentary control",
      "entity": "Customs warehouse",
      "channel": "In person",
      "where": "Storage",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Import customs declaration",
       "Import railway bill",
       "Commercial invoice",
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     },
     {
      "num": 49,
      "title": "Obtain import customs declaration",
      "output": "Import customs declaration",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: obtain",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature"
      ]
     }
    ]
   },
   {
    "id": "b15",
    "name": "Departure from customs warehouse",
    "dependsOn": [
     "b14"
    ],
    "level": 9,
    "estDuration": [
     10,
     30
    ],
    "dependencyReason": "Goods can only leave the warehouse after the import declaration clears in b14.",
    "lane": "Customs / SCC",
    "entities": [
     "Bank",
     "Customs warehouse"
    ],
    "stepRange": [
     50,
     53
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 50,
      "title": "Obtain invoice for customs warehouse services",
      "output": "Invoice for payment",
      "entity": "Customs warehouse",
      "channel": "In person",
      "where": "Commodity cash desk",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Import customs declaration",
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     },
     {
      "num": 51,
      "title": "Pay for customs warehouse services",
      "output": "Receipt of payment for warehouse services",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for payment",
       "For physical payment",
       "Physical presence",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 52,
      "title": "Obtain permit for exit",
      "output": "Exit pass",
      "entity": "Customs warehouse",
      "channel": "In person",
      "where": "Storage",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Receipt of payment",
       "Import customs declaration",
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     },
     {
      "num": 53,
      "title": "Departure from customs warehouse",
      "output": "Permission to exit from customs warehouse",
      "entity": "Customs warehouse",
      "channel": "In person",
      "where": "Customs warehouse checkpoint",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Exit pass",
       "Physical presence"
      ]
     }
    ]
   }
  ],
  "entityDirectory": [
   {
    "name": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
    "steps": "1, 27, 31",
    "lane": "Single Window & certification",
    "contact": "✉ info@karantin.uz 🌐 https://efito.uz/invoice/, http://karantin.uz/"
   },
   {
    "name": "Bank",
    "steps": "2, 8, 12, 28, 32, 43, 51",
    "lane": "Bank",
    "contact": ""
   },
   {
    "name": "One-stop service system Single window",
    "steps": "3, 4, 29, 34, 38, 39, 44",
    "lane": "Single Window & certification",
    "contact": "☎ +998 78 120 76 08 (Int. 5603, 5646, 5606, 5885) , +998 78 120 76 00 (Int. 5603, 5646, 5606, 5885) 🌐 http://singlewindow.uz/index.jsp, http://sw2.customs.uz/"
   },
   {
    "name": "Single portal of interactive state services",
    "steps": "5",
    "lane": "Other government",
    "contact": "✉ epigu@egov.uz ☎ +998 55 501 36 19,  +998 55 501 36 17 🌐 https://my.gov.uz/, https://my.gov.uz/ru/site/feedback"
   },
   {
    "name": "Uzbekistan railways Single window",
    "steps": "6, 7, 9",
    "lane": "Single Window & certification",
    "contact": "✉ git@railway.uz ☎ +998 71 238 88 02 🌐 https://e-nakl.railway.uz/"
   },
   {
    "name": "Tashkent regional railway junction",
    "steps": "10",
    "lane": "Transport & E-Tranzit",
    "contact": "✉ rju-1@railway.uz ☎ +998 71 299 96 20 🌐 http://tashkent.railway.uz/en/"
   },
   {
    "name": "Customs warehouse",
    "steps": "11, 13, 25, 26, 30, 40, 48, 50, 52, 53",
    "lane": "Customs / SCC",
    "contact": ""
   },
   {
    "name": "Railway station",
    "steps": "14, 15, 16, 24, 35, 36, 37",
    "lane": "Transport & E-Tranzit",
    "contact": ""
   },
   {
    "name": "Customs post of foreign trade activity",
    "steps": "17, 19, 22",
    "lane": "Customs / SCC",
    "contact": ""
   },
   {
    "name": "Personal cabinet of participant of foreign economic activity",
    "steps": "18, 20, 21, 23, 45, 47, 49",
    "lane": "Customs / SCC",
    "contact": "🌐 http://ed1.customs.uz, http://ed2.customs.uz"
   },
   {
    "name": "Territorial Department of plant quarantine and protection",
    "steps": "33",
    "lane": "Single Window & certification",
    "contact": ""
   },
   {
    "name": "Regional center for sanitary-epidemiological service",
    "steps": "41",
    "lane": "Single Window & certification",
    "contact": ""
   },
   {
    "name": "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
    "steps": "42",
    "lane": "Single Window & certification",
    "contact": "✉ kancelyariyaresdsenm@minzdrav.uz ☎ + 998 78 888 01 01 🌐 http://sanepid.uz/en"
   },
   {
    "name": "Online banking system",
    "steps": "46",
    "lane": "Bank",
    "contact": ""
   }
  ]
 },
 "540": {
  "id": "540",
  "title": "Export of tea by air",
  "direction": "export",
  "goods": "tea",
  "mode": "air",
  "timeframe": [
   30,
   108
  ],
  "stepsCount": 47,
  "blocks": [
   {
    "id": "b1",
    "name": "Registration of export contract",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     2,
     8
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Other government",
    "entities": [
     "Single portal of interactive state services"
    ],
    "stepRange": [
     1,
     1
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 1,
      "title": "Register foreign trade contract in UEISFTO",
      "output": "Identification number of foreign trade contract",
      "entity": "Single portal of interactive state services",
      "channel": "Online: apply",
      "where": "my.gov.uz — unified state services my.gov.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Electronic copy of foreign trade contract"
      ]
     }
    ]
   },
   {
    "id": "b2",
    "name": "Obtain air waybill",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     10,
     30
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Cargo sales agent"
    ],
    "stepRange": [
     2,
     5
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 2,
      "title": "Contract with cargo sales agent",
      "output": "Agreement on the provision of air transportation services",
      "entity": "Cargo sales agent",
      "channel": "In person",
      "where": "Cargo sales agent",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Guarantees and fees",
       "Bank details"
      ]
     },
     {
      "num": 3,
      "title": "Submit shipper’s letter of instruction",
      "output": "Shipper’s letter of instruction",
      "entity": "Cargo sales agent",
      "channel": "In person",
      "where": "Cargo sales agent",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Commercial invoice",
       "Packing list"
      ]
     },
     {
      "num": 4,
      "title": "Pay for transportation service",
      "output": "Bank payment receipt",
      "entity": "Cargo sales agent",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for payment",
       "For physical payment",
       "Physical presence",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 5,
      "title": "Obtain air waybill",
      "output": "Air waybill",
      "entity": "Cargo sales agent",
      "channel": "In person",
      "where": "Cargo sales agent",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Shipper's letter of instruction",
       "Bank payment receipt"
      ]
     }
    ]
   },
   {
    "id": "b3",
    "name": "Contract with airport for cargo handling",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     12,
     36
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Bank",
     "Postal cargo complex at Tashkent International Airport named by Islam Karimov"
    ],
    "stepRange": [
     6,
     9
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 6,
      "title": "Contract with airport for cargo handling",
      "output": "Sign the contract",
      "entity": "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
      "channel": "In person",
      "where": "Contracting Department \"Room 212, 2nd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Certificate of state registration",
       "Stamp"
      ]
     },
     {
      "num": 7,
      "title": "Obtain signed contract with airport for cargo handling",
      "output": "Contract for handling and storage of cargo",
      "entity": "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
      "channel": "In person",
      "where": "Contracting Department \"Room 212, 2nd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Power of attorney"
      ]
     },
     {
      "num": 8,
      "title": "Obtain invoice for prepayment",
      "output": "Invoice for prepayment for cargo handling",
      "entity": "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
      "channel": "In person",
      "where": "Cash desk \"First floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Contract for handling and storage of cargo",
       "Air waybill"
      ]
     },
     {
      "num": 9,
      "title": "Prepay for handling and storage of cargo",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for prepayment for cargo handling",
       "For physical payment",
       "Physical presence",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     }
    ]
   },
   {
    "id": "b4",
    "name": "Obtain internal phytosanitary certificate (for tea not in consumer packaging)",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     24,
     72
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Single Window & certification",
    "entities": [
     "Agency of plant quarantine and protection Personal cabinet (Oferta)",
     "Assalom Agro",
     "Bank",
     "Territorial Department of plant quarantine and protection",
     "Warehouse / Location of goods"
    ],
    "stepRange": [
     10,
     17
    ],
    "optionalSteps": [
     14,
     15,
     16
    ],
    "altSteps": [],
    "steps": [
     {
      "num": 10,
      "title": "Obtain offer agreement",
      "output": "Offer agreement for internal phytosanitary certificate",
      "entity": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
      "channel": "Online: obtain",
      "where": "eFito (phytosanitary) efito.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Internet access",
       "Data required to complete offer agreement",
       "Tax Identification Number of the organization or individual",
       "Name of the organization",
       "Full name of an organization's manager",
       "Contact phone number",
       "Agency region",
       "Payment sum"
      ]
     },
     {
      "num": 11,
      "title": "Pay for internal phytosanitary certificate",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Offer agreement for internal phytosanitary certificate",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 12,
      "title": "Apply for internal phytosanitary certificate",
      "output": "Appointment for inspection",
      "entity": "Assalom Agro",
      "channel": "Online: apply",
      "where": "assalomagro.uz assalomagro.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "To access the platform",
       "One ID account",
       "Contact phone number",
       "Email"
      ]
     },
     {
      "num": 13,
      "title": "Undergo phytosanitary inspection",
      "output": "Sealing",
      "entity": "Warehouse / Location of goods",
      "channel": "In person",
      "where": "Warehouse / Location of goods",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 14,
      "title": "Obtain offer agreement for fumigation",
      "output": "Fumigation offer agreement",
      "entity": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
      "channel": "Online: obtain",
      "where": "eFito (phytosanitary) efito.uz",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Internet access",
       "Data required to complete offer agreement",
       "Tax Identification Number of the organization or individual",
       "Name of the organization",
       "Full name of an organization's manager",
       "Type of organization (business entity, budgetary)",
       "Contact phone number",
       "Agency region",
       "Cost on the contract"
      ]
     },
     {
      "num": 15,
      "title": "Pay for fumigation",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Fumigation offer agreement",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 16,
      "title": "Undergo fumigation",
      "output": "Certificate of disinfestation",
      "entity": "Territorial Department of plant quarantine and protection",
      "channel": "In person",
      "where": "Fumigation (disinfection) division",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 17,
      "title": "Obtain internal phytosanitary certificate",
      "output": "Internal phytosanitary certificate",
      "entity": "Assalom Agro",
      "channel": "Online: obtain",
      "where": "assalomagro.uz assalomagro.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "One ID account",
       "Contact phone number",
       "Email"
      ]
     }
    ]
   },
   {
    "id": "b5",
    "name": "Obtain phytosanitary certificate (for tea not in consumer packaging)",
    "dependsOn": [
     "b4"
    ],
    "level": 1,
    "estDuration": [
     10,
     30
    ],
    "dependencyReason": "Border phytosanitary cert follows the internal cert/sealing done in b4.",
    "lane": "Single Window & certification",
    "entities": [
     "Agency of plant quarantine and protection Personal cabinet (Oferta)",
     "Bank",
     "Border checkpoint for plant quarantine",
     "One-stop service system Single window"
    ],
    "stepRange": [
     18,
     22
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 18,
      "title": "Obtain offer agreement",
      "output": "Offer agreement for phytosanitary certificate",
      "entity": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
      "channel": "Online: obtain",
      "where": "Quarantine cabinet cabinet.karantin.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Data required to complete offer agreement",
       "Tax Identification Number of the organization or individual",
       "Name of the organization",
       "Full name of an organization's manager",
       "Type of organization (business entity, budgetary)",
       "Contact phone number",
       "Agency region",
       "Payment sum",
       "Quantity of transport units"
      ]
     },
     {
      "num": 19,
      "title": "Pay for phytosanitary certificate",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Offer agreement for phytosanitary certificate",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 20,
      "title": "Apply for phytosanitary certificate",
      "output": "Appointment for phytosanitary control",
      "entity": "One-stop service system Single window",
      "channel": "Online: apply",
      "where": "Single Window singlewindow.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Online application for phytosanitary certificate"
      ]
     },
     {
      "num": 21,
      "title": "Undergo phytosanitary inspection",
      "output": "Visual inspection",
      "entity": "Border checkpoint for plant quarantine",
      "channel": "In person",
      "where": "Office of the inspector on the border checkpoint for plant quarantine",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 22,
      "title": "Obtain phytosanitary certificate",
      "output": "Phytosanitary certificate",
      "entity": "Border checkpoint for plant quarantine",
      "channel": "In person",
      "where": "Office of the inspector on the border checkpoint for plant quarantine",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     }
    ]
   },
   {
    "id": "b6",
    "name": "Obtain certificate of origin",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     24,
     72
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Single Window & certification",
    "entities": [
     "Bank",
     "One-stop service system Single window",
     "Warehouse / Location of goods",
     "“Uzbekexpertiza” JSC",
     "“Uzbekexpertiza” JSC service portal"
    ],
    "stepRange": [
     23,
     31
    ],
    "optionalSteps": [],
    "altSteps": [
     27,
     31
    ],
    "steps": [
     {
      "num": 23,
      "title": "Conclude contract for services",
      "output": "Contract with Uzbekexpertiza",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Deputy Chief of the Department of examination of preferential goods \"Room 36, 3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     },
     {
      "num": 24,
      "title": "Pay for certificate of origin",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for prepayment",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 25,
      "title": "Apply for certificate of origin",
      "output": "Assignment of expert on certification",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Deputy Chief of the Department of examination of preferential goods \"Room 36, 3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Application for obtaining of Certificate of origin for exported goods",
       "Application for obtaining of Certificate of origin for exported goods",
       "Commercial invoice",
       "Any document confirming the exporter's right to use a land plot",
       "Any document confirming purchase of agricultural products"
      ]
     },
     {
      "num": 26,
      "title": "Apply for certificate of origin via Uzbekexpertiza service portal",
      "output": "Appointment with an expert on certification",
      "entity": "“Uzbekexpertiza” JSC service portal",
      "channel": "Online: apply",
      "where": "Uzbekexpertiza service portal application.expertiza.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "One ID account",
       "Online application for certificate of origin",
       "Commercial invoice",
       "Any document confirming the exporter's right to use a land plot",
       "Any document confirming purchase of agricultural products"
      ]
     },
     {
      "num": 27,
      "title": "Apply for certificate of origin via Single Window",
      "output": "Appointment with an expert on certification",
      "entity": "One-stop service system Single window",
      "channel": "Online: apply",
      "where": "Single Window singlewindow.uz",
      "performedBy": "",
      "optional": false,
      "alternative": true,
      "inputs": [
       "Electronic digital signature",
       "Online application for certificate of origin",
       "Commercial invoice",
       "Any document confirming the exporter's right to use a land plot",
       "Any document confirming purchase of agricultural products"
      ]
     },
     {
      "num": 28,
      "title": "Assessment of application",
      "output": "Appointment for cargo expertise",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Department of Examination of Preferential Goods \"3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 29,
      "title": "Undergo expertise of goods",
      "output": "Undergo expertise",
      "entity": "Warehouse / Location of goods",
      "channel": "In person",
      "where": "Warehouse / Location of goods",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 30,
      "title": "Obtain certificate of origin",
      "output": "Certificate of origin",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Department of Examination of Preferential Goods \"3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 31,
      "title": "Obtain expert conclusion",
      "output": "Expert conclusion",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Department of Examination of Preferential Goods \"3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": true,
      "inputs": [
       "Physical presence"
      ]
     }
    ]
   },
   {
    "id": "b7",
    "name": "Arrange cargo handling and dispatch at airport's warehouse 1/2",
    "dependsOn": [
     "b2",
     "b3",
     "b5"
    ],
    "level": 2,
    "estDuration": [
     16,
     48
    ],
    "dependencyReason": "Airport warehouse handling needs the air waybill (b2), the signed handling contract (b3), and the phytosanitary clearance (b5) — the airport re-checks quarantine status at its own checkpoint.",
    "lane": "Customs / SCC",
    "entities": [
     "Border checkpoint for plant quarantine",
     "Customs post \"Avia yuklar\" at the airport's warehouse",
     "Postal cargo complex at Tashkent International Airport named by Islam Karimov"
    ],
    "stepRange": [
     32,
     38
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 32,
      "title": "Put cargo under customs control",
      "output": "Stamp \"Cargo is under customs control\"",
      "entity": "Customs post \"Avia yuklar\" at the airport's warehouse",
      "channel": "In person",
      "where": "Group of customs control and customs clearance",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Shipper's letter of instruction",
       "Physical presence",
       "Power of attorney"
      ]
     },
     {
      "num": 33,
      "title": "Apply for permission to airport's cargo warehouse",
      "output": "Permission granted",
      "entity": "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
      "channel": "In person",
      "where": "The agent in booking cargoes \"Room 102, 1st floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Air waybill",
       "Shipper's letter of instruction",
       "Passport",
       "Vehicle registration certificate",
       "Commercial invoice"
      ]
     },
     {
      "num": 34,
      "title": "Obtain the pass to airport's cargo warehouse",
      "output": "Pass card",
      "entity": "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
      "channel": "In person",
      "where": "Pass issuance room \"Room 109, 1st floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Passport",
       "Vehicle registration certificate"
      ]
     },
     {
      "num": 35,
      "title": "Undergo vehicle inspection at airport's Checkpoint",
      "output": "Entrance to airport's warehouse",
      "entity": "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
      "channel": "In person",
      "where": "Airport's Checkpoint",
      "performedBy": "vehicle driver",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Vehicle entrance permit"
      ]
     },
     {
      "num": 36,
      "title": "Undergo phytosanitary control at airport",
      "output": "Confirmation about passing quarantine control",
      "entity": "Border checkpoint for plant quarantine",
      "channel": "In person",
      "where": "Office of the inspector on the border checkpoint for plant quarantine",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Phytosanitary certificate"
      ]
     },
     {
      "num": 37,
      "title": "Undergo cargo weight and visual inspection",
      "output": "Inspection passed",
      "entity": "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
      "channel": "In person",
      "where": "Cargo storage place",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Air waybill"
      ]
     },
     {
      "num": 38,
      "title": "Undergo control for hidden dangerous goods",
      "output": "Notes or stamps in the air waybill",
      "entity": "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
      "channel": "In person",
      "where": "Dangerous goods department \"Room 101, 1st floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Air waybill"
      ]
     }
    ]
   },
   {
    "id": "b8",
    "name": "Undergo customs clearance",
    "dependsOn": [
     "b6",
     "b7"
    ],
    "level": 3,
    "estDuration": [
     12,
     40
    ],
    "dependencyReason": "Customs declaration needs the certificate of origin (b6) and the cargo already processed at the airport warehouse (b7).",
    "lane": "Customs / SCC",
    "entities": [
     "Bank",
     "Customs post \"Avia yuklar\" at the airport's warehouse",
     "Personal cabinet of participant of foreign economic activity"
    ],
    "stepRange": [
     39,
     43
    ],
    "optionalSteps": [
     42
    ],
    "altSteps": [],
    "steps": [
     {
      "num": 39,
      "title": "Create export customs declaration",
      "output": "Electronic form of customs declaration",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: apply",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Documents required to complete declaration",
       "Identification number of foreign trade contract",
       "Commercial invoice",
       "Air waybill",
       "Documents that are not obligatory to submit for export declaration",
       "Phytosanitary certificate",
       "Certificate of origin",
       "Certificate of origin form A",
       "Certificate of origin General form"
      ]
     },
     {
      "num": 40,
      "title": "Pay for customs fee",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Trade info portal uztradeinfo.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Bank details of territorial customs departments",
       "For physical payment",
       "Physical presence",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 41,
      "title": "Submit export customs declaration",
      "output": "Customs declaration submitted",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: submit",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Electronic form of customs declaration"
      ]
     },
     {
      "num": 42,
      "title": "Undergo customs inspection in red corridor",
      "output": "Customs examination act",
      "entity": "Customs post \"Avia yuklar\" at the airport's warehouse",
      "channel": "In person",
      "where": "Group of customs control and customs clearance",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Export customs declaration",
       "Air waybill",
       "Commercial invoice",
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     },
     {
      "num": 43,
      "title": "Obtain export customs declaration",
      "output": "Export customs declaration",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: obtain",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature"
      ]
     }
    ]
   },
   {
    "id": "b9",
    "name": "Arrange cargo handling and dispatch at airport's warehouse 2/2",
    "dependsOn": [
     "b8"
    ],
    "level": 4,
    "estDuration": [
     10,
     30
    ],
    "dependencyReason": "Final handover to the carrier follows customs release in b8.",
    "lane": "Customs / SCC",
    "entities": [
     "Customs post \"Avia yuklar\" at the airport's warehouse",
     "Postal cargo complex at Tashkent International Airport named by Islam Karimov"
    ],
    "stepRange": [
     44,
     47
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 44,
      "title": "Complete mutual settlements with airport",
      "output": "Cashdesk stamp on airwaybill",
      "entity": "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
      "channel": "In person",
      "where": "Cash desk \"First floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Air waybill",
       "Contract for handling and storage of cargo"
      ]
     },
     {
      "num": 45,
      "title": "Obtain customs approval to release cargo",
      "output": "Stamp \"Release permited\" on airwaybill",
      "entity": "Customs post \"Avia yuklar\" at the airport's warehouse",
      "channel": "In person",
      "where": "Department of customs clearance \"First Window, 1st floor in secured zone\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Air waybill",
       "Commercial invoice"
      ]
     },
     {
      "num": 46,
      "title": "Undergo air security inspection",
      "output": "Aviation safety stamp",
      "entity": "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
      "channel": "In person",
      "where": "Aviation safety inspection department",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Air waybill",
       "Physical presence"
      ]
     },
     {
      "num": 47,
      "title": "Hand over cargo for dispatch",
      "output": "Blue page of air waybill",
      "entity": "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
      "channel": "In person",
      "where": "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Air waybill",
       "Package of documents"
      ]
     }
    ]
   }
  ],
  "entityDirectory": [
   {
    "name": "Single portal of interactive state services",
    "steps": "1",
    "lane": "Other government",
    "contact": "✉ epigu@egov.uz ☎ +998 55 501 36 19,  +998 55 501 36 17 🌐 https://my.gov.uz/, https://my.gov.uz/ru/site/feedback"
   },
   {
    "name": "Cargo sales agent",
    "steps": "2, 3, 4, 5",
    "lane": "Transport & E-Tranzit",
    "contact": ""
   },
   {
    "name": "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
    "steps": "6, 7, 8, 33, 34, 35, 37, 38, 44, 46, 47",
    "lane": "Transport & E-Tranzit",
    "contact": "✉ pkg.tas@uzairports.com, tashairkanc@uzairports.com ☎ +990 78 140 28 25, +998 78 140 28 26 🌐 https://tashkent-airport.uz/"
   },
   {
    "name": "Bank",
    "steps": "9, 11, 15, 19, 24, 40",
    "lane": "Bank",
    "contact": ""
   },
   {
    "name": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
    "steps": "10, 14, 18",
    "lane": "Single Window & certification",
    "contact": "✉ info@karantin.uz 🌐 https://efito.uz/invoice/, http://karantin.uz/"
   },
   {
    "name": "Assalom Agro",
    "steps": "12, 17",
    "lane": "Single Window & certification",
    "contact": "✉ assalomagro@gmail.com, info@5x5.uz ☎ +998 55 502 55 75, +998 98 198 14 02 🌐 https://assalomagro.uz/en"
   },
   {
    "name": "Warehouse / Location of goods",
    "steps": "13, 29",
    "lane": "Transport & E-Tranzit",
    "contact": ""
   },
   {
    "name": "Territorial Department of plant quarantine and protection",
    "steps": "16",
    "lane": "Single Window & certification",
    "contact": ""
   },
   {
    "name": "One-stop service system Single window",
    "steps": "20, 27",
    "lane": "Single Window & certification",
    "contact": "☎ +998 78 120 76 08 (Int. 5603, 5646, 5606, 5885) , +998 78 120 76 00 (Int. 5603, 5646, 5606, 5885) 🌐 http://singlewindow.uz/index.jsp, http://sw2.customs.uz/"
   },
   {
    "name": "Border checkpoint for plant quarantine",
    "steps": "21, 22, 36",
    "lane": "Single Window & certification",
    "contact": ""
   },
   {
    "name": "“Uzbekexpertiza” JSC",
    "steps": "23, 25, 28, 30, 31",
    "lane": "Single Window & certification",
    "contact": "✉ info1@expertiza.uz, expertiza@exat.uz ☎ +998 71 230 23 64, +998 71 230 23 60 🌐 http://www.expertiza.uz/, http://t.me/uzbekexpertiza_bot"
   },
   {
    "name": "“Uzbekexpertiza” JSC service portal",
    "steps": "26",
    "lane": "Single Window & certification",
    "contact": "🌐 http://application.expertiza.uz/expertiza/#/, http://www.expertiza.uz/"
   },
   {
    "name": "Customs post \"Avia yuklar\" at the airport's warehouse",
    "steps": "32, 42, 45",
    "lane": "Customs / SCC",
    "contact": "☎ +998 78 120 86 30, +998 71 255 83 89"
   },
   {
    "name": "Personal cabinet of participant of foreign economic activity",
    "steps": "39, 41, 43",
    "lane": "Customs / SCC",
    "contact": "🌐 http://ed1.customs.uz, http://ed2.customs.uz"
   }
  ]
 },
 "868": {
  "id": "868",
  "title": "Export of tea by train",
  "direction": "export",
  "goods": "tea",
  "mode": "train",
  "timeframe": [
   81,
   244
  ],
  "stepsCount": 48,
  "blocks": [
   {
    "id": "b1",
    "name": "Registration of export contract",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     2,
     8
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Other government",
    "entities": [
     "Single portal of interactive state services"
    ],
    "stepRange": [
     1,
     1
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 1,
      "title": "Register foreign trade contract in UEISFTO",
      "output": "Identification number of foreign trade contract",
      "entity": "Single portal of interactive state services",
      "channel": "Online: apply",
      "where": "my.gov.uz — unified state services my.gov.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Electronic copy of foreign trade contract"
      ]
     }
    ]
   },
   {
    "id": "b2",
    "name": "Prepare for cargo delivery by train online",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     10,
     30
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Single Window & certification",
    "entities": [
     "Bank",
     "Tashkent regional railway junction",
     "Uzbekistan railways Single window"
    ],
    "stepRange": [
     2,
     6
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 2,
      "title": "Conclude online agreement with Technological Center and contract with Regional railway junction",
      "output": "Contract for additional services (Single window)",
      "entity": "Uzbekistan railways Single window",
      "channel": "Online: obtain",
      "where": "Railway electronic waybill e-nakl.railway.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "One ID account"
      ]
     },
     {
      "num": 3,
      "title": "Obtain cost calculation for railway services",
      "output": "Information on cost amount",
      "entity": "Uzbekistan railways Single window",
      "channel": "Online: obtain",
      "where": "Railway electronic waybill e-nakl.railway.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "One ID account"
      ]
     },
     {
      "num": 4,
      "title": "Prepay for railway services (General)",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for payment for railway services",
       "Agreement with Technological center",
       "For physical payment",
       "Physical presence",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 5,
      "title": "Generate electronic certificate for railway station",
      "output": "Electronic certificate for railway station",
      "entity": "Uzbekistan railways Single window",
      "channel": "Online: obtain",
      "where": "Railway electronic waybill e-nakl.railway.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature"
      ]
     },
     {
      "num": 6,
      "title": "Obtain approval for loading and unloading",
      "output": "Passing examination",
      "entity": "Tashkent regional railway junction",
      "channel": "In person",
      "where": "Inspectors of the Department on freight and commerce Room 402, 4th floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     }
    ]
   },
   {
    "id": "b3",
    "name": "Obtain code notification",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     12,
     36
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Bank",
     "Freight forwarding company"
    ],
    "stepRange": [
     7,
     10
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 7,
      "title": "Request for freight transportation by railway",
      "output": "Transportation request",
      "entity": "Freight forwarding company",
      "channel": "In person",
      "where": "Freight forwarding company",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Foreign economic activity contract",
       "Supply contract"
      ]
     },
     {
      "num": 8,
      "title": "Contract with freight forwarder",
      "output": "Invoice for payment",
      "entity": "Freight forwarding company",
      "channel": "In person",
      "where": "Freight forwarding company",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Passport",
       "Power of attorney",
       "Tax Identification Number of the organization or individual",
       "Personal identification number of an individual",
       "Bank details"
      ]
     },
     {
      "num": 9,
      "title": "Pay for code assignment and freight forwarder service",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for payment",
       "Agreement on railway transportation services",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 10,
      "title": "Obtain code notification",
      "output": "Code notification from the forwarder that concluded the contract with JSC \"Uzbekistan railways\"",
      "entity": "Freight forwarding company",
      "channel": "In person",
      "where": "Freight forwarding company",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Receipt of payment",
       "Agreement on railway transportation services"
      ]
     }
    ]
   },
   {
    "id": "b4",
    "name": "Obtain internal phytosanitary certificate (for tea not in consumer packaging)",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     24,
     72
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Single Window & certification",
    "entities": [
     "Agency of plant quarantine and protection Personal cabinet (Oferta)",
     "Assalom Agro",
     "Bank",
     "Territorial Department of plant quarantine and protection",
     "Warehouse / Location of goods"
    ],
    "stepRange": [
     11,
     18
    ],
    "optionalSteps": [
     15,
     16,
     17
    ],
    "altSteps": [],
    "steps": [
     {
      "num": 11,
      "title": "Obtain offer agreement",
      "output": "Offer agreement for internal phytosanitary certificate",
      "entity": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
      "channel": "Online: obtain",
      "where": "eFito (phytosanitary) efito.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Internet access",
       "Data required to complete offer agreement",
       "Tax Identification Number of the organization or individual",
       "Name of the organization",
       "Full name of an organization's manager",
       "Contact phone number",
       "Agency region",
       "Payment sum"
      ]
     },
     {
      "num": 12,
      "title": "Pay for internal phytosanitary certificate",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Offer agreement for internal phytosanitary certificate",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 13,
      "title": "Apply for internal phytosanitary certificate",
      "output": "Appointment for inspection",
      "entity": "Assalom Agro",
      "channel": "Online: apply",
      "where": "assalomagro.uz assalomagro.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "To access the platform",
       "One ID account",
       "Contact phone number",
       "Email"
      ]
     },
     {
      "num": 14,
      "title": "Undergo phytosanitary inspection",
      "output": "Sealing",
      "entity": "Warehouse / Location of goods",
      "channel": "In person",
      "where": "Warehouse / Location of goods",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 15,
      "title": "Obtain offer agreement for fumigation",
      "output": "Fumigation offer agreement",
      "entity": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
      "channel": "Online: obtain",
      "where": "eFito (phytosanitary) efito.uz",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Internet access",
       "Data required to complete offer agreement",
       "Tax Identification Number of the organization or individual",
       "Name of the organization",
       "Full name of an organization's manager",
       "Type of organization (business entity, budgetary)",
       "Contact phone number",
       "Agency region",
       "Cost on the contract"
      ]
     },
     {
      "num": 16,
      "title": "Pay for fumigation",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Fumigation offer agreement",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 17,
      "title": "Undergo fumigation",
      "output": "Certificate of disinfestation",
      "entity": "Territorial Department of plant quarantine and protection",
      "channel": "In person",
      "where": "Fumigation (disinfection) division",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 18,
      "title": "Obtain internal phytosanitary certificate",
      "output": "Internal phytosanitary certificate",
      "entity": "Assalom Agro",
      "channel": "Online: obtain",
      "where": "assalomagro.uz assalomagro.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "One ID account",
       "Contact phone number",
       "Email"
      ]
     }
    ]
   },
   {
    "id": "b5",
    "name": "Arrange freight transportation by railway",
    "dependsOn": [
     "b2",
     "b3"
    ],
    "level": 1,
    "estDuration": [
     16,
     48
    ],
    "dependencyReason": "Wagon booking needs the rail agreement (b2) and the forwarder code notification (b3).",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Joint Stock Company \"O'zbekiston temir yo'llari\""
    ],
    "stepRange": [
     19,
     22
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 19,
      "title": "Apply for good transportation on specific conditions",
      "output": "Acceptance of application",
      "entity": "Joint Stock Company \"O'zbekiston temir yo'llari\"",
      "channel": "In person",
      "where": "Department of carriage conditions \"Room 313, 3rd Floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Application for good transportation on specific conditions"
      ]
     },
     {
      "num": 20,
      "title": "Apply for freight transportation by railway",
      "output": "Acceptance of application",
      "entity": "Joint Stock Company \"O'zbekiston temir yo'llari\"",
      "channel": "In person",
      "where": "Transportation  Unit \"Room 128, 1st Floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "For submitting application by emails mpo@uzrailway.uz, mpo1@uzrailway.uz, mpo2@uzrailway.uz",
       "Application for cargo transportation GU-12",
       "Application for obtaining approval of cargo transportation",
       "Islamic Republic of Iran approval letter",
       "For submitting application physically",
       "Application for cargo transportation GU-12",
       "Application for obtaining approval of cargo transportation",
       "Islamic Republic of Iran approval letter"
      ]
     },
     {
      "num": 21,
      "title": "Obtain approval for freight transportation by railway",
      "output": "Coordination of transportation with other countries",
      "entity": "Joint Stock Company \"O'zbekiston temir yo'llari\"",
      "channel": "In person",
      "where": "Transportation  Unit \"Room 128, 1st Floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Availability by phone"
      ]
     },
     {
      "num": 22,
      "title": "Obtain order for wagon supply",
      "output": "Order for wagon supply for loading",
      "entity": "Joint Stock Company \"O'zbekiston temir yo'llari\"",
      "channel": "In person",
      "where": "Transportation  Unit \"Room 128, 1st Floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "For submitting application by emails mpo@uzrailway.uz, mpo1@uzrailway.uz, mpo2@uzrailway.uz",
       "Application on letterhead",
       "Application on letterhead (own wagons)",
       "Code notification from the forwarder that concluded the contract with JSC \"Uzbekistan railways\"",
       "For submitting application physically",
       "Power of attorney for Transportation Unit",
       "Passport",
       "Application on letterhead",
       "Application on letterhead (own wagons)",
       "Code notification from the forwarder that concluded the contract with JSC \"Uzbekistan railways\""
      ]
     }
    ]
   },
   {
    "id": "b6",
    "name": "Complete freight loading",
    "dependsOn": [
     "b5",
     "b4"
    ],
    "level": 2,
    "estDuration": [
     10,
     30
    ],
    "dependencyReason": "Loading needs wagons ordered (b5) and goods sealed by the internal phytosanitary process (b4).",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Place of loading / branch line",
     "Railway station"
    ],
    "stepRange": [
     23,
     26
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 23,
      "title": "Apply for allotment of wagons",
      "output": "Permit for allotment of wagons",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Commodity cash desk",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Application on letterhead for allotment of wagons",
       "Order for wagon supply for loading",
       "Certificate on availability of funds at client's account",
       "Passport",
       "Power of attorney for railway station",
       "Certificate on passing examination"
      ]
     },
     {
      "num": 24,
      "title": "Obtain wagons for loading",
      "output": "Signed GU-45 form",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Freight acceptance and handover Room",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 25,
      "title": "Loading",
      "output": "Report of the work done",
      "entity": "Place of loading / branch line",
      "channel": "In person",
      "where": "Place of loading / branch line",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Power of attorney"
      ]
     },
     {
      "num": 26,
      "title": "Obtain railway bill of lading",
      "output": "Export railway bill (SMGS)",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Commodity cash desk",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Commercial invoice"
      ]
     }
    ]
   },
   {
    "id": "b7",
    "name": "Obtain phytosanitary certificate (for tea not in consumer packaging)",
    "dependsOn": [
     "b6"
    ],
    "level": 3,
    "estDuration": [
     10,
     30
    ],
    "dependencyReason": "Border phytosanitary certificate is issued on the loaded, sealed wagon from b6.",
    "lane": "Single Window & certification",
    "entities": [
     "Agency of plant quarantine and protection Personal cabinet (Oferta)",
     "Bank",
     "Border checkpoint for plant quarantine",
     "One-stop service system Single window"
    ],
    "stepRange": [
     27,
     31
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 27,
      "title": "Obtain offer agreement",
      "output": "Offer agreement for phytosanitary certificate",
      "entity": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
      "channel": "Online: obtain",
      "where": "Quarantine cabinet cabinet.karantin.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Data required to complete offer agreement",
       "Tax Identification Number of the organization or individual",
       "Name of the organization",
       "Full name of an organization's manager",
       "Type of organization (business entity, budgetary)",
       "Contact phone number",
       "Agency region",
       "Payment sum",
       "Quantity of transport units"
      ]
     },
     {
      "num": 28,
      "title": "Pay for phytosanitary certificate",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Offer agreement for phytosanitary certificate",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 29,
      "title": "Apply for phytosanitary certificate",
      "output": "Appointment for phytosanitary control",
      "entity": "One-stop service system Single window",
      "channel": "Online: apply",
      "where": "Single Window singlewindow.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Online application for phytosanitary certificate"
      ]
     },
     {
      "num": 30,
      "title": "Undergo phytosanitary inspection",
      "output": "Visual inspection",
      "entity": "Border checkpoint for plant quarantine",
      "channel": "In person",
      "where": "Office of the inspector on the border checkpoint for plant quarantine",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 31,
      "title": "Obtain phytosanitary certificate",
      "output": "Phytosanitary certificate",
      "entity": "Border checkpoint for plant quarantine",
      "channel": "In person",
      "where": "Office of the inspector on the border checkpoint for plant quarantine",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     }
    ]
   },
   {
    "id": "b8",
    "name": "Obtain certificate of origin",
    "dependsOn": [],
    "level": 0,
    "estDuration": [
     24,
     72
    ],
    "dependencyReason": "Independent track — can start as soon as the case opens, no upstream block required.",
    "lane": "Single Window & certification",
    "entities": [
     "Bank",
     "One-stop service system Single window",
     "Warehouse / Location of goods",
     "“Uzbekexpertiza” JSC",
     "“Uzbekexpertiza” JSC service portal"
    ],
    "stepRange": [
     32,
     40
    ],
    "optionalSteps": [],
    "altSteps": [
     36,
     40
    ],
    "steps": [
     {
      "num": 32,
      "title": "Conclude contract for services",
      "output": "Contract with Uzbekexpertiza",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Deputy Chief of the Department of examination of preferential goods \"Room 36, 3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     },
     {
      "num": 33,
      "title": "Pay for certificate of origin",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Payment methods information page uzbekistan.tradeportal.org",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Invoice for prepayment",
       "For physical payment",
       "Physical presence",
       "Passport",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 34,
      "title": "Apply for certificate of origin",
      "output": "Assignment of expert on certification",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Deputy Chief of the Department of examination of preferential goods \"Room 36, 3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Application for obtaining of Certificate of origin for exported goods",
       "Application for obtaining of Certificate of origin for exported goods",
       "Commercial invoice",
       "Any document confirming the exporter's right to use a land plot",
       "Any document confirming purchase of agricultural products"
      ]
     },
     {
      "num": 35,
      "title": "Apply for certificate of origin via Uzbekexpertiza service portal",
      "output": "Appointment with an expert on certification",
      "entity": "“Uzbekexpertiza” JSC service portal",
      "channel": "Online: apply",
      "where": "Uzbekexpertiza service portal application.expertiza.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "One ID account",
       "Online application for certificate of origin",
       "Commercial invoice",
       "Any document confirming the exporter's right to use a land plot",
       "Any document confirming purchase of agricultural products"
      ]
     },
     {
      "num": 36,
      "title": "Apply for certificate of origin via Single Window",
      "output": "Appointment with an expert on certification",
      "entity": "One-stop service system Single window",
      "channel": "Online: apply",
      "where": "Single Window singlewindow.uz",
      "performedBy": "",
      "optional": false,
      "alternative": true,
      "inputs": [
       "Electronic digital signature",
       "Online application for certificate of origin",
       "Commercial invoice",
       "Any document confirming the exporter's right to use a land plot",
       "Any document confirming purchase of agricultural products"
      ]
     },
     {
      "num": 37,
      "title": "Assessment of application",
      "output": "Appointment for cargo expertise",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Department of Examination of Preferential Goods \"3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 38,
      "title": "Undergo expertise of goods",
      "output": "Undergo expertise",
      "entity": "Warehouse / Location of goods",
      "channel": "In person",
      "where": "Warehouse / Location of goods",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 39,
      "title": "Obtain certificate of origin",
      "output": "Certificate of origin",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Department of Examination of Preferential Goods \"3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence"
      ]
     },
     {
      "num": 40,
      "title": "Obtain expert conclusion",
      "output": "Expert conclusion",
      "entity": "“Uzbekexpertiza” JSC",
      "channel": "In person",
      "where": "Department of Examination of Preferential Goods \"3rd floor\"",
      "performedBy": "",
      "optional": false,
      "alternative": true,
      "inputs": [
       "Physical presence"
      ]
     }
    ]
   },
   {
    "id": "b9",
    "name": "Undergo customs clearance",
    "dependsOn": [
     "b7",
     "b8"
    ],
    "level": 4,
    "estDuration": [
     12,
     40
    ],
    "dependencyReason": "Customs declaration needs the border phytosanitary certificate (b7) and the certificate of origin (b8, run as an independent paperwork track from day 0).",
    "lane": "Customs / SCC",
    "entities": [
     "Bank",
     "Customs post of foreign trade activity",
     "Personal cabinet of participant of foreign economic activity",
     "Warehouse / Location of goods"
    ],
    "stepRange": [
     41,
     46
    ],
    "optionalSteps": [
     44
    ],
    "altSteps": [],
    "steps": [
     {
      "num": 41,
      "title": "Create export customs declaration",
      "output": "Electronic form of customs declaration",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: apply",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Identification number of foreign trade contract",
       "Commercial invoice",
       "Export railway bill (SMGS)",
       "Documents that are not obligatory to submit for export declaration",
       "Phytosanitary certificate",
       "Certificate of origin",
       "Certificate of origin form A",
       "Certificate of origin General form"
      ]
     },
     {
      "num": 42,
      "title": "Pay for customs fee",
      "output": "Receipt of payment",
      "entity": "Bank",
      "channel": "Online: pay",
      "where": "Trade info portal uztradeinfo.uz",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Bank details of territorial customs departments",
       "For physical payment",
       "Physical presence",
       "For online payment (without necessity to visit a bank)",
       "Online banking account"
      ]
     },
     {
      "num": 43,
      "title": "Submit export customs declaration",
      "output": "Customs declaration submitted",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: submit",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature",
       "Electronic form of customs declaration"
      ]
     },
     {
      "num": 44,
      "title": "Undergo customs inspection in red corridor",
      "output": "Undergo documentary control",
      "entity": "Warehouse / Location of goods",
      "channel": "In person",
      "where": "Warehouse / Location of goods",
      "performedBy": "",
      "optional": true,
      "alternative": false,
      "inputs": [
       "Export customs declaration",
       "Export railway bill (SMGS)",
       "Commercial invoice",
       "Physical presence",
       "Passport",
       "Power of attorney"
      ]
     },
     {
      "num": 45,
      "title": "Obtain export customs declaration",
      "output": "Export customs declaration",
      "entity": "Personal cabinet of participant of foreign economic activity",
      "channel": "Online: obtain",
      "where": "Customs e-declaration cabinet (SCC) ed1.customs.uz",
      "performedBy": "trader or customs broker",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Electronic digital signature"
      ]
     },
     {
      "num": 46,
      "title": "Obtain stamps on shipping documents",
      "output": "Export railway bill stamped by customs inspector",
      "entity": "Customs post of foreign trade activity",
      "channel": "In person",
      "where": "Group of customs control and customs clearance",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Export railway bill (SMGS)",
       "Commercial invoice",
       "Export customs declaration"
      ]
     }
    ]
   },
   {
    "id": "b10",
    "name": "Dispatch freight",
    "dependsOn": [
     "b9"
    ],
    "level": 5,
    "estDuration": [
     4,
     12
    ],
    "dependencyReason": "Dispatch follows the customs stamp obtained in b9.",
    "lane": "Transport & E-Tranzit",
    "entities": [
     "Railway station"
    ],
    "stepRange": [
     47,
     48
    ],
    "optionalSteps": [],
    "altSteps": [],
    "steps": [
     {
      "num": 47,
      "title": "Close memo of handover specialist",
      "output": "Signed GU-45 form",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Freight acceptance and handover Room",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Physical presence",
       "Application for wagon handover"
      ]
     },
     {
      "num": 48,
      "title": "Dispatch freight",
      "output": "Duplicate of railway bill with datestamp",
      "entity": "Railway station",
      "channel": "In person",
      "where": "Commodity cash desk",
      "performedBy": "",
      "optional": false,
      "alternative": false,
      "inputs": [
       "Export railway bill (SMGS)",
       "Package of documents"
      ]
     }
    ]
   }
  ],
  "entityDirectory": [
   {
    "name": "Single portal of interactive state services",
    "steps": "1",
    "lane": "Other government",
    "contact": "✉ epigu@egov.uz ☎ +998 55 501 36 19,  +998 55 501 36 17 🌐 https://my.gov.uz/, https://my.gov.uz/ru/site/feedback"
   },
   {
    "name": "Uzbekistan railways Single window",
    "steps": "2, 3, 5",
    "lane": "Single Window & certification",
    "contact": "✉ git@railway.uz ☎ +998 71 238 88 02 🌐 https://e-nakl.railway.uz/"
   },
   {
    "name": "Bank",
    "steps": "4, 9, 12, 16, 28, 33, 42",
    "lane": "Bank",
    "contact": ""
   },
   {
    "name": "Tashkent regional railway junction",
    "steps": "6",
    "lane": "Transport & E-Tranzit",
    "contact": "✉ rju-1@railway.uz ☎ +998 71 299 96 20 🌐 http://tashkent.railway.uz/en/"
   },
   {
    "name": "Freight forwarding company",
    "steps": "7, 8, 10",
    "lane": "Transport & E-Tranzit",
    "contact": ""
   },
   {
    "name": "Agency of plant quarantine and protection Personal cabinet (Oferta)",
    "steps": "11, 15, 27",
    "lane": "Single Window & certification",
    "contact": "✉ info@karantin.uz 🌐 https://efito.uz/invoice/, http://karantin.uz/"
   },
   {
    "name": "Assalom Agro",
    "steps": "13, 18",
    "lane": "Single Window & certification",
    "contact": "✉ assalomagro@gmail.com, info@5x5.uz ☎ +998 55 502 55 75, +998 98 198 14 02 🌐 https://assalomagro.uz/en"
   },
   {
    "name": "Warehouse / Location of goods",
    "steps": "14, 38, 44",
    "lane": "Transport & E-Tranzit",
    "contact": ""
   },
   {
    "name": "Territorial Department of plant quarantine and protection",
    "steps": "17",
    "lane": "Single Window & certification",
    "contact": ""
   },
   {
    "name": "Joint Stock Company \"O'zbekiston temir yo'llari\"",
    "steps": "19, 20, 21, 22",
    "lane": "Transport & E-Tranzit",
    "contact": "✉ info@uzrailway.uz ☎ +998 71 237 99 98, 1005 🌐 https://railway.uz/en/"
   },
   {
    "name": "Railway station",
    "steps": "23, 24, 26, 47, 48",
    "lane": "Transport & E-Tranzit",
    "contact": ""
   },
   {
    "name": "Place of loading / branch line",
    "steps": "25",
    "lane": "Transport & E-Tranzit",
    "contact": ""
   },
   {
    "name": "One-stop service system Single window",
    "steps": "29, 36",
    "lane": "Single Window & certification",
    "contact": "☎ +998 78 120 76 08 (Int. 5603, 5646, 5606, 5885) , +998 78 120 76 00 (Int. 5603, 5646, 5606, 5885) 🌐 http://singlewindow.uz/index.jsp, http://sw2.customs.uz/"
   },
   {
    "name": "Border checkpoint for plant quarantine",
    "steps": "30, 31",
    "lane": "Single Window & certification",
    "contact": ""
   },
   {
    "name": "“Uzbekexpertiza” JSC",
    "steps": "32, 34, 37, 39, 40",
    "lane": "Single Window & certification",
    "contact": "✉ info1@expertiza.uz, expertiza@exat.uz ☎ +998 71 230 23 64, +998 71 230 23 60 🌐 http://www.expertiza.uz/, http://t.me/uzbekexpertiza_bot"
   },
   {
    "name": "“Uzbekexpertiza” JSC service portal",
    "steps": "35",
    "lane": "Single Window & certification",
    "contact": "🌐 http://application.expertiza.uz/expertiza/#/, http://www.expertiza.uz/"
   },
   {
    "name": "Personal cabinet of participant of foreign economic activity",
    "steps": "41, 43, 45",
    "lane": "Customs / SCC",
    "contact": "🌐 http://ed1.customs.uz, http://ed2.customs.uz"
   },
   {
    "name": "Customs post of foreign trade activity",
    "steps": "46",
    "lane": "Customs / SCC",
    "contact": ""
   }
  ]
 }
};
