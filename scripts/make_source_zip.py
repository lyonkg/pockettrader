#!/usr/bin/env python3
"""Zip the project source (no node_modules / build outputs) into downloads/trading-app-source.zip."""
import os, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCLUDE_DIRS = {'node_modules', 'android', 'ios', 'dist', 'downloads', '.expo', '.git', 'web-build', '.gradle'}
EXCLUDE_FILES = {'.env', '.env.local', '.env.production'}
SECRET_SUFFIXES = ('.pem', '.p12', '.p8', '.key', '.mobileprovision', '.jks')
OUT = os.path.join(ROOT, 'downloads', 'trading-app-source.zip')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
count = 0
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = sorted(x for x in dirs if x not in EXCLUDE_DIRS)
        for f in sorted(files):
            p = os.path.join(d, f)
            if f in EXCLUDE_FILES or f.endswith(SECRET_SUFFIXES): continue
            if f.endswith('.json') and 'token' in f.lower(): continue
            z.write(p, os.path.join('trading-app', os.path.relpath(p, ROOT)))
            count += 1
print(f'wrote {OUT} ({count} files, {os.path.getsize(OUT)//1024} KB)')
