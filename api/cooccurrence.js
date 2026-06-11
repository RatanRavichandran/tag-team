// /api/cooccurrence.js
// Checks how many AO3 works are tagged with ALL given freeform tags.
// GET /api/cooccurrence?tags=Slow+Burn,Enemies+to+Lovers,Angst
//
// Runs on Vercel's Node.js runtime. Reaches AO3 via fetchAO3, which routes
// through a residential proxy in production (see api/_ao3.js).

import { fetchAO3 } from "./_ao3.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  // Co-occurrence results can change, but cache for a bit to be nice to AO3
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");

  const tagsParam = req.query.tags;

  if (!tagsParam) {
    res.status(400).json({ error: "missing_tags" });
    return;
  }

  const tags = tagsParam
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length < 2) {
    res.status(400).json({ error: "need_at_least_2_tags" });
    return;
  }

  // Use AO3 work search with ALL freeform tags (comma-separated = AND)
  const ao3Url = `https://archiveofourown.org/works/search?work_search[freeform_names]=${encodeURIComponent(
    tags.join(",")
  )}`;

  try {
    const ao3Res = await fetchAO3(
      ao3Url,
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    );

    if (ao3Res.status === 429) {
      res.status(429).json({ error: "rate_limited" });
      return;
    }

    if (!ao3Res.ok) {
      res.status(502).json({ error: "ao3_error", status: ao3Res.status });
      return;
    }

    const html = await ao3Res.text();

    let count = 0;
    // AO3 search results page shows "X Found" in a heading
    const match = html.match(/([\d,]+)\s*Found/i);
    if (match) {
      count = parseInt(match[1].replace(/,/g, ""), 10);
    }

    res.status(200).json({ tags, count });
  } catch (err) {
    res.status(502).json({ error: "fetch_failed", message: err.message });
  }
}
