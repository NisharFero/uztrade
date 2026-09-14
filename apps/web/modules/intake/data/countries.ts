/* Country fixture supplied for this prototype - read-only here, editable in a
 * real deployment.
 *
 * Intake's route step accepts only the partner countries listed here (one end
 * of every shipment is Uzbekistan). Compliance & Risk reads origin proof,
 * crossing points and destination requirements from it. Cities are resolved
 * to a country by the gazetteer in modules/intake/shipment-plan.ts; this file decides
 * whether that country is supported and what it requires. */

export type CountryProfile = {
  iso: string;
  name: string;
  region: string;
  eaeu: boolean;
  /** Proof of origin the destination expects, as supplied. */
  originProof: string | null;
  crossingPoints: string[];
  /** When no named crossing applies, how the route goes instead. */
  crossingNote: string | null;
  destinationRequirements: string[];
};

export const COUNTRY_FIXTURE_SOURCE = "Prototype country fixture (supplied) — verify before relying on it";

export const COUNTRIES: Record<string, CountryProfile> = {
  UZ: {
    iso: "UZ",
    name: "Uzbekistan",
    region: "Central Asia",
    eaeu: false,
    originProof: null,
    crossingPoints: [],
    crossingNote: null,
    destinationRequirements: [],
  },
  KZ: {
    iso: "KZ",
    name: "Kazakhstan",
    region: "Central Asia",
    eaeu: true,
    originProof: "Form CT-1",
    crossingPoints: ["Gisht-Ko'prik", "Yallama", "Daut-Ata"],
    crossingNote: null,
    destinationRequirements: ["Phytosanitary certificate for fresh produce", "Fumigation for wooden packaging (ISPM 15)"],
  },
  KG: {
    iso: "KG",
    name: "Kyrgyzstan",
    region: "Central Asia",
    eaeu: true,
    originProof: "Form CT-1",
    crossingPoints: ["Dostuk", "Uch-Kurgan"],
    crossingNote: null,
    destinationRequirements: ["Phytosanitary certificate for fresh produce"],
  },
  TR: {
    iso: "TR",
    name: "Türkiye",
    region: "Western Asia",
    eaeu: false,
    originProof: "Form A / EUR.1",
    crossingPoints: [],
    crossingNote: "Sea and air routes",
    destinationRequirements: ["Veterinary certificate for animal products", "Food test report from an accredited laboratory"],
  },
  AF: {
    iso: "AF",
    name: "Afghanistan",
    region: "South Asia",
    eaeu: false,
    originProof: "Certificate of origin (general form)",
    crossingPoints: ["Termez / Hairatan"],
    crossingNote: null,
    destinationRequirements: ["Transit declaration for onward movement"],
  },
  RU: {
    iso: "RU",
    name: "Russia",
    region: "Eastern Europe",
    eaeu: true,
    originProof: "Form CT-1",
    crossingPoints: [],
    crossingNote: "Via Kazakhstan",
    destinationRequirements: ["Phytosanitary certificate for fresh produce"],
  },
  CN: {
    iso: "CN",
    name: "China",
    region: "East Asia",
    eaeu: false,
    originProof: "Form A",
    crossingPoints: [],
    crossingNote: "Via Kyrgyzstan / Kazakhstan",
    destinationRequirements: ["Registration of the exporter with GACC for foodstuffs"],
  },
};

export const HOME_COUNTRY = "UZ";

/** Countries a shipment can go to or come from. */
export const PARTNER_COUNTRIES: CountryProfile[] = Object.values(COUNTRIES).filter((c) => c.iso !== HOME_COUNTRY);
