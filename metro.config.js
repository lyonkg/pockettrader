// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Serve downloadable artifacts (APK, source zip) from ./downloads when the app is hosted
// through `expo start` (e.g. via the public tunnel). They are intentionally NOT in /public
// so they don't get copied into the web export or the source zip.
const DOWNLOADS = path.join(__dirname, 'downloads');
const TYPES = { '.apk': 'application/vnd.android.package-archive', '.zip': 'application/zip' };

config.server = config.server || {};
const prev = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const base = prev ? prev(middleware, server) : middleware;
  return (req, res, next) => {
    const name = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
    const ext = path.extname(name);
    if (TYPES[ext] && !name.includes('/') && !name.includes('..')) {
      const file = path.join(DOWNLOADS, name);
      if (fs.existsSync(file)) {
        const stat = fs.statSync(file);
        res.writeHead(200, {
          'Content-Type': TYPES[ext],
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${name}"`,
          'Cache-Control': 'no-cache',
        });
        if (req.method === 'HEAD') return res.end();
        return fs.createReadStream(file).pipe(res);
      }
    }
    return base(req, res, next);
  };
};

module.exports = config;
