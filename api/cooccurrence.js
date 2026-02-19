// /api/cooccurrence.js
// Checks how many AO3 works are tagged with ALL given freeform tags.
// GET /api/cooccurrence?tags=Slow+Burn,Enemies+to+Lovers,Angst

export const config = { runtime: "edge" };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const tagsParam = searchParams.get("tags");

  if (!tagsParam) {
    return new Response(JSON.stringify({ error: "missing_tags" }), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  const tags = tagsParam.split(",").map((t) => t.trim()).filter(Boolean);
  if (tags.length < 2) {
    return new Response(JSON.stringify({ error: "need_at_least_2_tags" }), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  // Use AO3 work search with ALL freeform tags (comma-separated = AND)
  const ao3Url =
    `https://archiveofourown.org/works/search?work_search[freeform_names]=${encodeURIComponent(tags.join(","))}`;

  try {
    const res = await fetch(ao3Url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TagChainGame/1.0)",
        Accept: "text/html",
      },
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: corsHeaders(),
      });
    }

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "ao3_error", status: res.status }), {
        status: 502,
        headers: corsHeaders(),
      });
    }

    const html = await res.text();

    let count = 0;
    // AO3 search results page shows "X Found" in a heading
    const match = html.match(/([\d,]+)\s*Found/i);
    if (match) {
      count = parseInt(match[1].replace(/,/g, ""), 10);
    }

    return new Response(JSON.stringify({ tags, count }), {
      status: 200,
      headers: corsHeaders(),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "fetch_failed", message: err.message }), {
      status: 502,
      headers: corsHeaders(),
    });
  }
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    // Co-occurrence results can change, but cache for a bit to be nice to AO3
    "Cache-Control": "public, max-age=300, s-maxage=3600",
  };
}
