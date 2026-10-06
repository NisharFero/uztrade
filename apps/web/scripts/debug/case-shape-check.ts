/* One-off: what a case for goods outside the original six actually says.
 *
 * Cold chain, unit sizing, perishability and the certificate-rule gap all used
 * to be decided by one category name, so a yoghurt case planned a dry wagon and
 * an empty certificate list.
 */
import { assessCompliance } from "../../modules/compliance/compliance";
import { unitsFor } from "../../modules/intake/shipment-plan";
import { requireProcedure } from "../../modules/procedures/registry";

const cases: { id: string; goods: string; tonnes: number }[] = [
  { id: "109", goods: "yoghurt", tonnes: 12 },
  { id: "288", goods: "cheese", tonnes: 40 },
  { id: "1052", goods: "carpets", tonnes: 5 },
  { id: "868", goods: "tea", tonnes: 60 },
  { id: "325", goods: "tomatoes", tonnes: 20 },
];

for (const c of cases) {
  const procedure = await requireProcedure(c.id);
  const units = unitsFor(procedure.mode, procedure.goods, c.tonnes);
  const compliance = assessCompliance(procedure, { goods: c.goods, quantity: c.tonnes, unit: "tonnes" });
  const perishable = compliance.inputs.find((i) => i.key === "perishability")?.value;
  const gap = compliance.unresolved.find((u) => /Certificate rule/.test(u.input));
  console.log(
    `${c.id.padEnd(5)} ${c.goods.padEnd(10)} ${String(c.tonnes).padStart(3)} t  ->  ` +
      `${units.count} × ${units.kind} (${units.perUnitT} t)  ·  ${perishable}  ·  HS ${compliance.hsCode}  ·  ` +
      `${gap ? "no certificate rule (said so)" : "certificate rule applies"}`,
  );
}
