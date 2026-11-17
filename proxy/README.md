# Optional market-data proxy

The public GitHub Pages build of PocketTrader must not contain API keys: Expo inlines any `EXPO_PUBLIC_*` value into the JavaScript bundle.

Live **crypto** quotes still work without a proxy (CoinGecko's public API needs no key). Live **stock** quotes need a Finnhub key. You have two safe options:

1. **In-app Settings** — paste a free key from [finnhub.io](https://finnhub.io). It is stored only on the device (AsyncStorage / localStorage) and is never shown in full.
2. **This proxy** — hold the key on a server you control. The app calls your proxy; the key never ships to browsers.

This repository does **not** deploy the proxy (no hosting account is attached). Run it yourself.

## Node server (local or a VPS)

```bash
FINNHUB_API_KEY=your_key CORS_ORIGIN=https://lyonkg.github.io PORT=8787   node proxy/server.mjs
```

The process binds to `127.0.0.1` by default. Put it behind TLS (Caddy, nginx, or a tunnel) if you expose it on the internet.

## Cloudflare Worker

1. `npx wrangler secret put FINNHUB_API_KEY` (optional: `COINGECKO_API_KEY`).
2. Deploy `proxy/worker.js` with Wrangler (`main` pointing at that file).
3. Note the `*.workers.dev` (or custom) URL.

## Point the app at the proxy

Set this when you export a web build that should use the proxy:

```
EXPO_PUBLIC_DATA_PROXY_URL=https://your-proxy.example
```

No `EXPO_PUBLIC_*KEY` variables. Also add your proxy origin to `connect-src` in `public/index.html` (the template already allows `http://localhost:8787` for local development). Then rebuild and republish the web app.

The app calls:

- `GET {proxy}/finnhub/quote?symbol=AAPL`
- `GET {proxy}/coingecko/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true`
- `GET {proxy}/coingecko/coins/{id}/market_chart?vs_currency=usd&days=1|7|30|365`

Anything else returns 404. Requests are rate-limited (default 60/min per IP on the Node server). CORS is restricted to `https://lyonkg.github.io` (override with `CORS_ORIGIN`).
