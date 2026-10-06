/* One-off: what the commercial invoice spec actually calls its fields. */
import { specFor } from "../../modules/documents/specs";
const spec = specFor("commercial_invoice");
for (const f of spec.fields) console.log(`${f.key.padEnd(24)} ${f.required ? "required" : "        "}  q=${f.questions.length} a=${f.anchors.length}`);
