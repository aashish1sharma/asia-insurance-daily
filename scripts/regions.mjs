export const BULLETS_PER_REGION = 5;

export const REGIONS = [
  {
    id: "china-hk",
    name: "China & Hong Kong",
    color: "#8b3a2a",
    market:
      /\b(china|chinese|hong kong|hk\b|hkia|picc|ping an|great eastern|cathay|prudential china|beijing|shanghai|shenzhen|guangdong|sfc\b|mainland china|wealth hub)\b/i,
    exclude: /\b(utah families|us only|europe only)\b/i,
    fallback: "insurance (China OR Hong Kong) when:3d",
  },
  {
    id: "sea",
    name: "India & Southeast Asia",
    color: "#1e4d3a",
    market:
      /\b(singapore|malaysia|thailand|indonesia|vietnam|philippines|india|indian|mumbai|delhi|bengaluru|irdai|lic\b|hdfc|icici|sbi\b|axis bank|manulife india|fwd\b|aia singapore|great eastern|income insurance|msig|bima|₹|crore|lakh)\b/i,
    exclude: /\b(utah|us sme|united states only)\b/i,
    fallback: "insurance (Singapore OR India OR Malaysia OR Thailand OR Indonesia OR Vietnam) when:3d",
  },
  {
    id: "japan-korea",
    name: "Japan & Korea",
    color: "#1a4a6e",
    market:
      /\b(japan|japanese|korea|korean|tokyo|seoul|tokio marine|nippon life|dai-?ichi|sumitomo|ms&ad|samsung life|kyobo|db insurance|sony life|paypay|jiji|metlife japan|fssa)\b/i,
    exclude: /\b(utah|us only)\b/i,
    fallback: "insurance (Japan OR Korea) when:3d",
  },
  {
    id: "anz",
    name: "Australia & New Zealand",
    color: "#5c3d6e",
    market:
      /\b(australia|australian|new zealand|sydney|melbourne|auckland|qbe|australia financial review|afr\b|apra|anz\b|suncorp|iag\b|tower insurance|nz\b)\b/i,
    exclude: /\b(utah|us only)\b/i,
    fallback: "insurance (Australia OR New Zealand) when:3d",
  },
];

/** Primary region for each host. Unlisted hosts are treated as global (all regions). */
export const HOST_PRIMARY_REGION = {
  "scmp.com": "china-hk",
  "thediplomat.com": "china-hk",
  "asia.nikkei.com": "japan-korea",
  "jen.jiji.com": "japan-korea",
  "startupfortune.com": "japan-korea",
  "businesstimes.com.sg": "sea",
  "sbr.com.sg": "sea",
  "straitstimes.com": "sea",
  "theedgesingapore.com": "sea",
  "theedgemalaysia.com": "sea",
  "thestar.com.my": "sea",
  "finews.asia": "sea",
  "vietnamnews.vn": "sea",
  "vietnam.vn": "sea",
  "fundselectorasia.com": "sea",
  "eastspring.com": "sea",
  "sg.finance.yahoo.com": "sea",
  "insuranceasia.com": "sea",
  "adviservoice.com.au": "anz",
  "aap.com.au": "anz",
};

export function primaryRegionForHost(host) {
  return HOST_PRIMARY_REGION[host] ?? "global";
}

export function domainsForRegion(allDomains, regionId) {
  return allDomains.filter((d) => {
    const primary = primaryRegionForHost(d.host);
    return primary === regionId || primary === "global";
  });
}
