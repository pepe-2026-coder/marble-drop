/* Minimal static server, no dependencies.
 *
 * Local-only by default. For headset testing set HOST=0.0.0.0 and provide a
 * certificate pair — WebXR refuses to start on a plain-http LAN origin, so
 * `scripts/certs/local-{key,cert}.pem` (see README) switches the server to TLS.
 */
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { existsSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { extname, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const keyPath = resolve(process.env.HTTPS_KEY || "scripts/certs/local-key.pem");
const certPath = resolve(process.env.HTTPS_CERT || "scripts/certs/local-cert.pem");
const useTls = existsSync(keyPath) && existsSync(certPath);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function handle(request, response) {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    let path = decodeURIComponent(url.pathname);
    if (path === "/") path = "/index.html";
    const file = resolve(root, `.${path}`);
    if (file !== root && !file.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(500).end("Server error");
  }
}

const server = useTls
  ? createHttpsServer(
      {
        key: readFileSync(keyPath),
        cert: readFileSync(certPath),
      },
      handle,
    )
  : createHttpServer(handle);

const scheme = useTls ? "https" : "http";

server.listen(port, host, () => {
  console.log(`Marble Drop: ${scheme}://localhost:${port}/`);
  if (host === "0.0.0.0" || host === "::") {
    for (const entries of Object.values(networkInterfaces())) {
      for (const entry of entries || []) {
        if (entry.family === "IPv4" && !entry.internal) {
          console.log(`  LAN: ${scheme}://${entry.address}:${port}/`);
        }
      }
    }
    if (!useTls) {
      console.log("  note: WebXR needs a secure origin — plain http on the LAN cannot enter VR.");
    }
  }
});
