#!/usr/bin/env node
/*
 * Plays through the whole app in a phone-sized browser, checks the research
 * rules end to end, and saves screenshots.
 *   NODE_PATH=$(npm root -g) node tools/e2e.js [outDir]
 * The real voice clips play, so it takes a few minutes. Fails on any page
 * error, a missing clip, any use of the computer voice, or a broken rule.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'screenshots'));
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg' };

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

// No computer voice allowed: flag any use of it. Printing is stubbed.
const STUBS = () => {
  window.__tts = 0;
  if (window.speechSynthesis) window.speechSynthesis.speak = () => { window.__tts += 1; };
  window.print = () => {};
};

async function run() {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const clips = new Set();
  let shots = 0;

  async function phone(device, name, extra) {
    const ctx = await browser.newContext({ ...devices[device], ...(extra || {}) });
    await ctx.addInitScript(STUBS);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
    page.on('response', (r) => {
      const m = r.url().match(/\/audio\/([a-z0-9-]+)\.mp3/);
      if (!m) return;
      clips.add(m[1]);
      if (r.status() !== 200) errors.push(`[${name}] clip ${m[1]} returned ${r.status()}`);
    });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`); });
    return { ctx, page };
  }
  async function shot(page, file) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, file) });
    shots += 1;
  }
  async function ttsCheck(page) {
    if (await page.evaluate(() => window.__tts)) errors.push('the computer voice was used');
  }
  const tap = (page, sel) => page.click(sel, { force: true });
  const round = (page) => page.evaluate(() => {
    const s = window.WB_APP.session();
    if (!s || !s.plan[s.idx]) return null;
    const r = s.plan[s.idx];
    const w = window.WB_DATA.byId[r.id];
    return { type: r.type, check: r.check, id: r.id, idx: s.idx, label: w.word };
  });
  const waitNext = (page, idx) => page.waitForFunction((i) => {
    const s = window.WB_APP.session();
    return !s || s.idx > i;
  }, idx, { timeout: 30000 });

  // Every picture in a round is a real photo; count the grown-up's own photos.
  async function checkStyles(page) {
    const r = await page.evaluate(() => {
      const all = document.querySelectorAll('.choices .choice').length;
      const photos = document.querySelectorAll('.choices .choice .pic.photo').length;
      const own = [...document.querySelectorAll('.choices .choice img')].filter((i) => i.src.startsWith('blob:')).length;
      return { all, photos, own };
    });
    if (r.photos !== r.all) errors.push(`a round had a picture that isn't a photo (${r.photos}/${r.all})`);
    return r;
  }

  async function playRound(page, how) {
    const info = await round(page);
    if (!info) return null;
    if (info.type === 'learn') {
      await page.waitForSelector('.big-card.tap-me', { timeout: 10000 });
      await tap(page, '.big-card');
    } else {
      await page.waitForSelector('.choices[data-ready="1"]', { timeout: 10000 });
      await checkStyles(page);
      const target = `.choice[aria-label="${info.label}"]`;
      if (how === 'wrong') {
        await tap(page, `.choice:not([aria-label="${info.label}"])`);
        await page.waitForSelector('.choices.reshow[data-ready="1"]', { timeout: 10000 });
        await shot(page, '06-correction.png');
      } else if (how === 'wait') {
        await page.waitForSelector('.choice.hint', { timeout: 25000 });
        await shot(page, '05-hint.png');
      }
      await tap(page, target);
    }
    await waitNext(page, info.idx);
    return info;
  }

  const totals = (page) => page.evaluate(() => {
    const words = window.WB_APP.state().words;
    const t = { trials: 0, correct: 0, errors: 0, prompted: 0, corrections: 0 };
    Object.values(words).forEach((w) => Object.keys(t).forEach((k) => { t[k] += w[k]; }));
    return t;
  });

  // ---------- iPhone 13: first run and a full session ----------
  {
    const { ctx, page } = await phone('iPhone 13', 'iphone13');
    await page.goto(base);
    await page.waitForSelector('.welcome .pick');
    if (await page.$('.welcome input')) errors.push('there should be no name screen');
    await shot(page, '01-welcome.png');
    for (const w of ['ball', 'dog', 'milk']) await tap(page, `.pick[aria-label="${w}"]`);
    await shot(page, '02-pick-words.png');
    await tap(page, '.welcome .btn.green');
    await page.waitForSelector('.play-btn');
    if (!(await page.$('.home .mascot img'))) errors.push('the wizard is missing');
    const logo = await page.getAttribute('.logo', 'aria-label');
    if (logo !== 'Word Wizard') errors.push(`logo says ${logo}`);
    await shot(page, '03-home.png');

    await tap(page, '.play-btn');
    await page.waitForSelector('.coplay');
    await shot(page, '04-coplay.png');
    await tap(page, '.coplay .btn.green');

    const seen = {};
    let wrongDone = false;
    let waitDone = false;
    let earlyChecked = false;
    let finds = 0;
    for (let i = 0; i < 40; i++) {
      const info = await round(page);
      if (!info) break;
      if (info.type === 'find' && !earlyChecked) {
        // Research: taps before the word is said don't count.
        earlyChecked = true;
        await page.waitForSelector('.choices .choice');
        const before = await totals(page);
        await tap(page, `.choice[aria-label="${info.label}"]`);
        await page.waitForTimeout(80);
        const after = await totals(page);
        const idx = (await round(page)).idx;
        if (after.trials !== before.trials || idx !== info.idx) errors.push('a tap before the prompt finished was counted');
      }
      if (!seen[info.type]) {
        seen[info.type] = true;
        if (info.type === 'learn') await page.waitForSelector('.big-card.tap-me', { timeout: 10000 });
        else await page.waitForSelector('.choices[data-ready="1"]', { timeout: 10000 });
        await shot(page, `05-round-${info.type}.png`);
      }
      let how = null;
      if (info.type === 'find' && info.check !== 'bonus') {
        finds += 1;
        if (!wrongDone) { how = 'wrong'; wrongDone = true; } else if (!waitDone) { how = 'wait'; waitDone = true; }
      }
      await playRound(page, how);
    }
    const t = await totals(page);
    if (t.trials !== finds) errors.push(`expected ${finds} find trials recorded, got ${t.trials}`);
    if (t.errors !== 1) errors.push(`expected 1 wrong first tap, got ${t.errors}`);
    if (t.prompted !== 1) errors.push(`expected 1 hinted trial, got ${t.prompted}`);
    if (t.corrections !== 1) errors.push(`expected 1 do-over found, got ${t.corrections}`);
    if (t.correct !== finds - 2) errors.push(`expected ${finds - 2} correct, got ${t.correct}`);

    await page.waitForSelector('.gift');
    await shot(page, '07-reward.png');
    await tap(page, '.gift >> nth=1');
    await page.waitForSelector('.carry');
    await shot(page, '08-carryover.png');
    await tap(page, '.carry .btn.purple');
    await page.waitForSelector('.real-note');
    await shot(page, '09-real-things.png');
    await tap(page, '.topbar .icon-btn');

    await page.waitForSelector('.mode-btn');
    await tap(page, '.mode-btn >> nth=0');
    await page.waitForSelector('.tile');
    await tap(page, '.chip >> nth=8');
    await shot(page, '10-words-everyday.png');
    await tap(page, '.tile >> nth=0');
    await page.waitForSelector('.overlay .big-card');
    await tap(page, '.overlay .icon-btn');
    await tap(page, '.topbar .icon-btn');

    // Grown-ups: press and hold the gear
    await page.waitForSelector('.hold-btn');
    const box = await (await page.$('.hold-btn')).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1900);
    await page.mouse.up();
    await page.waitForSelector('.parent');
    await shot(page, '11-parent-progress.png');
    await tap(page, '.p-card .btn.white'); // print (stubbed)
    await tap(page, '.tab >> nth=1');
    await shot(page, '12-parent-words.png');
    await tap(page, '.edit-btn >> nth=0');
    await page.waitForSelector('.sheet');
    await page.waitForTimeout(400);
    if (await page.$('.sheet input[type=text], .sheet .rec-line')) errors.push('renaming and voice recording should be gone');
    await page.fill('.sheet textarea', 'Looked at me when I said "Mommy".');
    await shot(page, '13-customize.png');
    await tap(page, '.sheet-top .btn.purple');
    await tap(page, '.tab >> nth=2');
    await shot(page, '14-parent-settings.png');
    await tap(page, '.tab >> nth=3');
    await shot(page, '15-parent-help.png');
    const csv = await page.evaluate(() => window.WB_PROGRESS.reportCSV(window.WB_APP.state(), window.WB_DATA.PICTURE_WORDS, window.WB_DATA.catById, (w) => ({ label: w.word })));
    if (!/Correct \(no hint\)/.test(csv)) errors.push('report is missing the no-hint column');
    await tap(page, '.parent-head .btn');
    await page.waitForSelector('.play-btn');

    const st = await page.evaluate(() => window.WB_APP.state());
    if (!/Mommy/.test(st.custom.mommy.notes || '')) errors.push('notes not saved');
    if (!Object.keys(st.stickers).length) errors.push('no sticker saved');
    if (st.sessionCount !== 1) errors.push(`expected 1 finished session, got ${st.sessionCount}`);

    // Landscape
    await page.setViewportSize({ width: 844, height: 390 });
    await tap(page, '.play-btn');
    await page.waitForSelector('.coplay');
    await tap(page, '.coplay .btn.green');
    await page.waitForFunction(() => document.querySelector('.choices[data-ready="1"], .big-card.tap-me'), null, { timeout: 10000 });
    await shot(page, '16-landscape.png');
    await ttsCheck(page);
    await ctx.close();
  }

  // ---------- small iPhone SE ----------
  {
    const { ctx, page } = await phone('iPhone SE', 'iphoneSE');
    await page.goto(base);
    await page.waitForSelector('.pick');
    await shot(page, '20-se-pick.png');
    await tap(page, '.welcome .btn.green');
    await page.waitForSelector('.play-btn');
    await shot(page, '21-se-home.png');
    await tap(page, '.play-btn');
    await page.waitForSelector('.coplay');
    await shot(page, '22-se-coplay.png');
    await tap(page, '.coplay .btn.green');
    for (let i = 0; i < 6; i++) {
      const info = await round(page);
      if (info && info.type === 'find') {
        await page.waitForSelector('.choices[data-ready="1"]');
        await shot(page, '23-se-find.png');
        break;
      }
      await playRound(page);
    }
    await ttsCheck(page);
    await ctx.close();
  }

  // ---------- grown-up photos ----------
  {
    const { ctx, page } = await phone('iPhone 13', 'photos');
    await page.goto(base);
    await page.waitForSelector('.pick');
    for (const w of ['ball', 'dog', 'milk', 'car']) await tap(page, `.pick[aria-label="${w}"]`);
    await tap(page, '.welcome .btn.green');
    await page.waitForSelector('.play-btn');

    // Photos for a few words, including Mommy (replaces the stock photos) and Anthony.
    const photoFiles = ['unicorn', 'rocket', 'panda', 'kite'].map((f) => path.join(ROOT, `img/stickers/${f}.png`));
    const photoWords = ['ball', 'dog', 'Mommy', 'Anthony'];
    await page.evaluate(() => window.WB_APP.go('parent', 'words'));
    for (let i = 0; i < photoWords.length; i++) {
      await page.evaluate((label) => {
        const rows = [...document.querySelectorAll('.word-row')];
        const row = rows.find((r) => r.querySelector('b') && r.querySelector('b').textContent === label);
        row.querySelector('.edit-btn').click();
      }, photoWords[i]);
      await page.waitForSelector('.sheet');
      await page.waitForTimeout(400);
      await page.setInputFiles('.sheet input[type=file]', photoFiles[i]);
      await page.waitForSelector('.sheet .photo-cell', { timeout: 10000 });
      if (i === 2) await shot(page, '30-customize-photo.png');
      await tap(page, '.sheet-top .btn.purple');
      await page.waitForSelector('.sheet', { state: 'detached' });
    }
    const custom = await page.evaluate(() => window.WB_APP.state().custom);
    if (['ball', 'dog', 'mommy', 'me'].some((id) => !(custom[id] && custom[id].photos && custom[id].photos.length))) errors.push('photos not saved');
    await page.waitForTimeout(500);
    const rows = await page.evaluate(() => {
      const find = (label) => [...document.querySelectorAll('.word-row')].find((r) => r.querySelector('b') && r.querySelector('b').textContent === label);
      return {
        mommy: find('Mommy').querySelector('.thumb img').src,
        meStart: !!find('Anthony').querySelector('.pill-btn')
      };
    });
    if (!rows.mommy.startsWith('blob:')) errors.push('Mommy should show the grown-up\'s photo');
    if (!rows.meStart) errors.push('Anthony should be playable once there is a photo of him');
    await shot(page, '31-words-with-photos.png');
    await tap(page, '.parent-head .btn');

    // Play: every picture is a photo, and the grown-up's photos show up.
    await page.waitForSelector('.play-btn');
    await tap(page, '.play-btn');
    await page.waitForSelector('.coplay');
    await tap(page, '.coplay .btn.green');
    let ownRounds = 0;
    for (let i = 0; i < 40; i++) {
      const info = await round(page);
      if (!info) break;
      if (info.type === 'find') {
        await page.waitForSelector('.choices[data-ready="1"]', { timeout: 10000 });
        await page.waitForTimeout(150);
        const r = await checkStyles(page);
        if (r.own) {
          ownRounds += 1;
          if (ownRounds === 1) await shot(page, '32-own-photo-round.png');
        }
      }
      await playRound(page);
    }
    console.log(`rounds with the grown-up's photos: ${ownRounds}`);
    await ttsCheck(page);
    await ctx.close();
  }

  // The voice: real clips were played, and never the computer voice.
  ['common-did-it-name', 'common-present', 'ball-where', 'ball-thats', 'common-look'].forEach((c) => {
    if (!clips.has(c)) errors.push(`clip ${c} was never played`);
  });
  if (![...clips].some((c) => /^common-(yes|found|yay)/.test(c))) errors.push('no praise clip was played');
  console.log(`${clips.size} different voice clips played`);

  await browser.close();
  srv.close();
  console.log(`${shots} screenshots in ${OUT}`);
  if (errors.length) {
    console.error('ERRORS:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('No page errors; research rules held.');
}

run().catch((e) => { console.error(e); process.exit(1); });
