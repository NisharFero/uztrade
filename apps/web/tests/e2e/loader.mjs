/* Resolve hook mapping Cloudflare's built-in module specifiers onto a local
 * stub so `dist/server/index.js` can be imported by Node in tests. */

const STUB = new URL("./cloudflare-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") {
    return { url: STUB, shortCircuit: true };
  }
  return next(specifier, context);
}
