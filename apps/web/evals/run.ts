/* The evaluation harness.
 *
 *   npm run eval                 every suite that needs no model
 *   npm run eval -- --models     also the suites that call Groq
 *   npm run eval -- --suite intake --verbose
 *   npm run eval -- --json       machine-readable, for CI
 *
 * Two kinds of suite, kept apart on purpose:
 *
 *   deterministic  rules, tables and the published corpus. These must score
 *                  100%: anything less is a regression, and the run fails.
 *   model          a language model is in the loop, so the score is a
 *                  measurement against a threshold, not a pass/fail oracle.
 *                  Skipped entirely without GROQ_API_KEY.
 *
 * Gold data is checked before it is used. Every procedure id an expectation
 * names is verified against the published catalogue, so a typo in the gold
 * file reports as bad gold rather than as a broken application.
 */
import { existsSync, readFileSync } from "node:fs";
import { intakeSuite } from "./suites/intake";
import { masterDataSuite } from "./suites/masterdata";
import { taxonomySuite } from "./suites/taxonomy";
import { corpusSuite } from "./suites/corpus";
import { planningSuite } from "./suites/planning";
import { documentsSuite } from "./suites/documents";
import { demoWorkflowSuite } from "./suites/demo-workflow";
import { groqSuite } from "./suites/groq";
import { understandingModelSuite, understandingSuite } from "./suites/understanding";
import { procedureExecutionSuite } from "./suites/procedure-execution";
import { intakeCorpusSuite } from "./suites/intake-corpus";
import { agentsCorpusSuite } from "./suites/agents-corpus";
import type { Suite, SuiteResult } from "./types";

const SUITES: Suite[] = [corpusSuite, procedureExecutionSuite, intakeCorpusSuite, agentsCorpusSuite, taxonomySuite, intakeSuite, planningSuite, understandingSuite, masterDataSuite, documentsSuite, demoWorkflowSuite, groqSuite, understandingModelSuite];

/* The same files the app reads locally (apps/.env, then apps/web/.env.local),
   for the variables the shell has not already set. */
for (const file of ["../.env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};

const wanted = value("suite");
const offline = flag("offline");
const withModels = flag("models") || Boolean(wanted && SUITES.find((s) => s.name === wanted)?.needsModel);
const verbose = flag("verbose");
const asJson = flag("json");
const limit = Number(value("limit")) || undefined;

const hasKey = Boolean(process.env.GROQ_API_KEY?.trim());
const chosen = SUITES.filter((s) => (wanted ? s.name === wanted : true));

if (wanted && !chosen.length) {
  console.error(`No suite called "${wanted}". Suites: ${SUITES.map((s) => s.name).join(", ")}`);
  process.exit(2);
}

const results: SuiteResult[] = [];
for (const suite of chosen) {
  if (offline && (suite.needsDatabase || suite.needsModel)) {
    results.push({ suite: suite.name, about: suite.about, needsModel: Boolean(suite.needsModel), skipped: "offline run: external provider/database not exercised", cases: [], passed: 0, total: 0, threshold: suite.threshold });
    continue;
  }
  if (suite.needsDatabase && !process.env.DATABASE_URL?.trim()) {
    results.push({ suite: suite.name, about: suite.about, needsModel: false, skipped: "no DATABASE_URL", cases: [], passed: 0, total: 0, threshold: suite.threshold });
    continue;
  }
  if (suite.needsModel && !(withModels && hasKey)) {
    results.push({
      suite: suite.name,
      about: suite.about,
      needsModel: true,
      skipped: hasKey ? "not asked for (--models)" : "no GROQ_API_KEY",
      cases: [],
      passed: 0,
      total: 0,
      threshold: suite.threshold,
    });
    continue;
  }
  const started = Date.now();
  const cases = await suite.run({ limit, verbose });
  results.push({
    suite: suite.name,
    about: suite.about,
    needsModel: Boolean(suite.needsModel),
    cases,
    passed: cases.filter((c) => c.ok).length,
    total: cases.length,
    threshold: suite.threshold,
    ms: Date.now() - started,
  });
}

if (asJson) {
  console.log(JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
} else {
  report();
}

/** A suite fails when it is below its threshold; bad gold always fails. */
const failed = results.filter((r) => {
  if (r.skipped) return false;
  if (r.cases.some((c) => c.badGold)) return true;
  const score = r.total ? r.passed / r.total : 1;
  return score < (r.threshold ?? 1);
});

process.exit(failed.length ? 1 : 0);

function report() {
  console.log("");
  for (const r of results) {
    if (r.skipped) {
      console.log(`${pad(r.suite)} skipped — ${r.skipped}`);
      continue;
    }
    const score = r.total ? r.passed / r.total : 1;
    const target = r.threshold ?? 1;
    const mark = r.cases.some((c) => c.badGold) ? "GOLD" : score >= target ? "ok  " : "FAIL";
    console.log(
      `${mark} ${pad(r.suite)} ${String(r.passed).padStart(3)}/${String(r.total).padEnd(3)} ` +
        `${pct(score).padStart(5)}  (needs ${pct(target)})  ${r.ms ?? 0} ms`,
    );
    for (const c of r.cases) {
      if (c.ok && !verbose) continue;
      const tag = c.badGold ? "GOLD" : c.ok ? "ok" : "fail";
      console.log(`      ${tag.padEnd(5)} ${c.id}${c.detail ? ` — ${c.detail}` : ""}`);
    }
  }

  const graded = results.filter((r) => !r.skipped);
  const passed = graded.reduce((n, r) => n + r.passed, 0);
  const total = graded.reduce((n, r) => n + r.total, 0);
  console.log(`\n${passed}/${total} across ${graded.length} suites${results.some((r) => r.skipped) ? `, ${results.filter((r) => r.skipped).length} skipped` : ""}.`);
  if (!hasKey) console.log("Set GROQ_API_KEY and pass --models to include the suites that call a model.");
}

function pad(s: string) {
  return s.padEnd(12);
}
function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}
