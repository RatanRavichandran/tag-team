// /api/autocomplete.js
// Proxies AO3's freeform tag autocomplete endpoint.
// GET /api/autocomplete?term=slow+burn
//
// Runs on Vercel's Node.js runtime (NOT edge): the edge runtime's TLS stack
// gets rejected by AO3's Cloudflare with a 525 handshake error, whereas Node's
// OpenSSL negotiates normally.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");

  const term = req.query.term;

  if (!term || term.length < 2) {
    res.status(200).json([]);
    return;
  }

  const ao3Url = `https://archiveofourown.org/autocomplete/freeform?term=${encodeURIComponent(
    term
  )}`;

  try {
    const ao3Res = await fetch(ao3Url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (ao3Res.status === 429) {
      res.status(429).json({ error: "rate_limited" });
      return;
    }

    if (!ao3Res.ok) {
      res.status(502).json({ error: "ao3_error", status: ao3Res.status });
      return;
    }

    const data = await ao3Res.json();
    // AO3 returns [{ id, name }, ...] — we just pass it through
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: "fetch_failed", message: err.message });
  }
}
