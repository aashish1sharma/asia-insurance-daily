/** Direct RSS feeds for configured source domains. */
export const HOST_FEEDS = {
  "asia.nikkei.com": [{ url: "https://asia.nikkei.com/rss/feed/nar", label: "Nikkei Asia" }],
  "scmp.com": [{ url: "https://www.scmp.com/rss/91/feed", label: "SCMP" }],
  "businesstimes.com.sg": [{ url: "https://www.businesstimes.com.sg/rss/feed/business", label: "Business Times" }],
  "insurancethoughtleadership.com": [{ url: "https://www.insurancethoughtleadership.com/feed/", label: "Insurance Thought Leadership" }],
  "reinsurancene.ws": [{ url: "https://www.reinsurancene.ws/feed/", label: "Reinsurance News" }],
  "insurancebusinessmag.com": [{ url: "https://www.insurancebusinessmag.com/us/rss", label: "Insurance Business" }],
  "straitstimes.com": [{ url: "https://www.straitstimes.com/news/asia/rss.xml", label: "Straits Times" }],
  "reinasia.com": [{ url: "https://reinasia.com/feed/", label: "Reinasia" }],
  "riskandinsurance.com": [{ url: "https://riskandinsurance.com/feed/", label: "Risk & Insurance" }],
  "businessinsurance.com": [{ url: "https://www.businessinsurance.com/rss", label: "Business Insurance" }],
  "news.prudential.com": [{ url: "https://news.prudential.com/rss", label: "Prudential News" }],
};

export function feedsForHost(host) {
  return HOST_FEEDS[host] ?? [];
}
