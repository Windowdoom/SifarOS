// index.js — the Navigator server. Zero runtime dependencies (Node 18+).
//
// Serves the PWA from /public and exposes a small API:
//   GET  /api/health         -> { ok, modelAvailable }
//   GET  /api/jurisdictions  -> [{ code, displayName, programName }]
//   GET  /api/rules?j=CODE   -> merged rules for a jurisdiction + verification status
//   POST /api/discovery      -> grounded eligibility estimate (Job 1)
//   POST /api/explain        -> plain-language explanation
//
// Privacy: this server is STATELESS. It stores nothing and it NEVER logs request
// bodies. The only access log is method + path + status. All user data lives on the
// person's own device (localStorage).

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";

import {
  listJurisdictions,
  getMergedRules,
  getDefaultJurisdiction,
  countUnverified,
} from "./rules-loader.js";
import { isAvailable, getModel } from "./claude.js";
import { runDiscovery } from "./reasoning/discovery.js";
import { runExplain } from "./reasoning/explain.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const PORT = process.env.PORT || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

/** Remove developer-only keys (those starting with "_") to shrink the payload. */
function stripUnderscore(node) {
  if (Array.isArray(node)) return node.map(stripUnderscore);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("_")) continue;
      out[k] = stripUnderscore(v);
    }
    return out;
  }
  return node;
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

async function resolveJurisdiction(code) {
  if (code) return code;
  return getDefaultJurisdiction();
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  // Prevent path traversal.
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return 403;
  }
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) throw new Error("is dir");
    const ext = extname(filePath).toLowerCase();
    const body = await readFile(filePath);
    const isHtml = ext === ".html";
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "cache-control": isHtml ? "no-cache" : "public, max-age=3600",
      "x-content-type-options": "nosniff",
    });
    res.end(body);
    return 200;
  } catch {
    // Unknown path with no extension -> serve the app shell (hash routing).
    if (!extname(filePath)) {
      try {
        const body = await readFile(join(PUBLIC_DIR, "index.html"));
        res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-cache" });
        res.end(body);
        return 200;
      } catch {}
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return 404;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;
  let status = 200;
  try {
    if (pathname === "/api/health") {
      sendJson(res, 200, { ok: true, modelAvailable: isAvailable(), model: isAvailable() ? getModel() : null });
    } else if (pathname === "/api/jurisdictions") {
      sendJson(res, 200, { jurisdictions: await listJurisdictions(), default: await getDefaultJurisdiction() });
    } else if (pathname === "/api/rules") {
      const code = await resolveJurisdiction(url.searchParams.get("j"));
      const rules = await getMergedRules(code);
      sendJson(res, 200, {
        jurisdiction: code,
        verification: countUnverified(rules),
        modelAvailable: isAvailable(),
        rules: stripUnderscore(rules),
      });
    } else if (pathname === "/api/discovery" && req.method === "POST") {
      const body = await readBody(req);
      const code = await resolveJurisdiction(body.j);
      const rules = await getMergedRules(code);
      const result = await runDiscovery({
        rules,
        text: typeof body.text === "string" ? body.text : "",
        profile: body.profile && typeof body.profile === "object" ? body.profile : {},
        lang: body.lang === "es" ? "es" : "en",
      });
      sendJson(res, 200, result);
    } else if (pathname === "/api/explain" && req.method === "POST") {
      const body = await readBody(req);
      const code = await resolveJurisdiction(body.j);
      const rules = await getMergedRules(code);
      const result = await runExplain({
        rules,
        query: typeof body.query === "string" ? body.query : "",
        lang: body.lang === "es" ? "es" : "en",
        simpler: Boolean(body.simpler),
      });
      sendJson(res, 200, result);
    } else if (pathname.startsWith("/api/")) {
      status = 404;
      sendJson(res, 404, { error: "Unknown endpoint" });
    } else {
      status = await serveStatic(req, res, pathname);
    }
  } catch (err) {
    status = 500;
    // Log the error message only — never the request body (it may contain PII).
    console.error(`[error] ${req.method} ${pathname}: ${err.message}`);
    if (!res.headersSent) sendJson(res, 500, { error: "Something went wrong. Please try again." });
  } finally {
    // Access log: method, path, status. No bodies, no query values, no PII.
    console.log(`${req.method} ${pathname} -> ${status}`);
  }
});

server.listen(PORT, () => {
  console.log(`The Navigator is running on http://localhost:${PORT}`);
  console.log(`Model reasoning: ${isAvailable() ? "ON (" + getModel() + ")" : "OFF (deterministic fallback only)"}`);
});
