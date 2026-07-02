import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(__dirname, "..", "public");
const DASHBOARD = join(PUBLIC, "dashboard.json");
const PORT = Number(process.env.PORT ?? 3457);
const HOST = process.env.HOST ?? "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const refreshing = new Set();

async function loadFetcher() {
  const moduleUrl = `${pathToFileURL(join(__dirname, "fetch-news.mjs"))}?v=${Date.now()}`;
  return import(moduleUrl);
}

function readDashboardFile() {
  if (!existsSync(DASHBOARD)) return null;
  return JSON.parse(readFileSync(DASHBOARD, "utf8"));
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function serveStatic(req, res) {
  const path = req.url.split("?")[0];
  const file = path === "/" ? "/index.html" : path;
  const full = join(PUBLIC, file);

  if (!full.startsWith(PUBLIC) || !existsSync(full)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  const ext = extname(full);
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "no-store",
  });
  res.end(readFileSync(full));
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true, service: "asia-insurance-daily" });
    return;
  }

  if (req.method === "GET" && req.url === "/api/dashboard") {
    try {
      const data = readDashboardFile() ?? await (await loadFetcher()).fetchDashboard();
      sendJson(res, 200, data);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/refresh") {
    if (refreshing.has("main")) {
      sendJson(res, 409, { error: "Refresh already in progress" });
      return;
    }
    refreshing.add("main");
    try {
      const { fetchDashboard, writeDashboard } = await loadFetcher();
      const data = await fetchDashboard();
      writeDashboard(data);
      sendJson(res, 200, data);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    } finally {
      refreshing.delete("main");
    }
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405, { "Content-Type": "text/plain" });
  res.end("Method not allowed");
});

server.listen(PORT, HOST, () => {
  const local = `http://localhost:${PORT}`;
  console.log(`Asia Insurance Daily: ${local}/`);
  if (HOST === "0.0.0.0") {
    console.log(`  On your phone (same Wi‑Fi): http://<your-mac-ip>:${PORT}/`);
  }
});
