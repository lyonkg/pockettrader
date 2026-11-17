#!/usr/bin/env node
/**
 * Optional PocketTrader market-data proxy.
 * Holds API keys server-side and only forwards allowlisted GET requests.
 *
 *   FINNHUB_API_KEY=... COINGECKO_API_KEY=... [PORT=8787] \
 *     [CORS_ORIGIN=https://lyonkg.github.io] node proxy/server.mjs
 *
 * This script is not deployed from this repository. Run it yourself (VPS, localhost,
 * or adapt worker.js as a Cloudflare Worker). Never commit real keys.
 */
import http from 'node:http';
import { request as httpsRequest } from 'node:https';

const PORT = Number(process.env.PORT || 8787);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://lyonkg.github.io';
const FINNHUB_API_KEY = (process.env.FINNHUB_API_KEY || '').trim();
const COINGECKO_API_KEY = (process.env.COINGECKO_API_KEY || '').trim();
const RPM = Number(process.env.RATE_LIMIT_RPM || 60);

const buckets = new Map(); // ip -> { tokens, t }

function allowRate(ip) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b) {
    b = { tokens: RPM, t: now };
    buckets.set(ip, b);
  }
  const refill = RPM / 60_000;
  b.tokens = Math.min(RPM, b.tokens + (now - b.t) * refill);
  b.t = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  cors(res);
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function proxy(url, headers, res) {
  const u = new URL(url);
  const req = httpsRequest(
    {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'PocketTraderProxy/1.1', ...headers },
    },
    (up) => {
      cors(res);
      res.statusCode = up.statusCode || 502;
      const ct = up.headers['content-type'];
      if (ct) res.setHeader('Content-Type', ct);
      if (up.headers['retry-after']) res.setHeader('Retry-After', up.headers['retry-after']);
      up.pipe(res);
    },
  );
  req.setTimeout(10_000, () => {
    req.destroy();
    if (!res.headersSent) send(res, 504, { error: 'Upstream timeout' });
  });
  req.on('error', (err) => {
    if (!res.headersSent) send(res, 502, { error: 'Upstream error', detail: err.message });
  });
  req.end();
}

function matchCoingecko(pathname, searchParams) {
  if (pathname === '/coingecko/simple/price') {
    const ids = (searchParams.get('ids') || '').split(',').filter(Boolean);
    if (!ids.length || ids.length > 20 || ids.some((id) => !/^[a-z0-9-]{1,64}$/.test(id))) return null;
    const vs = searchParams.get('vs_currencies') || 'usd';
    if (vs !== 'usd') return null;
    const change = searchParams.get('include_24hr_change') === 'true' ? '&include_24hr_change=true' : '';
    return `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd${change}`;
  }
  const m = pathname.match(/^\/coingecko\/coins\/([a-z0-9-]{1,64})\/market_chart$/);
  if (m) {
    const days = searchParams.get('days') || '';
    if (!['1', '7', '30', '365'].includes(days)) return null;
    const vs = searchParams.get('vs_currency') || 'usd';
    if (vs !== 'usd') return null;
    return `https://api.coingecko.com/api/v3/coins/${m[1]}/market_chart?vs_currency=usd&days=${days}`;
  }
  return null;
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

  const origin = req.headers.origin;
  // Browser CORS is enforced by the allow-origin header. Non-browser callers are
  // still rate-limited. If an Origin is present, it must match.
  if (origin && origin !== CORS_ORIGIN && origin !== 'http://localhost:8080' && origin !== 'http://127.0.0.1:8080') {
    return send(res, 403, { error: 'Origin not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
  if (!allowRate(ip)) return send(res, 429, { error: 'Rate limit exceeded' });

  let url;
  try {
    url = new URL(req.url, 'http://127.0.0.1');
  } catch {
    return send(res, 400, { error: 'Bad URL' });
  }

  if (url.pathname === '/health') return send(res, 200, { ok: true });

  if (url.pathname === '/finnhub/quote') {
    if (!FINNHUB_API_KEY) return send(res, 503, { error: 'Finnhub key not configured on proxy' });
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
    if (!/^[A-Z0-9.-]{1,16}$/.test(symbol)) return send(res, 400, { error: 'Invalid symbol' });
    return proxy(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}`,
      { 'X-Finnhub-Token': FINNHUB_API_KEY },
      res,
    );
  }

  const cg = matchCoingecko(url.pathname, url.searchParams);
  if (cg) {
    const headers = {};
    if (COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;
    return proxy(cg, headers, res);
  }

  return send(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`PocketTrader proxy listening on http://127.0.0.1:${PORT} (CORS ${CORS_ORIGIN})`);
});
