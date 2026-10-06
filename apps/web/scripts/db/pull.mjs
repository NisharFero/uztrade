/* Introspect the live database back into Drizzle TypeScript.
 *
 *   npm run db:pull            # reads DATABASE_URL
 *
 * Two things this does that `drizzle-kit pull` on its own does not:
 *
 * 1. It writes somewhere disposable (`.drizzle-pull/`, gitignored) instead of
 *    `drizzle-postgres/`. A pull emits a whole migration plus its own journal,
 *    so pulling into the migrations directory would plant a second "0000_"
 *    migration next to the real history and confuse `drizzle-kit migrate`.
 *
 * 2. It repairs the emitted schema. drizzle-kit 0.31.10 - the current release -
 *    writes a column whose default is the empty string as `.default(')`,
 *    an unterminated string literal, so the file it produces does not parse
 *    at all. Everything else about the output is fine, so the fix is applied
 *    in place and the result is checked for anything still unterminated.
 *
 * The hand-written `db/schema.ts` remains the source of truth; this is for
 * comparing it against a database that actually exists.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(WEB, ".drizzle-pull");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run `npm run db:setup` first, or export the URL you want to introspect.");
  process.exit(1);
}

// A config of its own, in a temp directory, so this can never be confused with
// the migration config even if the run is interrupted.
const configDir = mkdtempSync(join(tmpdir(), "uztrade-pull-"));
const config = join(configDir, "drizzle.config.mjs");
writeFileSync(
  config,
  `export default { out: ${JSON.stringify(OUT)}, schema: ${JSON.stringify(join(WEB, "db/schema.ts"))}, dialect: "postgresql", dbCredentials: { url: process.env.DATABASE_URL } };\n`,
);

try {
  rmSync(OUT, { recursive: true, force: true });
  execFileSync("npx", ["drizzle-kit", "pull", "--config", config], {
    cwd: WEB,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
} finally {
  rmSync(configDir, { recursive: true, force: true });
}

/** `.default(')` - an empty-string default that drizzle-kit fails to quote. */
const EMPTY_DEFAULT = /\.default\('\)/g;

let repaired = 0;
for (const file of readdirSync(OUT).filter((name) => name.endsWith(".ts"))) {
  const path = join(OUT, file);
  const source = readFileSync(path, "utf8");
  const fixed = source.replace(EMPTY_DEFAULT, ".default('')");
  if (fixed === source) continue;
  writeFileSync(path, fixed, "utf8");
  repaired += (source.match(EMPTY_DEFAULT) ?? []).length;
  console.log(`repaired ${file}`);
}

// Anything left with an odd number of quotes on a line is a codegen bug we
// have not seen before; say so rather than leaving a file that will not parse.
for (const file of readdirSync(OUT).filter((name) => name.endsWith(".ts"))) {
  const lines = readFileSync(join(OUT, file), "utf8").split("\n");
  const broken = lines
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => (String(line).match(/'/g) ?? []).length % 2 === 1);
  if (broken.length) {
    console.error(`\n${file} still has unbalanced quotes:`);
    for (const [n, line] of broken) console.error(`  ${n}: ${String(line).trim()}`);
    process.exit(1);
  }
}

console.log(`\n${OUT}${repaired ? ` (${repaired} empty-string default${repaired === 1 ? "" : "s"} repaired)` : ""}`);
