import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC = join(ROOT, "public");
const DIST = join(ROOT, "dist");

const STATIC_FILES = [
  "index.html",
  "app.js",
  "dashboard.json",
  "manifest.webmanifest",
  "icon.svg",
];

function main() {
  if (!existsSync(join(PUBLIC, "dashboard.json"))) {
    console.error("Missing public/dashboard.json — run npm run refresh first.");
    process.exit(1);
  }

  mkdirSync(DIST, { recursive: true });
  writeFileSync(join(DIST, ".nojekyll"), "");
  for (const file of STATIC_FILES) {
    cpSync(join(PUBLIC, file), join(DIST, file));
  }

  const dashboard = JSON.parse(readFileSync(join(PUBLIC, "dashboard.json"), "utf8"));
  writeFileSync(
    join(DIST, "meta.json"),
    JSON.stringify(
      {
        publishedAt: new Date().toISOString(),
        generatedAt: dashboard.generatedAt,
        windowHours: dashboard.windowHours,
        headlineCount: dashboard.sectors?.reduce((n, s) => n + (s.bullets?.length ?? 0), 0) ?? 0,
      },
      null,
      2,
    ),
  );

  console.log(`Published static site → ${DIST}/`);
  console.log("  Open locally:  npx serve dist");
  console.log("  Or on phone:   npx serve dist -l 0.0.0.0:8080 (same Wi‑Fi)");
}

main();
