// Tiny zero-dependency static server for the exported PWA (dist/) plus downloads/.
// Usage: PORT=8080 node scripts/serve.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', 'dist');
const DL = path.resolve(__dirname, '..', 'downloads');
const PORT = Number(process.env.PORT || 8080);
const app = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'app.json'), 'utf8'));
const BASE = String(app.expo?.experiments?.baseUrl || '').replace(/\/+$/, ''); // e.g. '/pockettrader'
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.css': 'text/css',
  '.apk': 'application/vnd.android.package-archive', '.zip': 'application/zip', '.webmanifest': 'application/manifest+json',
};

function resolve(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (BASE && (p === BASE || p.startsWith(BASE + '/'))) p = p.slice(BASE.length) || '/';
  for (const base of [ROOT, DL]) {
    const f = path.join(base, p);
    if (!f.startsWith(base)) continue;
    try { if (fs.statSync(f).isFile()) return f; } catch {}
  }
  return null;
}

http.createServer((req, res) => {
  let file = resolve(req.url);
  if (!file) file = path.join(ROOT, 'index.html'); // SPA fallback
  const ext = path.extname(file);
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' };
  if (file.includes(`${path.sep}_expo${path.sep}`) || file.includes(`${path.sep}assets${path.sep}`)) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  else headers['Cache-Control'] = 'no-cache';
  if (ext === '.apk' || ext === '.zip') headers['Content-Disposition'] = `attachment; filename="${path.basename(file)}"`;
  const stat = fs.statSync(file);
  const gz = /gzip/.test(req.headers['accept-encoding'] || '') && /\.(js|html|json|css|svg)$/.test(ext);
  if (gz) { headers['Content-Encoding'] = 'gzip'; headers['Vary'] = 'Accept-Encoding'; }
  else headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file);
  (gz ? stream.pipe(zlib.createGzip()) : stream).pipe(res);
}).listen(PORT, () => console.log(`Serving ${ROOT} (+ ${DL}) on http://localhost:${PORT}`));
