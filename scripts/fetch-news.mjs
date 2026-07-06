import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { feedsForHost } from "./feeds.mjs";
import { buildSectionQueries, isCareerOrJobUrl, linkMatchesDomain, linkMatchesNewsSection } from "./news-sections.mjs";
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
  /\b(top \d+|best \d+|how to|stock to (?:buy|watch)|share price today|brokerage reco|buy rating|viral video|stock surges|women of influence|mortgage pre-approval|fda approval|sickle cell|robotics federation|gf value|is it too late to buy|tipranks|ad hoc news)\b/i;

const MARKET_DATA_EXCLUDE =
  /\b(trades below|trades above|buyback average|interactive stock chart|holding history|stock chart|share price|stock price,?\s*news,?\s*quote(?: & history)?|latest stock news(?: & headlines)?|options chain|company profile(?: & facts)?|stock forum|gráfico interactivo|stock may be \d+% undervalued|\b\d+% undervalued\b|\[(?:LSE|NYSE|NASDAQ|TSE|HKEX|SGX):|\([A-Z0-9]+\.(?:BO|NS|L|HK|TO)\)|\([A-Z]{1,5}\)\s*(?:stock|latest|balances|risk)|(?:^|\s)(?:0P0000|[A-Z]{1,5}\d+\.(?:BO|NS|L|HK|TO))\)|gurufocus|kalkine media|stock titan|ishares .* trust\(|portfolio holdings|mutual fund|fmcg fund|high growth \d+)\b/i;

const HUB_ACTION_VERBS =
  /\b(launch|appoint|report|survey|deal|profit|regulat|merger|partnership|reform|coverage|premium|delay|aims|taps|teams|claims|offers|introduc|expand|sign|record|approve|reject|raise|cut|boost|warn|unveil|partner|acquire|invest|enter|secure|win|name|elect|hire|step|return|build|create|develop|provide|deliver|help|support|enable|drive|shift|move|set|plan|expect|forecast|guide|urge|call|seek|push|back|lead|join|leave|quit|retire|hand|cashing in)\b/i;

const CAREER_EXCLUDE =
  /\b(business solutions manager|solutions manager|relationship manager in|senior portfolio manager in|portfolio manager in|manager in (?:Singapore|Hong Kong|China|India|Australia|Malaysia|Indonesia|Vietnam|Japan|Korea|Tokyo)|actuarial analyst in|analyst in (?:Singapore|Hong Kong|China|India|Australia)|actuary analyst|in (?:Singapore|Hong Kong|China|India|Australia|Malaysia|Indonesia|Vietnam|Japan|Korea|Tokyo),|m\/f\/d\)|m\/f\/d\b|job opening|we are hiring|join our team|graduate programme|graduate program|early career|internship at|career opportunity|vacancy for|hiring for|recruitment drive|apply now|sales & distribution at|partnership in kuala lumpur| at manulife - manulife| at prudential - prudential)\b/i;

const POLITICS_EXCLUDE =
  /\b(senator|congressman|congresswoman|parliament|kmt\b|political party|election campaign|white house|democrat|republican|foreign minister|diplomatic talks|did not meet me|ukraine peace talks|peace talks|brok(?:er|ering) (?:stalled )?peace|trump offers|trump dials|calls for trump|socceroo|monoculture claim)\b/i;

const INSURANCE_KEYWORDS =
  /\b(insurance|insurer|insurers|insuring|reinsurance|reinsurer|life insurance|life insurers?|general insurance|health insurance|underwrit|policy premium|insurtech|actuar|(?:insurance|policy|health|life)\s+claims?\b|\bclaims?\s+(?:ratio|settlement|paid|surge|rise|fall|data|handling|volume|costs)\b|bima|irdai|apra|hkma|tokio marine|aia\b|allianz|axa\b|aviva|manulife|prudential|metlife|ms&ad|dai-?ichi|sumitomo life|nippon life|fwd\b|chubb|zurich|swiss re|munich re|liberty mutual|insurance broker(?:age)?s?|reinsurance broker(?:age)?s?|mga\b|captives?|techcom life|bao hiem|bảo hiểm|higher-for-longer rates|organizational growth and transformation)\b/i;

const NON_INSURANCE_EXCLUDE =
  /\b(military training|russia approved|sgx mainboard|esg reporting(?!.*insur)|vertex announces|casgevy|real estate(?!.*insur)|property developer|marketing claims|rejects claims|false claims|mortgage|home buying|robotics federation|oscar health|unum group|hello nation.*utah|clash in court over marketing)\b/i;

const INSURER_REGIONS = {
  "great eastern": ["china-hk", "sea"],
  prudential: ["china-hk", "sea"],
  metlife: ["japan-korea", "sea", "china-hk"],
  manulife: ["sea", "china-hk", "japan-korea"],
  aia: ["china-hk", "sea"],
  fwd: ["sea"],
  "tokio marine": ["japan-korea"],
  "nippon life": ["japan-korea"],
  "dai-ichi life": ["japan-korea"],
  daiichi: ["japan-korea"],
  "sumitomo life": ["japan-korea"],
  qbe: ["anz"],
  suncorp: ["anz"],
  iag: ["anz"],
};

const INSURER_ENTITIES = [
  "great eastern",
  "tokio marine",
  "sumitomo life",
  "nippon life",
  "dai-ichi life",
  "daiichi life",
  "income insurance",
  "china life",
  "ping an",
  "china taiping",
  "techcom life",
  "techcombank",
  "prudential",
  "manulife",
  "aia",
  "axa",
  "allianz",
  "aviva",
  "chubb",
  "zurich",
  "fwd",
  "msig",
  "qbe",
  "aig",
  "metlife",
  "generali",
  "swiss re",
  "munich re",
  "liberty mutual",
  "hdfc life",
  "icici prudential",
  "sbi life",
];

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
    patterns: [
      /\b(earnings|quarterly|q[1-4]|results|revenue|profit|premium|aum|cashing in|higher-for-longer rates|rates are a gift)\b/i,
    ],
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

function headlineText(title) {
  return String(title ?? "")
    .replace(/\s*[-–|]\s*[\w.]+\.(?:com|au|co\.uk|asia|vn|sg)(?:\s*[-–|]\s*[\w.]+)?\s*$/i, "")
    .replace(/\s*[-–|]\s*(?:reuters|bloomberg|insurance asia|nikkei|scmp|south china morning post|business times|aap|yahoo finance|wsj).*$/i, "")
    .trim();
}

function isLowQualityTitle(title) {
  const headline = headlineText(title);
  const words = headline.match(/\b[a-zA-Z]{3,}\b/g) ?? [];
  if (words.length < 2) return true;
  if (/(?:\d+%\s*){2,}/.test(headline) && words.length < 4) return true;
  if (/^(?:net asset value|site map|meta_title)/i.test(headline)) return true;
  return false;
}

function isGenericHubTitle(title) {
  const headline = headlineText(title);
  if (
    /\b(the latest news,?\s*insight|commentary & analysis at|news - the latest|latest news,?\s*insight,?\s*commentary|executive perspectives - wsj$|meta_title)\b/i.test(
      headline,
    )
  ) {
    return true;
  }
  const parts = String(title ?? "")
    .split(/\s*[-–|]\s*/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length >= 3 && parts.at(-1) === parts.at(-2)) return true;
  if (
    /^[^.!?]{0,80} news$/i.test(headline) &&
    !HUB_ACTION_VERBS.test(headline)
  ) {
    return true;
  }
  if (/\binsurance asia$/i.test(String(title)) && !HUB_ACTION_VERBS.test(headline)) return true;
  if (/\b(medical insurance news|regulatory and development authority)\b/i.test(headline) && !HUB_ACTION_VERBS.test(headline)) {
    return true;
  }
  return false;
}

function isJobPostingTitle(title) {
  const headline = headlineText(title);
  if (/\|\s*.+\s+at\s+(?:manulife|prudential|aia|allianz|axa|aviva)\b/i.test(title)) return true;
  if (/[^\u0000-\u024F\u1E00-\u1EFF]{4,}/.test(title)) return true;
  return /\b(?:senior )?(?:portfolio|relationship|business solutions) manager in\b/i.test(headline);
}

function passesContentFilter(item) {
  const headline = headlineText(item.title);
  const haystack = `${headline} ${item.title} ${item.link}`.toLowerCase();
  if (isLowQualityTitle(item.title)) return false;
  if (isGenericHubTitle(item.title)) return false;
  if (isJobPostingTitle(item.title)) return false;
  if (isCareerOrJobUrl(item.link)) return false;
  if (CAREER_EXCLUDE.test(haystack)) return false;
  if (POLITICS_EXCLUDE.test(haystack)) return false;
  if (NON_INSURANCE_EXCLUDE.test(haystack)) return false;
  if (MARKET_DATA_EXCLUDE.test(haystack)) return false;
  if (LOW_SIGNAL.test(haystack)) return false;
  if (/aap(?:news)?\.(?:com\.)?au/i.test(`${item.title} ${item.link}`) && !INSURANCE_KEYWORDS.test(haystack)) return false;
  return true;
}

function passesInsuranceFilter(item, domain = null) {
  if (!passesContentFilter(item)) return false;
  const headline = headlineText(item.title);
  const haystack = `${headline} ${item.link}`;
  if (item.fromNewsSection && /\/insurance\//.test(item.link ?? "") && INSURANCE_KEYWORDS.test(headline)) return true;
  if (INSURANCE_KEYWORDS.test(haystack)) return true;
  if (FIG_CONTEXT.test(haystack)) return true;
  if (domain?.host?.includes("insurance") && /\/insurance\//.test(item.link ?? "") && INSURANCE_KEYWORDS.test(headline)) {
    return true;
  }
  if (domain?.primaryRegion && domain.primaryRegion !== "global") {
    if (INSURANCE_KEYWORDS.test(headline) || FIG_CONTEXT.test(headline)) return true;
  }
  return false;
}

function regionHintForHeadline(title) {
  const headline = headlineText(title);
  for (const region of REGIONS) {
    if (region.market.test(headline)) return region.id;
  }
  const entity = extractInsurerEntity(title);
  if (entity && INSURER_REGIONS[entity]?.[0]) return INSURER_REGIONS[entity][0];
  if (/\blife insurers?\b/i.test(headline)) return "sea";
  return null;
}

function passesRegionFilter(item, region) {
  const headline = headlineText(item.title);
  const haystack = `${headline} ${item.link}`.toLowerCase();
  if (region.exclude?.test(haystack)) return false;
  if (region.market.test(headline)) return true;

  const entities = extractInsurerEntities(item.title);
  if (entities.some((entity) => INSURER_REGIONS[entity]?.includes(region.id))) return true;

  const hinted = regionHintForHeadline(item.title);
  if (hinted === region.id) return true;

  if (item.domainHost && item.primaryRegion === region.id && item.primaryRegion !== "global") {
    return passesInsuranceFilter(item, {
      host: item.domainHost,
      primaryRegion: item.primaryRegion,
      label: item.source,
    });
  }
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
  if (/\blife insurers?\b/i.test(item.title) && /\b(rates|cashing in|higher-for-longer)\b/i.test(item.title)) rank -= 4;
  if (/\b(higher-for-longer rates|rates are a gift)\b/i.test(item.title)) rank -= 3;
  if (domain.host === "deloitte.wsj.com") rank -= 4;
  if (/\b(ceo|cfo|chief)\b/i.test(item.title) && /\b(manulife|prudential|aia\b|great eastern)\b/i.test(item.title)) rank -= 3;
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
  return headlineText(title)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInsurerEntity(title) {
  const lower = cleanTitle(title);
  for (const entity of [...INSURER_ENTITIES].sort((a, b) => b.length - a.length)) {
    if (lower.includes(entity)) return entity;
  }
  return null;
}

function extractInsurerEntities(title) {
  const lower = cleanTitle(title);
  return [...INSURER_ENTITIES]
    .filter((entity) => lower.includes(entity))
    .sort((a, b) => b.length - a.length);
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
  if (union > 0 && shared / union >= 0.45) return true;
  return false;
}

function pickTopN(items, n = BULLETS_PER_REGION, regionId = null) {
  const sorted = [...items].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0);
  });
  const unique = [];
  const hostCount = new Map();
  const entitySeen = new Map();

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
      const entity = extractInsurerEntity(best.title);
      if (entity && (entitySeen.get(entity) ?? 0) >= 2) continue;
      if (entity && unique.some((kept) => extractInsurerEntity(kept.title) === entity && isSameStory(best, kept))) {
        continue;
      }
      unique.push(best);
      if (entity) entitySeen.set(entity, (entitySeen.get(entity) ?? 0) + 1);
      hostCount.set(host, 1);
    }
  }

  const flagship = sorted.find(
    (item) =>
      /\b(higher-for-longer|rates are a gift)\b/i.test(item.title) && /\blife insurers?\b/i.test(item.title),
  );
  if (flagship && !unique.some((kept) => isSameStory(flagship, kept))) {
    unique.push(flagship);
    const entity = extractInsurerEntity(flagship.title);
    if (entity) entitySeen.set(entity, (entitySeen.get(entity) ?? 0) + 1);
    const host = flagship.domainHost ?? "";
    if (host) hostCount.set(host, (hostCount.get(host) ?? 0) + 1);
  }

  for (const item of sorted) {
    if (unique.length >= n) break;
    if (unique.some((kept) => isSameStory(item, kept))) continue;
    const entity = extractInsurerEntity(item.title);
    if (entity && (entitySeen.get(entity) ?? 0) >= 2) continue;
    if (entity && unique.some((kept) => extractInsurerEntity(kept.title) === entity && isSameStory(item, kept))) {
      continue;
    }
    const host = item.domainHost ?? "";
    if (host && (hostCount.get(host) ?? 0) >= 2) continue;
    if (unique.includes(item)) continue;
    unique.push(item);
    if (entity) entitySeen.set(entity, (entitySeen.get(entity) ?? 0) + 1);
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

  if (domain.host === "finance.yahoo.com" || domain.host === "sg.finance.yahoo.com") {
    queries.unshift(
      `site:${domain.host} ("life insurers" OR "life insurance" OR "higher-for-longer" OR manulife OR prudential OR metlife) when:3d`,
    );
  }
  if (domain.host === "deloitte.wsj.com") {
    queries.unshift(
      `site:${domain.host} (manulife OR prudential OR aia OR insurance OR CEO OR CFO OR "executive perspectives") when:7d`,
    );
  }

  const all = [];
  for (const query of queries) {
    const windowMatch = query.match(/when:(\d+)d/);
    const queryDays = windowMatch ? Number(windowMatch[1]) : 2;
    const effectiveCutoff = Date.now() - queryDays * 24 * 60 * 60 * 1000;
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

const SUPPLEMENTAL_GOOGLE_HOSTS = new Set(["finance.yahoo.com", "sg.finance.yahoo.com", "deloitte.wsj.com"]);

async function collectFromDomain(domain, region, cutoff) {
  let all = [];
  const feeds = domain.rssFeeds?.length ? domain.rssFeeds : feedsForHost(domain.host);
  if (feeds.length) {
    for (const feed of feeds) {
      all = all.concat(await collectFromRssFeed(feed, domain, region, cutoff));
    }
  }
  all = all.concat(await collectFromDomainSections(domain, region, cutoff));
  if (SUPPLEMENTAL_GOOGLE_HOSTS.has(domain.host) || pickTopN(all, 1).length === 0) {
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
