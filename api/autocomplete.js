// /api/autocomplete.js
// Proxies AO3's freeform tag autocomplete endpoint.
// GET /api/autocomplete?term=slow+burn
//
// Runs on Vercel's Node.js runtime. Reaches AO3 via fetchAO3, which routes
// through a residential proxy in production (see api/_ao3.js).

import { fetchAO3 } from "./_ao3.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");

  const term = req.query.term;

  if (!term || term.length < 2) {
    res.status(200).json([]);
    return;
  }

  // Use the ".json" extension so AO3 returns JSON regardless of the Accept
  // header — the residential proxy sends a browser-style "Accept: text/html",
  // which otherwise makes AO3 redirect away from the JSON response.
  const ao3Url = `https://archiveofourown.org/autocomplete/freeform.json?term=${encodeURIComponent(
    term
  )}`;

  try {
    const ao3Res = await fetchAO3(
      ao3Url,
      "application/json, text/javascript, */*; q=0.01"
    );

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
