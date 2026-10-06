/* One-off: which procedure the chat path opens, for goods with several
 * published treatments. A clearance-only case presupposes permits a full
 * import produces, so picking one by accident would be a quiet mistake. */
import { classifyByRules, settleMatch } from "../../modules/intake/classify";
import { CATALOGUE } from "../../modules/procedures/data/procedures.generated";

const queries = [
  "import 20 tonnes of dairy products by train from Almaty to Tashkent",
  "import 20 tonnes of dairy products by road from Almaty to Tashkent",
  "clearance only of dairy products by train, they are at the border",
  "import medical equipment by road temporarily",
  "import flour by train from Kazakhstan",
];

for (const q of queries) {
  const m = settleMatch(classifyByRules(q), q);
  const p = m.procedureId ? CATALOGUE[m.procedureId] : null;
  console.log(`${q}\n  -> ${m.status} ${m.procedureId ?? ""} ${p ? `${p.regime.padEnd(9)} ${p.title}` : m.reason}`);
}
