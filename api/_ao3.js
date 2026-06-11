// Shared helper: fetch an AO3 URL, optionally through a residential proxy.
//
// Files in /api whose name starts with "_" are NOT treated as routes by Vercel,
// so this is a private module imported by the real endpoints.
//
// WHY: AO3 sits behind Cloudflare, which blocks requests from datacenter IPs
// (Vercel, free CORS proxies, etc.) with a 525 handshake error. It only answers
// residential-looking clients. So in production we route through a residential
// proxy/scraping API; locally (residential IP) we can hit AO3 directly.
//
// Configure via the AO3_PROXY_URL env var — a template containing "{url}",
// which is replaced with the URL-encoded AO3 URL. Example (ScraperAPI):
//   https://api.scraperapi.com/?api_key=YOUR_KEY&premium=true&url={url}
// If AO3_PROXY_URL is unset, AO3 is fetched directly.

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

// AO3's search/Elasticsearch is flaky and Cloudflare intermittently answers
// datacenter-origin requests with a transient 5xx (525/520/522). Retry those a
// couple of times — a different residential IP / a moment later usually works.
// Client errors (404, 429) are returned immediately; retrying them is pointless.
export async function fetchAO3(ao3Url, accept, { retries = 2 } = {}) {
  const template = process.env.AO3_PROXY_URL;
  const target = template
    ? template.replace("{url}", encodeURIComponent(ao3Url))
    : ao3Url;

  let res;
  for (let attempt = 0; attempt <= retries; attempt++) {
    res = await fetch(target, {
      headers: { ...BROWSER_HEADERS, Accept: accept },
    });
    if (res.status < 500) return res;
  }
  return res;
}
