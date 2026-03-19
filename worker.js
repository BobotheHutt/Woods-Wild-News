/**
 * Wood's Wild News — Cloudflare Worker
 * Routes:
 *   GET  /rss?url=... → proxies RSS feeds (bypasses browser CORS)
 *   POST /api         → proxies to Anthropic (optional, for future use)
 *   *                 → serves static assets (index.html etc.)
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }

    // RSS proxy — fetches any RSS feed server-side, bypassing CORS
    if (url.pathname === '/rss' && request.method === 'GET') {
      const feedUrl = url.searchParams.get('url');
      if (!feedUrl) return new Response('Missing url param', { status: 400 });
      try {
        const res = await fetch(feedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; WoodsWildNews/1.0; RSS Reader)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
          },
          signal: AbortSignal.timeout(8000),
        });
        const text = await res.text();
        return new Response(text, {
          status: 200,
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=120',
          },
        });
      } catch (err) {
        return new Response(`Feed error: ${err.message}`, {
          status: 502,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // Anthropic proxy (optional, kept for future)
    if (url.pathname === '/api' && request.method === 'POST') {
      try {
        const body = await request.json();
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY || '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          status: res.status,
          headers: { 'Content-Type': 'application/json', ...cors() },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...cors() },
        });
      }
    }

    // Static assets
    return env.ASSETS.fetch(request);
  },
};

const cors = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});
