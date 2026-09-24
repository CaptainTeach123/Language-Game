#!/usr/bin/env node
/*
 * Regenerates the offline file list and cache version in sw.js.
 *   node tools/build-sw.js          rewrite sw.js
 *   node tools/build-sw.js --check  exit 1 if sw.js is out of date
 * Run it after adding, removing or changing any app file.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SW = path.join(ROOT, 'sw.js');
const INCLUDE = ['index.html', 'manifest.webmanifest', 'css', 'js', 'fonts', 'img'];
const EXTS = new Set(['.html', '.webmanifest', '.css', '.js', '.woff2', '.png']);

function walk(rel) {
  const abs = path.join(ROOT, rel);
  const st = fs.statSync(abs);
  if (st.isFile()) return EXTS.has(path.extname(rel)) ? [rel] : [];
  return fs.readdirSync(abs).sort().flatMap((name) => walk(path.posix.join(rel, name)));
}

function build() {
  const files = INCLUDE.flatMap(walk);
  const hash = crypto.createHash('sha256');
  files.forEach((f) => { hash.update(f); hash.update(fs.readFileSync(path.join(ROOT, f))); });
  const version = hash.digest('hex').slice(0, 10);
  const list = ['./'].concat(files).map((f) => `  '${f}'`).join(',\n');
  const src = fs.readFileSync(SW, 'utf8');
  return src
    .replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`)
    .replace(/\/\/ ASSETS-START[\s\S]*\/\/ ASSETS-END/, `// ASSETS-START\n${list}\n  // ASSETS-END`);
}

const next = build();
if (process.argv.includes('--check')) {
  if (next !== fs.readFileSync(SW, 'utf8')) {
    console.error('sw.js is out of date. Run: node tools/build-sw.js');
    process.exit(1);
  }
  console.log('sw.js is up to date.');
} else {
  fs.writeFileSync(SW, next);
  console.log('sw.js updated.');
}
