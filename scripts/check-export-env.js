#!/usr/bin/env node
/** Fail a production web export if an EXPO_PUBLIC_*KEY would be inlined into the bundle. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function isSet(v) {
  if (v == null) return false;
  const t = String(v).trim();
  return t.length > 0 && t !== '""' && t !== "''";
}

const hits = [];
for (const [k, v] of Object.entries(process.env)) {
  if (k.startsWith('EXPO_PUBLIC_') && /KEY/i.test(k) && isSet(v)) hits.push(`${k} (environment)`);
}

const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1].startsWith('EXPO_PUBLIC_') && /KEY/i.test(m[1]) && isSet(m[2])) {
      hits.push(`${m[1]} (.env)`);
    }
  }
}

if (hits.length) {
  console.error('\nWARNING: Refusing to export a production web build with API keys in EXPO_PUBLIC_* variables:');
  for (const h of hits) console.error('  -', h);
  console.error('\nThose values would be visible in the public JavaScript bundle.');
  console.error('Enter keys in Settings (stored on-device only) or use the optional proxy (proxy/README.md).\n');
  process.exit(1);
}
console.log('export-env check: no EXPO_PUBLIC_*KEY values set.');
