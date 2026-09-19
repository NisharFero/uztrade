/* GENERATED FILE - do not edit by hand.
 * Source: Docs/Procedures/*.docx -> scripts/data/extract-all.mjs -> scripts/data/procedures/*.json
 * Regenerate: node scripts/data/extract-all.mjs && node scripts/data/build-procedures.mjs
 *
 * This module holds the types and the catalogue of all 243 published
 * procedures. A procedure's workflow - its blocks, steps and step inputs - is
 * 3.6 MB across the corpus, so it is served from public/data/procedures/<id>.json
 * and loaded on demand by modules/procedures/registry.ts.
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

export type Direction = "import" | "export" | "transit";

/** "any" is a service procedure: obtaining one document or registering one
 *  contract, which no single transport mode belongs to. */
export type TransportMode = "train" | "air" | "road" | "any";

/** "customs": clearing named goods across the border. "logistics": arranging
 *  or taking delivery of any cargo, and transit. "service": obtaining one
 *  document or registering one contract. */
export type ProcedureKind = "customs" | "logistics" | "service";

/** What the catalogue knows about every procedure without loading its workflow. */
export type ProcedureSummary = {
  id: string;
  title: string;
  direction: Direction;
  goods: string;
  mode: TransportMode;
  kind: ProcedureKind;
  /** [min, max] hours end to end, as published. */
  timeframe: [number, number];
  blocksCount: number;
  stepsCount: number;
  onlineCount: number;
  entities: string[];
};

export type Procedure = {
  id: string;
  title: string;
  direction: Direction;
  goods: string;
  mode: TransportMode;
  kind: ProcedureKind;
  timeframe: [number, number];
  stepsCount: number;
  blocks: ProcedureBlock[];
  entityDirectory: EntityRef[];
};

/** Every published procedure in Docs/Procedures, by id. */
export const PROCEDURE_IDS = ["32","33","46","49","54","55","57","105","109","125","126","127","128","130","131","135","137","138","140","143","145","158","161","165","169","175","176","178","184","191","198","202","208","209","210","217","219","220","223","224","229","230","233","244","251","252","254","260","264","271","273","280","281","284","286","288","290","292","295","303","304","306","318","320","321","325","332","333","340","344","345","347","348","352","353","354","359","360","385","400","402","412","436","440","451","458","459","466","470","476","477","482","483","487","488","496","497","499","500","507","512","514","518","519","522","537","540","541","543","548","550","555","556","557","561","562","563","570","572","576","584","585","587","591","593","596","598","600","611","626","660","668","672","678","680","685","687","707","710","714","715","716","718","720","724","725","735","738","739","740","741","742","744","746","748","750","752","753","754","755","757","758","760","761","762","763","764","765","766","767","769","770","771","772","774","775","776","777","779","780","782","783","784","785","787","788","789","793","795","796","801","804","805","806","819","824","827","828","835","838","839","861","865","866","868","877","884","888","891","911","924","925","934","935","948","949","953","983","984","993","994","1000","1001","1002","1007","1012","1046","1047","1051","1052","1070","1092","1096","1101","1104","1105","1108","1113","1116","1122","1141","1155","1179"] as const;

export type ProcedureId = (typeof PROCEDURE_IDS)[number];

/** Title, goods, mode and counts for every procedure - what listing, search
 *  and intake matching read. The workflow itself comes from the registry. */
export const CATALOGUE: Record<string, ProcedureSummary> = {
 "32": {
  "id": "32",
  "title": "Export of fresh fruits and vegetables by road",
  "direction": "export",
  "goods": "fresh fruits and vegetables",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   29,
   89
  ],
  "blocksCount": 7,
  "stepsCount": 42,
  "onlineCount": 17,
  "entities": [
   "Single portal of interactive state services",
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "Assalom Agro",
   "Warehouse / Location of goods",
   "Territorial Department of plant quarantine and protection",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Border checkpoint for plant quarantine",
   "Transportation company",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "33": {
  "id": "33",
  "title": "Export of fruit and vegetable juices by road",
  "direction": "export",
  "goods": "fruit and vegetable juices",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   15,
   52
  ],
  "blocksCount": 5,
  "stepsCount": 27,
  "onlineCount": 8,
  "entities": [
   "Single portal of interactive state services",
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Transportation company",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "46": {
  "id": "46",
  "title": "Import of flour by road",
  "direction": "import",
  "goods": "flour",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   39,
   169
  ],
  "blocksCount": 10,
  "stepsCount": 50,
  "onlineCount": 27,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Single portal of interactive state services",
   "Customs warehouse",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Territorial Department of plant quarantine and protection",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "49": {
  "id": "49",
  "title": "Import of pharmaceutical products by road",
  "direction": "import",
  "goods": "pharmaceutical products",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   82,
   275
  ],
  "blocksCount": 9,
  "stepsCount": 37,
  "onlineCount": 18,
  "entities": [
   "State center for expertise and standardization of medicines official web-site",
   "Single portal of interactive state services",
   "Customs warehouse",
   "Bank",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "State center for expertise and standardization of medicines, medical devices and medical equipment",
   "Electronic document management systems",
   "Online banking system"
  ]
 },
 "54": {
  "id": "54",
  "title": "Import of mineral fertilizers by road",
  "direction": "import",
  "goods": "mineral fertilizers",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   27,
   183
  ],
  "blocksCount": 8,
  "stepsCount": 35,
  "onlineCount": 15,
  "entities": [
   "Single portal of interactive state services",
   "Customs warehouse",
   "Bank",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "Certification body of fertilizers, pesticides and chemical protection of plants",
   "Online banking system"
  ]
 },
 "55": {
  "id": "55",
  "title": "Import of medical equipment by road",
  "direction": "import",
  "goods": "medical equipment",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   82,
   275
  ],
  "blocksCount": 9,
  "stepsCount": 37,
  "onlineCount": 18,
  "entities": [
   "State center for expertise and standardization of medicines official web-site",
   "Single portal of interactive state services",
   "Customs warehouse",
   "Bank",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "State center for expertise and standardization of medicines, medical devices and medical equipment",
   "Electronic document management systems",
   "Online banking system"
  ]
 },
 "57": {
  "id": "57",
  "title": "Import of animal or vegetable fertilizers by road",
  "direction": "import",
  "goods": "animal or vegetable fertilizers",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   45,
   517
  ],
  "blocksCount": 12,
  "stepsCount": 58,
  "onlineCount": 33,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Single portal of interactive state services",
   "Customs warehouse",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Territorial Department of plant quarantine and protection",
   "Warehouse / Location of goods",
   "Certification body of fertilizers, pesticides and chemical protection of plants",
   "Online banking system"
  ]
 },
 "105": {
  "id": "105",
  "title": "Import of confectionery by road",
  "direction": "import",
  "goods": "confectionery",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   21,
   83
  ],
  "blocksCount": 8,
  "stepsCount": 37,
  "onlineCount": 17,
  "entities": [
   "Single portal of interactive state services",
   "Customs warehouse",
   "Bank",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "109": {
  "id": "109",
  "title": "Import of dairy products by road",
  "direction": "import",
  "goods": "dairy products",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   63,
   371
  ],
  "blocksCount": 10,
  "stepsCount": 47,
  "onlineCount": 25,
  "entities": [
   "One-stop service system Single window",
   "Bank",
   "Single portal of interactive state services",
   "Customs warehouse",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Warehouse / Location of goods",
   "Online banking system"
  ]
 },
 "125": {
  "id": "125",
  "title": "Export of confectionery by road",
  "direction": "export",
  "goods": "confectionery",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   15,
   52
  ],
  "blocksCount": 5,
  "stepsCount": 27,
  "onlineCount": 8,
  "entities": [
   "Single portal of interactive state services",
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Transportation company",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "126": {
  "id": "126",
  "title": "Contract customs broker",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   0,
   0
  ],
  "blocksCount": 1,
  "stepsCount": 1,
  "onlineCount": 0,
  "entities": [
   "Customs broker"
  ]
 },
 "127": {
  "id": "127",
  "title": "Registration of export contract",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   0,
   0
  ],
  "blocksCount": 1,
  "stepsCount": 1,
  "onlineCount": 1,
  "entities": [
   "Single portal of interactive state services"
  ]
 },
 "128": {
  "id": "128",
  "title": "Obtain insurance policy",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   8,
   19
  ],
  "blocksCount": 1,
  "stepsCount": 4,
  "onlineCount": 0,
  "entities": [
   "Insurance company"
  ]
 },
 "130": {
  "id": "130",
  "title": "Arrange cargo transportation by road",
  "direction": "export",
  "goods": "any cargo",
  "mode": "road",
  "kind": "logistics",
  "timeframe": [
   11,
   30
  ],
  "blocksCount": 1,
  "stepsCount": 5,
  "onlineCount": 0,
  "entities": [
   "Transportation company",
   "Warehouse / Location of goods"
  ]
 },
 "131": {
  "id": "131",
  "title": "Clearance of confectionery by road",
  "direction": "import",
  "goods": "confectionery",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   2,
   12
  ],
  "blocksCount": 2,
  "stepsCount": 13,
  "onlineCount": 4,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "135": {
  "id": "135",
  "title": "Clearance of confectionery by road",
  "direction": "import",
  "goods": "confectionery",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   6,
   32
  ],
  "blocksCount": 5,
  "stepsCount": 27,
  "onlineCount": 10,
  "entities": [
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs warehouse",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Online banking system",
   "Bank"
  ]
 },
 "137": {
  "id": "137",
  "title": "Registration of import contract",
  "direction": "import",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   0,
   0
  ],
  "blocksCount": 1,
  "stepsCount": 1,
  "onlineCount": 1,
  "entities": [
   "Single portal of interactive state services"
  ]
 },
 "138": {
  "id": "138",
  "title": "Contract customs warehouse",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   2,
   3
  ],
  "blocksCount": 1,
  "stepsCount": 2,
  "onlineCount": 1,
  "entities": [
   "Customs warehouse",
   "Bank"
  ]
 },
 "140": {
  "id": "140",
  "title": "Obtain sanitary-epidemiological conclusion",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   13,
   48
  ],
  "blocksCount": 1,
  "stepsCount": 7,
  "onlineCount": 5,
  "entities": [
   "One-stop service system Single window",
   "Customs warehouse",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Bank"
  ]
 },
 "143": {
  "id": "143",
  "title": "Export of dairy products by road",
  "direction": "export",
  "goods": "dairy products",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   26,
   84
  ],
  "blocksCount": 7,
  "stepsCount": 35,
  "onlineCount": 14,
  "entities": [
   "Single portal of interactive state services",
   "One-stop service system Single window",
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "Warehouse / Location of goods",
   "Transportation company",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "145": {
  "id": "145",
  "title": "Export of seed oil by road",
  "direction": "export",
  "goods": "seed oil",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   14,
   52
  ],
  "blocksCount": 5,
  "stepsCount": 27,
  "onlineCount": 8,
  "entities": [
   "Single portal of interactive state services",
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Transportation company",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "158": {
  "id": "158",
  "title": "Obtain phytosanitary certificate for package and pallets",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   5,
   13
  ],
  "blocksCount": 1,
  "stepsCount": 8,
  "onlineCount": 5,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Border checkpoint for plant quarantine",
   "Territorial Department of plant quarantine and protection"
  ]
 },
 "161": {
  "id": "161",
  "title": "Clearance of fruit and vegetable juices by road",
  "direction": "export",
  "goods": "fruit and vegetable juices",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   2,
   12
  ],
  "blocksCount": 2,
  "stepsCount": 13,
  "onlineCount": 4,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "165": {
  "id": "165",
  "title": "Export of meat and meat products by road",
  "direction": "export",
  "goods": "meat and meat products",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   25,
   82
  ],
  "blocksCount": 7,
  "stepsCount": 35,
  "onlineCount": 14,
  "entities": [
   "Single portal of interactive state services",
   "One-stop service system Single window",
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "Warehouse / Location of goods",
   "Transportation company",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "169": {
  "id": "169",
  "title": "Clearance of meat and meat products by road",
  "direction": "import",
  "goods": "meat and meat products",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   2,
   12
  ],
  "blocksCount": 2,
  "stepsCount": 14,
  "onlineCount": 4,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "175": {
  "id": "175",
  "title": "Clearance of dairy products by road",
  "direction": "import",
  "goods": "dairy products",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   4,
   15
  ],
  "blocksCount": 2,
  "stepsCount": 14,
  "onlineCount": 4,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "176": {
  "id": "176",
  "title": "Clearance of seed oil by road",
  "direction": "import",
  "goods": "seed oil",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   1,
   12
  ],
  "blocksCount": 2,
  "stepsCount": 13,
  "onlineCount": 4,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "178": {
  "id": "178",
  "title": "Obtain veterinary certificate for export",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   1,
   5
  ],
  "blocksCount": 1,
  "stepsCount": 5,
  "onlineCount": 4,
  "entities": [
   "One-stop service system Single window",
   "Bank",
   "Warehouse / Location of goods"
  ]
 },
 "184": {
  "id": "184",
  "title": "Import of meat and meat products by road",
  "direction": "import",
  "goods": "meat and meat products",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   63,
   371
  ],
  "blocksCount": 10,
  "stepsCount": 47,
  "onlineCount": 25,
  "entities": [
   "One-stop service system Single window",
   "Bank",
   "Single portal of interactive state services",
   "Customs warehouse",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Warehouse / Location of goods",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "191": {
  "id": "191",
  "title": "Recover transportation costs for export of poultry meat and edible offal",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   48,
   113
  ],
  "blocksCount": 1,
  "stepsCount": 3,
  "onlineCount": 1,
  "entities": [
   "The Export promotion agency",
   "Online banking system"
  ]
 },
 "198": {
  "id": "198",
  "title": "Obtain phytosanitary certificate",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   5,
   13
  ],
  "blocksCount": 1,
  "stepsCount": 5,
  "onlineCount": 3,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Border checkpoint for plant quarantine"
  ]
 },
 "202": {
  "id": "202",
  "title": "Obtain veterinary permit",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   8,
   24
  ],
  "blocksCount": 1,
  "stepsCount": 2,
  "onlineCount": 2,
  "entities": [
   "One-stop service system Single window"
  ]
 },
 "208": {
  "id": "208",
  "title": "Obtain veterinary permit",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   8,
   243
  ],
  "blocksCount": 1,
  "stepsCount": 4,
  "onlineCount": 4,
  "entities": [
   "One-stop service system Single window",
   "Bank"
  ]
 },
 "209": {
  "id": "209",
  "title": "Obtain certificate of origin form CT-1",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   2,
   10
  ],
  "blocksCount": 1,
  "stepsCount": 8,
  "onlineCount": 3,
  "entities": [
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods"
  ]
 },
 "210": {
  "id": "210",
  "title": "Obtain certificate of origin form A",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   2,
   10
  ],
  "blocksCount": 1,
  "stepsCount": 8,
  "onlineCount": 3,
  "entities": [
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods"
  ]
 },
 "217": {
  "id": "217",
  "title": "Clearance of dairy products by road",
  "direction": "import",
  "goods": "dairy products",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   7,
   33
  ],
  "blocksCount": 5,
  "stepsCount": 28,
  "onlineCount": 10,
  "entities": [
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs warehouse",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Online banking system",
   "Bank"
  ]
 },
 "219": {
  "id": "219",
  "title": "Obtain veterinary certificate for import",
  "direction": "import",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   1,
   5
  ],
  "blocksCount": 1,
  "stepsCount": 5,
  "onlineCount": 4,
  "entities": [
   "One-stop service system Single window",
   "Bank",
   "Warehouse / Location of goods"
  ]
 },
 "220": {
  "id": "220",
  "title": "Obtain sanitary and epidemiological conclusion",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   45,
   88
  ],
  "blocksCount": 1,
  "stepsCount": 7,
  "onlineCount": 5,
  "entities": [
   "One-stop service system Single window",
   "Customs warehouse",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Bank"
  ]
 },
 "223": {
  "id": "223",
  "title": "Import of vegetable oils for consumers' use and consumption by road",
  "direction": "import",
  "goods": "vegetable oils for consumers' use and consumption",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   45,
   83
  ],
  "blocksCount": 8,
  "stepsCount": 37,
  "onlineCount": 17,
  "entities": [
   "Single portal of interactive state services",
   "Customs warehouse",
   "Bank",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "224": {
  "id": "224",
  "title": "Import of vegetable oils for technical or industrial use by road",
  "direction": "import",
  "goods": "vegetable oils for technical or industrial use",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   4,
   20
  ],
  "blocksCount": 4,
  "stepsCount": 20,
  "onlineCount": 7,
  "entities": [
   "Single portal of interactive state services",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs warehouse",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Online banking system"
  ]
 },
 "229": {
  "id": "229",
  "title": "Clearance of vegetable oils for consumers' use and consumption by road",
  "direction": "import",
  "goods": "vegetable oils for consumers' use and consumption",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   6,
   32
  ],
  "blocksCount": 5,
  "stepsCount": 27,
  "onlineCount": 10,
  "entities": [
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs warehouse",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Online banking system",
   "Bank"
  ]
 },
 "230": {
  "id": "230",
  "title": "Clearance of vegetable oils for technical or industrial use by road",
  "direction": "import",
  "goods": "vegetable oils for technical or industrial use",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   4,
   20
  ],
  "blocksCount": 3,
  "stepsCount": 19,
  "onlineCount": 6,
  "entities": [
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs warehouse",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Online banking system"
  ]
 },
 "233": {
  "id": "233",
  "title": "Obtain certificate of origin General form",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   2,
   10
  ],
  "blocksCount": 1,
  "stepsCount": 8,
  "onlineCount": 3,
  "entities": [
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods"
  ]
 },
 "244": {
  "id": "244",
  "title": "Obtain quarantine permit",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   4,
   42
  ],
  "blocksCount": 1,
  "stepsCount": 4,
  "onlineCount": 4,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window"
  ]
 },
 "251": {
  "id": "251",
  "title": "Clearance of animal or vegetable fertilizers by road",
  "direction": "import",
  "goods": "animal or vegetable fertilizers",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   6,
   33
  ],
  "blocksCount": 5,
  "stepsCount": 29,
  "onlineCount": 10,
  "entities": [
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs warehouse",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Online banking system",
   "Bank"
  ]
 },
 "252": {
  "id": "252",
  "title": "Obtain quarantine inspection act",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   5,
   43
  ],
  "blocksCount": 1,
  "stepsCount": 8,
  "onlineCount": 6,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Customs warehouse",
   "Territorial Department of plant quarantine and protection"
  ]
 },
 "254": {
  "id": "254",
  "title": "Obtain certificate of conformity",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   19,
   148
  ],
  "blocksCount": 1,
  "stepsCount": 5,
  "onlineCount": 3,
  "entities": [
   "One-stop service system Single window",
   "Certification body of fertilizers, pesticides and chemical protection of plants",
   "Online banking system",
   "Customs warehouse"
  ]
 },
 "260": {
  "id": "260",
  "title": "Clearance of flour by road",
  "direction": "import",
  "goods": "flour",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   6,
   33
  ],
  "blocksCount": 5,
  "stepsCount": 28,
  "onlineCount": 10,
  "entities": [
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs warehouse",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Online banking system",
   "Bank"
  ]
 },
 "264": {
  "id": "264",
  "title": "Obtain registration certificate for pharmaceutical products",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   450,
   1524
  ],
  "blocksCount": 1,
  "stepsCount": 8,
  "onlineCount": 2,
  "entities": [
   "Darmon",
   "State center for expertise and standardization of medicines, medical devices and medical equipment",
   "Foreign bank"
  ]
 },
 "271": {
  "id": "271",
  "title": "Obtain certificate of conformity",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   74,
   239
  ],
  "blocksCount": 1,
  "stepsCount": 6,
  "onlineCount": 5,
  "entities": [
   "One-stop service system Single window",
   "State center for expertise and standardization of medicines, medical devices and medical equipment",
   "Customs warehouse",
   "Electronic document management systems",
   "Online banking system"
  ]
 },
 "273": {
  "id": "273",
  "title": "Obtain registration certificate",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   162,
   1514
  ],
  "blocksCount": 1,
  "stepsCount": 7,
  "onlineCount": 0,
  "entities": [
   "State center for expertise and standardization of medicines, medical devices and medical equipment",
   "Foreign bank",
   "Place of medical equipment installation"
  ]
 },
 "280": {
  "id": "280",
  "title": "Obtain certificate of conformity for equipment not requiring pre-installation",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   74,
   239
  ],
  "blocksCount": 1,
  "stepsCount": 6,
  "onlineCount": 5,
  "entities": [
   "One-stop service system Single window",
   "State center for expertise and standardization of medicines, medical devices and medical equipment",
   "Customs warehouse",
   "Electronic document management systems",
   "Online banking system"
  ]
 },
 "281": {
  "id": "281",
  "title": "Export of dairy products by train",
  "direction": "export",
  "goods": "dairy products",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   76,
   235
  ],
  "blocksCount": 10,
  "stepsCount": 41,
  "onlineCount": 19,
  "entities": [
   "Single portal of interactive state services",
   "One-stop service system Single window",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Warehouse / Location of goods",
   "Railway station",
   "Place of loading / branch line",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "284": {
  "id": "284",
  "title": "Clearance of dairy products by train",
  "direction": "import",
  "goods": "dairy products",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   2,
   12
  ],
  "blocksCount": 1,
  "stepsCount": 6,
  "onlineCount": 4,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Warehouse / Location of goods",
   "Customs post of foreign trade activity"
  ]
 },
 "286": {
  "id": "286",
  "title": "Arrange cargo transportation by train physically",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   63,
   189
  ],
  "blocksCount": 5,
  "stepsCount": 21,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Place of loading / branch line"
  ]
 },
 "288": {
  "id": "288",
  "title": "Import of dairy products by train",
  "direction": "import",
  "goods": "dairy products",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   66,
   386
  ],
  "blocksCount": 15,
  "stepsCount": 50,
  "onlineCount": 27,
  "entities": [
   "One-stop service system Single window",
   "Bank",
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Warehouse / Location of goods",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "290": {
  "id": "290",
  "title": "Register in the REX system to export to the European Union",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   2,
   10
  ],
  "blocksCount": 3,
  "stepsCount": 7,
  "onlineCount": 1,
  "entities": [
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "Warehouse / Location of goods"
  ]
 },
 "292": {
  "id": "292",
  "title": "Obtain veterinary certificate for export",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   1,
   5
  ],
  "blocksCount": 1,
  "stepsCount": 5,
  "onlineCount": 4,
  "entities": [
   "One-stop service system Single window",
   "Bank",
   "Warehouse / Location of goods"
  ]
 },
 "295": {
  "id": "295",
  "title": "Clearance of dairy products by train",
  "direction": "import",
  "goods": "dairy products",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   4,
   28
  ],
  "blocksCount": 4,
  "stepsCount": 16,
  "onlineCount": 8,
  "entities": [
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Online banking system",
   "Customs warehouse",
   "Bank"
  ]
 },
 "303": {
  "id": "303",
  "title": "Arrange cargo transportation by train physically",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   63,
   189
  ],
  "blocksCount": 5,
  "stepsCount": 21,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Place of loading / branch line"
  ]
 },
 "304": {
  "id": "304",
  "title": "Export of fruit and vegetable juices by train",
  "direction": "export",
  "goods": "fruit and vegetable juices",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   67,
   206
  ],
  "blocksCount": 8,
  "stepsCount": 34,
  "onlineCount": 13,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Railway station",
   "Place of loading / branch line",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "306": {
  "id": "306",
  "title": "Export of dried fruits by train",
  "direction": "export",
  "goods": "dried fruits",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   81,
   241
  ],
  "blocksCount": 10,
  "stepsCount": 48,
  "onlineCount": 22,
  "entities": [
   "Single portal of interactive state services",
   "Bank",
   "Tashkent regional railway junction",
   "Uzbekistan railways Single window",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Assalom Agro",
   "Territorial Department of plant quarantine and protection",
   "Warehouse / Location of goods",
   "One-stop service system Single window",
   "“Uzbekexpertiza” JSC",
   "“Uzbekexpertiza” JSC service portal",
   "Place of loading / branch line",
   "Railway station",
   "Border checkpoint for plant quarantine",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity"
  ]
 },
 "318": {
  "id": "318",
  "title": "Arrange cargo transportation by train physically",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   63,
   189
  ],
  "blocksCount": 5,
  "stepsCount": 21,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Place of loading / branch line"
  ]
 },
 "320": {
  "id": "320",
  "title": "Clearance of dried fruits by road",
  "direction": "import",
  "goods": "dried fruits",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   2,
   13
  ],
  "blocksCount": 2,
  "stepsCount": 14,
  "onlineCount": 4,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "321": {
  "id": "321",
  "title": "Clearance of dried fruits by train",
  "direction": "import",
  "goods": "dried fruits",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   2,
   12
  ],
  "blocksCount": 1,
  "stepsCount": 6,
  "onlineCount": 4,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Customs post of foreign trade activity",
   "Warehouse / Location of goods"
  ]
 },
 "325": {
  "id": "325",
  "title": "Export of fresh fruits and vegetables by train",
  "direction": "export",
  "goods": "fresh fruits and vegetables",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   81,
   241
  ],
  "blocksCount": 10,
  "stepsCount": 48,
  "onlineCount": 22,
  "entities": [
   "Single portal of interactive state services",
   "Bank",
   "Tashkent regional railway junction",
   "Uzbekistan railways Single window",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Assalom Agro",
   "Territorial Department of plant quarantine and protection",
   "Warehouse / Location of goods",
   "One-stop service system Single window",
   "“Uzbekexpertiza” JSC",
   "“Uzbekexpertiza” JSC service portal",
   "Border checkpoint for plant quarantine",
   "Place of loading / branch line",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity"
  ]
 },
 "332": {
  "id": "332",
  "title": "Export of cotton yarn by train",
  "direction": "export",
  "goods": "cotton yarn",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   44,
   130
  ],
  "blocksCount": 8,
  "stepsCount": 34,
  "onlineCount": 14,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Railway station",
   "Place of loading / branch line",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "333": {
  "id": "333",
  "title": "Export of cotton yarn by road",
  "direction": "export",
  "goods": "cotton yarn",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   21,
   116
  ],
  "blocksCount": 7,
  "stepsCount": 31,
  "onlineCount": 11,
  "entities": [
   "Single portal of interactive state services",
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Transportation company",
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Territorial Department of plant quarantine and protection",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "340": {
  "id": "340",
  "title": "Export of textile and garment by train",
  "direction": "export",
  "goods": "textile and garment",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   43,
   125
  ],
  "blocksCount": 8,
  "stepsCount": 33,
  "onlineCount": 13,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Railway station",
   "Place of loading / branch line",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "344": {
  "id": "344",
  "title": "Arrange cargo transportation by road",
  "direction": "export",
  "goods": "any cargo",
  "mode": "road",
  "kind": "logistics",
  "timeframe": [
   16,
   89
  ],
  "blocksCount": 3,
  "stepsCount": 8,
  "onlineCount": 2,
  "entities": [
   "Transportation company",
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "Territorial Department of plant quarantine and protection",
   "Warehouse / Location of goods"
  ]
 },
 "345": {
  "id": "345",
  "title": "Arrange cargo transportation by train physically",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   39,
   109
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Place of loading / branch line"
  ]
 },
 "347": {
  "id": "347",
  "title": "Clearance of cotton yarn by road",
  "direction": "import",
  "goods": "cotton yarn",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   4,
   17
  ],
  "blocksCount": 2,
  "stepsCount": 14,
  "onlineCount": 5,
  "entities": [
   "Bank",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "348": {
  "id": "348",
  "title": "Clearance of cotton yarn by train",
  "direction": "import",
  "goods": "cotton yarn",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   3,
   16
  ],
  "blocksCount": 1,
  "stepsCount": 7,
  "onlineCount": 5,
  "entities": [
   "Bank",
   "Personal cabinet of participant of foreign economic activity",
   "Warehouse / Location of goods",
   "Customs post of foreign trade activity"
  ]
 },
 "352": {
  "id": "352",
  "title": "Export of fabrics by road",
  "direction": "export",
  "goods": "fabrics",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   17,
   57
  ],
  "blocksCount": 5,
  "stepsCount": 28,
  "onlineCount": 9,
  "entities": [
   "Single portal of interactive state services",
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Transportation company",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "353": {
  "id": "353",
  "title": "Export of fabrics by train",
  "direction": "export",
  "goods": "fabrics",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   44,
   130
  ],
  "blocksCount": 8,
  "stepsCount": 34,
  "onlineCount": 14,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Railway station",
   "Place of loading / branch line",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "354": {
  "id": "354",
  "title": "Obtain certificate of origin form CT-1",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   2,
   11
  ],
  "blocksCount": 1,
  "stepsCount": 9,
  "onlineCount": 3,
  "entities": [
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods"
  ]
 },
 "359": {
  "id": "359",
  "title": "Obtain certificate of origin form A",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   2,
   11
  ],
  "blocksCount": 1,
  "stepsCount": 9,
  "onlineCount": 3,
  "entities": [
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods"
  ]
 },
 "360": {
  "id": "360",
  "title": "Obtain certificate of origin General form",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   2,
   11
  ],
  "blocksCount": 1,
  "stepsCount": 9,
  "onlineCount": 3,
  "entities": [
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods"
  ]
 },
 "385": {
  "id": "385",
  "title": "Arrange cargo transportation by train physically",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   63,
   189
  ],
  "blocksCount": 5,
  "stepsCount": 21,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Place of loading / branch line"
  ]
 },
 "400": {
  "id": "400",
  "title": "Export of confectionery by train",
  "direction": "export",
  "goods": "confectionery",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   67,
   206
  ],
  "blocksCount": 8,
  "stepsCount": 34,
  "onlineCount": 13,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Railway station",
   "Place of loading / branch line",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "402": {
  "id": "402",
  "title": "Arrange cargo transportation by train physically",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   63,
   189
  ],
  "blocksCount": 5,
  "stepsCount": 21,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Place of loading / branch line"
  ]
 },
 "412": {
  "id": "412",
  "title": "Export of seed oil by train",
  "direction": "export",
  "goods": "seed oil",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   66,
   206
  ],
  "blocksCount": 8,
  "stepsCount": 34,
  "onlineCount": 13,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Railway station",
   "Place of loading / branch line",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "436": {
  "id": "436",
  "title": "Export of mineral fertilizers by train",
  "direction": "export",
  "goods": "mineral fertilizers",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   67,
   206
  ],
  "blocksCount": 8,
  "stepsCount": 34,
  "onlineCount": 13,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Railway station",
   "Place of loading / branch line",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "440": {
  "id": "440",
  "title": "Arrange cargo transportation by train physically",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   63,
   189
  ],
  "blocksCount": 5,
  "stepsCount": 21,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Place of loading / branch line"
  ]
 },
 "451": {
  "id": "451",
  "title": "Export of meat and meat products by train",
  "direction": "export",
  "goods": "meat and meat products",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   76,
   235
  ],
  "blocksCount": 10,
  "stepsCount": 41,
  "onlineCount": 19,
  "entities": [
   "Single portal of interactive state services",
   "One-stop service system Single window",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Railway station",
   "Place of loading / branch line",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "Warehouse / Location of goods",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "458": {
  "id": "458",
  "title": "Export of animal or vegetable fertilizers by road",
  "direction": "export",
  "goods": "animal or vegetable fertilizers",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   30,
   98
  ],
  "blocksCount": 8,
  "stepsCount": 41,
  "onlineCount": 17,
  "entities": [
   "Single portal of interactive state services",
   "One-stop service system Single window",
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "Warehouse / Location of goods",
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Border checkpoint for plant quarantine",
   "Transportation company",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "459": {
  "id": "459",
  "title": "Export of animal or vegetable fertilizers by train",
  "direction": "export",
  "goods": "animal or vegetable fertilizers",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   82,
   249
  ],
  "blocksCount": 11,
  "stepsCount": 46,
  "onlineCount": 22,
  "entities": [
   "Single portal of interactive state services",
   "One-stop service system Single window",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Warehouse / Location of goods",
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Border checkpoint for plant quarantine",
   "Railway station",
   "Place of loading / branch line",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "466": {
  "id": "466",
  "title": "Clearance of animal or vegetable fertilizers by road",
  "direction": "import",
  "goods": "animal or vegetable fertilizers",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   2,
   15
  ],
  "blocksCount": 2,
  "stepsCount": 15,
  "onlineCount": 4,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "470": {
  "id": "470",
  "title": "Obtain veterinary certificate for export",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   2,
   6
  ],
  "blocksCount": 1,
  "stepsCount": 5,
  "onlineCount": 4,
  "entities": [
   "One-stop service system Single window",
   "Bank",
   "Warehouse / Location of goods"
  ]
 },
 "476": {
  "id": "476",
  "title": "Import of tea by road",
  "direction": "import",
  "goods": "tea",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   31,
   169
  ],
  "blocksCount": 10,
  "stepsCount": 50,
  "onlineCount": 27,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Single portal of interactive state services",
   "Customs warehouse",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Territorial Department of plant quarantine and protection",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "477": {
  "id": "477",
  "title": "Import of tea by train",
  "direction": "import",
  "goods": "tea",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   34,
   183
  ],
  "blocksCount": 15,
  "stepsCount": 53,
  "onlineCount": 29,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Single portal of interactive state services",
   "Tashkent regional railway junction",
   "Uzbekistan railways Single window",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Territorial Department of plant quarantine and protection",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "482": {
  "id": "482",
  "title": "Import of coffee by road",
  "direction": "import",
  "goods": "coffee",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   31,
   169
  ],
  "blocksCount": 10,
  "stepsCount": 50,
  "onlineCount": 27,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Single portal of interactive state services",
   "Customs warehouse",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Territorial Department of plant quarantine and protection",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "483": {
  "id": "483",
  "title": "Import of coffee by train",
  "direction": "import",
  "goods": "coffee",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   35,
   184
  ],
  "blocksCount": 15,
  "stepsCount": 53,
  "onlineCount": 30,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Territorial Department of plant quarantine and protection",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan"
  ]
 },
 "487": {
  "id": "487",
  "title": "Obtain quarantine permit",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   4,
   42
  ],
  "blocksCount": 1,
  "stepsCount": 4,
  "onlineCount": 4,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window"
  ]
 },
 "488": {
  "id": "488",
  "title": "Obtain quarantine inspection act",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   5,
   43
  ],
  "blocksCount": 1,
  "stepsCount": 8,
  "onlineCount": 6,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Customs warehouse",
   "Territorial Department of plant quarantine and protection"
  ]
 },
 "496": {
  "id": "496",
  "title": "Clearance of coffee by train",
  "direction": "import",
  "goods": "coffee",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   5,
   28
  ],
  "blocksCount": 4,
  "stepsCount": 16,
  "onlineCount": 9,
  "entities": [
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Customs warehouse"
  ]
 },
 "497": {
  "id": "497",
  "title": "Import of confectionery by train",
  "direction": "import",
  "goods": "confectionery",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   25,
   98
  ],
  "blocksCount": 13,
  "stepsCount": 41,
  "onlineCount": 19,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "499": {
  "id": "499",
  "title": "Obtain quarantine permit",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   4,
   42
  ],
  "blocksCount": 1,
  "stepsCount": 4,
  "onlineCount": 4,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window"
  ]
 },
 "500": {
  "id": "500",
  "title": "Obtain quarantine inspection act",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   5,
   43
  ],
  "blocksCount": 1,
  "stepsCount": 8,
  "onlineCount": 6,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Customs warehouse",
   "Territorial Department of plant quarantine and protection"
  ]
 },
 "507": {
  "id": "507",
  "title": "Import of vegetable oils for consumers' use and consumption by train",
  "direction": "import",
  "goods": "vegetable oils for consumers' use and consumption",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   49,
   98
  ],
  "blocksCount": 13,
  "stepsCount": 41,
  "onlineCount": 19,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "512": {
  "id": "512",
  "title": "Import of vegetable oils for technical or industrial use by train",
  "direction": "import",
  "goods": "vegetable oils for technical or industrial use",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   10,
   41
  ],
  "blocksCount": 11,
  "stepsCount": 28,
  "onlineCount": 10,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Online banking system"
  ]
 },
 "514": {
  "id": "514",
  "title": "Export of vegetable oils by train",
  "direction": "export",
  "goods": "vegetable oils",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   67,
   206
  ],
  "blocksCount": 8,
  "stepsCount": 34,
  "onlineCount": 13,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Railway station",
   "Place of loading / branch line",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "518": {
  "id": "518",
  "title": "Arrange cargo transportation by train physically",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   63,
   189
  ],
  "blocksCount": 5,
  "stepsCount": 21,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Place of loading / branch line"
  ]
 },
 "519": {
  "id": "519",
  "title": "Arrange cargo transportation by train physically",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   63,
   189
  ],
  "blocksCount": 5,
  "stepsCount": 21,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Place of loading / branch line"
  ]
 },
 "522": {
  "id": "522",
  "title": "Clearance of seed oil by train",
  "direction": "import",
  "goods": "seed oil",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   1,
   12
  ],
  "blocksCount": 1,
  "stepsCount": 6,
  "onlineCount": 4,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Warehouse / Location of goods",
   "Customs post of foreign trade activity"
  ]
 },
 "537": {
  "id": "537",
  "title": "Export of perfumery, cosmetic or toilet preparations by air",
  "direction": "export",
  "goods": "perfumery, cosmetic or toilet preparations",
  "mode": "air",
  "kind": "customs",
  "timeframe": [
   16,
   72
  ],
  "blocksCount": 7,
  "stepsCount": 32,
  "onlineCount": 10,
  "entities": [
   "Single portal of interactive state services",
   "Cargo sales agent",
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Customs post \"Avia yuklar\" at the airport's warehouse",
   "Personal cabinet of participant of foreign economic activity"
  ]
 },
 "540": {
  "id": "540",
  "title": "Export of tea by air",
  "direction": "export",
  "goods": "tea",
  "mode": "air",
  "kind": "customs",
  "timeframe": [
   30,
   108
  ],
  "blocksCount": 9,
  "stepsCount": 47,
  "onlineCount": 19,
  "entities": [
   "Single portal of interactive state services",
   "Cargo sales agent",
   "Bank",
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Assalom Agro",
   "Territorial Department of plant quarantine and protection",
   "Warehouse / Location of goods",
   "Border checkpoint for plant quarantine",
   "One-stop service system Single window",
   "“Uzbekexpertiza” JSC",
   "“Uzbekexpertiza” JSC service portal",
   "Customs post \"Avia yuklar\" at the airport's warehouse",
   "Personal cabinet of participant of foreign economic activity"
  ]
 },
 "541": {
  "id": "541",
  "title": "Clearance of vegetable oils for consumers' use and consumption by train",
  "direction": "import",
  "goods": "vegetable oils for consumers' use and consumption",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   7,
   33
  ],
  "blocksCount": 5,
  "stepsCount": 19,
  "onlineCount": 8,
  "entities": [
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Online banking system",
   "Bank"
  ]
 },
 "543": {
  "id": "543",
  "title": "Clearance of vegetable oils for technical or industrial use by train",
  "direction": "import",
  "goods": "vegetable oils for technical or industrial use",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   3,
   18
  ],
  "blocksCount": 3,
  "stepsCount": 10,
  "onlineCount": 4,
  "entities": [
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Online banking system",
   "Customs warehouse",
   "Bank"
  ]
 },
 "548": {
  "id": "548",
  "title": "Clearance of meat and meat products by road",
  "direction": "import",
  "goods": "meat and meat products",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   7,
   33
  ],
  "blocksCount": 5,
  "stepsCount": 28,
  "onlineCount": 10,
  "entities": [
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs warehouse",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Online banking system"
  ]
 },
 "550": {
  "id": "550",
  "title": "Obtain internal phytosanitary certificate",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   9,
   21
  ],
  "blocksCount": 1,
  "stepsCount": 8,
  "onlineCount": 6,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "Assalom Agro",
   "Warehouse / Location of goods",
   "Territorial Department of plant quarantine and protection"
  ]
 },
 "555": {
  "id": "555",
  "title": "Import of tea by air",
  "direction": "import",
  "goods": "tea",
  "mode": "air",
  "kind": "customs",
  "timeframe": [
   36,
   196
  ],
  "blocksCount": 12,
  "stepsCount": 46,
  "onlineCount": 23,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Single portal of interactive state services",
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post \"Avia yuklar\" at the airport's warehouse",
   "Customs warehouse",
   "Territorial Department of plant quarantine and protection",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system",
   "Border checkpoint for plant quarantine"
  ]
 },
 "556": {
  "id": "556",
  "title": "Import of coffee by air",
  "direction": "import",
  "goods": "coffee",
  "mode": "air",
  "kind": "customs",
  "timeframe": [
   36,
   196
  ],
  "blocksCount": 12,
  "stepsCount": 46,
  "onlineCount": 23,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Single portal of interactive state services",
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post \"Avia yuklar\" at the airport's warehouse",
   "Customs warehouse",
   "Territorial Department of plant quarantine and protection",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system",
   "Border checkpoint for plant quarantine"
  ]
 },
 "557": {
  "id": "557",
  "title": "Import of pharmaceutical products by train",
  "direction": "import",
  "goods": "pharmaceutical products",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   85,
   290
  ],
  "blocksCount": 14,
  "stepsCount": 41,
  "onlineCount": 20,
  "entities": [
   "State center for expertise and standardization of medicines official web-site",
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "State center for expertise and standardization of medicines, medical devices and medical equipment",
   "Electronic document management systems",
   "Online banking system"
  ]
 },
 "561": {
  "id": "561",
  "title": "Import of wood by road",
  "direction": "import",
  "goods": "wood",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   17,
   122
  ],
  "blocksCount": 9,
  "stepsCount": 43,
  "onlineCount": 22,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Single portal of interactive state services",
   "Customs warehouse",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Territorial Department of plant quarantine and protection",
   "Online banking system"
  ]
 },
 "562": {
  "id": "562",
  "title": "Import of wood by train",
  "direction": "import",
  "goods": "wood",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   21,
   136
  ],
  "blocksCount": 14,
  "stepsCount": 46,
  "onlineCount": 24,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Territorial Department of plant quarantine and protection",
   "Online banking system"
  ]
 },
 "563": {
  "id": "563",
  "title": "Clearance of tea by air",
  "direction": "import",
  "goods": "tea",
  "mode": "air",
  "kind": "customs",
  "timeframe": [
   5,
   36
  ],
  "blocksCount": 5,
  "stepsCount": 22,
  "onlineCount": 6,
  "entities": [
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post \"Avia yuklar\" at the airport's warehouse",
   "Online banking system",
   "Border checkpoint for plant quarantine"
  ]
 },
 "570": {
  "id": "570",
  "title": "Arrange cargo transportation by air",
  "direction": "export",
  "goods": "any cargo",
  "mode": "air",
  "kind": "logistics",
  "timeframe": [
   12,
   51
  ],
  "blocksCount": 4,
  "stepsCount": 18,
  "onlineCount": 2,
  "entities": [
   "Cargo sales agent",
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Bank",
   "Customs post \"Avia yuklar\" at the airport's warehouse"
  ]
 },
 "572": {
  "id": "572",
  "title": "Clearance of perfumery, cosmetic or toilet preparations by air",
  "direction": "import",
  "goods": "perfumery, cosmetic or toilet preparations",
  "mode": "air",
  "kind": "customs",
  "timeframe": [
   4,
   28
  ],
  "blocksCount": 3,
  "stepsCount": 15,
  "onlineCount": 4,
  "entities": [
   "Customs post \"Avia yuklar\" at the airport's warehouse",
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Personal cabinet of participant of foreign economic activity",
   "Bank"
  ]
 },
 "576": {
  "id": "576",
  "title": "Export of furniture by train",
  "direction": "export",
  "goods": "furniture",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   43,
   125
  ],
  "blocksCount": 8,
  "stepsCount": 33,
  "onlineCount": 13,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Railway station",
   "Place of loading / branch line",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "584": {
  "id": "584",
  "title": "Clearance of tea by air",
  "direction": "import",
  "goods": "tea",
  "mode": "air",
  "kind": "customs",
  "timeframe": [
   5,
   28
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 4,
  "entities": [
   "Customs post \"Avia yuklar\" at the airport's warehouse",
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Border checkpoint for plant quarantine",
   "Personal cabinet of participant of foreign economic activity",
   "Bank"
  ]
 },
 "585": {
  "id": "585",
  "title": "Obtain phytosanitary certificate",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   5,
   13
  ],
  "blocksCount": 1,
  "stepsCount": 5,
  "onlineCount": 3,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Border checkpoint for plant quarantine"
  ]
 },
 "587": {
  "id": "587",
  "title": "Arrange cargo transportation by train physically",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   39,
   109
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Place of loading / branch line"
  ]
 },
 "591": {
  "id": "591",
  "title": "Export of jewelry by air",
  "direction": "export",
  "goods": "jewelry",
  "mode": "air",
  "kind": "customs",
  "timeframe": [
   16,
   72
  ],
  "blocksCount": 7,
  "stepsCount": 32,
  "onlineCount": 10,
  "entities": [
   "Single portal of interactive state services",
   "Cargo sales agent",
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Bank",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Customs post \"Avia yuklar\" at the airport's warehouse",
   "Personal cabinet of participant of foreign economic activity"
  ]
 },
 "593": {
  "id": "593",
  "title": "Clearance of pharmaceutical products by train",
  "direction": "import",
  "goods": "pharmaceutical products",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   7,
   33
  ],
  "blocksCount": 6,
  "stepsCount": 20,
  "onlineCount": 8,
  "entities": [
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Online banking system",
   "Bank"
  ]
 },
 "596": {
  "id": "596",
  "title": "Import of medical equipment by train",
  "direction": "import",
  "goods": "medical equipment",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   85,
   290
  ],
  "blocksCount": 14,
  "stepsCount": 41,
  "onlineCount": 20,
  "entities": [
   "State center for expertise and standardization of medicines official web-site",
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "State center for expertise and standardization of medicines, medical devices and medical equipment",
   "Electronic document management systems",
   "Online banking system"
  ]
 },
 "598": {
  "id": "598",
  "title": "Clearance of medical equipment by train",
  "direction": "import",
  "goods": "medical equipment",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   4,
   25
  ],
  "blocksCount": 4,
  "stepsCount": 13,
  "onlineCount": 7,
  "entities": [
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Online banking system",
   "Customs warehouse"
  ]
 },
 "600": {
  "id": "600",
  "title": "Obtain internal phytosanitary certificate",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   9,
   21
  ],
  "blocksCount": 1,
  "stepsCount": 8,
  "onlineCount": 6,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "Assalom Agro",
   "Warehouse / Location of goods",
   "Territorial Department of plant quarantine and protection"
  ]
 },
 "611": {
  "id": "611",
  "title": "Arrange cargo transportation by train physically",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   63,
   189
  ],
  "blocksCount": 5,
  "stepsCount": 21,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Place of loading / branch line"
  ]
 },
 "626": {
  "id": "626",
  "title": "Import of jewelry by air",
  "direction": "import",
  "goods": "jewelry",
  "mode": "air",
  "kind": "customs",
  "timeframe": [
   12,
   50
  ],
  "blocksCount": 5,
  "stepsCount": 22,
  "onlineCount": 6,
  "entities": [
   "Single portal of interactive state services",
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Bank",
   "Customs post of foreign trade activity",
   "Online banking system",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post \"Avia yuklar\" at the airport's warehouse"
  ]
 },
 "660": {
  "id": "660",
  "title": "Clearance of jewelry by air",
  "direction": "import",
  "goods": "jewelry",
  "mode": "air",
  "kind": "customs",
  "timeframe": [
   4,
   28
  ],
  "blocksCount": 3,
  "stepsCount": 15,
  "onlineCount": 4,
  "entities": [
   "Customs post \"Avia yuklar\" at the airport's warehouse",
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Personal cabinet of participant of foreign economic activity",
   "Bank"
  ]
 },
 "668": {
  "id": "668",
  "title": "Import of carbonated beverages by train",
  "direction": "import",
  "goods": "carbonated beverages",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   33,
   138
  ],
  "blocksCount": 13,
  "stepsCount": 41,
  "onlineCount": 19,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "672": {
  "id": "672",
  "title": "Import of cereals by train",
  "direction": "import",
  "goods": "cereals",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   29,
   155
  ],
  "blocksCount": 15,
  "stepsCount": 53,
  "onlineCount": 29,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Territorial Department of plant quarantine and protection",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "678": {
  "id": "678",
  "title": "Import of fruit and vegetable juices by train",
  "direction": "import",
  "goods": "fruit and vegetable juices",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   57,
   138
  ],
  "blocksCount": 13,
  "stepsCount": 41,
  "onlineCount": 19,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "680": {
  "id": "680",
  "title": "Import of flour by train",
  "direction": "import",
  "goods": "flour",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   41,
   178
  ],
  "blocksCount": 16,
  "stepsCount": 48,
  "onlineCount": 28,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan"
  ]
 },
 "685": {
  "id": "685",
  "title": "Arrange fumigation of transport",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   4,
   59
  ],
  "blocksCount": 1,
  "stepsCount": 3,
  "onlineCount": 2,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "Territorial Department of plant quarantine and protection"
  ]
 },
 "687": {
  "id": "687",
  "title": "Import of mineral fertilizers by train",
  "direction": "import",
  "goods": "mineral fertilizers",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   30,
   198
  ],
  "blocksCount": 13,
  "stepsCount": 39,
  "onlineCount": 17,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "Certification body of fertilizers, pesticides and chemical protection of plants",
   "Online banking system"
  ]
 },
 "707": {
  "id": "707",
  "title": "Import of animal or vegetable fertilizers by train",
  "direction": "import",
  "goods": "animal or vegetable fertilizers",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   49,
   531
  ],
  "blocksCount": 17,
  "stepsCount": 60,
  "onlineCount": 35,
  "entities": [
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "One-stop service system Single window",
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Territorial Department of plant quarantine and protection",
   "Warehouse / Location of goods",
   "Certification body of fertilizers, pesticides and chemical protection of plants",
   "Online banking system"
  ]
 },
 "710": {
  "id": "710",
  "title": "Clearance of animal or vegetable fertilizers by train",
  "direction": "import",
  "goods": "animal or vegetable fertilizers",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   4,
   28
  ],
  "blocksCount": 4,
  "stepsCount": 16,
  "onlineCount": 8,
  "entities": [
   "Customs post of foreign trade activity",
   "Customs warehouse",
   "Bank",
   "Personal cabinet of participant of foreign economic activity",
   "Online banking system"
  ]
 },
 "714": {
  "id": "714",
  "title": "Import of pharmaceutical products by air",
  "direction": "import",
  "goods": "pharmaceutical products",
  "mode": "air",
  "kind": "customs",
  "timeframe": [
   87,
   301
  ],
  "blocksCount": 9,
  "stepsCount": 33,
  "onlineCount": 14,
  "entities": [
   "State center for expertise and standardization of medicines official web-site",
   "Single portal of interactive state services",
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Bank",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post \"Avia yuklar\" at the airport's warehouse",
   "One-stop service system Single window",
   "State center for expertise and standardization of medicines, medical devices and medical equipment",
   "Customs warehouse",
   "Electronic document management systems",
   "Online banking system"
  ]
 },
 "715": {
  "id": "715",
  "title": "Arrange cargo delivery by air",
  "direction": "import",
  "goods": "any cargo",
  "mode": "air",
  "kind": "logistics",
  "timeframe": [
   10,
   38
  ],
  "blocksCount": 4,
  "stepsCount": 16,
  "onlineCount": 1,
  "entities": [
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Bank",
   "Customs post \"Avia yuklar\" at the airport's warehouse"
  ]
 },
 "716": {
  "id": "716",
  "title": "Clearance of pharmaceutical products by air",
  "direction": "import",
  "goods": "pharmaceutical products",
  "mode": "air",
  "kind": "customs",
  "timeframe": [
   3,
   24
  ],
  "blocksCount": 2,
  "stepsCount": 9,
  "onlineCount": 6,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Customs post \"Avia yuklar\" at the airport's warehouse",
   "Online banking system"
  ]
 },
 "718": {
  "id": "718",
  "title": "Obtain certificate of conformity",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   16,
   245
  ],
  "blocksCount": 1,
  "stepsCount": 6,
  "onlineCount": 4,
  "entities": [
   "One-stop service system Single window",
   "Uzbek Center for Research and Quality Control \"UzTest\"",
   "Bank",
   "Customs warehouse",
   "Electronic document management systems"
  ]
 },
 "720": {
  "id": "720",
  "title": "Clearance of flour by train",
  "direction": "import",
  "goods": "flour",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   6,
   31
  ],
  "blocksCount": 5,
  "stepsCount": 18,
  "onlineCount": 9,
  "entities": [
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Customs warehouse",
   "Bank"
  ]
 },
 "724": {
  "id": "724",
  "title": "Import of glass and glass products by road",
  "direction": "import",
  "goods": "glass and glass products",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   24,
   281
  ],
  "blocksCount": 8,
  "stepsCount": 36,
  "onlineCount": 16,
  "entities": [
   "Single portal of interactive state services",
   "Customs warehouse",
   "Bank",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "Uzbek Center for Research and Quality Control \"UzTest\"",
   "Electronic document management systems",
   "Online banking system"
  ]
 },
 "725": {
  "id": "725",
  "title": "Import of glass and glass products by train",
  "direction": "import",
  "goods": "glass and glass products",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   27,
   296
  ],
  "blocksCount": 13,
  "stepsCount": 40,
  "onlineCount": 18,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "Uzbek Center for Research and Quality Control \"UzTest\"",
   "Electronic document management systems",
   "Online banking system"
  ]
 },
 "735": {
  "id": "735",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   28
  ],
  "blocksCount": 7,
  "stepsCount": 19,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "738": {
  "id": "738",
  "title": "Arrange cargo transportation by train physically",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   39,
   109
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Place of loading / branch line"
  ]
 },
 "739": {
  "id": "739",
  "title": "Arrange cargo transportation by train via Single Window online portal",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   33,
   87
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 14,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Place of loading / branch line",
   "Railway station"
  ]
 },
 "740": {
  "id": "740",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "741": {
  "id": "741",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "742": {
  "id": "742",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   27
  ],
  "blocksCount": 6,
  "stepsCount": 18,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "744": {
  "id": "744",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "746": {
  "id": "746",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   27
  ],
  "blocksCount": 6,
  "stepsCount": 18,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "748": {
  "id": "748",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   28
  ],
  "blocksCount": 7,
  "stepsCount": 19,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "750": {
  "id": "750",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "752": {
  "id": "752",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "753": {
  "id": "753",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   28
  ],
  "blocksCount": 7,
  "stepsCount": 19,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "754": {
  "id": "754",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   28
  ],
  "blocksCount": 7,
  "stepsCount": 19,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "755": {
  "id": "755",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "757": {
  "id": "757",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   28
  ],
  "blocksCount": 7,
  "stepsCount": 19,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "758": {
  "id": "758",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "760": {
  "id": "760",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   28
  ],
  "blocksCount": 7,
  "stepsCount": 19,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "761": {
  "id": "761",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "762": {
  "id": "762",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   28
  ],
  "blocksCount": 7,
  "stepsCount": 19,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "763": {
  "id": "763",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "764": {
  "id": "764",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   28
  ],
  "blocksCount": 7,
  "stepsCount": 19,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "765": {
  "id": "765",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "766": {
  "id": "766",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   28
  ],
  "blocksCount": 7,
  "stepsCount": 19,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "767": {
  "id": "767",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "769": {
  "id": "769",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   28
  ],
  "blocksCount": 7,
  "stepsCount": 19,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "770": {
  "id": "770",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "771": {
  "id": "771",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   28
  ],
  "blocksCount": 7,
  "stepsCount": 19,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "772": {
  "id": "772",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "774": {
  "id": "774",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   28
  ],
  "blocksCount": 7,
  "stepsCount": 19,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "775": {
  "id": "775",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "776": {
  "id": "776",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   28
  ],
  "blocksCount": 7,
  "stepsCount": 19,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "777": {
  "id": "777",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "779": {
  "id": "779",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   28
  ],
  "blocksCount": 7,
  "stepsCount": 19,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "780": {
  "id": "780",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "782": {
  "id": "782",
  "title": "Arrange cargo transportation by train via Single Window online portal",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   33,
   87
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 14,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Place of loading / branch line",
   "Railway station"
  ]
 },
 "783": {
  "id": "783",
  "title": "Arrange cargo transportation by train via Single Window online portal",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   33,
   87
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 14,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Place of loading / branch line",
   "Railway station"
  ]
 },
 "784": {
  "id": "784",
  "title": "Arrange cargo transportation by train via Single Window online portal",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   33,
   87
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 14,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Place of loading / branch line",
   "Railway station"
  ]
 },
 "785": {
  "id": "785",
  "title": "Arrange cargo transportation by train via Single Window online portal",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   33,
   87
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 14,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Place of loading / branch line",
   "Railway station"
  ]
 },
 "787": {
  "id": "787",
  "title": "Arrange cargo transportation by train via Single Window online portal",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   33,
   87
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 14,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Place of loading / branch line",
   "Railway station"
  ]
 },
 "788": {
  "id": "788",
  "title": "Arrange cargo transportation by train via Single Window online portal",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   33,
   87
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 14,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Place of loading / branch line",
   "Railway station"
  ]
 },
 "789": {
  "id": "789",
  "title": "Arrange cargo transportation by train via Single Window online portal",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   33,
   87
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 14,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Place of loading / branch line",
   "Railway station"
  ]
 },
 "793": {
  "id": "793",
  "title": "Arrange cargo transportation by train via Single Window online portal",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   33,
   87
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 14,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Place of loading / branch line",
   "Railway station"
  ]
 },
 "795": {
  "id": "795",
  "title": "Arrange cargo transportation by train via Single Window online portal",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   33,
   87
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 14,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Place of loading / branch line",
   "Railway station"
  ]
 },
 "796": {
  "id": "796",
  "title": "Arrange cargo transportation by train via Single Window online portal",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   33,
   87
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 14,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Place of loading / branch line",
   "Railway station"
  ]
 },
 "801": {
  "id": "801",
  "title": "Export of honey by road",
  "direction": "export",
  "goods": "honey",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   25,
   83
  ],
  "blocksCount": 7,
  "stepsCount": 35,
  "onlineCount": 14,
  "entities": [
   "Single portal of interactive state services",
   "One-stop service system Single window",
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "Warehouse / Location of goods",
   "Transportation company",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "804": {
  "id": "804",
  "title": "Export of salt by train",
  "direction": "export",
  "goods": "salt",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   43,
   125
  ],
  "blocksCount": 8,
  "stepsCount": 33,
  "onlineCount": 13,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Railway station",
   "Place of loading / branch line",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "805": {
  "id": "805",
  "title": "Export of dried fruits by air",
  "direction": "export",
  "goods": "dried fruits",
  "mode": "air",
  "kind": "customs",
  "timeframe": [
   30,
   108
  ],
  "blocksCount": 9,
  "stepsCount": 47,
  "onlineCount": 19,
  "entities": [
   "Single portal of interactive state services",
   "Cargo sales agent",
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Bank",
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Assalom Agro",
   "Warehouse / Location of goods",
   "Territorial Department of plant quarantine and protection",
   "One-stop service system Single window",
   "Border checkpoint for plant quarantine",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "Customs post \"Avia yuklar\" at the airport's warehouse",
   "Personal cabinet of participant of foreign economic activity"
  ]
 },
 "806": {
  "id": "806",
  "title": "Arrange cargo transportation by air",
  "direction": "export",
  "goods": "any cargo",
  "mode": "air",
  "kind": "logistics",
  "timeframe": [
   12,
   52
  ],
  "blocksCount": 4,
  "stepsCount": 19,
  "onlineCount": 2,
  "entities": [
   "Cargo sales agent",
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Bank",
   "Customs post \"Avia yuklar\" at the airport's warehouse",
   "Border checkpoint for plant quarantine"
  ]
 },
 "819": {
  "id": "819",
  "title": "Export of honey by air",
  "direction": "export",
  "goods": "honey",
  "mode": "air",
  "kind": "customs",
  "timeframe": [
   25,
   102
  ],
  "blocksCount": 9,
  "stepsCount": 39,
  "onlineCount": 16,
  "entities": [
   "Single portal of interactive state services",
   "One-stop service system Single window",
   "Cargo sales agent",
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Bank",
   "Warehouse / Location of goods",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "Customs post \"Avia yuklar\" at the airport's warehouse",
   "Personal cabinet of participant of foreign economic activity"
  ]
 },
 "824": {
  "id": "824",
  "title": "Export of cement by train",
  "direction": "export",
  "goods": "cement",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   43,
   125
  ],
  "blocksCount": 8,
  "stepsCount": 33,
  "onlineCount": 13,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Railway station",
   "Place of loading / branch line",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "827": {
  "id": "827",
  "title": "Import of meat and meat products by train",
  "direction": "import",
  "goods": "meat and meat products",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   64,
   382
  ],
  "blocksCount": 14,
  "stepsCount": 47,
  "onlineCount": 26,
  "entities": [
   "One-stop service system Single window",
   "Bank",
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Customs warehouse",
   "Warehouse / Location of goods",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "828": {
  "id": "828",
  "title": "Obtain certificate of conformity for equipment requiring pre-installation",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   96,
   319
  ],
  "blocksCount": 2,
  "stepsCount": 11,
  "onlineCount": 9,
  "entities": [
   "One-stop service system Single window",
   "State center for expertise and standardization of medicines, medical devices and medical equipment",
   "Customs warehouse",
   "Electronic document management systems",
   "Online banking system"
  ]
 },
 "835": {
  "id": "835",
  "title": "Clearance of salt by train",
  "direction": "import",
  "goods": "salt",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   2,
   12
  ],
  "blocksCount": 1,
  "stepsCount": 6,
  "onlineCount": 4,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Warehouse / Location of goods",
   "Customs post of foreign trade activity"
  ]
 },
 "838": {
  "id": "838",
  "title": "Import of paper and cardboard products by road",
  "direction": "import",
  "goods": "paper and cardboard products",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   24,
   282
  ],
  "blocksCount": 8,
  "stepsCount": 37,
  "onlineCount": 16,
  "entities": [
   "Single portal of interactive state services",
   "Customs warehouse",
   "Bank",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "Uzbek Center for Research and Quality Control \"UzTest\"",
   "Electronic document management systems",
   "Online banking system"
  ]
 },
 "839": {
  "id": "839",
  "title": "Import of paper and cardboard products by train",
  "direction": "import",
  "goods": "paper and cardboard products",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   27,
   301
  ],
  "blocksCount": 13,
  "stepsCount": 42,
  "onlineCount": 15,
  "entities": [
   "Single portal of interactive state services",
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "Uzbek Center for Research and Quality Control \"UzTest\"",
   "Electronic document management systems",
   "Online banking system"
  ]
 },
 "861": {
  "id": "861",
  "title": "Clearance of honey by road",
  "direction": "import",
  "goods": "honey",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   2,
   13
  ],
  "blocksCount": 2,
  "stepsCount": 14,
  "onlineCount": 4,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "865": {
  "id": "865",
  "title": "Obtain veterinary certificate for export",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   1,
   5
  ],
  "blocksCount": 1,
  "stepsCount": 5,
  "onlineCount": 4,
  "entities": [
   "One-stop service system Single window",
   "Bank",
   "Warehouse / Location of goods"
  ]
 },
 "866": {
  "id": "866",
  "title": "Obtain ecological certificate (for waste and scrap of paper and paperboard)",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   32,
   40
  ],
  "blocksCount": 1,
  "stepsCount": 5,
  "onlineCount": 4,
  "entities": [
   "One-stop service system Single window",
   "Electronic document management systems",
   "Bank",
   "Customs warehouse"
  ]
 },
 "868": {
  "id": "868",
  "title": "Export of tea by train",
  "direction": "export",
  "goods": "tea",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   81,
   244
  ],
  "blocksCount": 10,
  "stepsCount": 48,
  "onlineCount": 22,
  "entities": [
   "Single portal of interactive state services",
   "Bank",
   "Tashkent regional railway junction",
   "Uzbekistan railways Single window",
   "Freight forwarding company",
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Assalom Agro",
   "Territorial Department of plant quarantine and protection",
   "Warehouse / Location of goods",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Place of loading / branch line",
   "Railway station",
   "Border checkpoint for plant quarantine",
   "One-stop service system Single window",
   "“Uzbekexpertiza” JSC",
   "“Uzbekexpertiza” JSC service portal",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity"
  ]
 },
 "877": {
  "id": "877",
  "title": "Export of pasta by train",
  "direction": "export",
  "goods": "pasta",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   67,
   209
  ],
  "blocksCount": 8,
  "stepsCount": 34,
  "onlineCount": 13,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Railway station",
   "Place of loading / branch line",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "884": {
  "id": "884",
  "title": "Arrange cargo transportation by train via Single Window online portal",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   33,
   90
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 14,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Place of loading / branch line",
   "Railway station"
  ]
 },
 "888": {
  "id": "888",
  "title": "Import of cement by train",
  "direction": "import",
  "goods": "cement",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   27,
   296
  ],
  "blocksCount": 13,
  "stepsCount": 40,
  "onlineCount": 18,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "Uzbek Center for Research and Quality Control \"UzTest\"",
   "Electronic document management systems",
   "Online banking system"
  ]
 },
 "891": {
  "id": "891",
  "title": "Export of paper and cardboard products by road",
  "direction": "export",
  "goods": "paper and cardboard products",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   29,
   87
  ],
  "blocksCount": 7,
  "stepsCount": 39,
  "onlineCount": 16,
  "entities": [
   "Single portal of interactive state services",
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Bank",
   "Assalom Agro",
   "Warehouse / Location of goods",
   "Territorial Department of plant quarantine and protection",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Border checkpoint for plant quarantine",
   "Transportation company",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "911": {
  "id": "911",
  "title": "Export of paper and cardboard products by train",
  "direction": "export",
  "goods": "paper and cardboard products",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   81,
   243
  ],
  "blocksCount": 10,
  "stepsCount": 46,
  "onlineCount": 21,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Agency of plant quarantine and protection Personal cabinet (Oferta)",
   "Assalom Agro",
   "Warehouse / Location of goods",
   "Territorial Department of plant quarantine and protection",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Railway station",
   "Place of loading / branch line",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Border checkpoint for plant quarantine",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "924": {
  "id": "924",
  "title": "Arrange cargo delivery by train physically",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   7,
   27
  ],
  "blocksCount": 6,
  "stepsCount": 18,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Customs warehouse"
  ]
 },
 "925": {
  "id": "925",
  "title": "Arrange cargo delivery by train via Single Window online portal",
  "direction": "import",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   13,
   34
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 12,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Railway station",
   "Customs warehouse"
  ]
 },
 "934": {
  "id": "934",
  "title": "Arrange cargo transportation by train physically",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   39,
   112
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 2,
  "entities": [
   "Tashkent Technological center for the processing of transport documents",
   "Tashkent regional railway junction",
   "Railway station",
   "Bank",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Place of loading / branch line"
  ]
 },
 "935": {
  "id": "935",
  "title": "Arrange cargo transportation by train via Single Window online portal",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   33,
   87
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 14,
  "entities": [
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Place of loading / branch line",
   "Railway station"
  ]
 },
 "948": {
  "id": "948",
  "title": "Export of eggs  by road",
  "direction": "export",
  "goods": "eggs",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   24,
   77
  ],
  "blocksCount": 7,
  "stepsCount": 34,
  "onlineCount": 13,
  "entities": [
   "Single portal of interactive state services",
   "One-stop service system Single window",
   "\"Uzbekexpertiza\" JSC",
   "Bank",
   "\"Uzbekexpertiza\" JSC service portal",
   "Warehouse / Location of goods",
   "Transportation company",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "949": {
  "id": "949",
  "title": "Export of eggs by train",
  "direction": "export",
  "goods": "eggs",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   76,
   238
  ],
  "blocksCount": 10,
  "stepsCount": 41,
  "onlineCount": 19,
  "entities": [
   "Single portal of interactive state services",
   "One-stop service system Single window",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Railway station",
   "Place of loading / branch line",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "Warehouse / Location of goods",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "953": {
  "id": "953",
  "title": "Export of washing detergents by train",
  "direction": "export",
  "goods": "washing detergents",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   67,
   209
  ],
  "blocksCount": 8,
  "stepsCount": 34,
  "onlineCount": 13,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Railway station",
   "Place of loading / branch line",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "983": {
  "id": "983",
  "title": "Arrange cargo transportation by train via Single Window online portal",
  "direction": "export",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   33,
   87
  ],
  "blocksCount": 5,
  "stepsCount": 20,
  "onlineCount": 14,
  "entities": [
   "Freight forwarding company",
   "Bank",
   "Uzbekistan railways Single window",
   "Place of loading / branch line",
   "Tashkent regional railway junction",
   "Railway station"
  ]
 },
 "984": {
  "id": "984",
  "title": "Clearance of eggs by road",
  "direction": "import",
  "goods": "eggs",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   1,
   8
  ],
  "blocksCount": 2,
  "stepsCount": 13,
  "onlineCount": 3,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "993": {
  "id": "993",
  "title": "Import of pasta by road",
  "direction": "import",
  "goods": "pasta",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   55,
   331
  ],
  "blocksCount": 10,
  "stepsCount": 47,
  "onlineCount": 25,
  "entities": [
   "One-stop service system Single window",
   "Bank",
   "Single portal of interactive state services",
   "Customs warehouse",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Warehouse / Location of goods",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "994": {
  "id": "994",
  "title": "Import of pasta by train",
  "direction": "import",
  "goods": "pasta",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   58,
   346
  ],
  "blocksCount": 15,
  "stepsCount": 50,
  "onlineCount": 27,
  "entities": [
   "One-stop service system Single window",
   "Bank",
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Warehouse / Location of goods",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Online banking system"
  ]
 },
 "1000": {
  "id": "1000",
  "title": "Obtain sanitary and epidemiological conclusion",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   37,
   48
  ],
  "blocksCount": 1,
  "stepsCount": 7,
  "onlineCount": 5,
  "entities": [
   "One-stop service system Single window",
   "Customs warehouse",
   "Regional center for sanitary-epidemiological service",
   "Sanitary-epidemiological welfare and public health committee of the Republic of Uzbekistan",
   "Bank"
  ]
 },
 "1001": {
  "id": "1001",
  "title": "Transit by road through Uzbekistan",
  "direction": "transit",
  "goods": "any cargo",
  "mode": "road",
  "kind": "logistics",
  "timeframe": [
   1,
   3
  ],
  "blocksCount": 3,
  "stepsCount": 21,
  "onlineCount": 2,
  "entities": [
   "Automated information system \"E-tranzit\"",
   "State border crossing point"
  ]
 },
 "1002": {
  "id": "1002",
  "title": "Transit by train through Uzbekistan",
  "direction": "transit",
  "goods": "any cargo",
  "mode": "train",
  "kind": "logistics",
  "timeframe": [
   3,
   7
  ],
  "blocksCount": 3,
  "stepsCount": 5,
  "onlineCount": 1,
  "entities": [
   "Automated information system \"E-tranzit\"",
   "Border crossing point by rail"
  ]
 },
 "1007": {
  "id": "1007",
  "title": "Clearance of pasta by road",
  "direction": "import",
  "goods": "pasta",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   7,
   33
  ],
  "blocksCount": 5,
  "stepsCount": 28,
  "onlineCount": 10,
  "entities": [
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs warehouse",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Online banking system",
   "Bank"
  ]
 },
 "1012": {
  "id": "1012",
  "title": "Import of washing detergents by train",
  "direction": "import",
  "goods": "washing detergents",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   27,
   296
  ],
  "blocksCount": 13,
  "stepsCount": 40,
  "onlineCount": 18,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "Uzbek Center for Research and Quality Control \"UzTest\"",
   "Electronic document management systems",
   "Online banking system"
  ]
 },
 "1046": {
  "id": "1046",
  "title": "Clearance of jewelry by air",
  "direction": "import",
  "goods": "jewelry",
  "mode": "air",
  "kind": "customs",
  "timeframe": [
   2,
   15
  ],
  "blocksCount": 1,
  "stepsCount": 7,
  "onlineCount": 4,
  "entities": [
   "Customs post of foreign trade activity",
   "Online banking system",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post \"Avia yuklar\" at the airport's warehouse"
  ]
 },
 "1047": {
  "id": "1047",
  "title": "Arrange cargo delivery by air",
  "direction": "import",
  "goods": "any cargo",
  "mode": "air",
  "kind": "logistics",
  "timeframe": [
   10,
   36
  ],
  "blocksCount": 3,
  "stepsCount": 14,
  "onlineCount": 1,
  "entities": [
   "Postal cargo complex at Tashkent International Airport named by Islam Karimov",
   "Bank",
   "Customs post \"Avia yuklar\" at the airport's warehouse"
  ]
 },
 "1051": {
  "id": "1051",
  "title": "Export of carpets by road",
  "direction": "export",
  "goods": "carpets",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   47,
   92
  ],
  "blocksCount": 6,
  "stepsCount": 32,
  "onlineCount": 12,
  "entities": [
   "Single portal of interactive state services",
   "Transportation company",
   "Warehouse / Location of goods",
   "One-stop service system Single window",
   "Electronic document management systems",
   "Bank",
   "Customs warehouse",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "1052": {
  "id": "1052",
  "title": "Export of carpets by train",
  "direction": "export",
  "goods": "carpets",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   75,
   165
  ],
  "blocksCount": 9,
  "stepsCount": 38,
  "onlineCount": 17,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "Railway station",
   "Place of loading / branch line",
   "One-stop service system Single window",
   "Electronic document management systems",
   "Customs warehouse",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "Warehouse / Location of goods",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "1070": {
  "id": "1070",
  "title": "Export of shoes by train",
  "direction": "export",
  "goods": "shoes",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   67,
   209
  ],
  "blocksCount": 8,
  "stepsCount": 34,
  "onlineCount": 13,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Freight forwarding company",
   "Joint Stock Company \"O'zbekiston temir yo'llari\"",
   "\"Uzbekexpertiza\" JSC",
   "\"Uzbekexpertiza\" JSC service portal",
   "One-stop service system Single window",
   "Warehouse / Location of goods",
   "Railway station",
   "Place of loading / branch line",
   "Personal cabinet of participant of foreign economic activity",
   "Customs post of foreign trade activity"
  ]
 },
 "1092": {
  "id": "1092",
  "title": "Temporary import of medical equipment by road",
  "direction": "import",
  "goods": "medical equipment",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   6,
   24
  ],
  "blocksCount": 5,
  "stepsCount": 22,
  "onlineCount": 8,
  "entities": [
   "Single portal of interactive state services",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs warehouse",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Bank"
  ]
 },
 "1096": {
  "id": "1096",
  "title": "Re-export of medical equipment by road",
  "direction": "export",
  "goods": "medical equipment",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   94,
   203
  ],
  "blocksCount": 4,
  "stepsCount": 21,
  "onlineCount": 5,
  "entities": [
   "Transportation company",
   "Warehouse / Location of goods",
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "1101": {
  "id": "1101",
  "title": "Temporary export of reusable packaging by road",
  "direction": "export",
  "goods": "reusable packaging",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   14,
   43
  ],
  "blocksCount": 4,
  "stepsCount": 19,
  "onlineCount": 5,
  "entities": [
   "Single portal of interactive state services",
   "Transportation company",
   "Warehouse / Location of goods",
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "1104": {
  "id": "1104",
  "title": "Re-import of reusable packaging by road",
  "direction": "import",
  "goods": "reusable packaging",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   6,
   25
  ],
  "blocksCount": 5,
  "stepsCount": 22,
  "onlineCount": 8,
  "entities": [
   "Single portal of interactive state services",
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs warehouse",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Bank"
  ]
 },
 "1105": {
  "id": "1105",
  "title": "Registration of foreign trade contract",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   0,
   0
  ],
  "blocksCount": 1,
  "stepsCount": 1,
  "onlineCount": 1,
  "entities": [
   "Single portal of interactive state services"
  ]
 },
 "1108": {
  "id": "1108",
  "title": "Clearance of temporary import of medical equipment by road",
  "direction": "import",
  "goods": "temporary import of medical equipment",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   6,
   23
  ],
  "blocksCount": 4,
  "stepsCount": 21,
  "onlineCount": 7,
  "entities": [
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs warehouse",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Bank"
  ]
 },
 "1113": {
  "id": "1113",
  "title": "Clearance of medical equipment by road",
  "direction": "import",
  "goods": "medical equipment",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   83,
   173
  ],
  "blocksCount": 3,
  "stepsCount": 16,
  "onlineCount": 5,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "1116": {
  "id": "1116",
  "title": "Clearance of reusable packaging by road",
  "direction": "import",
  "goods": "reusable packaging",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   6,
   24
  ],
  "blocksCount": 4,
  "stepsCount": 21,
  "onlineCount": 7,
  "entities": [
   "Automated information system \"E-tranzit\"",
   "State border crossing point",
   "Customs warehouse",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "Bank"
  ]
 },
 "1122": {
  "id": "1122",
  "title": "Clearance of temporary export of reusable packaging by road",
  "direction": "import",
  "goods": "temporary export of reusable packaging",
  "mode": "road",
  "kind": "customs",
  "timeframe": [
   2,
   12
  ],
  "blocksCount": 2,
  "stepsCount": 13,
  "onlineCount": 4,
  "entities": [
   "Personal cabinet of participant of foreign economic activity",
   "Bank",
   "Customs post of foreign trade activity",
   "State border crossing point"
  ]
 },
 "1141": {
  "id": "1141",
  "title": "Import of salt by train",
  "direction": "import",
  "goods": "salt",
  "mode": "train",
  "kind": "customs",
  "timeframe": [
   14,
   54
  ],
  "blocksCount": 12,
  "stepsCount": 34,
  "onlineCount": 16,
  "entities": [
   "Single portal of interactive state services",
   "Uzbekistan railways Single window",
   "Bank",
   "Tashkent regional railway junction",
   "Customs warehouse",
   "Railway station",
   "Customs post of foreign trade activity",
   "Personal cabinet of participant of foreign economic activity",
   "One-stop service system Single window",
   "Online banking system"
  ]
 },
 "1155": {
  "id": "1155",
  "title": "Obtain sanitary-epidemiological conclusion",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   4,
   9
  ],
  "blocksCount": 1,
  "stepsCount": 2,
  "onlineCount": 2,
  "entities": [
   "One-stop service system Single window"
  ]
 },
 "1179": {
  "id": "1179",
  "title": "Test customs payment",
  "direction": "export",
  "goods": "any cargo",
  "mode": "any",
  "kind": "service",
  "timeframe": [
   56,
   297
  ],
  "blocksCount": 2,
  "stepsCount": 8,
  "onlineCount": 2,
  "entities": [
   "Bank",
   "Online banking system",
   "State nature protection comittee",
   "Single portal of interactive state services"
  ]
 }
};
