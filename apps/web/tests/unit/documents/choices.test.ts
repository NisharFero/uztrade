import assert from "node:assert/strict";
import test from "node:test";
import { composeField } from "../../../modules/documents/docai/compose";
import { crossCheck } from "../../../modules/documents/docai/crosscheck";
import { FIELD_OPTIONS, countryLabel, countryOf, normalizeValue, parseTonnes } from "../../../modules/documents/docai/validate";
import { specFor } from "../../../modules/documents/specs";

test("every value offered as a choice is one the validator accepts", () => {
  for (const [kind, options] of Object.entries(FIELD_OPTIONS)) {
    assert.ok(options?.length, `${kind} offers nothing`);
    for (const option of options!) {
      const { ok } = normalizeValue(kind as keyof typeof FIELD_OPTIONS, option);
      assert.ok(ok, `${kind} offers “${option}”, which the validator rejects`);
    }
  }
});

test("the country vocabulary covers the partners the route data covers", () => {
  // Only seven countries were listed, so the destination check silently
  // skipped every other partner.
  for (const [text, code] of [["Germany", "DE"], ["Германия", "DE"], ["Poland", "PL"], ["Iran", "IR"], ["Ukraine", "UA"], ["Japan", "JP"]] as const) {
    assert.equal(countryOf(text), code, `${text} should read as ${code}`);
  }
  assert.equal(countryLabel("DE"), "Germany");
  assert.equal(countryLabel("ZZ"), "ZZ", "an unknown code falls back to itself");
  assert.ok(FIELD_OPTIONS.country!.includes("Germany"));
});

const invoiceField = (key: string, value: string) =>
  composeField(specFor("commercial_invoice").fields.find((f) => f.key === key)!, [{ value, score: 0.9, source: "layoutlm" }], []);

test("a quantity mismatch offers both values, and both can be written back", () => {
  const checks = crossCheck("commercial_invoice", [invoiceField("quantity", "58 000 kg")], {
    intakeTonnes: 60,
    partnerCountry: "RU",
    direction: "export",
    goodsCategory: "tea",
    documents: [],
  });
  const quantity = checks.find((c) => c.check === "Quantity vs intake")!;
  assert.equal(quantity.status, "mismatch");
  const compared = quantity.compared!;
  assert.equal(compared.fieldKey, "quantity");
  assert.equal(compared.here, "58 t");
  assert.equal(compared.there, "60 t");
  // Whichever the trader picks has to survive being read back as a weight.
  assert.equal(parseTonnes(compared.here), 58);
  assert.equal(parseTonnes(compared.there), 60);
});

const phytoField = (key: string, value: string) =>
  composeField(specFor("phytosanitary_certificate").fields.find((f) => f.key === key)!, [{ value, score: 0.9, source: "layoutlm" }], []);

test("a destination that disagrees with the route is a choice, named not coded", () => {
  const checks = crossCheck("phytosanitary_certificate", [phytoField("destination_country", "Germany")], {
    intakeTonnes: null,
    partnerCountry: "RU",
    direction: "export",
    goodsCategory: "tea",
    documents: [],
  });
  const country = checks.find((c) => c.check === "Destination country vs route")!;
  assert.equal(country.status, "mismatch");
  assert.equal(country.compared?.here, "Germany");
  assert.equal(country.compared?.there, "Russia");
  assert.match(country.detail, /Germany/);
  assert.ok(!/\bDE\b/.test(country.detail), "the trader is shown names, not ISO codes");
});

test("a check that agrees offers no choice to make", () => {
  const checks = crossCheck("commercial_invoice", [invoiceField("quantity", "60 000 kg")], {
    intakeTonnes: 60,
    partnerCountry: "RU",
    direction: "export",
    goodsCategory: "tea",
    documents: [],
  });
  const quantity = checks.find((c) => c.check === "Quantity vs intake")!;
  assert.equal(quantity.status, "ok");
});
