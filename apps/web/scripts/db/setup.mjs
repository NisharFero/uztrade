/* One command to get a working local database.
 *
 *   npm run db:setup
 *
 * Starts the repo-local cluster, creates the database, writes DATABASE_URL
 * where each tool looks for it, and applies the Drizzle migrations. Safe to
 * run again: every step checks before it acts.
 *
 * Where DATABASE_URL has to go, and why there are two files:
 *   apps/.env          - lifted into the Worker's vars by vite.config.ts, so
 *                        `npm run dev` and `npm run build` see it.
 *   apps/web/.env.local - read by Node tooling (drizzle-kit, `next build`).
 * Both are gitignored.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_DATABASE_URL, createDatabase, start } from "./local-postgres.mjs";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ENV_FILES = [join(WEB, "..", ".env"), join(WEB, ".env.local")];

/** Add or replace one key, leaving every other line untouched. */
function putEnv(file, key, value) {
  const line = `${key}=${value}`;
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  const lines = existing.split(/\r?\n/);
  const at = lines.findIndex((l) => l.trimStart().startsWith(`${key}=`));
  if (at >= 0) {
    if (lines[at] === line) return `${file}: already set`;
    lines[at] = line;
  } else {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
    lines.splice(lines.length - 1, 0, line);
  }
  writeFileSync(file, lines.join("\n"), "utf8");
  return `${file}: ${key} written`;
}

start();
createDatabase();
for (const file of ENV_FILES) console.log(putEnv(file, "DATABASE_URL", LOCAL_DATABASE_URL));

console.log("applying migrations");
execFileSync("npx", ["drizzle-kit", "migrate"], {
  cwd: WEB,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: LOCAL_DATABASE_URL },
});
console.log(`\nready: ${LOCAL_DATABASE_URL}`);
