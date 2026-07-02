import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { feedsForHost } from "./feeds.mjs";
import { newsSectionsForDomain } from "./news-sections.mjs";
import { REGIONS, primaryRegionForHost } from "./regions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DOMAINS_PATH = join(ROOT, "data", "domains.json");
const OUT_PATH = join(ROOT, "data", "sources.json");

export function loadDomainsConfig() {
  const { domains } = JSON.parse(readFileSync(DOMAINS_PATH, "utf8"));
  return domains.map((d) => {
    const primaryRegion = d.primaryRegion ?? primaryRegionForHost(d.host);
    const feeds = feedsForHost(d.host);
    const newsSections = newsSectionsForDomain({ ...d, primaryRegion });
    return {
      host: d.host,
      origin: d.origin,
      label: d.label,
      primaryRegion,
      primaryRegionLabel:
        primaryRegion === "global"
          ? "Global"
          : (REGIONS.find((r) => r.id === primaryRegion)?.name ?? primaryRegion),
      newsSections,
      hasRss: feeds.length > 0,
      rssFeeds: feeds,
    };
  });
}

export function buildSourcesPayload() {
  const domains = loadDomainsConfig().sort((a, b) => a.label.localeCompare(b.label));

  const regions = REGIONS.map((region) => ({
    id: region.id,
    name: region.name,
    color: region.color,
    domains: domains.filter((d) => d.primaryRegion === region.id || d.primaryRegion === "global"),
    primaryDomains: domains.filter((d) => d.primaryRegion === region.id),
  }));

  return {
    generatedAt: new Date().toISOString(),
    sourceConfig: "data/domains.json",
    uniqueDomains: domains.length,
    rssEnabledDomains: domains.filter((d) => d.hasRss).length,
    domains,
    regions,
  };
}

function main() {
  const payload = buildSourcesPayload();
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Loaded ${payload.uniqueDomains} domains from ${DOMAINS_PATH}`);
  console.log(`  Direct RSS feeds: ${payload.rssEnabledDomains} domains`);
  for (const region of payload.regions) {
    console.log(`  ${region.name}: ${region.primaryDomains.length} primary + ${region.domains.length} total sources`);
  }
  console.log(`Wrote ${OUT_PATH}`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) main();
