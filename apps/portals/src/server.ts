import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createPortalApp } from "./app.ts";
import { ENTITIES } from "./entities/index.ts";
import { createStore } from "./store.ts";

const port = Number(process.env.PORT ?? 8790);
// A platform that hands us a PORT (Render, Railway, Fly) also expects the
// service bound on every interface; bound to loopback it is unreachable and the
// health check never passes. On a developer's machine loopback stays the default.
const host = process.env.HOST ?? (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const dataFile = process.env.PORTALS_DATA ?? fileURLToPath(new URL("../.data/applications.json", import.meta.url));

const handle = createPortalApp({
  store: createStore(dataFile),
  reviewMs: Number(process.env.PORTALS_REVIEW_MS ?? 4000),
  keys: Object.fromEntries(ENTITIES.map((entity) => [entity.id, process.env[entity.keyEnv]])),
});

const HOP_BY_HOP = new Set(["host", "connection", "content-length", "transfer-encoding", "keep-alive"]);

createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value != null && !HOP_BY_HOP.has(name)) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    const method = req.method ?? "GET";
    const response = await handle(
      new Request(`http://${host}:${port}${req.url ?? "/"}`, { method, headers, body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks) }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }));
  }
}).listen(port, host, () => {
  console.log(`Entity APIs (sandbox) on http://${host}:${port} — ${ENTITIES.map((e) => e.id).join(", ")}`);
});
