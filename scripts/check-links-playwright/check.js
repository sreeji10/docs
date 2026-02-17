#!/usr/bin/env node
/**
 * Link checker using Playwright (headless browser).
 * Crawls docs.langchain.com, extracts all links from the fully rendered DOM,
 * and verifies each link. Handles client-rendered content (e.g. Mintlify Tabs).
 *
 * Usage:
 *   node check.js [options] [startUrl]
 *
 * Options:
 *   --max-pages=N    Max pages to crawl (default: 500)
 *   --timeout=N      Request timeout in ms (default: 15000)
 *   --concurrency=N  Concurrent link checks (default: 8)
 *
 * Example:
 *   node check.js https://docs.langchain.com/
 *   node check.js --max-pages=100
 */

import { chromium } from 'playwright';

const BASE_URL = 'https://docs.langchain.com';
const DEFAULT_MAX_PAGES = 500;
const DEFAULT_TIMEOUT = 15000;
const DEFAULT_CONCURRENCY = 8;

// URLs matching these patterns are skipped (regex or substring)
const SKIP_PATTERNS = [
  'academy.langchain.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'mintcdn.com',
  'mintlify-assets',
  'platform.openai.com/account/api-keys',
  'mcp.apify.com',
  'github.com',
];

// Parse args
const args = process.argv.slice(2);
let startUrl = BASE_URL + '/';
let maxPages = DEFAULT_MAX_PAGES;
let timeout = DEFAULT_TIMEOUT;
let concurrency = DEFAULT_CONCURRENCY;

for (const arg of args) {
  if (arg.startsWith('--max-pages=')) maxPages = parseInt(arg.split('=')[1], 10);
  else if (arg.startsWith('--timeout=')) timeout = parseInt(arg.split('=')[1], 10);
  else if (arg.startsWith('--concurrency=')) concurrency = parseInt(arg.split('=')[1], 10);
  else if (!arg.startsWith('--')) startUrl = arg;
}

const startOrigin = new URL(startUrl).origin;

/** Whether to skip checking this URL. */
function shouldSkip(url) {
  return SKIP_PATTERNS.some((p) => url.includes(p));
}

/** Normalize href to absolute URL. */
function resolveUrl(href, baseUrl) {
  if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return null;
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

/** Check if URL is same-origin (docs to crawl). */
function isInternal(url) {
  try {
    return new URL(url).origin === startOrigin;
  } catch {
    return false;
  }
}

/** Check if URL has a fragment. */
function hasFragment(url) {
  try {
    return new URL(url).hash.length > 1;
  } catch {
    return false;
  }
}

/** Get fragment ID (without #). */
function getFragment(url) {
  try {
    const hash = new URL(url).hash;
    return hash ? hash.slice(1) : null;
  } catch {
    return null;
  }
}

/** Get URL without fragment. */
function urlWithoutFragment(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

async function main() {
  const toCrawl = [startUrl];
  const visited = new Set();
  const linksToCheck = new Map(); // url -> { sourcePage, hasFragment }
  const checked = new Map();     // url -> { ok, status?, error? }
  const broken = [];

  console.log(`Crawling ${startUrl} (max ${maxPages} pages, timeout ${timeout}ms)...\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'LangChain-Docs-Link-Check/1.0',
    ignoreHTTPSErrors: true,
  });

  const request = context.request;

  try {
    // Phase 1: Crawl and collect links
    while (toCrawl.length > 0 && visited.size < maxPages) {
      const url = toCrawl.shift();
      if (visited.has(url)) continue;
      visited.add(url);

      process.stderr.write(`\rCrawled ${visited.size} pages, found ${linksToCheck.size} links...`);

      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout });
        const base = page.url();

        const hrefs = await page.$$eval('a[href]', (anchors) =>
          anchors.map((a) => a.getAttribute('href')).filter(Boolean)
        );

        for (const href of hrefs) {
          const resolved = resolveUrl(href, base);
          if (!resolved || shouldSkip(resolved)) continue;

          if (!linksToCheck.has(resolved)) {
            linksToCheck.set(resolved, { sourcePage: url, hasFragment: hasFragment(resolved) });
          }

          if (isInternal(resolved)) {
            const withoutHash = urlWithoutFragment(resolved);
            if (!visited.has(withoutHash) && !toCrawl.includes(withoutHash)) {
              toCrawl.push(withoutHash);
            }
          }
        }
      } catch (err) {
        console.error(`\nFailed to load ${url}: ${err.message}`);
      } finally {
        await page.close();
      }
    }

    process.stderr.write(`\rCrawled ${visited.size} pages, found ${linksToCheck.size} links. Verifying...\n\n`);

    // Phase 2: Verify each link (batched for concurrency)
    const urls = [...linksToCheck.keys()];
    const results = [];

    async function checkOne(url) {
      const { hasFragment: hasFrag } = linksToCheck.get(url);
      const frag = hasFrag ? getFragment(url) : null;
      const baseUrl = urlWithoutFragment(url);

      if (isInternal(url) && hasFrag) {
        const page = await context.newPage();
        try {
          await page.goto(baseUrl, { waitUntil: 'networkidle', timeout });
          // Use attribute selector [id="..."] to avoid needing CSS.escape (browser-only API)
          const escaped = frag.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          const exists = (await page.locator(`[id="${escaped}"]`).count()) > 0;
          await page.close();
          return { url, ok: exists, status: exists ? 200 : null, error: exists ? null : 'Fragment not found' };
        } catch (err) {
          await page.close();
          return { url, ok: false, status: null, error: err.message };
        }
      }

      try {
        const response = await request.get(url, { timeout });
        const ok = response.ok();
        return { url, ok, status: response.status(), error: ok ? null : `HTTP ${response.status()}` };
      } catch (err) {
        return { url, ok: false, status: null, error: err.message };
      }
    }

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(checkOne));
      results.push(...batchResults);
      for (const r of batchResults) {
        if (!r.ok) {
          broken.push({ url: r.url, error: r.error, status: r.status });
          const { sourcePage } = linksToCheck.get(r.url) || {};
          console.error(`❌ ${r.url}`);
          console.error(`   ${r.error}${sourcePage ? ` (from ${sourcePage})` : ''}`);
        }
      }
      process.stderr.write(`\rVerified ${Math.min(i + concurrency, urls.length)}/${urls.length} links (${broken.length} broken)...`);
    }
  } finally {
    await browser.close();
  }

  // Summary
  const total = linksToCheck.size;
  const okCount = total - broken.length;
  console.log(`\n${total} links checked: ${okCount} OK, ${broken.length} broken`);

  if (broken.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
