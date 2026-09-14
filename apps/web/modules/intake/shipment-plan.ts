/* Shipment plan: what the quantity and the distance of a shipment do to a
 * case.
 *
 * The published procedures give durations for the paperwork of ONE
 * consignment and stop at dispatch. A trader asking "export 60 tonnes of tea
 * from Tashkent to Moscow" needs two more answers the documents don't carry:
 *
 *   - Quantity -> how many wagons / air pallets, and therefore how much longer
 *     the steps that touch the goods take (loading, sampling, inspection).
 *   - Distance -> the transit corridor (countries, border crossings, gauge
 *     changes, sea legs) and how long the goods are actually moving.
 *
 * Every figure below is a PLANNING ASSUMPTION - capacities, speeds and
 * handling allowances typical of Central Asian rail and air cargo, not a
 * quote from a railway or airline - and the panel says so. The logic is
 * deterministic so it is testable and never depends on the LLM being up.
 */

import { requiresPhysical } from "../procedures/delegation";
import type { Procedure, ProcedureBlock } from "../procedures/data/procedures.generated";
import type { ShipmentFacts } from "../workflow/domain";

export type Hours = [number, number];

/* ------------------------------------------------------------ gazetteer --- */

export type Place = { name: string; country: string; lat: number; lon: number };

const COUNTRY_NAMES: Record<string, { name: string; aliases: string[]; hub: string }> = {
  UZ: { name: "Uzbekistan", aliases: ["uzbekistan", "o'zbekiston", "uzbek"], hub: "Tashkent" },
  KZ: { name: "Kazakhstan", aliases: ["kazakhstan"], hub: "Almaty" },
  KG: { name: "Kyrgyzstan", aliases: ["kyrgyzstan", "kirghizia"], hub: "Bishkek" },
  TJ: { name: "Tajikistan", aliases: ["tajikistan"], hub: "Dushanbe" },
  TM: { name: "Turkmenistan", aliases: ["turkmenistan"], hub: "Ashgabat" },
  AF: { name: "Afghanistan", aliases: ["afghanistan"], hub: "Mazar-i-Sharif" },
  RU: { name: "Russia", aliases: ["russia", "russian federation"], hub: "Moscow" },
  BY: { name: "Belarus", aliases: ["belarus"], hub: "Minsk" },
  UA: { name: "Ukraine", aliases: ["ukraine"], hub: "Kyiv" },
  LV: { name: "Latvia", aliases: ["latvia"], hub: "Riga" },
  LT: { name: "Lithuania", aliases: ["lithuania"], hub: "Vilnius" },
  PL: { name: "Poland", aliases: ["poland"], hub: "Warsaw" },
  DE: { name: "Germany", aliases: ["germany"], hub: "Berlin" },
  NL: { name: "Netherlands", aliases: ["netherlands", "holland"], hub: "Rotterdam" },
  GB: { name: "United Kingdom", aliases: ["united kingdom", "uk", "england", "britain"], hub: "London" },
  CN: { name: "China", aliases: ["china"], hub: "Urumqi" },
  IR: { name: "Iran", aliases: ["iran"], hub: "Tehran" },
  TR: { name: "Turkey", aliases: ["turkey", "turkiye", "türkiye"], hub: "Istanbul" },
  AZ: { name: "Azerbaijan", aliases: ["azerbaijan"], hub: "Baku" },
  GE: { name: "Georgia", aliases: ["georgia"], hub: "Tbilisi" },
  AE: { name: "United Arab Emirates", aliases: ["united arab emirates", "uae", "emirates"], hub: "Dubai" },
  SA: { name: "Saudi Arabia", aliases: ["saudi arabia", "saudi"], hub: "Riyadh" },
  PK: { name: "Pakistan", aliases: ["pakistan"], hub: "Karachi" },
  IN: { name: "India", aliases: ["india"], hub: "Delhi" },
  KR: { name: "South Korea", aliases: ["south korea", "korea"], hub: "Seoul" },
  JP: { name: "Japan", aliases: ["japan"], hub: "Tokyo" },
};

/* [name, country, lat, lon, ...aliases] */
const CITIES: [string, string, number, number, ...string[]][] = [
  ["Tashkent", "UZ", 41.3, 69.24, "toshkent", "tashkand"],
  ["Samarkand", "UZ", 39.65, 66.96, "samarqand"],
  ["Bukhara", "UZ", 39.77, 64.42, "buxoro"],
  ["Andijan", "UZ", 40.78, 72.34, "andijon"],
  ["Namangan", "UZ", 41.0, 71.67],
  ["Fergana", "UZ", 40.38, 71.79, "farg'ona", "ferghana"],
  ["Kokand", "UZ", 40.53, 70.94, "qo'qon"],
  ["Navoi", "UZ", 40.1, 65.37, "navoiy"],
  ["Karshi", "UZ", 38.86, 65.79, "qarshi"],
  ["Termez", "UZ", 37.22, 67.28, "termiz"],
  ["Nukus", "UZ", 42.46, 59.6],
  ["Urgench", "UZ", 41.55, 60.63],
  ["Jizzakh", "UZ", 40.12, 67.84, "jizzax"],
  ["Almaty", "KZ", 43.24, 76.89, "alma-ata"],
  ["Astana", "KZ", 51.17, 71.45, "nur-sultan"],
  ["Shymkent", "KZ", 42.34, 69.59],
  ["Aktobe", "KZ", 50.28, 57.17],
  ["Aktau", "KZ", 43.65, 51.17],
  ["Bishkek", "KG", 42.87, 74.59],
  ["Osh", "KG", 40.51, 72.81],
  ["Dushanbe", "TJ", 38.56, 68.77],
  ["Khujand", "TJ", 40.28, 69.62],
  ["Ashgabat", "TM", 37.96, 58.33],
  ["Turkmenbashi", "TM", 40.02, 52.96],
  ["Kabul", "AF", 34.53, 69.17],
  ["Mazar-i-Sharif", "AF", 36.71, 67.11, "mazar-e-sharif", "mazar"],
  ["Hairatan", "AF", 37.23, 67.42],
  ["Moscow", "RU", 55.76, 37.62, "moskva"],
  ["Saint Petersburg", "RU", 59.93, 30.34, "st petersburg", "st. petersburg", "petersburg"],
  ["Novosibirsk", "RU", 55.03, 82.92],
  ["Yekaterinburg", "RU", 56.84, 60.61, "ekaterinburg"],
  ["Kazan", "RU", 55.79, 49.12],
  ["Samara", "RU", 53.2, 50.15],
  ["Chelyabinsk", "RU", 55.16, 61.4],
  ["Omsk", "RU", 54.99, 73.37],
  ["Krasnodar", "RU", 45.04, 38.98],
  ["Rostov-on-Don", "RU", 47.24, 39.71, "rostov"],
  ["Vladivostok", "RU", 43.12, 131.89],
  ["Minsk", "BY", 53.9, 27.57],
  ["Kyiv", "UA", 50.45, 30.52, "kiev"],
  ["Riga", "LV", 56.95, 24.11],
  ["Vilnius", "LT", 54.69, 25.28],
  ["Warsaw", "PL", 52.23, 21.01],
  ["Berlin", "DE", 52.52, 13.4],
  ["Hamburg", "DE", 53.55, 9.99],
  ["Rotterdam", "NL", 51.92, 4.48],
  ["London", "GB", 51.51, -0.13],
  ["Urumqi", "CN", 43.83, 87.62, "urumchi", "ürümqi"],
  ["Kashgar", "CN", 39.47, 75.99],
  ["Xi'an", "CN", 34.34, 108.94, "xian"],
  ["Beijing", "CN", 39.9, 116.41],
  ["Shanghai", "CN", 31.23, 121.47],
  ["Chongqing", "CN", 29.56, 106.55],
  ["Tehran", "IR", 35.69, 51.39],
  ["Mashhad", "IR", 36.3, 59.61],
  ["Bandar Abbas", "IR", 27.18, 56.27],
  ["Istanbul", "TR", 41.01, 28.98],
  ["Ankara", "TR", 39.93, 32.86],
  ["Mersin", "TR", 36.81, 34.64],
  ["Baku", "AZ", 40.41, 49.87],
  ["Tbilisi", "GE", 41.72, 44.79],
  ["Poti", "GE", 42.15, 41.67],
  ["Dubai", "AE", 25.2, 55.27],
  ["Abu Dhabi", "AE", 24.45, 54.38],
  ["Riyadh", "SA", 24.71, 46.68],
  ["Jeddah", "SA", 21.49, 39.19],
  ["Karachi", "PK", 24.86, 67.01],
  ["Lahore", "PK", 31.52, 74.36],
  ["Islamabad", "PK", 33.68, 73.05],
  ["Peshawar", "PK", 34.01, 71.58],
  ["Delhi", "IN", 28.61, 77.21, "new delhi"],
  ["Mumbai", "IN", 19.08, 72.88, "bombay"],
  ["Seoul", "KR", 37.57, 126.98],
  ["Tokyo", "JP", 35.68, 139.69],
];

const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’`]/g, "'");

type Alias = { alias: string; place: Place };

const ALIASES: Alias[] = (() => {
  const out: Alias[] = [];
  const byName = new Map<string, Place>();
  for (const [name, country, lat, lon, ...aliases] of CITIES) {
    const place = { name, country, lat, lon };
    byName.set(name, place);
    for (const a of [name, ...aliases]) out.push({ alias: normalize(a), place });
  }
  // A country on its own ("to Russia") resolves to its main freight hub.
  for (const c of Object.values(COUNTRY_NAMES)) {
    const hub = byName.get(c.hub);
    if (hub) for (const a of c.aliases) out.push({ alias: normalize(a), place: hub });
  }
  // Longest first, so "new delhi" beats "delhi" and "saint petersburg" beats "petersburg".
  return out.sort((a, b) => b.alias.length - a.alias.length);
})();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every place mentioned in free text, in order of appearance. */
export function placesIn(text: string): { place: Place; index: number }[] {
  const t = normalize(text);
  const found: { place: Place; index: number; end: number }[] = [];
  for (const { alias, place } of ALIASES) {
    const re = new RegExp(`(^|[^a-z'])${escape(alias)}(?![a-z])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const index = m.index + m[1].length;
      const end = index + alias.length;
      if (!found.some((f) => index < f.end && end > f.index)) found.push({ place, index, end });
    }
  }
  return found.sort((a, b) => a.index - b.index).map(({ place, index }) => ({ place, index }));
}

export function findPlace(text: string | null | undefined): Place | null {
  return text ? placesIn(text)[0]?.place ?? null : null;
}

export function countryName(code: string): string {
  return COUNTRY_NAMES[code]?.name ?? code;
}

/* ---------------------------------------------------------------- route --- */

export type RouteEnd = { place: Place; assumed: boolean };

/** Origin and destination from the extracted facts, falling back to reading
 *  the query itself ("to Moscow from Samarkand", "Tashkent to Almaty"). When
 *  the Uzbek end is missing it is assumed to be Tashkent and flagged. */
/** The places the trader actually named, with no defaults filled in. */
export function mentionedRoute(
  facts: Pick<ShipmentFacts, "origin" | "destination">,
  query = "",
): { origin: Place | null; destination: Place | null } {
  let origin = findPlace(facts.origin);
  let destination = findPlace(facts.destination);

  if (!origin || !destination) {
    const t = normalize(query);
    const mentions = placesIn(query);
    const after = (keyword: RegExp) => {
      const m = keyword.exec(t);
      return m ? mentions.find((p) => p.index >= m.index + m[0].length - 1)?.place ?? null : null;
    };
    origin ??= after(/\bfrom\s/);
    destination ??= after(/\b(?:to|into)\s/);
    const others = mentions.map((m) => m.place).filter((p) => p !== origin && p !== destination);
    if (!origin && !destination && others.length >= 2) {
      origin = others[0];
      destination = others[others.length - 1];
    } else if (!destination && origin) {
      destination = others.find((p) => p.country !== origin!.country) ?? null;
    } else if (!origin && destination) {
      origin = others.find((p) => p.country !== destination!.country) ?? null;
    }
  }

  return { origin, destination };
}

export function resolveRoute(
  direction: "import" | "export",
  facts: Pick<ShipmentFacts, "origin" | "destination">,
  query = "",
): { origin: RouteEnd | null; destination: RouteEnd | null } {
  const { origin, destination } = mentionedRoute(facts, query);
  const tashkent = findPlace("Tashkent")!;
  const originEnd = origin ? { place: origin, assumed: false } : direction === "export" ? { place: tashkent, assumed: true } : null;
  const destEnd = destination ? { place: destination, assumed: false } : direction === "import" ? { place: tashkent, assumed: true } : null;
  return { origin: originEnd, destination: destEnd };
}

const R_KM = 6371;
export function greatCircleKm(a: Place, b: Place): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

/* Rail corridors from Uzbekistan by partner country: the countries crossed in
   between, any break of gauge (the CIS 1520 mm network meets 1435 mm at the
   Chinese, Iranian and EU borders) and any leg that is not rail at all. */
type Corridor = { via: string[]; gaugeBreak?: string; sea?: string; road?: string };
const RAIL_CORRIDORS: Record<string, Corridor> = {
  UZ: { via: [] },
  KZ: { via: [] },
  KG: { via: [] },
  TJ: { via: [] },
  TM: { via: [] },
  AF: { via: [] },
  RU: { via: ["KZ"] },
  BY: { via: ["KZ", "RU"] },
  LV: { via: ["KZ", "RU"] },
  LT: { via: ["KZ", "RU", "BY"] },
  PL: { via: ["KZ", "RU", "BY"], gaugeBreak: "1520 → 1435 mm at the Belarus–Poland border" },
  DE: { via: ["KZ", "RU", "BY", "PL"], gaugeBreak: "1520 → 1435 mm at the Belarus–Poland border" },
  NL: { via: ["KZ", "RU", "BY", "PL", "DE"], gaugeBreak: "1520 → 1435 mm at the Belarus–Poland border" },
  CN: { via: ["KZ"], gaugeBreak: "1520 → 1435 mm at Dostyk / Khorgos" },
  IR: { via: ["TM"], gaugeBreak: "1520 → 1435 mm at Sarakhs" },
  TR: { via: ["TM", "IR"], gaugeBreak: "1520 → 1435 mm at Sarakhs" },
  AZ: { via: ["TM"], sea: "Caspian ferry Turkmenbashi → Baku" },
  GE: { via: ["TM", "AZ"], sea: "Caspian ferry Turkmenbashi → Baku" },
  AE: { via: ["TM", "IR"], gaugeBreak: "1520 → 1435 mm at Sarakhs", sea: "Sea leg Bandar Abbas → Jebel Ali" },
  SA: { via: ["TM", "IR"], gaugeBreak: "1520 → 1435 mm at Sarakhs", sea: "Sea leg from Bandar Abbas" },
  IN: { via: ["TM", "IR"], gaugeBreak: "1520 → 1435 mm at Sarakhs", sea: "Sea leg Bandar Abbas → Mumbai" },
  PK: { via: ["AF"], road: "No rail through Afghanistan to Pakistan yet — road leg from Hairatan" },
  KR: { via: ["KZ", "CN"], gaugeBreak: "1520 → 1435 mm at Dostyk / Khorgos", sea: "Sea leg from a Chinese port" },
  JP: { via: ["KZ", "CN"], gaugeBreak: "1520 → 1435 mm at Dostyk / Khorgos", sea: "Sea leg from a Chinese port" },
};

/* Planning allowances, in hours. */
const RAIL = {
  routeFactor: 1.25, // rail track vs great-circle
  kmPerDay: [450, 250] as Hours, // wagon-load freight incl. marshalling: best, worst
  border: [12, 36] as Hours,
  gaugeBreak: [24, 48] as Hours,
  sea: [72, 168] as Hours,
  road: [24, 72] as Hours,
};
const AIR = {
  routeFactor: 1.08,
  kmPerHour: 750,
  originHandling: [24, 48] as Hours, // acceptance, screening, build-up
  destHandling: [12, 36] as Hours,
  transfer: [12, 24] as Hours,
  transferEveryKm: 4500,
};

export type Route = {
  origin: RouteEnd;
  destination: RouteEnd;
  mode: "train" | "air";
  distanceKm: number;
  via: string[];
  borders: number;
  gaugeBreak: string | null;
  sea: string | null;
  road: string | null;
  transfers: number;
  transit: Hours;
  modelled: boolean;
};

export function planRoute(mode: "train" | "air", origin: RouteEnd, destination: RouteEnd, direction: "import" | "export"): Route {
  const gc = greatCircleKm(origin.place, destination.place);
  const partner = direction === "export" ? destination.place.country : origin.place.country;
  const domestic = origin.place.country === destination.place.country;

  if (mode === "air") {
    const distanceKm = Math.round(gc * AIR.routeFactor);
    const transfers = Math.floor(distanceKm / AIR.transferEveryKm);
    const flight = distanceKm / AIR.kmPerHour;
    const transit: Hours = [
      flight + AIR.originHandling[0] + AIR.destHandling[0] + transfers * AIR.transfer[0],
      flight + AIR.originHandling[1] + AIR.destHandling[1] + transfers * AIR.transfer[1],
    ];
    return {
      origin, destination, mode, distanceKm, via: [], borders: domestic ? 0 : 1,
      gaugeBreak: null, sea: null, road: null, transfers, transit: round(transit), modelled: true,
    };
  }

  const corridor = domestic ? { via: [] } : RAIL_CORRIDORS[partner];
  const c: Corridor = corridor ?? { via: [] };
  const distanceKm = Math.round(gc * RAIL.routeFactor);
  const borders = domestic ? 0 : c.via.length + 1;
  const add = (h: Hours, n = 1): Hours => [h[0] * n, h[1] * n];
  const legs: Hours[] = [
    [(distanceKm / RAIL.kmPerDay[0]) * 24, (distanceKm / RAIL.kmPerDay[1]) * 24],
    add(RAIL.border, borders),
    c.gaugeBreak ? RAIL.gaugeBreak : [0, 0],
    c.sea ? RAIL.sea : [0, 0],
    c.road ? RAIL.road : [0, 0],
  ];
  const transit = legs.reduce<Hours>((s, l) => [s[0] + l[0], s[1] + l[1]], [0, 0]);
  return {
    origin, destination, mode, distanceKm, via: c.via, borders,
    gaugeBreak: c.gaugeBreak ?? null, sea: c.sea ?? null, road: c.road ?? null,
    transfers: 0, transit: round(transit), modelled: Boolean(corridor) || domestic,
  };
}

const round = (h: Hours): Hours => [Math.round(h[0]), Math.round(h[1])];

/* ------------------------------------------------------------- quantity --- */

/* Tonnes one unit carries. Tea and dried fruit fill a covered wagon's volume
   long before its 68 t weight limit; fresh produce travels refrigerated. */
const WAGON_T: Record<string, number> = { tea: 30, "dried fruits": 45, "fresh fruits and vegetables": 22 };
const CONTAINER_T: Record<string, number> = { tea: 18, "dried fruits": 22, "fresh fruits and vegetables": 22 };
const AIR_PALLET_T = 3.5; // one main-deck PMC pallet of packed tea
const FREIGHTER_T = 100; // one wide-body freighter
const BELLY_T = 10; // what scheduled passenger bellies realistically take

export function toTonnes(quantity: number | null, unit: string | null, goods: string): number | null {
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) return null;
  const u = (unit ?? "t").toLowerCase();
  if (/^(kg|kgs|kilo|kilogram)/.test(u)) return quantity / 1000;
  if (/^wagon|^railcar/.test(u)) return quantity * (WAGON_T[goods] ?? 30);
  if (/^container/.test(u)) return quantity * (CONTAINER_T[goods] ?? 18);
  if (/^(lb|pound)/.test(u)) return (quantity * 0.4536) / 1000;
  return quantity; // t, tonnes, tons, mt - read as metric tonnes
}

export type Units = { kind: string; count: number; perUnitT: number; assumed: boolean };

export function unitsFor(mode: "train" | "air", goods: string, tonnes: number | null): Units {
  if (mode === "air") {
    return { kind: "air pallet", count: tonnes ? Math.max(1, Math.ceil(tonnes / AIR_PALLET_T)) : 1, perUnitT: AIR_PALLET_T, assumed: tonnes == null };
  }
  const perUnitT = WAGON_T[goods] ?? 30;
  const kind = goods === "fresh fruits and vegetables" ? "refrigerated wagon" : "covered wagon";
  return { kind, count: tonnes ? Math.max(1, Math.ceil(tonnes / perUnitT)) : 1, perUnitT, assumed: tonnes == null };
}

/* ---------------------------------------------------------- adjustments --- */

export type Adjustment = { blockId: string; name: string; published: Hours; adjusted: Hours; reason: string };

/** Only blocks that handle the goods scale with the load: every extra wagon
 *  is loaded, sealed, sampled and inspected. Paperwork, and dispatch of a
 *  train that leaves as one, does not. */
function adjustmentsFor(blocks: ProcedureBlock[], units: Units, mode: "train" | "air"): Adjustment[] {
  if (units.count <= 1) return [];
  const extra = units.count - 1;
  const out: Adjustment[] = [];
  for (const b of blocks) {
    if (!requiresPhysical(b) || /dispatch/i.test(b.name)) continue;
    const loading = /load/i.test(b.name);
    const rate: Hours = mode === "air" ? (loading ? [0.5, 1] : [0.25, 0.5]) : loading ? [2, 4] : [1, 2];
    const adjusted: Hours = [b.estDuration[0] + extra * rate[0], b.estDuration[1] + extra * rate[1]];
    const what = /unload/i.test(b.name)
      ? "unloaded"
      : loading
        ? mode === "air" ? "built up" : "loaded and sealed"
        : /inspect|sampl|quarantine|sanitary|expert|origin|clearance/i.test(b.name)
          ? "sampled and inspected"
          : "handled";
    out.push({
      blockId: b.id,
      name: b.name,
      published: b.estDuration,
      adjusted: round(adjusted),
      reason: `${extra} more ${units.kind}${extra === 1 ? "" : "s"} to be ${what} (+${fmtRate(rate)} each)`,
    });
  }
  return out;
}

const fmtRate = ([a, b]: Hours) => (a === b ? `${a}h` : `${a}–${b}h`);

/** Longest path through the blocks, separately for the optimistic and the
 *  pessimistic ends of each range. */
export function pathHours(blocks: ProcedureBlock[], durations: Map<string, Hours>): Hours {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const memo = new Map<string, Hours>();
  const finish = (id: string): Hours => {
    const cached = memo.get(id);
    if (cached) return cached;
    const b = byId.get(id)!;
    const start = b.dependsOn.reduce<Hours>((m, d) => {
      const f = finish(d);
      return [Math.max(m[0], f[0]), Math.max(m[1], f[1])];
    }, [0, 0]);
    const own = durations.get(id) ?? b.estDuration;
    const f: Hours = [start[0] + own[0], start[1] + own[1]];
    memo.set(id, f);
    return f;
  };
  return blocks.reduce<Hours>((m, b) => {
    const f = finish(b.id);
    return [Math.max(m[0], f[0]), Math.max(m[1], f[1])];
  }, [0, 0]);
}

/* ------------------------------------------------------ mode + the plan --- */

const EXPLICIT_MODE = /\b(air|plane|flight|fly|airfreight|rail|train|wagons?|railcar|road|truck|lorry)\b/i;
export const statesMode = (query: string) => EXPLICIT_MODE.test(query);

/** When the trader didn't say train or air, let the load decide: a
 *  wagonload belongs on rail; a few hundred kilos going far goes by air. */
export function recommendMode(goods: string, tonnes: number | null, distanceKm: number | null): { mode: "train" | "air"; reason: string } {
  if (tonnes == null) return { mode: "train", reason: "no quantity was given, so rail — the default for bulk " + goods + " — was assumed" };
  const t = fmtTonnes(tonnes);
  if (tonnes < 2 && (distanceKm == null || distanceKm > 1000)) {
    return { mode: "air", reason: `${t} is under 2 t${distanceKm ? ` over ~${distanceKm.toLocaleString("en-US")} km` : ""}, so air is faster and a wagon would travel mostly empty` };
  }
  if (tonnes >= BELLY_T) return { mode: "train", reason: `${t} is a wagonload — by air it would need a freighter charter` };
  return { mode: "train", reason: `${t} fits rail economically; air pays off only for loads under about 2 t` };
}

export type PlanNote = { tone: "info" | "caution" | "high"; text: string };

export type ShipmentPlan = {
  tonnes: number | null;
  units: Units;
  route: Route | null;
  adjustments: Adjustment[];
  paperwork: Hours;
  publishedPaperwork: Hours;
  doorToDoor: Hours | null;
  notes: PlanNote[];
  missing: string[];
};

export function fmtTonnes(t: number): string {
  if (t < 1) return `${Math.round(t * 1000).toLocaleString("en-US")} kg`;
  return `${Number.isInteger(t) ? t : t.toFixed(1)} t`;
}

export function buildShipmentPlan(procedure: Procedure, facts: ShipmentFacts, query = ""): ShipmentPlan {
  const mode = procedure.mode === "air" ? "air" : "train";
  const goods = procedure.goods;
  const tonnes = toTonnes(facts.quantity, facts.unit, goods);
  const units = unitsFor(mode, goods, tonnes);
  const ends = resolveRoute(procedure.direction, facts, query);
  const route = ends.origin && ends.destination ? planRoute(mode, ends.origin, ends.destination, procedure.direction) : null;

  const adjustments = adjustmentsFor(procedure.blocks, units, mode);
  const durations = new Map(adjustments.map((a) => [a.blockId, a.adjusted]));
  const publishedPaperwork = pathHours(procedure.blocks, new Map());
  const paperwork = pathHours(procedure.blocks, durations);
  const doorToDoor: Hours | null = route ? [paperwork[0] + route.transit[0], paperwork[1] + route.transit[1]] : null;

  const notes: PlanNote[] = [];
  const missing: string[] = [];

  if (tonnes == null) missing.push(`Quantity not stated — sized as one ${units.kind}. Say e.g. "20 tonnes" to size it.`);
  if (ends.origin?.assumed) missing.push(`Origin not stated — assumed ${ends.origin.place.name}.`);
  if (ends.destination?.assumed) missing.push(`Destination not stated — assumed ${ends.destination.place.name}.`);
  if (!ends.origin && facts.origin) missing.push(`Couldn't place “${facts.origin}” — transit not estimated.`);
  if (!ends.destination) {
    missing.push(facts.destination ? `Couldn't place “${facts.destination}” — transit not estimated.` : "Destination not stated — transit not estimated.");
  }

  if (tonnes != null && mode === "train") {
    if (tonnes < units.perUnitT / 2) {
      notes.push({ tone: "info", text: `${fmtTonnes(tonnes)} is under half a ${units.kind} (~${units.perUnitT} t) — book groupage or a 20-ft container rather than paying for a full wagon.` });
    }
    if (tonnes < 2) notes.push({ tone: "info", text: `At ${fmtTonnes(tonnes)}, air freight would be faster and may cost less than a part-empty wagon.` });
  }
  if (tonnes != null && mode === "air") {
    if (tonnes > FREIGHTER_T) {
      notes.push({ tone: "high", text: `${fmtTonnes(tonnes)} exceeds one freighter (~${FREIGHTER_T} t) — ${Math.ceil(tonnes / FREIGHTER_T)} flights. Rail is the realistic mode at this volume.` });
    } else if (tonnes > BELLY_T) {
      notes.push({ tone: "caution", text: `${fmtTonnes(tonnes)} is beyond typical belly capacity (~${BELLY_T} t) — needs a main-deck freighter or charter; rail would cost far less.` });
    }
  }
  if (units.count > 1) {
    notes.push({ tone: "info", text: `${units.count} ${units.kind}s — the goods-handling blocks below take longer; paperwork does not.` });
  }

  if (route) {
    if (route.origin.place.country === route.destination.place.country) {
      notes.push({ tone: "caution", text: `Both ends are in ${countryName(route.origin.place.country)} — no border is crossed, so an ${procedure.direction} procedure may not apply.` });
    }
    if (route.via.length) notes.push({ tone: "info", text: `Transit through ${route.via.map(countryName).join(" → ")}: each border adds a handover and transit-declaration check.` });
    if (route.gaugeBreak) notes.push({ tone: "caution", text: `Break of gauge (${route.gaugeBreak}) — goods are transshipped or bogies changed.` });
    if (route.sea) notes.push({ tone: "caution", text: `${route.sea} — not rail; book it separately.` });
    if (route.road) notes.push({ tone: "caution", text: route.road + "." });
    if (!route.modelled) notes.push({ tone: "info", text: "Transit corridor for this country isn't modelled — estimate uses distance only." });
    if (goods === "fresh fruits and vegetables") {
      const days = route.transit[1] / 24;
      if (days > 7) notes.push({ tone: "high", text: `Transit up to ${Math.round(days)} days is beyond the shelf life of most fresh produce — pre-cool, use reefers, or choose a nearer market.` });
      else if (days > 3) notes.push({ tone: "caution", text: `Up to ${Math.round(days)} days in transit — keep the cold chain unbroken and pre-cool before loading.` });
    }
  }

  return { tonnes, units, route, adjustments, paperwork, publishedPaperwork, doorToDoor, notes, missing };
}
