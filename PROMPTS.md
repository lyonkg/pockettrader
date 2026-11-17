# PROMPTS.md — development prompt log

All prompts used to build **PocketTrader**, in order. Quoted prompts are verbatim.

---

## 1. Original user request (verbatim)

> Start now. Build the complete mobile trading app as specified in your instructions: cross-platform mobile app (React Native via Expo preferred for easy direct-download links), portfolio dashboard, watchlist, interactive price charts, buy/sell order flow, mock market data with a toggle to swap in a real provider, all development prompts saved in a PROMPTS.md file, full source in the workspace with a clear README covering build, run, and direct download steps. Iterate until it launches and the download link works.

## 2. Agent brief ("your instructions")

The assistant's standing brief was to build a complete mobile trading application. The build agent didn't get its full text, so this is a paraphrase of requirements 1–5 as the task prompt below restates them:

1. Cross-platform mobile app (React Native via Expo preferred, easy direct-download links).
2. Portfolio dashboard + watchlist.
3. Interactive price charts.
4. Buy/sell order flow.
5. Mock market data with a toggle to swap in a real provider; all prompts saved in PROMPTS.md; full source + README with build/run/direct-download steps.

## 3. Task prompt to the build agent (verbatim)

> Build a complete, working cross-platform mobile trading app (stocks + crypto) with Expo / React Native + TypeScript in /workspace/trading-app. Work autonomously: scaffold, code, test, and iterate until it launches.
>
> Features (clean dark-themed UI, bottom tab navigation):
> 1. Portfolio dashboard: total value, daily P&L, holdings list with qty/avg cost/market value/P&L, cash balance (start with e.g. $100,000 demo cash).
> 2. Watchlist: add/remove symbols, live-updating prices with % change, search over a symbol universe (e.g. AAPL, MSFT, TSLA, NVDA, AMZN, GOOGL, BTC-USD, ETH-USD, SOL-USD...).
> 3. Interactive price charts on a symbol detail screen: line chart with timeframe selector (1D/1W/1M/1Y), touch/scrub to see price at a point. Use a library that works on web + native (e.g. react-native-svg based custom chart or react-native-gifted-charts / victory-native compatible with web) — must render in the web build.
> 4. Buy/sell order flow: market and limit orders, quantity input, order preview/confirm, validation (insufficient cash/shares), order history screen, limit orders fill when mock price crosses. Persist state with AsyncStorage.
> 5. Market data layer: a provider interface (getQuote, getHistory, subscribe) with a MockProvider (deterministic random-walk, live ticking every ~1-2s, no API key) as default, plus at least one real provider implementation (e.g. Finnhub or Alpha Vantage for stocks, CoinGecko for crypto) selected by config/env (EXPO_PUBLIC_DATA_PROVIDER, EXPO_PUBLIC_API_KEY) and also a toggle in a Settings screen. Fall back to mock if the real provider errors.
> 6. Settings screen: data provider toggle, reset demo account.
>
> Deliverables:
> - Full source in /workspace/trading-app.
> - README.md: features, architecture, how to install, run (Expo Go, web, emulator), build (web/PWA export, APK via EAS or local gradle), how to switch to a real data provider, and how to download/install.
> - PROMPTS.md: all prompts used during development, starting with the user's original request verbatim: "Start now. Build the complete mobile trading app as specified in your instructions: …" plus the agent brief (build a complete mobile trading application... requirements 1-5) and this task prompt and any meaningful sub-prompts/iteration notes you used.
> - Tests: at least some unit tests (jest) for order logic and mock provider; TypeScript typecheck passes.
>
> Direct download link (crucial, must actually work and be verified with curl from outside):
> - Export the web build as an installable PWA (npx expo export -p web, add manifest/icons so it's 'Add to Home Screen' installable). Host it publicly without needing the user's accounts. Options to try: serve dist with a static server and expose via a cloudflared quick tunnel (trycloudflare.com) or similar no-account tunnel; or any free no-signup static host. Keep the server and tunnel running in the background (nohup) and make them survive.
> - Also try hard to produce an Android APK: either a local build (install JDK 17 + Android SDK cmdline tools, npx expo prebuild, ./gradlew assembleRelease, debug-signed is fine) if feasible on this Linux box within reasonable time/disk, and serve the APK from the same hosted site as a download link (e.g. /trading-app.apk). If APK build is infeasible, document why and the EAS command in README.
> - Optionally also start `npx expo start --tunnel` for Expo Go QR/exp:// link if it works without login; not required.
> - Also make a zip of the source (excluding node_modules) available at the hosted URL, e.g. /trading-app-source.zip.
> - Put the final URLs in README.
>
> Verify: web build loads (curl the public URL returns 200 and the JS bundle), ideally render check with a headless browser (playwright/chromium) and save screenshots of portfolio, watchlist, chart, and order screens to /workspace/trading-app/screenshots/*.png at a phone viewport (390x844). Fix any runtime errors seen in console.
>
> Report back: public app URL, APK URL (or why not), source zip URL, whether tunnel is temporary (note it lives only while my computer runs), paths of screenshots, test/typecheck results, and any limitations. Be concise.

## 4. Steering update during development (verbatim, relayed from the user)

> User update: they want zero manual steps on their phone. The primary deliverable is ONE https link they tap (delivered as a chat message) that opens the app directly in the phone browser and works immediately as a PWA (no QR, no Expo Go). Make sure the hosted root URL loads the app fast on mobile Safari/Chrome, is HTTPS, has a proper manifest/apple-touch-icon/theme so it can be added to the home screen, and works without any login. Keep the APK as a secondary link (Android will still require the user to confirm install / allow unknown sources; iOS cannot sideload an IPA without signing). Verify the public URL with curl and a headless mobile-viewport render. Report the single primary link clearly.

## 5. Sub-prompts and iteration notes (the agent's own working steps)

1. **Scaffold**: `create-expo-app --template blank-typescript` (Expo SDK 58, RN 0.88), then add react-native-web, react-native-svg, AsyncStorage, and React Navigation (bottom tabs + native stack).
2. **Data layer**: "Define a `MarketDataProvider` interface (getQuote/getHistory/subscribe). MockProvider: per-symbol seeded PRNG (FNV-1a hash + mulberry32), log-normal random walk with mild mean reversion, ticks every 1.5s, deterministic history that ends at the live price. LiveProvider: CoinGecko (crypto, no key) + Finnhub /quote (stocks, key). Wrap every call in try/catch and fall back to the shared mock."
3. **Order engine as pure functions** so it can be unit tested: validate → place (market fills now, marketable limits fill at the better price, others rest) → `processOpenOrders` on every tick. Cash and shares held for open orders are reserved so they can't be spent twice.
4. **Chart**: a custom SVG line/area chart that uses the RN responder system for scrubbing, so it behaves the same on web and native.
5. **Hosting iteration**:
   - Tried a cloudflared quick tunnel. QUIC to port 7844 timed out and HTTP/2 to 7844 was blocked (returned 530), so it was dropped.
   - Tried SSH tunnels (localhost.run on port 22, pinggy on port 443). The egress proxy closed both connections.
   - Tried tunnelmole. Its control port 8083 was blocked.
   - Found that outbound TLS on port 443 works, which is what Expo's ngrok tunnel uses (`expo start --tunnel ngrok`, no login). The app is served through it with `--no-dev --minify` (a production, gzipped bundle). A Metro `enhanceMiddleware` in `metro.config.js` also serves `/trading-app.apk` and `/trading-app-source.zip` from `downloads/`. `scripts/host.sh` restarts the tunnel in a loop, and `.expo/settings.json` keeps the subdomain stable.
6. **PWA**: `public/index.html` template with manifest, apple-touch-icon, theme-color, iOS standalone meta tags, a boot splash, and a network-first service worker.
7. **Verification**: Playwright run in Chromium at an iPhone 390×844 viewport against the public URL. It checks live ticking, search/add, chart scrubbing, market buy, insufficient-cash validation, resting limit order, persistence after reload, manifest, and service-worker registration, and saves screenshots to `screenshots/`. The console showed no errors.
8. **Fix from screenshots**: while scrubbing, the chart line color flipped to the scrubbed point's change. It now uses the timeframe's overall direction, and only the label uses the scrubbed change.
9. **Android**: Temurin JDK 17 + Android cmdline-tools (platform 36, build-tools 36). Ran `expo prebuild -p android`, then `./gradlew assembleRelease` for arm64-v8a only, to save time and memory. The build is signed with the debug key.

## 6. GitHub Pages permanent publish (2026-11-05)

User approved publishing to a public GitHub Pages repo under `lyonkg`. Steps used:
1. Confirmed `gh` authenticated as `lyonkg` with `repo` + `workflow` scopes.
2. Set `expo.experiments.baseUrl` to `/pockettrader` so the web export prefixes asset URLs for project Pages.
3. Updated `scripts/pwa-postexport.js` to rewrite manifest/SW/icon paths with the same base (without double-prefixing Expo's already-prefixed script tag), write `.nojekyll` and `404.html`.
4. Created public repo `lyonkg/pockettrader`, pushed full source (excluding node_modules, android build outputs, downloads secrets).
5. Pushed `dist/` to `gh-pages` branch and enabled Pages via the GitHub API.
6. Created Release `v1.0.0` with APK + source zip.
7. Primary URLs in README point at GitHub; deed.page/catbox listed as older mirrors.

## 7. Real market data hardening + audit + v1.1.0 (2026-11-17)

User request (verbatim):

> Ajoute le support des vraies données de marché à PocketTrader. Par défaut, garde les données fictives/mock comme mode principal, mais implémente un commutateur facile (déjà présent dans les réglages) pour basculer vers de vraies données via CoinGecko (crypto) et Finnhub (actions). Gère le rate limiting, le fallback gracieux vers les données mock si l'API échoue ou si aucune clé n'est configurée, et affiche un indicateur clair dans l'UI quand on est en mode données réelles. Ajoute les instructions de configuration des clés API dans le README. Lance les tests et itère jusqu'à ce que tout fonctionne.

Follow-up (audit, then publish with approval): targeted audit of bugs, security (client-side API keys, injection, AsyncStorage), rate limiting, mock/real inconsistencies; fix critical then major issues; optional backend proxy; publish v1.1.0. A later request asked for a Mac app build after v1.1.0.
