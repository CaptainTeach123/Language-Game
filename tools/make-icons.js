#!/usr/bin/env node
/*
 * Renders the app icons (Pip the mascot on a sky background) with Playwright.
 *   NODE_PATH=$(npm root -g) node tools/make-icons.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const m = appSrc.match(/var PIP_SVG =([\s\S]*?);\n/);
const PIP_SVG = new Function('return (' + m[1].trim() + ');')();

function page(size, pipScale) {
  return `<!doctype html><html><head><style>.pip-smile{display:none}</style></head><body style="margin:0">
  <div style="width:${size}px;height:${size}px;position:relative;overflow:hidden;
    background:linear-gradient(180deg,#38B6F5 0%,#7FD3FA 55%,#BDEBFF 100%)">
    <svg viewBox="0 0 400 120" preserveAspectRatio="none" style="position:absolute;left:0;bottom:0;width:100%;height:30%">
      <path d="M0 60 Q 90 10 200 50 T 400 45 V120 H0Z" fill="#9BE36D"/>
      <path d="M0 85 Q 110 50 220 85 T 400 78 V120 H0Z" fill="#6CCB4E"/>
    </svg>
    <div style="position:absolute;width:${pipScale * 100}%;height:${pipScale * 105}%;left:${(1 - pipScale) * 50}%;top:${(1 - pipScale * 1.05) * 50 + 3}%">
      ${PIP_SVG.replace('<svg ', '<svg style="width:100%;height:100%" ')}
    </div>
  </div></body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const out = [
    ['icon-180.png', 180, 0.8],
    ['icon-192.png', 192, 0.8],
    ['icon-512.png', 512, 0.8],
    ['icon-maskable-512.png', 512, 0.6]
  ];
  for (const [name, size, scale] of out) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(page(size, scale));
    await p.screenshot({ path: path.join(ROOT, 'img/icons', name), clip: { x: 0, y: 0, width: size, height: size } });
    console.log('wrote', name);
  }
  await browser.close();
})();
