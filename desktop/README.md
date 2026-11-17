# PocketTrader desktop (Electron)

This folder wraps the Expo web export in a small Electron shell so it can run as a native Mac app. The packaged app loads the **local** bundle (`www/`), not the GitHub Pages site.

## Rebuild

From the repo root, export a web build with an empty `baseUrl` (the public Pages site uses `/pockettrader` and must be restored afterwards):

```bash
# 1. Temporarily clear expo.experiments.baseUrl in app.json, then:
npx expo export -p web --output-dir desktop/www
# 2. Restore app.json baseUrl to /pockettrader
# 3. Optional: disable the service-worker registration in desktop/www/index.html
cd desktop
npm install
CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack:mac
# → out/PocketTrader-1.1.0-mac-arm64.zip and -mac-x64.zip
```

The zips are **unsigned**. macOS Gatekeeper will warn; see the Mac section in the root README. A `.dmg` cannot be produced from Linux (`sips` is missing).
