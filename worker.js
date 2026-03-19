/**
 * Wood's Wild News — Cloudflare Worker
 * GET  /rss?url=... → proxy RSS feeds (bypasses CORS)
 * POST /api         → proxy to Anthropic (optional)
 * *                 → serve static assets via ASSETS binding
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // ── GET /rss?url=... ── proxy RSS feeds server-side ──
    if (path === '/rss') {
      const feedUrl = url.searchParams.get('url');
      if (!feedUrl) {
        return new Response('Missing ?url= parameter', { status: 400 });
      }
      try {
        const res = await fetch(feedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; WoodsWildNews RSS Reader)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
          },
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
        return new Response(`RSS fetch failed: ${err.message}`, {
          status: 502,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // ── POST /api ── Anthropic proxy ──
    if (path === '/api' && request.method === 'POST') {
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
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // ── Everything else → static assets ──
    return env.ASSETS.fetch(request);
  },
};
