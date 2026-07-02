import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { feedsForHost } from "./feeds.mjs";
import { buildSectionQueries, linkMatchesDomain, linkMatchesNewsSection } from "./news-sections.mjs";
import { BULLETS_PER_REGION, REGIONS, domainsForRegion } from "./regions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SOURCES_PATH = join(ROOT, "data", "sources.json");
const OUT_PATH = join(ROOT, "public", "dashboard.json");

const WINDOW_HOURS = 48;
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;

const queryCache = new Map();

const FIG_CONTEXT =
  /\b(great eastern|securities advisory|financial adviser|financial advisors|insurance licen[cs]e|advisory licen[cs]e|wealth management|bancassurance|insurtech|reinsurance|underwriting|policyholder|claims?)\b/i;
const HL = "en-US";
const GL = "US";
const CEID = "US:en";

const LOW_SIGNAL =
  /\b(top \d+|best \d+|how to|stock to (?:buy|watch)|share price today|brokerage reco|buy rating|viral video|stock surges|women of influence|mortgage pre-approval|fda approval|sickle cell|robotics federation|gf value|is it too late to buy|job posting|m\/f\/d\)|coordinator \(m|internship|tipranks|ad hoc news|actuarial analyst in|partnership in kuala lumpur|sales & distribution at)\b/i;

const INSURANCE_KEYWORDS =
  /\b(insurance|insurer|insurers|insuring|reinsurance|reinsurer|life insurance|general insurance|health insurance|underwrit|policy premium|insurtech|actuar|claims?(?:\s+(?:ratio|settlement|paid))?|bima|irdai|apra|hkma|tokio marine|aia\b|allianz|axa\b|aviva|manulife|prudential|metlife|ms&ad|dai-?ichi|sumitomo life|nippon life|fwd\b|chubb|zurich|swiss re|munich re|liberty mutual|broker(?:age)?|mga\b|captives?|techcom life|bao hiem|bảo hiểm)\b/i;

const NON_INSURANCE_EXCLUDE =
  /\b(military training|russia approved|sgx mainboard|esg reporting(?!.*insur)|vertex announces|casgevy|real estate expert|mortgage|home buying|robotics federation|oscar health|unum group|hello nation.*utah)\b/i;

const TAG_RULES = [
  {
    tag: "Leadership",
    patterns: [/\b(ceo|cfo|president|chairman|chief|appointed|named|steps down|resigns|managing director)\b/i],
  },
  {
    tag: "Strategy",
    patterns: [
      /\b(strategy|merger|acquisition|partnership|restructur|expansion|consolidat|inflows?|outflows?|increases capital|capital injection|contributes.*?capital)\b/i,
    ],
  },
  {
    tag: "Product",
    patterns: [/\b(launch(es|ed|ing)?|introduc(es|ed|ing)?|new product|policy|coverage|insurtech|platform)\b/i],
  },
  {
    tag: "Regulatory",
    patterns: [/\b(regulat|approv(al|ed)|irdai|mas\b|apra|hkma|license|licence|circular|guideline)\b/i],
  },
  {
    tag: "Earnings",
    patterns: [/\b(earnings|quarterly|q[1-4]|results|revenue|profit|premium|aum)\b/i],
  },
  { tag: "Press", patterns: [/./] },
];

function loadSources() {
  return JSON.parse(readFileSync(SOURCES_PATH, "utf8"));
}

function classify(text) {
  for (const rule of TAG_RULES) {
    if (rule.tag === "Press") continue;
    if (rule.patterns.some((p) => p.test(text))) return rule.tag;
  }
  return "Press";
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function summarize(title) {
  return title.length > 140 ? `${title.slice(0, 137)}…` : title;
}

function parseRss(xml, defaultSource = "") {
  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const block of blocks) {
    const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim();
    const link =
      block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() ??
      block.match(/<guid>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/guid>/)?.[1]?.trim();
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim();
    const source =
      block.match(/<source[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/)?.[1]?.trim() ?? defaultSource;
    if (!title || !link) continue;
    items.push({
      title: decodeEntities(title.replace(/<[^>]+>/g, "")),
      link: decodeEntities(link),
      pubDate: pubDate ? new Date(pubDate) : null,
      source: decodeEntities(source),
    });
  }
  return items;
}

async function fetchUrl(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "daily-news-aggregator/1.0",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`);
  return res.text();
}

async function fetchQuery(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${HL}&gl=${GL}&ceid=${CEID}`;
  return parseRss(await fetchUrl(url));
}

async function fetchQueryCached(query) {
  if (!queryCache.has(query)) {
    queryCache.set(query, fetchQuery(query));
  }
  return queryCache.get(query);
}

function passesInsuranceFilter(item, domain = null) {
  const haystack = `${item.title} ${item.link}`;
  if (LOW_SIGNAL.test(haystack)) return false;
  if (NON_INSURANCE_EXCLUDE.test(haystack)) return false;
  if (item.fromNewsSection && domain?.host?.includes("insurance")) return true;
  if (item.fromNewsSection && /\/insurance\//.test(item.link ?? "")) return true;
  if (INSURANCE_KEYWORDS.test(haystack)) return true;
  if (FIG_CONTEXT.test(haystack)) return true;
  if (domain?.host?.includes("insurance") && /\/insurance\//.test(item.link ?? "")) return true;
  if (domain?.primaryRegion && domain.primaryRegion !== "global") {
    if (/\b(life insurer|life insurance|techcom life|manulife|prudential|aia\b|fwd life|great eastern)\b/i.test(haystack)) {
      return true;
    }
  }
  return false;
}

function passesRegionFilter(item, region) {
  const haystack = `${item.title} ${item.link} ${item.source ?? ""}`;
  if (region.exclude?.test(haystack)) return false;
  if (region.market.test(haystack)) return true;
  // Primary-region domains can surface without explicit market token when insurance-strong
  if (item.domainHost && item.primaryRegion === region.id) return true;
  return false;
}

function scoreItem(item, domain, region) {
  const sourceLabel = domain.label;
  const text = `${item.title} ${sourceLabel}`;
  const tag = classify(text);
  const priority = ["Regulatory", "Leadership", "Strategy", "Product", "Earnings", "Press"];
  let rank = priority.indexOf(tag);
  const haystack = `${item.title} ${item.link}`;
  if (region.market.test(haystack)) rank -= 2;
  if (domain.primaryRegion === region.id) rank -= 1;
  return {
    ...item,
    source: sourceLabel,
    tag,
    rank,
    domainHost: domain.host,
    primaryRegion: domain.primaryRegion,
    via: item.via ?? "google-news",
  };
}

function cleanTitle(title) {
  return title
    .replace(/\s*[-–|]\s*(?:reuters|bloomberg|insurance asia|nikkei).*$/i, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSameStory(a, b) {
  const titleA = cleanTitle(a.title);
  const titleB = cleanTitle(b.title);
  if (!titleA || !titleB) return false;
  if (titleA === titleB) return true;
  const tokensA = titleA.split(" ").filter((t) => t.length > 3);
  const tokensB = titleB.split(" ").filter((t) => t.length > 3);
  const setB = new Set(tokensB);
  const shared = tokensA.filter((t) => setB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 && shared / union >= 0.45;
}

function pickTopN(items, n = BULLETS_PER_REGION, regionId = null) {
  const sorted = [...items].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0);
  });
  const unique = [];
  const hostCount = new Map();

  if (regionId) {
    const primaryBest = [
      ...new Set(sorted.filter((i) => i.primaryRegion === regionId && i.domainHost).map((i) => i.domainHost)),
    ]
      .map((host) => ({ host, best: sorted.find((i) => i.domainHost === host) }))
      .filter((entry) => entry.best)
      .sort((a, b) => {
        if (a.best.rank !== b.best.rank) return a.best.rank - b.best.rank;
        return (b.best.pubDate?.getTime() ?? 0) - (a.best.pubDate?.getTime() ?? 0);
      });

    const primarySlots = Math.min(3, n);
    for (const { host, best } of primaryBest) {
      if (unique.length >= primarySlots) break;
      if (unique.some((kept) => isSameStory(best, kept))) continue;
      unique.push(best);
      hostCount.set(host, 1);
    }
  }

  for (const item of sorted) {
    if (unique.length >= n) break;
    if (unique.some((kept) => isSameStory(item, kept))) continue;
    const host = item.domainHost ?? "";
    if (host && (hostCount.get(host) ?? 0) >= 2) continue;
    if (unique.includes(item)) continue;
    unique.push(item);
    if (host) hostCount.set(host, (hostCount.get(host) ?? 0) + 1);
  }

  return unique.slice(0, n).map((item) => ({
    tag: item.tag,
    headline: summarize(item.title),
    source: item.source,
    url: item.link,
    published: item.pubDate?.toISOString() ?? null,
    via: item.via,
  }));
}

async function collectFromRssFeed(feed, domain, region, cutoff) {
  const all = [];
  try {
    for (const item of await parseRss(await fetchUrl(feed.url), feed.label ?? domain.label)) {
      if (item.pubDate && item.pubDate.getTime() < cutoff) continue;
      if (!passesInsuranceFilter(item, domain)) continue;
      const scored = scoreItem({ ...item, via: "rss" }, domain, region);
      if (!passesRegionFilter(scored, region)) continue;
      all.push(scored);
    }
  } catch (err) {
    console.warn(`      rss warn: ${feed.url} — ${err.message}`);
  }
  return all;
}

async function collectFromDomainSections(domain, region, cutoff) {
  const sections = domain.newsSections ?? [];
  const all = [];
  const seenTitles = new Set();

  for (const query of buildSectionQueries(domain)) {
    try {
      for (const item of await fetchQueryCached(query)) {
        if (!item.pubDate || item.pubDate.getTime() < cutoff) continue;
        const onDomain = linkMatchesDomain(item.link, domain.host);
        if (!onDomain && !/news\.google\.com/i.test(item.link)) continue;
        if (onDomain && !linkMatchesNewsSection(item.link, sections)) continue;
        if (seenTitles.has(cleanTitle(item.title))) continue;
        seenTitles.add(cleanTitle(item.title));

        const enriched = { ...item, fromNewsSection: true, via: "sections" };
        if (!passesInsuranceFilter(enriched, domain)) continue;
        const scored = scoreItem(enriched, domain, region);
        if (!passesRegionFilter(scored, region)) continue;
        if (domain.primaryRegion === region.id) scored.rank -= 4;
        all.push(scored);
      }
    } catch (err) {
      console.warn(`      sections warn: ${domain.host} — ${err.message}`);
    }
  }

  return all;
}

async function collectFromDomainGoogle(domain, region, cutoff) {
  const regionTerm = region.name.split("&")[0].trim();
  const queries = [
    `site:${domain.host} insurance ${regionTerm} when:2d`,
    `site:${domain.host} insurance when:2d`,
    `site:${domain.host} (life OR insurance OR reinsurance) when:3d`,
  ];
  const all = [];
  for (const query of queries) {
    const useExtended = query.includes("when:3d");
    const effectiveCutoff = useExtended ? Date.now() - 3 * 24 * 60 * 60 * 1000 : cutoff;
    try {
      for (const item of await fetchQueryCached(query)) {
        if (!item.pubDate || item.pubDate.getTime() < effectiveCutoff) continue;
        if (!passesInsuranceFilter(item, domain)) continue;
        const scored = scoreItem({ ...item, via: "google-news" }, domain, region);
        if (!passesRegionFilter(scored, region)) continue;
        all.push(scored);
      }
    } catch (err) {
      console.warn(`      google warn: ${domain.host} — ${err.message}`);
    }
  }
  return all;
}

async function collectFromDomain(domain, region, cutoff) {
  let all = [];
  const feeds = domain.rssFeeds?.length ? domain.rssFeeds : feedsForHost(domain.host);
  if (feeds.length) {
    for (const feed of feeds) {
      all = all.concat(await collectFromRssFeed(feed, domain, region, cutoff));
    }
  }
  all = all.concat(await collectFromDomainSections(domain, region, cutoff));
  if (pickTopN(all, 1).length === 0) {
    all = all.concat(await collectFromDomainGoogle(domain, region, cutoff));
  }
  return all;
}

async function buildRegion(region, allDomains, cutoff) {
  const regionDomains = domainsForRegion(allDomains, region.id).sort((a, b) => {
    const ap = a.primaryRegion === region.id ? 0 : 1;
    const bp = b.primaryRegion === region.id ? 0 : 1;
    return ap - bp || b.count - a.count;
  });
  let all = [];

  console.log(`  ${region.name} (${regionDomains.length} sources)`);
  for (const domain of regionDomains) {
    const feedTag = domain.hasRss ? "RSS+Sections" : "Sections";
    console.log(`    [${feedTag}] ${domain.label} (${domain.host})`);
    all = all.concat(await collectFromDomain(domain, region, cutoff));
  }

  if (pickTopN(all, BULLETS_PER_REGION).length < BULLETS_PER_REGION) {
    try {
      const extendedCutoff = Date.now() - 72 * 60 * 60 * 1000;
      for (const item of await fetchQuery(region.fallback)) {
        if (!item.pubDate || item.pubDate.getTime() < extendedCutoff) continue;
        if (!passesInsuranceFilter(item)) continue;
        const pseudo = {
          host: "google-news",
          label: item.source || "Google News",
          primaryRegion: "global",
        };
        const scored = scoreItem({ ...item, via: "google-news" }, pseudo, region);
        if (!passesRegionFilter(scored, region)) continue;
        all.push(scored);
      }
    } catch (err) {
      console.warn(`    fallback warn: ${err.message}`);
    }
  }

  return {
    id: region.id,
    name: region.name,
    color: region.color,
    sourceCount: regionDomains.length,
    rssSourceCount: regionDomains.filter((d) => d.hasRss).length,
    bullets: pickTopN(all, BULLETS_PER_REGION, region.id),
  };
}

export async function fetchDashboard() {
  const sources = loadSources();
  queryCache.clear();
  const cutoff = Date.now() - WINDOW_MS;
  const sectors = [];

  for (const region of REGIONS) {
    sectors.push(await buildRegion(region, sources.domains, cutoff));
  }

  return {
    generatedAt: new Date().toISOString(),
    title: "Asia Insurance Daily",
    region: "Asia-Pacific",
    timezone: "Asia/Singapore",
    windowHours: WINDOW_HOURS,
    bulletsPerRegion: BULLETS_PER_REGION,
    sourcesExtractedAt: sources.generatedAt,
    totalSourceDomains: sources.uniqueDomains,
    rssEnabledDomains: sources.rssEnabledDomains,
    sourceConfig: sources.sourceConfig,
    domains: sources.domains.map(({ host, label, primaryRegion, primaryRegionLabel, hasRss, newsSections }) => ({
      host,
      label,
      primaryRegion,
      primaryRegionLabel,
      hasRss,
      newsSections,
    })),
    sectors,
  };
}

export function writeDashboard(payload) {
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  return OUT_PATH;
}

async function main() {
  console.log(`Fetching Asia Insurance Daily headlines (last ${WINDOW_HOURS}h, ${BULLETS_PER_REGION} per region)…`);
  const payload = await fetchDashboard();
  const out = writeDashboard(payload);
  const total = payload.sectors.reduce((n, s) => n + s.bullets.length, 0);
  console.log(`\nWrote ${out} (${total} headlines across ${payload.sectors.length} regions)`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
