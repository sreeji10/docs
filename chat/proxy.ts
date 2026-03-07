/**
 * Local development proxy for chat.langchain.com.
 *
 * Strips the `frame-ancestors` CSP directive so the iframe embed works
 * on localhost. Run alongside `make dev`:
 *
 *   bun chat/proxy.ts
 *
 * The chat widget auto-detects localhost and points to this proxy (port 3333).
 */
const TARGET = "https://chat.langchain.com";
const PORT = 3333;

const STRIP_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "x-frame-options",
  "strict-transport-security",
]);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const targetUrl = `${TARGET}${url.pathname}${url.search}`;

    const headers = new Headers(req.headers);
    headers.set("host", "chat.langchain.com");
    headers.delete("origin");
    headers.delete("referer");
    // Prevent compressed responses — Bun's fetch auto-decompresses but
    // we'd then forward stale Content-Encoding headers to the browser.
    headers.set("accept-encoding", "identity");

    const resp = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      redirect: "follow",
    });

    const respHeaders = new Headers();
    for (const [key, value] of resp.headers.entries()) {
      if (STRIP_HEADERS.has(key.toLowerCase())) continue;

      if (key.toLowerCase() === "content-security-policy") {
        respHeaders.set(key, value.replace(/frame-ancestors[^;]*(;|$)/gi, ""));
        continue;
      }

      // Rewrite cookies: strip Secure flag and __Host-/__Secure- prefixes
      // so they work on plain HTTP localhost.
      if (key.toLowerCase() === "set-cookie") {
        const fixed = value
          .replace(/;\s*Secure/gi, "")
          .replace(/__Host-/g, "__Dev-Host-")
          .replace(/__Secure-/g, "__Dev-Secure-");
        respHeaders.append(key, fixed);
        continue;
      }

      respHeaders.set(key, value);
    }

    respHeaders.set("access-control-allow-origin", "*");

    const body = await resp.arrayBuffer();
    return new Response(body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  },
});

console.log(`Chat proxy running at http://localhost:${PORT} → ${TARGET}`);
