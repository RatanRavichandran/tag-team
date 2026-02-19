// /api/autocomplete.js
// Proxies AO3's freeform tag autocomplete endpoint.
// GET /api/autocomplete?term=slow+burn

export const config = { runtime: "edge" };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const term = searchParams.get("term");

  if (!term || term.length < 2) {
    return Response.json([]);
  }

  const ao3Url = `https://archiveofourown.org/autocomplete/freeform?term=${encodeURIComponent(term)}`;

  try {
    const res = await fetch(ao3Url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TagChainGame/1.0)",
        Accept: "application/json",
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

    const data = await res.json();
    // AO3 returns [{ id, name }, ...] — we just pass it through
    return new Response(JSON.stringify(data), {
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
    "Cache-Control": "public, max-age=3600, s-maxage=86400",
  };
}
