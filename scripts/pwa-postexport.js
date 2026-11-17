// Injects PWA / iOS home-screen tags into dist/ and rewrites absolute paths for GitHub Pages.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const base = (app.expo?.experiments?.baseUrl || '').replace(/\/+$/, ''); // e.g. '/pockettrader' or ''

function withBase(p) {
  if (!p.startsWith('/')) return p;
  if (base && (p === base || p.startsWith(base + '/'))) return p; // already prefixed (e.g. by Expo)
  return base + p;
}

const indexFile = path.join(dist, 'index.html');
let html = fs.readFileSync(indexFile, 'utf8');

const tags = `
    <link rel="manifest" href="${withBase('/manifest.json')}" />
    <meta name="theme-color" content="#0B0F14" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="PocketTrader" />
    <meta name="application-name" content="PocketTrader" />
    <meta name="description" content="Paper-trading app for stocks and crypto." />
    <link rel="apple-touch-icon" href="${withBase('/apple-touch-icon.png')}" />
    <link rel="icon" type="image/png" sizes="32x32" href="${withBase('/favicon-32.png')}" />
    <base href="${base || '/'}${base ? '/' : ''}" />
    <style>html,body{background:#0B0F14;overscroll-behavior:none}</style>
    <script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('${withBase('/sw.js')}').catch(function(){})})}</script>
`;

if (!html.includes('rel="manifest"')) {
  html = html.replace('</head>', `${tags}</head>`);
} else {
  html = html.replace(/(href|src)="(\/[^"]*)"/g, (_, a, p) => `${a}="${withBase(p)}"`);
  html = html.replace(/navigator\.serviceWorker\.register\('(\/[^']*)'\)/g, (_, p) => `navigator.serviceWorker.register('${withBase(p)}')`);
  if (!html.includes('<base ')) {
    html = html.replace('</head>', `    <base href="${base || '/'}${base ? '/' : ''}" />\n</head>`);
  }
}
html = html.replace(/<title>[^<]*<\/title>/, '<title>PocketTrader</title>');
html = html.replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />');
fs.writeFileSync(indexFile, html);
fs.copyFileSync(indexFile, path.join(dist, '404.html'));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');

const mfPath = path.join(dist, 'manifest.json');
if (fs.existsSync(mfPath)) {
  const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
  mf.id = withBase('/') || '/';
  mf.start_url = withBase('/') || '/';
  mf.scope = withBase('/') || '/';
  if (Array.isArray(mf.icons)) {
    mf.icons = mf.icons.map((i) => {
      const src = i.src.startsWith('/') ? i.src : '/' + i.src;
      return { ...i, src: withBase(src) };
    });
  }
  fs.writeFileSync(mfPath, JSON.stringify(mf, null, 2));
}

const swPath = path.join(dist, 'sw.js');
if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  const shell = withBase('/') || '/';
  const assets = [shell, withBase('/manifest.json'), withBase('/icon-192.png')];
  sw = sw.replace(/caches\.open\(CACHE\)\.then\(\(c\) => c\.addAll\(\[[^\]]*\]\)\)/,
    `caches.open(CACHE).then((c) => c.addAll(${JSON.stringify(assets)}))`);
  sw = sw.replace(/c\.put\(req\.mode === 'navigate' \? '[^']*' : req, copy\)/g,
    `c.put(req.mode === 'navigate' ? '${shell}' : req, copy)`);
  sw = sw.replace(/c\.put\(req\.mode === 'navigate' \? '\/' : req, copy\)/g,
    `c.put(req.mode === 'navigate' ? '${shell}' : req, copy)`);
  sw = sw.replace(/caches\.match\(req\.mode === 'navigate' \? '[^']*' : req\)/g,
    `caches.match(req.mode === 'navigate' ? '${shell}' : req)`);
  sw = sw.replace(/caches\.match\(req\.mode === 'navigate' \? '\/' : req\)/g,
    `caches.match(req.mode === 'navigate' ? '${shell}' : req)`);
  const ver = String(app.expo?.version || 'dev').replace(/\W+/g, '-');
  sw = sw.replace(/pockettrader-[a-z0-9-]*/, `pockettrader-gh-${(base || 'root').replace(/\W+/g, '')}-${ver}`);
  fs.writeFileSync(swPath, sw);
}

console.log('PWA post-export done. baseUrl=', base || '(root)');
