#!/usr/bin/env node
/*
 * Plays through the whole app in a phone-sized browser and saves screenshots.
 *   NODE_PATH=$(npm root -g) node tools/e2e.js [outDir]
 * Speech is stubbed so it runs fast; fails on any page error.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'screenshots'));
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const STUB_SPEECH = () => {
  const fake = {
    speaking: false,
    getVoices: () => [{ name: 'Samantha', lang: 'en-US', voiceURI: 'samantha', localService: true }],
    speak(u) { setTimeout(() => { u.onstart && u.onstart(); }, 5); setTimeout(() => { u.onend && u.onend(); }, 60); },
    cancel() {},
    addEventListener() {},
    removeEventListener() {}
  };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
};

async function run() {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const errors = [];
  let shots = 0;

  async function phone(device, name) {
    const ctx = await browser.newContext({ ...devices[device] });
    await ctx.addInitScript(STUB_SPEECH);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`); });
    return { ctx, page };
  }
  async function shot(page, file) {
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, file) });
    shots += 1;
  }

  // Plays one round of whatever type it is. Returns the round type.
  async function playRound(page, answer) {
    const info = await page.evaluate(() => {
      const s = window.WB_APP.session();
      if (!s) return null;
      const r = s.plan[s.idx];
      const st = window.WB_APP.state();
      const c = st.custom[r.id];
      return { type: r.type, id: r.id, idx: s.idx, label: (c && c.label) || window.WB_DATA.byId[r.id].word };
    });
    if (!info) return null;
    if (info.type === 'learn') {
      // The card glows once the word has been named; tapping it is the child's answer.
      await page.waitForSelector('.big-card.tap-me', { timeout: 10000 });
      await page.click('.big-card', { force: true });
    } else {
      await page.waitForSelector('.choice');
      if (answer === 'wrong') {
        const wrong = await page.$(`.choice:not([aria-label="${info.label}"])`);
        await wrong.click({ force: true });
        await page.waitForTimeout(400);
      }
      await page.click(`.choice[aria-label="${info.label}"]`, { force: true });
    }
    await page.waitForFunction((idx) => {
      const s = window.WB_APP.session();
      return !s || s.idx > idx;
    }, info.idx, { timeout: 15000 });
    return info.type;
  }

  // ---------- iPhone 13 ----------
  {
    const { ctx, page } = await phone('iPhone 13', 'iphone13');
    await page.goto(base);
    await shot(page, '01-welcome.png');
    await page.fill('.welcome input', 'Sam');
    await page.click('.welcome .btn.green', { force: true });
    await page.waitForSelector('.play-btn');
    await shot(page, '02-home.png');

    await page.click('.play-btn', { force: true });
    const seen = {};
    for (let i = 0; i < 30; i++) {
      const t = await page.evaluate(() => { const s = window.WB_APP.session(); return s && s.plan[s.idx].type; });
      if (!t) break;
      if (!seen[t]) {
        seen[t] = true;
        await page.waitForTimeout(600);
        await shot(page, `03-round-${t}.png`);
        if (t === 'learn') {
          await page.waitForSelector('.big-card.tap-me', { timeout: 10000 });
          await shot(page, '03-round-learn-tap.png');
        }
      }
      if (t === 'find' && !seen.findWrong) {
        seen.findWrong = true;
        await page.waitForSelector('.choice');
        const info = await page.evaluate(() => {
          const s = window.WB_APP.session();
          return window.WB_DATA.byId[s.plan[s.idx].id].word;
        });
        const wrongs = await page.$$(`.choice:not([aria-label="${info}"])`);
        await wrongs[0].click({ force: true });
        await page.waitForTimeout(300);
        if (wrongs[1]) await wrongs[1].click({ force: true }); else await wrongs[0].click({ force: true });
        await shot(page, '03-round-find-hint.png');
      }
      await playRound(page);
    }
    await page.waitForSelector('.gift');
    await shot(page, '04-reward.png');
    await page.click('.gift >> nth=1', { force: true });
    await page.waitForSelector('.prize img');
    await shot(page, '05-prize.png');

    // A Pop session (bubbles), with one wrong tap
    await page.click('.reward-actions .btn.white', { force: true });
    await page.waitForSelector('.mode-btn');
    await page.click('.mode-btn >> nth=2', { force: true });
    await page.waitForSelector('.choices.bubbles .choice');
    await shot(page, '03-round-pop.png');
    await playRound(page, 'wrong');
    for (let i = 0; i < 30; i++) {
      const more = await page.evaluate(() => !!window.WB_APP.session());
      if (!more) break;
      await playRound(page);
    }
    await page.waitForSelector('.gift');
    await page.click('.gift >> nth=0', { force: true });
    await page.waitForSelector('.reward-actions .btn.pink');
    await page.click('.reward-actions .btn.pink', { force: true });
    await page.waitForSelector('.sticker');
    await shot(page, '06-stickers.png');

    await page.click('.topbar .icon-btn', { force: true });
    await page.waitForSelector('.mode-btn');
    await page.click('.mode-btn >> nth=0', { force: true });
    await page.waitForSelector('.tile');
    await shot(page, '07-words.png');
    await page.click('.chip >> nth=4', { force: true });
    await page.click('.tile >> nth=0', { force: true });
    await page.waitForSelector('.overlay .big-card');
    await shot(page, '08-viewer.png');
    await page.click('.overlay .icon-btn', { force: true });
    await page.click('.topbar .icon-btn', { force: true });

    // Grown-ups: press and hold the gear
    await page.waitForSelector('.hold-btn');
    const box = await (await page.$('.hold-btn')).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1900);
    await page.mouse.up();
    await page.waitForSelector('.parent');
    await shot(page, '09-parent-progress.png');
    await page.click('.tab >> nth=1', { force: true });
    await shot(page, '10-parent-words.png');
    await page.click('.edit-btn >> nth=0', { force: true });
    await page.waitForSelector('.sheet');
    await page.fill('.sheet input[type=text]', 'Mama');
    await shot(page, '11-customize.png');
    await page.click('.sheet .btn.purple', { force: true });
    await page.click('.tab >> nth=2', { force: true });
    await shot(page, '12-parent-settings.png');
    await page.click('.tab >> nth=3', { force: true });
    await shot(page, '13-parent-help.png');
    await page.click('.parent-head .btn', { force: true });
    await page.waitForSelector('.play-btn');

    const st = await page.evaluate(() => window.WB_APP.state());
    if (st.custom.mommy.label !== 'Mama') errors.push('custom label not saved');
    if (!Object.keys(st.stickers).length) errors.push('no sticker saved');
    const finds = Object.values(st.words).reduce((n, w) => n + w.findTries, 0);
    const misses = Object.values(st.words).reduce((n, w) => n + (w.findTries - w.findOk), 0);
    if (!finds) errors.push('no Find it rounds were recorded');
    if (misses !== 2) errors.push(`expected exactly the 2 deliberate wrong first taps to count as misses, got ${misses}`);

    // Find-it mode, landscape
    await page.setViewportSize({ width: 844, height: 390 });
    await page.click('.mode-btn >> nth=1', { force: true });
    await page.waitForSelector('.choice');
    await shot(page, '14-landscape-find.png');
    await ctx.close();
  }

  // ---------- small iPhone SE ----------
  {
    const { ctx, page } = await phone('iPhone SE', 'iphoneSE');
    await page.goto(base);
    await page.click('.welcome .btn.green', { force: true });
    await page.waitForSelector('.play-btn');
    await shot(page, '20-se-home.png');
    await page.click('.mode-btn >> nth=1', { force: true });
    await page.waitForSelector('.choice');
    await shot(page, '21-se-find.png');
    await page.click('.topbar .icon-btn', { force: true });
    await page.click('.mode-btn >> nth=2', { force: true });
    await page.waitForSelector('.choices.bubbles');
    await shot(page, '22-se-pop.png');
    await ctx.close();
  }

  // ---------- grown-up voice recording and photo (fake media devices) ----------
  {
    const mb = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const ctx = await mb.newContext({ ...devices['iPhone 13'], permissions: ['microphone'] });
    await ctx.addInitScript(STUB_SPEECH);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[media] ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[media] console: ${m.text()}`); });
    await page.goto(base);
    await page.click('.welcome .btn.green', { force: true });
    await page.waitForSelector('.play-btn');

    // Record a grown-up voice and add a photo for "ball".
    await page.evaluate(() => window.WB_APP.go('parent', 'words'));
    await page.click('.edit-btn >> nth=15', { force: true });
    await page.waitForSelector('.sheet');
    await page.waitForTimeout(500); // let the sheet slide up
    const wordId = await page.evaluate(() => {
      const t = document.querySelector('.sheet h2');
      return t ? t.textContent : null;
    });
    await page.click('.sheet .btn.red', { force: true });
    await page.waitForFunction(() => /Using your recording/.test(document.querySelector('.sheet').textContent), null, { timeout: 10000 });
    await page.setInputFiles('.sheet input[type=file]', path.join(ROOT, 'img/stickers/unicorn.png'));
    await page.waitForFunction(() => /Using your photo/.test(document.querySelector('.sheet').textContent), null, { timeout: 10000 });
    await shot(page, '30-custom-photo-voice.png');
    const custom = await page.evaluate(() => window.WB_APP.state().custom);
    const entry = Object.values(custom).find((c) => c.rec && c.photo);
    if (!entry) errors.push(`recording/photo not saved for ${wordId}: ${JSON.stringify(custom)}`);
    await page.click('.sheet .btn.purple', { force: true });
    await ctx.close();
    await mb.close();
  }

  await browser.close();
  srv.close();
  console.log(`${shots} screenshots in ${OUT}`);
  if (errors.length) {
    console.error('ERRORS:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('No page errors.');
}

run().catch((e) => { console.error(e); process.exit(1); });
