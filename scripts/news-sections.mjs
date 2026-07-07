/** Canonical news section tokens to search on source domains. */
export const CORE_SECTION_TOKENS = ["insights", "news", "news-releases", "media-releases"];

/** Per-host section landing paths for news / insights / release areas. */
export const HOST_SECTION_PATHS = {
  "insuranceasia.com": ["/insurance/news/"],
  "insurancethoughtleadership.com": ["/six-things-commentary/", "/leadership/", "/ai-machine-learning/"],
  "allianz.com": ["/mediacenter/news/"],
  "aviva.com": ["/newsroom/news-releases/"],
  "manulife.com": ["/about-us/news/"],
  "news.prudential.com": ["/latest-news/"],
  "wtwco.com": ["/insights/"],
  "deloitte.com": ["/insights/"],
  "deloitte.wsj.com": ["/executive-perspectives/", "/cfo/", "/ceo/"],
  "bcg.com": ["/publications/"],
  "asia.nikkei.com": ["/business/insurance/"],
  "scmp.com": ["/business/"],
  "reuters.com": ["/business/", "/legal/"],
  "vietnam.vn": ["/en/"],
  "vietnamnews.vn": ["/economy/", "/business/"],
  "businesstimes.com.sg": ["/companies-markets/"],
  "thestar.com.my": ["/business/"],
  "finews.asia": ["/finance/"],
};

/** Paths that indicate careers / jobs content, not news. */
export const CAREER_PATH_RE =
  /\/(?:careers?|jobs?|recruitment|vacancies|join-us|work-with-us|talent|campus|graduate-programme|early-careers)\b/i;

export function isCareerOrJobUrl(link) {
  return CAREER_PATH_RE.test(String(link ?? ""));
}

/** Google query exclusions appended to section searches. */
const SECTION_QUERY_EXCLUDE = "-careers -jobs -recruitment -vacancies -hiring";

/** Google News time window for section queries (days). Kept wider than the post-filter window. */
export const SECTION_QUERY_DAYS = 2;

export function newsSectionsForDomain(domain) {
  const paths = new Set([
    ...(HOST_SECTION_PATHS[domain.host] ?? []),
    ...(domain.newsSections ?? []),
  ]);
  for (const token of CORE_SECTION_TOKENS) {
    paths.add(`/${token}/`);
  }
  return [...paths].filter(Boolean).slice(0, 10);
}

/** True when link resolves to the expected source domain. */
export function linkMatchesDomain(link, host) {
  try {
    const h = new URL(link).hostname.replace(/^www\./, "");
    return h === host || h.endsWith(`.${host}`);
  } catch {
    return false;
  }
}

/** True when a headline URL sits in a news / insights / releases section. */
export function linkMatchesNewsSection(link, sections = []) {
  if (isCareerOrJobUrl(link)) return false;
  if (/news\.google\.com/i.test(link)) return true;
  try {
    const path = new URL(link).pathname.toLowerCase();
    if (CORE_SECTION_TOKENS.some((t) => path.includes(`/${t}`))) return true;
    if (/\/newsroom\/|\/mediacenter\/|\/publications\/|\/press-release/i.test(path)) return true;
    return sections.some((section) => {
      const needle = section.replace(/^\/|\/$/g, "").toLowerCase();
      return needle.length > 2 && path.includes(needle);
    });
  } catch {
    return false;
  }
}

/** Build Google News queries scoped to news sections on a domain. */
export function buildSectionQueries(domain, queryDays = SECTION_QUERY_DAYS) {
  const host = domain.host;
  const sections = newsSectionsForDomain(domain);
  const when = `when:${queryDays}d`;
  const queries = new Set();

  const pathPhrases = sections
    .map((s) => s.replace(/^\/|\/$/g, "").replace(/\//g, " ").replace(/-/g, " ").trim())
    .filter((p) => p.length >= 2);

  if (pathPhrases.length) {
    const clause = pathPhrases
      .slice(0, 5)
      .map((p) => (p.includes(" ") ? `"${p}"` : p))
      .join(" OR ");
    queries.add(`site:${host} (${clause}) ${when} ${SECTION_QUERY_EXCLUDE}`);
  }

  queries.add(
    `site:${host} (news OR insights OR "news releases" OR "media releases" OR newsroom OR mediacenter) ${when} ${SECTION_QUERY_EXCLUDE}`,
  );

  if (host === "vietnam.vn" || host === "vietnamnews.vn") {
    queries.add(`site:${host} (insurance OR techcom OR "bao hiem" OR bancassurance) ${when} ${SECTION_QUERY_EXCLUDE}`);
  }

  if (host === "finance.yahoo.com" || host === "sg.finance.yahoo.com") {
    return [
      `site:${host} "Higher-for-Longer Rates" ${when}`,
      `site:${host} ("life insurers" OR "life insurance" OR reinsurance OR insurtech OR underwrit*) ${when}`,
      `site:${host} (insurance OR manulife OR prudential OR metlife OR aia OR chubb) ${when}`,
    ];
  }

  if (host === "deloitte.wsj.com") {
    queries.add(
      `site:${host} (manulife OR prudential OR aia OR insurance OR CEO OR CFO OR "executive perspectives") when:7d ${SECTION_QUERY_EXCLUDE}`,
    );
  }

  return [...queries].slice(0, 4);
}
