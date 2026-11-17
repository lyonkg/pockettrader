# PocketTrader: stocks and crypto paper trading (Expo / React Native + TypeScript)

PocketTrader is a cross-platform (iOS, Android, web/PWA) paper-trading app. It has a portfolio dashboard, a live watchlist, interactive charts, and market and limit orders. Market data can come from a deterministic mock feed or from real providers.

## ▶ Open the app (one tap, nothing to install)

**https://lyonkg.github.io/pockettrader/**

The link opens the app directly in mobile Safari or Chrome over HTTPS, with no login, QR code, or Expo Go. To keep it as an app, use Share → **Add to Home Screen** (iOS) or ⋮ → **Install app** (Android Chrome).

| Download | URL | Lifetime |
|---|---|---|
| Web app / PWA (primary) | https://lyonkg.github.io/pockettrader/ | Permanent (GitHub Pages) |
| Source repository | https://github.com/lyonkg/pockettrader | Permanent |
| Android APK (debug-signed, arm64) | https://github.com/lyonkg/pockettrader/releases/download/v1.0.1/trading-app.apk | Permanent (GitHub Release) |
| Source code zip | https://github.com/lyonkg/pockettrader/releases/download/v1.0.1/trading-app-source.zip | Permanent (GitHub Release) |

Older mirrors (may expire):
- deed.page: https://lyonkg.github.io/pockettrader/ (host marked permanent; free plan)
- catbox APK: https://files.catbox.moe/j6et76.apk
- catbox zip: https://files.catbox.moe/ue8vaq.zip

> **Installing the APK:** Android asks you to confirm the install and to allow "install unknown apps" for your browser. iOS can't sideload apps without signing, so iPhone users should use the web link.

## Features

- **Portfolio**: total value, today's P&L ($ and %), cash, buying power (cash minus open buy orders), holdings value, unrealized P&L, and total return against the $100,000 demo start. Each holding shows quantity, average cost, last price, market value, and P&L.
- **Watchlist**: prices and % change update live every 1.5 s. Search the symbol universe to add symbols, and tap ✕ to remove one. The universe covers AAPL, MSFT, TSLA, NVDA, AMZN, GOOGL, META, NFLX, AMD, JPM, V, SPY, BTC-USD, ETH-USD, SOL-USD, DOGE-USD, ADA-USD, and XRP-USD.
- **Symbol detail**: an SVG line/area chart with 1D/1W/1M/1Y timeframes. Touch and drag (or click and drag on desktop) to scrub and read the price and time at any point. The 1D chart also adds live ticks. You can star a symbol to add it to the watchlist and see your position here.
- **Orders**: buy or sell, market or limit, with a quantity input (fractional for crypto) and a MAX button. Each order goes through a preview and confirm step. Orders that need more cash or shares than you have are rejected, and so are invalid quantities or prices. Limit orders that can fill right away do so at the better price. Others stay open, keep the needed cash or shares aside, and fill automatically when the price crosses the limit (an in-app toast appears). Open orders can be cancelled.
- **Order history**: filter by All / Open / Filled / Other (cancelled or rejected).
- **Settings**: switch between Mock and Live data, enter a Finnhub API key (stored on-device and always masked), see provider status and the last error, and reset the demo account. A header badge shows **LIVE DATA** (green), **MOCK** (grey), or **MOCK FALLBACK** (orange) when Live mode has to fall back.
- **Persistence**: the account, orders, watchlist, and settings are saved with AsyncStorage (localStorage on web).
- **Dark UI** with bottom tab navigation (Portfolio · Watchlist · Orders · Settings).

## Architecture

```
App.tsx                      Navigation: native stack (Tabs, Symbol, Trade modal) + bottom tabs
src/
  data/
    types.ts                 MarketDataProvider interface: getQuote / getHistory / subscribe
    MockProvider.ts          Deterministic seeded random walk (FNV-1a + mulberry32), ticks every 1.5 s
    LiveProvider.ts          Hybrid live feed: CoinGecko (crypto) + Finnhub (stocks) with cache, rate limits, 429 backoff
    http.ts                  Token bucket, TTL/stale cache, request coalescing, timeouts
    index.ts                 createProvider(mode, apiKey, opts); one shared mock keeps prices continuous
    config.ts                EXPO_PUBLIC_DATA_PROVIDER, proxy URL, optional keys (dev only)
    symbols.ts               Symbol universe + search
  store/
    orders.ts                Pure order engine: validate, place, fill, process open orders, cancel, summarize
    persist.ts               Schema-checked AsyncStorage loader
    AppContext.tsx           React context: quote stream, account state, AsyncStorage persistence
  components/                PriceChart, DataBadge, UI primitives
  screens/                   Portfolio, Watchlist, Symbol, Trade, Orders, Settings
public/                      PWA: index.html template (meta/iOS tags, CSP), manifest.json, sw.js, icons
proxy/                       Optional Node / Cloudflare Worker proxy (not deployed; keys stay server-side)
scripts/                     host.sh, serve.js, pwa-postexport.js, make_source_zip.py, check-export-env.js
__tests__/                   Jest tests for the order engine, providers, HTTP helpers, and persistence
```

The order engine has no React or IO dependencies, so it is fully unit tested. On every quote batch, `AppContext` calls `processOpenOrders` to fill limit orders whose price has been crossed.

## Install & run (development)

Requirements: Node 20+ and npm.

```bash
npm install
npx expo start            # press w for web; scan the QR with Expo Go (Android/iOS); a = Android emulator, i = iOS simulator
npx expo start --web      # web only
npx expo start --tunnel ngrok   # reachable from any network (no Expo login needed)
```

- **Expo Go:** install Expo Go from the App Store or Play Store and scan the QR code shown by `npx expo start`. All native modules used here (svg, async-storage, screens, safe-area) are included in Expo Go.
- **Android emulator:** start an AVD, then press `a` (or run `npx expo run:android` for a native dev build).
- **iOS simulator (macOS):** press `i`, or run `npx expo run:ios`.

Checks:

```bash
npm test             # jest (order engine + providers)
npm run typecheck    # tsc --noEmit
```

## Build

### Web / PWA

```bash
npm run export:web   # expo export -p web + PWA tag check → dist/
npm run serve:web    # serve dist/ on http://localhost:8080 (gzip, SPA fallback, also serves downloads/)
```

`dist/` is a static site that can be installed as an app: it has a manifest, 192/512/maskable icons, an apple-touch-icon, theme color, iOS standalone meta tags, and a network-first service worker for offline use.

### Android APK

**Local Gradle build (this is how the hosted APK was built):**

```bash
# JDK 17 + Android SDK (platform 36, build-tools 36) with JAVA_HOME / ANDROID_HOME set
npx expo prebuild -p android
cd android && ./gradlew assembleRelease     # debug keystore signing (Expo template default)
# → android/app/build/outputs/apk/release/app-release.apk
```

The hosted APK was built for `arm64-v8a` only (`reactNativeArchitectures` in `android/gradle.properties`) to cut build time. Remove that override to build a universal APK.

**EAS (cloud, needs a free Expo account):**

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview   # with "buildType": "apk" in eas.json preview profile
```

### iOS

Use `npx eas-cli@latest build -p ios`. This needs an Apple Developer account. iOS can't sideload unsigned apps, so the PWA is the no-install option on iPhone.

## Market data: switching to a real provider

Mock data is the default and works offline with no keys. Live mode is a hybrid: crypto goes to CoinGecko, stocks go to Finnhub.

| Mode | Stocks | Crypto |
|---|---|---|
| `mock` (default) | Deterministic random walk | Deterministic random walk |
| `live` | Finnhub `/quote`, polled every 20 s (needs a key or a proxy; otherwise mock) | CoinGecko `/simple/price`, polled every 30 s, plus `/market_chart` history (no key required) |

A header badge shows the current mode:

- **LIVE DATA** (green) — Live mode, at least one real quote is showing.
- **MOCK** (grey) — Mock mode.
- **MOCK FALLBACK** (orange) — Live mode, but every current quote had to fall back to mock (no key, error, timeout, or rate limit).

Per-symbol badges appear on the watchlist, holdings, and symbol screen when you are in Live mode.

### Configuring API keys

**Do not put API keys in `EXPO_PUBLIC_*` variables for the public GitHub Pages build.** Expo inlines those values into the JavaScript bundle, where anyone can read them. `npm run export:web` will refuse to run if a key is set.

Preferred options, in order:

1. **In the app (stocks):** Settings → paste a free Finnhub key from [finnhub.io](https://finnhub.io) (create a free account, copy the API key). The key is stored only on this device (AsyncStorage / localStorage), is never shown in full (it is masked, e.g. `••••abcd`), and can be cleared. Crypto does not need a key.
2. **Optional backend proxy:** run `proxy/server.mjs` or deploy `proxy/worker.js` yourself (this repo does not deploy it). Hold `FINNHUB_API_KEY` on the server, then point the app at it with `EXPO_PUBLIC_DATA_PROXY_URL`. See [proxy/README.md](proxy/README.md). Also add the proxy origin to `connect-src` in `public/index.html`.
3. **Local development only:** copy `.env.example` to `.env` (gitignored) and, if you really want keys at dev time:
   ```
   EXPO_PUBLIC_DATA_PROVIDER=live
   EXPO_PUBLIC_FINNHUB_API_KEY=          # optional, local only
   EXPO_PUBLIC_COINGECKO_API_KEY=        # optional demo key; sent as x-cg-demo-api-key
   EXPO_PUBLIC_DATA_PROXY_URL=           # e.g. http://localhost:8787
   EXPO_PUBLIC_API_KEY=                  # deprecated alias of the Finnhub key
   ```
4. **Code:** implement `MarketDataProvider` (`src/data/types.ts`) and return it from `createProvider` in `src/data/index.ts`.

You can still switch Mock / Live at runtime in Settings regardless of the env default.

### Rate limits, caching, and fallback

- Client-side token buckets: CoinGecko ≈ 30 requests/min, Finnhub ≈ 50/min (free tier is 60/min).
- Identical in-flight requests are coalesced. Quotes are cached ~20 s; candles are cached longer (5–30 min by timeframe).
- HTTP 429 is retried with exponential backoff, honoring `Retry-After`. Requests time out after 8 s (`AbortController`).
- If there is no Finnhub key and no proxy, stocks stay on mock in Live mode (crypto still uses CoinGecko).
- If a live request fails, times out, or exhausts 429 retries, the app first reuses a recent real quote (up to 10 minutes) so prices do not jump to the mock scale; only then does it fall back to mock for that symbol, marked **MOCK FALLBACK**. The app never crashes on a data error.
- Finnhub's candle endpoint is paid, so stock charts in Live mode are generated by the mock engine but anchored to the real last price.

The public site's CSP already allows `https://api.coingecko.com` and `https://finnhub.io`. CoinGecko and Finnhub both support browser CORS.

## Self-hosting through a tunnel (optional, temporary)

```bash
nohup setsid bash scripts/host.sh > /tmp/host.log 2>&1 < /dev/null &
curl -s localhost:4040/api/tunnels      # shows the https://…exp.direct public URL
```

`scripts/host.sh` runs `expo start --tunnel ngrok --no-dev --minify` in a restart loop, which serves a production, minified, gzipped web bundle. The PWA files come from `public/`. `metro.config.js` also serves `downloads/trading-app.apk` and `downloads/trading-app-source.zip`. The subdomain comes from `.expo/settings.json` and stays the same across restarts.

(Cloudflare quick tunnels and SSH-based tunnels were tried first, but this machine's network blocks them. Expo's tunnel runs over TLS on port 443.)

### Permanent hosting

`dist/` is a plain static site. It uses absolute `/` asset paths, so host it at a domain root (or set `experiments.baseUrl` in app.json for a sub-path such as GitHub project pages). To publish it permanently, drag it onto Netlify Drop or use `npx vercel dist`, `npx surge dist`, GitHub Pages, or Cloudflare Pages (each needs your own account). Copy `downloads/*` into `dist/` first if you also want the APK and zip hosted there.

## Screenshots

See `screenshots/` (390×844 phone viewport, taken with headless Chromium against the public URL): portfolio, watchlist, chart scrubbing, order entry/preview/fill, validation, order history, settings, and live BTC data.

## Limitations

- Paper trading only: no brokerage, auth, or real orders. There are no fees and no market-hours rules, so stocks tick 24/7 in mock mode.
- Today's P&L is measured against the previous close, including for positions opened today.
- The live stock history is synthetic (see above). CoinGecko's free tier is rate-limited; the app throttles, caches, and falls back to mock when needed.
- A Finnhub key entered in Settings is stored on the device. The public Pages build does not include any API key. An optional proxy is documented but not hosted here.
- Primary hosting is GitHub Pages (permanent). Older deed.page / catbox mirrors may still work.
