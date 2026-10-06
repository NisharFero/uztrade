/* One-off: what the chat says about the next step of a case. */
import { briefStep } from "../../modules/steps/briefing";
import type { AssistantView } from "../../modules/steps/assistant";

const caseId = process.argv[2] ?? "UZ-2609-0010";
const view = (await (await fetch(`http://localhost:3000/api/cases/${caseId}/assistant`)).json()) as AssistantView;
if (!view.next) {
  console.log("nothing outstanding");
} else {
  const brief = briefStep(view.next);
  console.log(brief.headline);
  console.log();
  for (const p of brief.paragraphs) console.log(p);
  if (brief.missing.length) {
    console.log();
    for (const n of brief.missing) console.log(`• ${n.label}${n.optional ? " (optional)" : ""}`);
  }
  console.log();
  console.log("upload button:", brief.upload ? `“Upload ${brief.upload.label.toLowerCase()}”` : "none");
}
