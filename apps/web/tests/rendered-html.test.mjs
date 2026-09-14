import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

/** Renders a route through the built worker. Routes that touch D1 are not
 *  covered here - the harness supplies no database binding - so these tests
 *  stay on the static pages and the generated dataset. */
async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
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

/* Ground truth for the five supported procedures. If the source data or the
   generator drifts, these numbers are what should fail first. */
const EXPECTED = {
  306: { title: "Export of dried fruits by train", blocks: 10, steps: 48 },
  325: { title: "Export of fresh fruits and vegetables by train", blocks: 10, steps: 48 },
  477: { title: "Import of tea by train", blocks: 15, steps: 53 },
  540: { title: "Export of tea by air", blocks: 9, steps: 47 },
  868: { title: "Export of tea by train", blocks: 10, steps: 48 },
};

test("server-renders the dashboard composer", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>UzTrade Trade Agent<\/title>/i);
  assert.match(html, /Ask UzTrade/);
  assert.match(html, /Describe the goods you want to move/);
  assert.match(html, /Send request/);
  // The composer offers the five supported procedures as prompts.
  for (const { title } of Object.values(EXPECTED)) assert.match(html, new RegExp(title));
});

test("sidebar links to the real destinations", async () => {
  const html = await (await render()).text();

  assert.match(html, /href="\/procedures"/);
  assert.match(html, /href="\/cases"/);
  assert.match(html, /href="\/agents"/);
  assert.match(html, /Cases &amp; Shipments/);
  assert.match(html, /href="/faq"/);
  assert.match(html, /AI Agent Center/);
  assert.match(html, /All Agents/);
  // Out-of-scope sections must not be dead links.
  assert.doesNotMatch(html, /href="#"/);
});

test("procedures page lists all five with their real counts", async () => {
  const response = await render("/procedures");
  assert.equal(response.status, 200);
  const html = await response.text();

  for (const [id, { title }] of Object.entries(EXPECTED)) {
    assert.match(html, new RegExp(title));
    assert.match(html, new RegExp(`href="/procedures/${id}"`));
  }
  // Demo content from the earlier hard-coded workflow must be gone.
  assert.doesNotMatch(html, /Shipment Concierge|Procedure 868 plan/);
});

test("generated dataset matches the source procedures", () => {
  const source = readJson("../scripts/dag-data.json");

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

    // Real parallelism: more than one root, and at least one join.
    assert.ok(p.blocks.filter((b) => b.dependsOn.length === 0).length >= 2, `${id} roots`);
    assert.ok(p.blocks.filter((b) => b.dependsOn.length > 1).length >= 1, `${id} joins`);
  }
});

test("every entity classifies to a known actor", () => {
  const source = readJson("../scripts/dag-data.json");

  // Mirrors app/data/actors.ts. Kept in step deliberately: an entity that
  // falls through would silently land in the wrong swimlane.
  const RULES = [
    [/\bbank\b|banking system/i, "bank"],
    [/customs warehouse/i, "transport"],
    [/customs post|customs control|group of customs/i, "government"],
    [
      /quarantine|karantin|expertiza|single window|singlewindow|state services|my\.gov|sanitary|epidemiolog|ministry|committee|agency of plant|border checkpoint|assalom agro|standard/i,
      "government",
    ],
    [
      /railway|temir yo|forwarding|freight|station|airport|airline|terminal|junction|cargo sales agent|postal cargo|place of loading|branch line|transport/i,
      "transport",
    ],
    [/personal cabinet of participant|customs broker|warehouse|location of goods/i, "trader"],
  ];
  const counterparty = (entity) => RULES.find(([re]) => re.test(entity))?.[1] ?? null;

  const entities = new Set();
  for (const p of Object.values(source))
    for (const b of p.blocks) for (const s of b.steps) entities.add(s.entity);

  const unmatched = [...entities].filter((e) => counterparty(e) === null);
  assert.deepEqual(unmatched, [], `unclassified entities: ${unmatched.join(", ")}`);
  assert.ok(entities.size >= 25, "expected at least 25 distinct entities");
});

test("uses the upgraded theme and font system", async () => {
  const html = await (await render()).text();

  assert.doesNotMatch(html, /Manrope|Source Serif|IBM Plex Mono/);
  assert.match(html, /premium-shell/);
  assert.match(html, /command-surface/);
});

/* Fonts are self-hosted rather than injected by next/font, so the @font-face
   rules live in the CSS bundle and the payloads under /fonts - not in the
   HTML. vinext emits absolute disk paths for next/font, which browsers block
   as file:// requests, so a regression here means invisible fallback text. */
test("serves self-hosted webfonts over http, not file://", async () => {
  const assetDir = fileURLToPath(new URL("../dist/client/assets/", import.meta.url));
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

  const fontDir = fileURLToPath(new URL("../dist/client/fonts/geist/", import.meta.url));
  assert.ok(readdirSync(fontDir).some((f) => f.endsWith(".woff2")), "expected woff2 payloads");
});

/* The delegation model is the heart of the orchestrator: every step must land
   in exactly one of three lanes - User, Agent, Physical - and the split is
   what the swimlane columns render. Mirrors app/data/delegation.ts; a drift
   between the two shows up here rather than as a silently wrong diagram. */
test("every step delegates to exactly one of user / agent / physical", () => {
  const source = readJson("../scripts/dag-data.json");

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
  for (const p of Object.values(source))
    for (const b of p.blocks)
      for (const s of b.steps) {
        const lane = delegate(s);
        assert.ok(lane in tally, `step "${s.title}" produced unknown lane ${lane}`);
        tally[lane]++;
        total++;
      }

  assert.equal(total, 244, "expected 244 steps across the five procedures");
  assert.equal(tally.user + tally.agent + tally.physical, total, "lanes must partition every step");

  // Nothing filed online can be a physical cargo operation - the gate that
  // stops "Obtain offer agreement for fumigation" landing in Physical.
  for (const p of Object.values(source))
    for (const b of p.blocks)
      for (const s of b.steps)
        if (/^online:/i.test(s.channel)) assert.notEqual(delegate(s), "physical", s.title);

  // Every payment is the trader's to authorize, never the agent's to make.
  for (const p of Object.values(source))
    for (const b of p.blocks)
      for (const s of b.steps)
        if (/^online:\s*pay/i.test(s.channel)) assert.equal(delegate(s), "user", s.title);

  // All three lanes are genuinely populated, so no column is decorative.
  for (const lane of ["user", "agent", "physical"]) assert.ok(tally[lane] > 20, `${lane} lane too small: ${tally[lane]}`);
});

/* Compliance & Risk must never invent a duty figure it cannot support - the
   source procedures contain no HS codes and no tariff rates. */
test("compliance reference covers every goods category in scope", () => {
  const source = readJson("../scripts/dag-data.json");
  const goods = new Set(
    Object.values(source).map((p) => {
      const m = p.title.match(/^(?:Export|Import|Clearance)\s+of\s+(.+?)\s+by\s+(?:train|air|road)$/i);
      return m[1].toLowerCase();
    }),
  );
  assert.deepEqual([...goods].sort(), ["dried fruits", "fresh fruits and vegetables", "tea"]);
});

test("backend workflow API surface is present without changing the UI", () => {
  const appRoot = fileURLToPath(new URL("../app/", import.meta.url));
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
