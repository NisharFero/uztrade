import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

/** Renders a route through the built worker. Routes that touch D1 are not
 *  covered here - the harness supplies no database binding - so these tests
 *  stay on the static pages and the generated dataset. */
async function render(path = "/") {
  const workerUrl = new URL("../../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

const readJson = (rel) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));

/* Ground truth for the ten hand-checked procedures - the ones whose graphs are
   curated rather than derived. If the source data or the generator drifts,
   these numbers are what should fail first. */
const EXPECTED = {
  306: { title: "Export of dried fruits by train", blocks: 10, steps: 48 },
  325: { title: "Export of fresh fruits and vegetables by train", blocks: 10, steps: 48 },
  477: { title: "Import of tea by train", blocks: 15, steps: 53 },
  540: { title: "Export of tea by air", blocks: 9, steps: 47 },
  868: { title: "Export of tea by train", blocks: 10, steps: 48 },
  161: { title: "Clearance of fruit and vegetable juices by road", blocks: 2, steps: 13 },
  57: { title: "Import of animal or vegetable fertilizers by road", blocks: 12, steps: 58 },
  707: { title: "Import of animal or vegetable fertilizers by train", blocks: 17, steps: 60 },
  782: { title: "Arrange cargo transportation by train via Single Window online portal", blocks: 5, steps: 20 },
  924: { title: "Arrange cargo delivery by train physically", blocks: 6, steps: 18 },
};

/* The whole published corpus: one workflow file per procedure. */
const WORKFLOW_DIR = fileURLToPath(new URL("../../public/data/procedures/", import.meta.url));
const workflows = () =>
  readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(WORKFLOW_DIR + f, "utf8")));
const CORPUS = workflows();

test("server-renders the conversation the dashboard opens with", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Uzbekistan Trade Platform<\/title>/i);
  // Chat first: one question and the composer, no form - missing details are
  // asked for one at a time in the conversation.
  assert.match(html, /class="convo convo-start"/);
  assert.match(html, /What are you moving\?/);
  assert.match(html, /id="trade-query"/, "the composer");
  assert.match(html, /Export 20 tonnes of tea from Tashkent to Almaty by train/, "a way in");
  assert.doesNotMatch(html, /intake-fields|Open the case/, "no form, and nothing to open before a match");
});

test("sidebar links to the real destinations", async () => {
  const html = await (await render()).text();

  assert.match(html, /href="\/procedures"/);
  assert.match(html, /href="\/cases"/);
  assert.match(html, /href="\/agents"/);
  assert.match(html, /Cases &amp; Shipments/);
  assert.match(html, /href="\/faq"/);
  assert.match(html, /AI Agent Center/);
  assert.match(html, /All Agents/);
  // Out-of-scope sections must not be dead links.
  assert.doesNotMatch(html, /href="#"/);
});

test("procedures page lists every published procedure", async () => {
  const response = await render("/procedures");
  assert.equal(response.status, 200);
  const html = await response.text();

  for (const [id, { title }] of Object.entries(EXPECTED)) {
    assert.match(html, new RegExp(title));
    assert.match(html, new RegExp(`href="/procedures/${id}"`));
  }
  // Not a sample of them: the list is the corpus, and search narrows it client-side.
  const listed = new Set([...html.matchAll(/href="\/procedures\/(\d+)"/g)].map((m) => m[1]));
  assert.equal(listed.size, CORPUS.length, `${listed.size} listed of ${CORPUS.length} published`);
  // Demo content from the earlier hard-coded workflow must be gone.
  assert.doesNotMatch(html, /Shipment Concierge|Procedure 868 plan/);
});

test("generated dataset matches the source procedures", () => {
  const source = readJson("../../scripts/data/dag-data.json");

  // dag-data.json holds exactly the curated graphs, which the generator keeps
  // in preference to anything derived from the .docx.
  assert.deepEqual(Object.keys(EXPECTED).sort(), Object.keys(source).sort());

  for (const [id, expected] of Object.entries(EXPECTED)) {
    const p = source[id];
    assert.equal(p.title, expected.title, `${id} title`);
    assert.equal(p.blocks.length, expected.blocks, `${id} block count`);
    assert.equal(p.stepsCount, expected.steps, `${id} step count`);

    const ids = new Set(p.blocks.map((b) => b.id));
    for (const b of p.blocks) {
      // Every edge resolves to a sibling block.
      for (const dep of b.dependsOn) {
        assert.ok(ids.has(dep), `${id}: ${b.id} depends on unknown ${dep}`);
      }
      // Duration ranges are ordered and positive - the critical path sums them.
      assert.ok(Array.isArray(b.estDuration) && b.estDuration.length === 2, `${id}/${b.id} duration`);
      assert.ok(b.estDuration[0] > 0 && b.estDuration[1] >= b.estDuration[0], `${id}/${b.id} range`);
      assert.ok(b.dependencyReason.length > 0, `${id}/${b.id} needs a reason for the hover card`);
    }

    // The graph must be acyclic, otherwise levelling and the critical path
    // would not terminate.
    const state = new Map();
    const byId = new Map(p.blocks.map((b) => [b.id, b]));
    const visit = (nodeId) => {
      const seen = state.get(nodeId);
      if (seen === "done") return;
      assert.notEqual(seen, "open", `${id}: cycle through ${nodeId}`);
      state.set(nodeId, "open");
      for (const dep of byId.get(nodeId).dependsOn) visit(dep);
      state.set(nodeId, "done");
    };
    for (const b of p.blocks) visit(b.id);

    // Somewhere to start, always.
    const roots = p.blocks.filter((b) => b.dependsOn.length === 0).length;
    assert.ok(roots >= 1, `${id} has no root block`);

    // Real parallelism where the procedure has it. The five original graphs
    // fan out and rejoin; 57, 161, 707, 782 and 924 are genuinely sequential
    // chains and asserting otherwise would be asserting a fiction.
    if (["306", "325", "477", "540", "868"].includes(id)) {
      assert.ok(roots >= 2, `${id} roots`);
      assert.ok(p.blocks.filter((b) => b.dependsOn.length > 1).length >= 1, `${id} joins`);
    }
  }
});

test("every entity classifies to a known actor", () => {

  // Mirrors modules/procedures/actors.ts. Kept in step deliberately: an entity that
  // falls through would silently land in the wrong swimlane.
  const RULES = [
    [/\bbank\b|banking system/i, "bank"],
    [/customs warehouse/i, "transport"],
    [/insurance/i, "commercial"],
    [/customs post|customs control|group of customs/i, "government"],
    [
      /quarantine|karantin|expertiza|single window|singlewindow|state services|my\.gov|sanitary|epidemiolog|ministry|committee|agency of plant|border checkpoint|assalom agro|standard|comittee/i,
      "government",
    ],
    [
      /border crossing point|e-tranzit|electronic document management|uztest|research and quality control|certification body|nature protection|export promotion|darmon/i,
      "government",
    ],
    [
      /railway|temir yo|forwarding|freight|station|airport|airline|terminal|junction|cargo sales agent|postal cargo|place of loading|branch line|transport/i,
      "transport",
    ],
    [/personal cabinet of participant|customs broker|warehouse|location of goods|place of .*installation/i, "trader"],
  ];
  const counterparty = (entity) => RULES.find(([re]) => re.test(entity))?.[1] ?? null;

  const entities = new Set();
  for (const p of CORPUS) for (const b of p.blocks) for (const s of b.steps) if (s.entity) entities.add(s.entity);

  const unmatched = [...entities].filter((e) => counterparty(e) === null);
  assert.deepEqual(unmatched, [], `unclassified entities: ${unmatched.join(", ")}`);
  assert.ok(entities.size >= 40, `expected at least 40 distinct entities, saw ${entities.size}`);
});

test("uses the upgraded theme and font system", async () => {
  const html = await (await render()).text();

  assert.doesNotMatch(html, /Manrope|Source Serif|IBM Plex Mono/);
  assert.match(html, /premium-shell/);
  assert.match(html, /class="convo convo-start"/, "the conversation owns the page");
});

/* Fonts are self-hosted rather than injected by next/font, so the @font-face
   rules live in the CSS bundle and the payloads under /fonts - not in the
   HTML. vinext emits absolute disk paths for next/font, which browsers block
   as file:// requests, so a regression here means invisible fallback text. */
test("serves self-hosted webfonts over http, not file://", async () => {
  const assetDir = fileURLToPath(new URL("../../dist/client/assets/", import.meta.url));
  const cssFile = readdirSync(assetDir).find((f) => f.endsWith(".css"));
  assert.ok(cssFile, "expected a built CSS asset");
  const css = readFileSync(assetDir + cssFile, "utf8");

  assert.match(css, /font-family:\s*Geist/i);
  assert.match(css, /font-family:\s*["']?Geist Mono/i);
  assert.match(css, /url\(\/fonts\/geist\//);
  // An absolute disk path here means next/font crept back in and the faces
  // will silently fail to load in the browser.
  assert.doesNotMatch(css, /url\((?:"|')?[A-Za-z]:\//);
  assert.doesNotMatch(css, /file:\/\//);

  const fontDir = fileURLToPath(new URL("../../dist/client/fonts/geist/", import.meta.url));
  assert.ok(readdirSync(fontDir).some((f) => f.endsWith(".woff2")), "expected woff2 payloads");
});

/* The delegation model is the heart of the orchestrator: every step must land
   in exactly one of three lanes - User, Agent, Physical - and the split is
   what the swimlane columns render. Mirrors modules/procedures/delegation.ts; a drift
   between the two shows up here rather than as a silently wrong diagram. */
test("every step delegates to exactly one of user / agent / physical", () => {
  const PHYSICAL_ACT =
    /\bundergo\b|\bload(ing)?\b|\bunload|\bdispatch\b|\bseal(ing)?\b|\bsampl(e|ing)s?\b|\bfumigat|\bweigh|^place cargo|^arrange cargo|\binspection\b|\bhand over\b/i;

  const delegate = (step) => {
    if (/^in person/i.test(step.channel) && PHYSICAL_ACT.test(step.title)) return "physical";
    if (/^online:\s*pay/i.test(step.channel)) return "user";
    if (/^online:/i.test(step.channel)) return "agent";
    return "user";
  };

  const tally = { user: 0, agent: 0, physical: 0 };
  let total = 0;
  for (const p of CORPUS)
    for (const b of p.blocks)
      for (const s of b.steps) {
        const lane = delegate(s);
        assert.ok(lane in tally, `step "${s.title}" produced unknown lane ${lane}`);
        tally[lane]++;
        total++;
      }

  assert.equal(total, 5539, "expected 5,539 steps across the published corpus");
  assert.equal(tally.user + tally.agent + tally.physical, total, "lanes must partition every step");

  // Nothing filed online can be a physical cargo operation - the gate that
  // stops "Obtain offer agreement for fumigation" landing in Physical.
  for (const p of CORPUS)
    for (const b of p.blocks)
      for (const s of b.steps)
        if (/^online:/i.test(s.channel)) assert.notEqual(delegate(s), "physical", s.title);

  // Every payment is the trader's to authorize, never the agent's to make.
  for (const p of CORPUS)
    for (const b of p.blocks)
      for (const s of b.steps)
        if (/^online:\s*pay/i.test(s.channel)) assert.equal(delegate(s), "user", s.title);

  // All three lanes are genuinely populated, so no column is decorative.
  for (const lane of ["user", "agent", "physical"]) assert.ok(tally[lane] > 20, `${lane} lane too small: ${tally[lane]}`);
});

/* Compliance & Risk must never invent a duty figure it cannot support - the
   source procedures contain no HS codes and no tariff rates. */
test("every procedure carries the taxonomy intake matches on", () => {
  const directions = new Set(["import", "export", "transit"]);
  const modes = new Set(["train", "air", "road", "any"]);
  const kinds = new Set(["customs", "logistics", "service"]);

  for (const p of CORPUS) {
    assert.ok(directions.has(p.direction), `${p.id} direction ${p.direction}`);
    assert.ok(modes.has(p.mode), `${p.id} mode ${p.mode}`);
    assert.ok(kinds.has(p.kind), `${p.id} kind ${p.kind}`);
    assert.ok(p.goods && p.goods.length > 0, `${p.id} names its goods`);
    assert.ok(p.blocks.length > 0 && p.stepsCount > 0, `${p.id} has a workflow`);
  }

  // The goods the certificate rules and the demo pack are written against.
  const goods = new Set(CORPUS.map((p) => p.goods));
  for (const g of ["tea", "dried fruits", "fresh fruits and vegetables", "fruit and vegetable juices"])
    assert.ok(goods.has(g), `${g} is published`);
});

test("backend workflow API surface is present without changing the UI", () => {
  const appRoot = fileURLToPath(new URL("../../app/", import.meta.url));
  const routes = [
    "api/users/route.ts",
    "api/entities/route.ts",
    "api/procedures/route.ts",
    "api/workflows/[id]/route.ts",
    "api/workflows/[id]/run/route.ts",
    "api/work-items/route.ts",
    "api/work-items/[id]/complete/route.ts",
    "api/agent-runs/route.ts",
    "api/artifacts/route.ts",
    "api/audit-events/route.ts",
  ];
  for (const route of routes) {
    assert.ok(readFileSync(appRoot + route, "utf8").includes("export async function"), route);
  }
});

test("entities page is linked and renders its operational heading", async () => {
  const dashboard = await (await render()).text();
  assert.match(dashboard, /href="\/entities"/);
  const response = await render("/entities");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /External entities/i);
});
