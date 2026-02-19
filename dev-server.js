// dev-server.js — Local development server
// Serves static files from public/ and proxies /api/* to AO3.
// Run: node dev-server.js

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function httpsGet(targetUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TagChainGame/1.0)",
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });

    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
    req.end();
  });
}

async function handleAutocomplete(query, res) {
  const term = query.term;
  if (!term || term.length < 2) {
    return sendJson(res, 200, []);
  }

  const ao3Url = `https://archiveofourown.org/autocomplete/freeform?term=${encodeURIComponent(term)}`;

  try {
    const result = await httpsGet(ao3Url, { Accept: "application/json" });

    if (result.status === 429) {
      return sendJson(res, 429, { error: "rate_limited" });
    }
    if (result.status !== 200) {
      return sendJson(res, 502, { error: "ao3_error", status: result.status });
    }

    const data = JSON.parse(result.data);
    sendJson(res, 200, data);
  } catch (err) {
    sendJson(res, 502, { error: "fetch_failed", message: err.message });
  }
}

async function handleCooccurrence(query, res) {
  const tagsParam = query.tags;

  if (!tagsParam) {
    return sendJson(res, 400, { error: "missing_tags" });
  }

  const tags = tagsParam.split(",").map((t) => t.trim()).filter(Boolean);
  if (tags.length < 2) {
    return sendJson(res, 400, { error: "need_at_least_2_tags" });
  }

  const ao3Url = `https://archiveofourown.org/works/search?work_search[freeform_names]=${encodeURIComponent(tags.join(","))}`;

  try {
    const result = await httpsGet(ao3Url, { Accept: "text/html" });

    if (result.status === 429) {
      return sendJson(res, 429, { error: "rate_limited" });
    }

    // Handle redirects (AO3 sometimes 302s to search results)
    if (result.status >= 300 && result.status < 400 && result.headers.location) {
      const redirectUrl = result.headers.location.startsWith("http")
        ? result.headers.location
        : `https://archiveofourown.org${result.headers.location}`;
      const redirectResult = await httpsGet(redirectUrl, { Accept: "text/html" });
      return parseAndSendCount(redirectResult.data, tags, res);
    }

    if (result.status !== 200) {
      return sendJson(res, 502, { error: "ao3_error", status: result.status });
    }

    parseAndSendCount(result.data, tags, res);
  } catch (err) {
    sendJson(res, 502, { error: "fetch_failed", message: err.message });
  }
}

function parseAndSendCount(html, tags, res) {
  let count = 0;
  const match = html.match(/([\d,]+)\s*Found/i);
  if (match) {
    count = parseInt(match[1].replace(/,/g, ""), 10);
  }
  sendJson(res, 200, { tags, count });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function serveStatic(pathname, res) {
  let filePath = path.join(PUBLIC_DIR, pathname);

  // Default to index.html
  if (pathname === "/") filePath = path.join(PUBLIC_DIR, "index.html");

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (pathname === "/api/autocomplete") {
    await handleAutocomplete(parsed.query, res);
  } else if (pathname === "/api/cooccurrence") {
    await handleCooccurrence(parsed.query, res);
  } else {
    serveStatic(pathname, res);
  }
});

server.listen(PORT, () => {
  console.log(`\n  ✨ Tag Team dev server running at http://localhost:${PORT}\n`);
});
