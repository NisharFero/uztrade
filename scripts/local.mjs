/* Run the whole platform locally with one command.
 *
 *   npm run setup    install dependencies, create apps/.env, prepare the database
 *   npm start        database + entity APIs + web app, health-checked; Ctrl+C stops the apps
 *   npm run status   what is running
 *   npm stop         stop the apps and the local database
 *
 * The database is chosen in this order:
 *   external  DATABASE_URL in apps/.env points somewhere other than this machine
 *   native    PostgreSQL 14+ is installed: a repo-local cluster in .pgdata (port 5433)
 *   docker    otherwise, the `db` service in docker-compose.yml (same port and URL)
 * Force one with UZTRADE_DB=native|docker.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const PORTALS = join(ROOT, "apps", "portals");
const ENV_FILE = join(ROOT, "apps", ".env");
const ENV_EXAMPLE = join(ROOT, "apps", ".env.example");
const WEB_ENV_LOCAL = join(WEB, ".env.local");
const LOCAL_DATABASE_URL = "postgres://uztrade@127.0.0.1:5433/uztrade";
const PORTALS_URL = "http://127.0.0.1:8790";
const WEB_URL = "http://localhost:3000";
const isWindows = process.platform === "win32";

const say = (line) => console.log(`\x1b[36m[uztrade]\x1b[0m ${line}`);
const fail = (line) => {
  console.error(`\x1b[31m[uztrade]\x1b[0m ${line}`);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ env file --- */

function readEnv(file = ENV_FILE) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Add or replace one key, leaving every other line untouched. */
function putEnv(file, key, value) {
  const line = `${key}=${value}`;
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [""];
  const at = lines.findIndex((l) => l.trimStart().startsWith(`${key}=`));
  if (at >= 0) {
    if (lines[at] === line) return;
    lines[at] = line;
  } else {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
    lines.splice(lines.length - 1, 0, line);
  }
  writeFileSync(file, lines.join("\n"), "utf8");
}

/* ------------------------------------------------------------- helpers --- */

function checkNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) fail(`Node.js 22.13 or newer is required (you have ${process.versions.node}). See .nvmrc.`);
}

/** Run a command in the foreground, sharing this terminal. */
function sh(command, cwd, env = {}) {
  const result = spawnSync(command, { cwd, stdio: "inherit", shell: true, env: { ...process.env, ...env } });
  if (result.status !== 0) fail(`"${command}" failed in ${cwd}`);
}

function hasDocker() {
  return spawnSync("docker", ["compose", "version"], { stdio: "ignore", shell: isWindows }).status === 0;
}

async function ok(url, timeoutMs = 3000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitFor(label, check, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return true;
    await sleep(1500);
  }
  fail(`${label} did not come up within ${Math.round(timeoutMs / 1000)} s`);
}

/** Asks the database for `select 1` through the app's own driver. */
async function dbAnswers(url) {
  const postgresPath = join(WEB, "node_modules", "postgres", "src", "index.js");
  if (!existsSync(postgresPath)) return "down";
  const { default: postgres } = await import(pathToFileURL(postgresPath).href);
  const sql = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => {} });
  try {
    await sql`select 1`;
    return "ok";
  } catch (e) {
    return /recovery mode|starting up/.test(String(e?.message)) ? "recovery" : "down";
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

/* ------------------------------------------------------------ database --- */

async function nativeDb() {
  return import(pathToFileURL(join(WEB, "scripts", "db", "local-postgres.mjs")).href);
}

async function dbMode() {
  const url = readEnv().DATABASE_URL || "";
  if (url && !/@(127\.0\.0\.1|localhost)[:/]/.test(url)) return "external";
  const forced = process.env.UZTRADE_DB;
  if (forced === "native" || forced === "docker") return forced;
  if ((await nativeDb()).findBinDir()) return "native";
  if (hasDocker()) return "docker";
  fail("No database available. Install PostgreSQL 14+ (https://www.postgresql.org/download/) or Docker Desktop, then run this again.\n" +
    "         Or put a hosted DATABASE_URL (e.g. Neon) in apps/.env.");
}

async function startDb(mode) {
  const url = mode === "external" ? readEnv().DATABASE_URL : LOCAL_DATABASE_URL;
  if (mode === "external") {
    say("database: using DATABASE_URL from apps/.env");
  } else if (mode === "docker") {
    say("database: starting PostgreSQL in Docker (first run downloads the image)");
    sh("docker compose up -d --wait db", ROOT);
  } else {
    const pg = await nativeDb();
    say("database: starting the repo-local PostgreSQL on port 5433");
    pg.start();
    pg.createDatabase();
  }

  // Wait for queries; a native cluster stuck in crash recovery (seen after
  // Windows sleep/hibernate) is restarted once, which clears it.
  let restarted = false;
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    const state = await dbAnswers(url);
    if (state === "ok") return url;
    if (state === "recovery" && mode === "native" && !restarted && Date.now() > until - 75_000) {
      say("database is stuck in crash recovery; restarting it");
      const pg = await nativeDb();
      pg.stop();
      pg.start();
      restarted = true;
    }
    await sleep(1500);
  }
  fail(`the database is not answering at ${url.replace(/:[^:@/]*@/, ":***@")}`);
}

function migrate(url) {
  say("database: applying migrations");
  // Quiet unless it fails: drizzle prints a harmless NOTICE on every run.
  const result = spawnSync("npx drizzle-kit migrate", { cwd: WEB, shell: true, encoding: "utf8", env: { ...process.env, DATABASE_URL: url } });
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    fail("migrations failed");
  }
}

/* --------------------------------------------------------------- setup --- */

async function setup() {
  checkNode();

  if (!existsSync(join(WEB, "node_modules"))) {
    say("installing web app dependencies (npm ci)");
    sh("npm ci", WEB);
  } else {
    say("web app dependencies already installed (delete apps/web/node_modules to reinstall)");
  }

  if (!existsSync(ENV_FILE)) {
    copyFileSync(ENV_EXAMPLE, ENV_FILE);
    say("created apps/.env from apps/.env.example");
  }
  if (!readEnv().PORTALS_URL) putEnv(ENV_FILE, "PORTALS_URL", PORTALS_URL);

  const mode = await dbMode();
  const url = await startDb(mode);
  if (mode !== "external") putEnv(ENV_FILE, "DATABASE_URL", LOCAL_DATABASE_URL);
  // Node tooling (drizzle-kit, `next build`) reads apps/web/.env.local.
  putEnv(WEB_ENV_LOCAL, "DATABASE_URL", url);
  migrate(url);

  say("setup complete.");
  if (!readEnv().GROQ_API_KEY) say("optional: add GROQ_API_KEY to apps/.env for free-text understanding and document reading.");
  say("next: npm start");
}

/* --------------------------------------------------------------- start --- */

const children = [];

/** Starts a long-running app, prefixing its output with its name. */
function launch(name, command, cwd, color) {
  const child = spawn(command, { cwd, shell: true, env: process.env, detached: !isWindows });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const relay = (stream, out) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) out.write(tag + line + "\n");
    });
  };
  relay(child.stdout, process.stdout);
  relay(child.stderr, process.stderr);
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`${tag}exited with code ${code}; stopping`);
      shutdown(1);
    }
  });
  children.push(child);
}

function killTree(child) {
  if (child.exitCode !== null) return;
  if (isWindows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  say("stopping the web app and entity APIs (the database keeps running; `npm stop` stops it)");
  children.forEach(killTree);
  setTimeout(() => process.exit(code), 500);
}

async function start() {
  checkNode();
  if (!existsSync(join(WEB, "node_modules")) || !existsSync(ENV_FILE)) fail("run `npm run setup` first");

  const mode = await dbMode();
  const url = await startDb(mode);
  putEnv(WEB_ENV_LOCAL, "DATABASE_URL", url);
  migrate(url);

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  if (await ok(`${PORTALS_URL}/health`)) say(`entity APIs already running on ${PORTALS_URL}`);
  else {
    say("starting the entity APIs");
    launch("portals", "npm start", PORTALS, "35");
  }
  await waitFor("entity APIs", () => ok(`${PORTALS_URL}/health`), 60_000);

  if (await ok(WEB_URL)) say(`web app already running on ${WEB_URL}`);
  else {
    say("starting the web app (the first page load compiles, give it a moment)");
    launch("web", "npm run dev", WEB, "33");
  }
  await waitFor("web app", () => ok(WEB_URL, 120_000), 240_000);

  console.log("");
  say(`ready: ${WEB_URL}`);
  say(`entity APIs: ${PORTALS_URL}   database: ${mode}`);
  say("press Ctrl+C to stop");
  if (!children.length) process.exit(0);
}

/* -------------------------------------------------------- status / stop --- */

async function status() {
  const mode = await dbMode();
  const url = mode === "external" ? readEnv().DATABASE_URL : LOCAL_DATABASE_URL;
  const db = await dbAnswers(url);
  console.log(`database     ${db === "ok" ? "running" : db}  (${mode})`);
  console.log(`entity APIs  ${(await ok(`${PORTALS_URL}/health`)) ? "running" : "stopped"}  ${PORTALS_URL}`);
  console.log(`web app      ${(await ok(WEB_URL, 10_000)) ? "running" : "stopped"}  ${WEB_URL}`);
}

/** Processes listening on a TCP port (best effort, per platform). */
function pidsOnPort(port) {
  try {
    if (isWindows) {
      // No "-p tcp": that lists IPv4 only, and the web app listens on [::1].
      const out = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
      const listening = out.split(/\r?\n/).filter((l) => /^\s*TCP/.test(l) && /LISTENING/.test(l));
      return [...new Set(listening.filter((l) => new RegExp(`:${port}\\s`).test(l.trim().split(/\s+/)[1] + " ")).map((l) => l.trim().split(/\s+/).pop()))];
    }
    return execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

async function stop() {
  for (const [name, port] of [["web app", 3000], ["entity APIs", 8790]]) {
    const pids = pidsOnPort(port);
    for (const pid of pids) {
      if (isWindows) spawnSync("taskkill", ["/pid", pid, "/T", "/F"], { stdio: "ignore" });
      else {
        try {
          process.kill(Number(pid), "SIGTERM");
        } catch {}
      }
    }
    say(pids.length ? `stopped the ${name}` : `${name} was not running`);
  }
  const mode = await dbMode();
  if (mode === "native") (await nativeDb()).stop();
  else if (mode === "docker") sh("docker compose stop db", ROOT);
  else say("database is external; nothing to stop");
}

const commands = { setup, start, status, stop };
const command = process.argv[2];
if (!commands[command]) fail(`usage: node scripts/local.mjs ${Object.keys(commands).join("|")}`);
await commands[command]();
