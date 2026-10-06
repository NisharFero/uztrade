import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vinext from "vinext";

/* Local dev secrets live in apps/.env (outside this package, and gitignored).
 * Miniflare does not read that file, so the values are lifted into the
 * worker's `vars` here. In production the hosting platform injects the real
 * secrets and this finds nothing to add. */
function loadLocalSecrets(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of ["../.env", "./.dev.vars"]) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split(String.fromCharCode(10))) {
      const line = raw.trim();
      const eq = line.indexOf("=");
      if (eq <= 0 || line.startsWith("#")) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (!key) continue;
      out[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return out;
}
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  vars: loadLocalSecrets(),
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

const serverConfig = {
  // Vite 8 forwards browser errors/logs over the HMR socket. Vinext/RSC can
  // emit early client errors before that socket is connected, which makes
  // Vite's reporter throw `Cannot read properties of undefined (reading 'send')`.
  forwardConsole: false,
  ...(isCodexSeatbeltSandbox
    ? { watch: { useFsEvents: false, usePolling: true } }
    : {}),
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: serverConfig,
    resolve: {
      alias: {
        // postgres.js ships a Cloudflare-specific build behind the `workerd`
        // export condition, which speaks `cloudflare:sockets` and therefore
        // only runs inside workerd - `vinext start` serves the same bundle
        // from Node and its queries fail. workerd's own `nodejs_compat`
        // provides node:net, so the standard build runs in both.
        postgres: fileURLToPath(new URL("./node_modules/postgres/src/index.js", import.meta.url)),
      },
    },
    // workerd's `nodejs_compat` console polyfill defines `console.createTask`
    // as a stub that throws `ERR_METHOD_NOT_IMPLEMENTED`, and React's
    // development build calls it for every element it creates the moment it
    // sees the property - so every dev render fails with "The
    // Console.createTask method is not implemented". Compiling the property
    // away puts React on its own fallback (`() => null`). Production builds of
    // React never create tasks, so nothing is lost.
    define: { "console.createTask": "undefined" },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
