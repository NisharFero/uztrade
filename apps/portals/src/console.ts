/* The officer's view of the sandbox registry: every application filed with
 * every entity, what the rules or an officer decided, and buttons to decide
 * first. Keys are embedded only for entities still on their development key. */

type ConsoleEntity = { id: string; name: string; site: string; key: string | null };

export function consolePage(entities: ConsoleEntity[], reviewMs: number): string {
  const data = JSON.stringify(entities).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Entity APIs · sandbox</title>
<style>
  :root { color-scheme: light dark; --ink:#1d2330; --muted:#667085; --line:#e4e7ec; --bg:#f8f9fb; --card:#fff; --ok:#067647; --warn:#b54708; --info:#175cd3; }
  @media (prefers-color-scheme: dark) { :root { --ink:#e7eaf0; --muted:#98a2b3; --line:#2c3340; --bg:#12151b; --card:#1a1f27; --ok:#47cd89; --warn:#fdb022; --info:#84adff; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px clamp(16px, 4vw, 40px); font: 14px/1.45 system-ui, sans-serif; color: var(--ink); background: var(--bg); }
  h1 { font-size: 20px; margin: 0 0 4px; } h1 small { font-weight: 500; color: var(--muted); font-size: 13px; }
  p { margin: 0 0 16px; color: var(--muted); max-width: 70ch; }
  .entities { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .entities span { border: 1px solid var(--line); background: var(--card); border-radius: 999px; padding: 4px 10px; font-size: 12px; }
  .wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--card); }
  table { border-collapse: collapse; width: 100%; min-width: 860px; }
  th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 12px; color: var(--muted); font-weight: 600; }
  tr:last-child td { border-bottom: 0; }
  code { font-size: 12px; }
  .status { font-weight: 600; white-space: nowrap; }
  .status[data-s="approved"] { color: var(--ok); } .status[data-s="changes_requested"] { color: var(--warn); } .status[data-s="under_review"] { color: var(--info); }
  .detail { font-size: 12px; color: var(--muted); } .detail b { color: var(--ink); font-weight: 600; }
  button { font: inherit; font-size: 12px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); border-radius: 6px; padding: 3px 8px; cursor: pointer; margin: 0 4px 4px 0; }
  .empty { color: var(--muted); text-align: center; padding: 24px; }
</style>
</head>
<body>
<h1>Entity APIs <small>sandbox registry</small></h1>
<p>Applications filed with each entity by the trade agent or anyone holding the entity's key. The entity's rules review an application ${Math.round(reviewMs / 1000)} s after it is filed; an officer can decide before that.</p>
<div class="entities" id="entities"></div>
<div class="wrap"><table>
  <thead><tr><th>Reference</th><th>Entity · service</th><th>Status</th><th>Rev.</th><th>Case</th><th>Changes requested / issued</th><th>Updated</th><th>Officer</th></tr></thead>
  <tbody id="rows"><tr><td colspan="8" class="empty">Loading…</td></tr></tbody>
</table></div>
<script>
const ENTITIES = ${data};
const byId = {};
ENTITIES.forEach(function (e) { byId[e.id] = e; });
let current = [];
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
document.getElementById("entities").innerHTML = ENTITIES.map(function (e) { return "<span><b>" + esc(e.name) + "</b> · /" + esc(e.id) + "/v1 · " + esc(e.site) + "</span>"; }).join("");
function detail(a) {
  if (a.status === "approved") return Object.keys(a.outputs).map(function (k) { return esc(k) + ": <b>" + esc(a.outputs[k]) + "</b>"; }).join("<br>");
  if (a.status === "changes_requested") return a.changes.map(function (c) { return "<b>" + esc(c.label) + "</b>: " + esc(c.reason); }).join("<br>");
  return "Review due " + esc(new Date(a.reviewDueAt).toLocaleTimeString());
}
function load() {
  fetch("/registry").then(function (r) { return r.json(); }).then(function (data) {
    current = data.applications;
    document.getElementById("rows").innerHTML = current.length ? current.map(function (a, i) {
      const actions = a.status === "approved" ? "" : '<button data-i="' + i + '" data-d="approve">Approve</button><button data-i="' + i + '" data-d="request_changes">Request changes</button>';
      return "<tr><td><code>" + esc(a.reference) + "</code></td><td>" + esc(a.entityName) + "<br><span class=detail>" + esc(a.serviceTitle) + "</span></td>" +
        '<td class="status" data-s="' + esc(a.status) + '">' + esc(a.status.replace("_", " ")) + "</td><td>" + a.revision + "</td><td class=detail>" + esc(a.caseRef || "—") + "</td>" +
        "<td class=detail>" + detail(a) + "</td><td class=detail>" + esc(new Date(a.updatedAt).toLocaleString()) + "</td><td>" + actions + "</td></tr>";
    }).join("") : '<tr><td colspan="8" class="empty">No applications yet.</td></tr>';
  }).catch(function () {});
}
document.getElementById("rows").addEventListener("click", function (event) {
  const button = event.target.closest("button");
  if (!button) return;
  const a = current[Number(button.dataset.i)];
  const entity = byId[a.entity];
  const body = { decision: button.dataset.d };
  if (body.decision === "request_changes") {
    const field = prompt("Field to change: " + Object.keys(a.fields).join(", "));
    if (!field) return;
    const reason = prompt("What should the applicant change?");
    if (!reason) return;
    body.changes = [{ field: field, reason: reason }];
  }
  const key = entity.key || prompt("API key for " + entity.name) || "";
  fetch("/" + a.entity + "/v1/applications/" + a.id + "/decision", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key }, body: JSON.stringify(body) })
    .then(function (r) { return r.ok ? null : r.json().then(function (b) { alert(b.error); }); })
    .then(load);
});
load();
setInterval(load, 3000);
</script>
</body>
</html>`;
}
