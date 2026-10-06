/* The local development database.
 *
 * Production is Neon; locally we run a plain Postgres cluster that lives in
 * the repo (`.pgdata`, gitignored) rather than depending on whatever server
 * happens to be installed on the machine. Nothing is shared with the system
 * PostgreSQL service - a different port, its own data directory, its own
 * superuser - so starting this cannot disturb anything else.
 *
 *   node scripts/db/local-postgres.mjs start|stop|status|create|reset|url|psql
 *
 * `npm run db:setup` does start + create + migrate in one go.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../..");
const DATA_DIR = join(REPO, ".pgdata");
const LOG = join(DATA_DIR, "server.log");
const PORT = process.env.UZTRADE_PG_PORT ?? "5433";
const USER = "uztrade";
const DATABASE = "uztrade";

export const LOCAL_DATABASE_URL = `postgres://${USER}@127.0.0.1:${PORT}/${DATABASE}`;

const EXE = process.platform === "win32" ? ".exe" : "";

/** The newest PostgreSQL bin directory this machine has, or null.
 *  Looks in PG_BIN, the usual install roots (Windows installer, Debian/Ubuntu,
 *  Homebrew `postgresql@16`, Postgres.app), then on PATH. */
export function findBinDir() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  const roots = [
    "C:/Program Files/PostgreSQL",
    "/usr/lib/postgresql",
    "/opt/homebrew/opt",
    "/usr/local/opt",
    "/Applications/Postgres.app/Contents/Versions",
  ];
  const major = (name) => Number.parseInt(name.replace(/^postgresql@?/, ""), 10);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const versions = readdirSync(root)
      .filter((name) => /^(postgresql@)?\d+/.test(name))
      .sort((a, b) => major(b) - major(a));
    for (const version of versions) {
      const bin = join(root, version, "bin");
      if (existsSync(join(bin, `pg_ctl${EXE}`))) return bin;
    }
  }
  // Fedora, Arch and Homebrew's unversioned formula put the tools on PATH.
  for (const dir of (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":")) {
    if (dir && existsSync(join(dir, `pg_ctl${EXE}`)) && existsSync(join(dir, `initdb${EXE}`))) return dir;
  }
  return null;
}

function binDir() {
  const dir = findBinDir();
  if (!dir) throw new Error("No PostgreSQL binaries found. Install PostgreSQL 14+, set PG_BIN to its bin directory, or use Docker (see README).");
  return dir;
}

const tool = (name) => join(binDir(), `${name}${EXE}`);
const run = (name, args, options = {}) => execFileSync(tool(name), args, { stdio: "inherit", ...options });
const quiet = (name, args) => spawnSync(tool(name), args, { encoding: "utf8" });

export function status() {
  return quiet("pg_ctl", ["-D", DATA_DIR, "status"]).status === 0;
}

function init() {
  if (existsSync(join(DATA_DIR, "PG_VERSION"))) return;
  console.log(`initdb ${DATA_DIR}`);
  // Trust auth on loopback only: there is no password to leak into a .env, and
  // the cluster is not reachable from outside this machine.
  run("initdb", ["-D", DATA_DIR, "-U", USER, "--auth=trust", "--encoding=UTF8", "--locale=C"]);
}

export function start() {
  init();
  if (status()) {
    console.log(`postgres already running on 127.0.0.1:${PORT}`);
    return;
  }
  // stdio "ignore": on Windows the server inherits pg_ctl's handles, so piped
  // output would keep the caller waiting until the server itself exits.
  const started = spawnSync(tool("pg_ctl"), ["-D", DATA_DIR, "-l", LOG, "-o", `-p ${PORT} -c listen_addresses=127.0.0.1`, "-w", "-t", "60", "start"], { stdio: "ignore" });
  if (started.status !== 0 && !status()) throw new Error(`postgres did not start; see ${LOG}`);
  console.log(`postgres listening on 127.0.0.1:${PORT}`);
}

export function stop() {
  if (!status()) {
    console.log("postgres is not running");
    return;
  }
  const fast = spawnSync(tool("pg_ctl"), ["-D", DATA_DIR, "-m", "fast", "-w", "-t", "30", "stop"], { stdio: "ignore" });
  if (fast.status !== 0 && status()) {
    // A server wedged after a crash (Windows sleep/hibernate) ignores a fast
    // shutdown. Immediate mode is a crash stop: the next start replays the WAL,
    // so nothing committed is lost.
    console.log("postgres did not stop cleanly; forcing an immediate stop");
    spawnSync(tool("pg_ctl"), ["-D", DATA_DIR, "-m", "immediate", "-w", "-t", "30", "stop"], { stdio: "ignore" });
  }
  console.log(status() ? "postgres is still running" : "postgres stopped");
}

/** Whether the server answers queries. "recovery" when it is up but stuck
 *  recovering from a crash, which needs a restart to clear. */
export function health() {
  const probe = quiet("psql", ["-h", "127.0.0.1", "-p", PORT, "-U", USER, "-d", "postgres", "-tAc", "select 1"]);
  if (probe.stdout?.trim() === "1") return "ok";
  return /recovery mode|starting up/.test(probe.stderr ?? "") ? "recovery" : "down";
}

export function createDatabase() {
  const exists = quiet("psql", [
    "-h", "127.0.0.1", "-p", PORT, "-U", USER, "-d", "postgres",
    "-tAc", `select 1 from pg_database where datname = '${DATABASE}'`,
  ]);
  if (exists.stdout?.trim() === "1") {
    console.log(`database ${DATABASE} already exists`);
    return;
  }
  run("createdb", ["-h", "127.0.0.1", "-p", PORT, "-U", USER, DATABASE]);
  console.log(`created database ${DATABASE}`);
}

function reset() {
  if (status()) stop();
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`removed ${DATA_DIR}`);
}

const commands = {
  start,
  stop,
  status: () => console.log(status() ? `running on 127.0.0.1:${PORT}` : "stopped"),
  create: createDatabase,
  reset,
  url: () => console.log(LOCAL_DATABASE_URL),
  psql: () => run("psql", ["-h", "127.0.0.1", "-p", PORT, "-U", USER, "-d", DATABASE]),
};

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const command = process.argv[2] ?? "status";
  if (!commands[command]) {
    console.error(`unknown command ${command}; expected one of ${Object.keys(commands).join(", ")}`);
    process.exit(1);
  }
  commands[command]();
}
