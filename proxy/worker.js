/**
 * Cloudflare Worker variant of the PocketTrader market-data proxy.
 * Bind FINNHUB_API_KEY (and optionally COINGECKO_API_KEY) as Worker secrets.
 * Set CORS_ORIGIN if you use a host other than https://lyonkg.github.io.
 *
 * Deploy (your account): npx wrangler secret put FINNHUB_API_KEY && npx wrangler deploy
 * Then set EXPO_PUBLIC_DATA_PROXY_URL to the Worker URL and add that origin to
 * the app's Content-Security-Policy connect-src in public/index.html.
 */
const DEFAULT_ORIGIN = 'https://lyonkg.github.io';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
  };
}

function json(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
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

export default {
  async fetch(request, env) {
    const origin = env.CORS_ORIGIN || DEFAULT_ORIGIN;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed' }, origin);

    const reqOrigin = request.headers.get('Origin');
    if (reqOrigin && reqOrigin !== origin) return json(403, { error: 'Origin not allowed' }, origin);

    const url = new URL(request.url);
    if (url.pathname === '/health') return json(200, { ok: true }, origin);

    let upstream;
    const headers = { Accept: 'application/json', 'User-Agent': 'PocketTraderProxy/1.1' };

    if (url.pathname === '/finnhub/quote') {
      const key = env.FINNHUB_API_KEY;
      if (!key) return json(503, { error: 'Finnhub key not configured on proxy' }, origin);
      const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
      if (!/^[A-Z0-9.-]{1,16}$/.test(symbol)) return json(400, { error: 'Invalid symbol' }, origin);
      upstream = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}`;
      headers['X-Finnhub-Token'] = key;
    } else {
      const cg = matchCoingecko(url.pathname, url.searchParams);
      if (!cg) return json(404, { error: 'Not found' }, origin);
      upstream = cg;
      if (env.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = env.COINGECKO_API_KEY;
    }

    const up = await fetch(upstream, { headers });
    const outHeaders = { ...corsHeaders(origin) };
    const ct = up.headers.get('Content-Type');
    if (ct) outHeaders['Content-Type'] = ct;
    const ra = up.headers.get('Retry-After');
    if (ra) outHeaders['Retry-After'] = ra;
    return new Response(up.body, { status: up.status, headers: outHeaders });
  },
};
