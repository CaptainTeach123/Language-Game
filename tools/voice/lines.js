#!/usr/bin/env node
/*
 * The exact lines spoken by the bundled voice, grouped into ElevenLabs
 * generations: one per picture word (audio/<word>-<key>.mp3), and short
 * groups of up to six shared lines (audio/common-<key>.mp3). Each generation
 * separates lines with <break time="1.5s" /> so tools/voice/split_voice.py
 * can cut them apart. Voice: "Emma - Bright Kids Educator", eleven_multilingual_v2.
 *   node tools/voice/lines.js            print { group: { prompt, lines: [{ key, text }] } } as JSON
 */
'use strict';
const D = require('../../js/words.js');

const BREAK = ' <break time="1.5s" /> ';
const CHILD = 'Anthony';
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Per picture word. Keys match audio/<word>-<key>.mp3.
function wordLines(w) {
  const l = w.personal ? CHILD : w.word;
  const t = w.kind === 'noun' ? 'the ' : '';
  const plural = w.kind === 'plural';
  const phrase = w.phrase.replace(/\{w\}/g, l).replace(/\{W\}/g, cap(l));
  return [
    { key: 'word', text: cap(l) + '!' },
    { key: 'where', text: plural ? `Where are the ${l}?` : `Where's ${t}${l}?` },
    { key: 'find', text: plural ? `Find the ${l}!` : `Find ${t}${l}!` },
    { key: 'here', text: plural ? `Here are the ${l}!` : `Here's ${t}${l}!` },
    { key: 'touch', text: plural ? `Touch the ${l}!` : `Touch ${t}${l}!` },
    { key: 'thats', text: plural ? `Those are the ${l}!` : `That's ${t}${l}!` },
    { key: 'this', text: plural ? `These are the ${l}.` : `This is ${t}${l}.` },
    { key: 'phrase', text: phrase }
  ];
}

// Short, varied, social praise (research: "Yes!", "You found it!"), much of it
// using Anthony's name, plus the few other things the wizard says.
const SHARED = [
  { key: 'yes', text: 'Yes!' },
  { key: 'found', text: 'You found it!' },
  { key: 'yay', text: 'Yay!' },
  { key: 'yes-name', text: `Yes, ${CHILD}!` },
  { key: 'great-name', text: `Great job, ${CHILD}!` },
  { key: 'found-name', text: `You found it, ${CHILD}!` },
  { key: 'way-name', text: `Way to go, ${CHILD}!` },
  { key: 'listener-name', text: `${CHILD}, you're a great listener!` },
  { key: 'high-five-name', text: `High five, ${CHILD}!` },
  { key: 'look', text: 'Hmm, let\'s look.' },
  { key: 'hi-name', text: `Hi, ${CHILD}! Let's play!` },
  { key: 'hello-name', text: `Hello, ${CHILD}! I'm so happy to see you!` },
  { key: 'did-it-name', text: `Yay, ${CHILD}! You did it!` },
  { key: 'present', text: 'Pick a present!' },
  { key: 'more-stickers', text: 'Play to find more stickers!' },
  { key: 'stickers-name', text: `Look at all your stickers, ${CHILD}!` }
];

const CATEGORY_SAID = { home: 'Home and sky!', body: 'My body!', everyday: 'Everyday words!' };

function groups() {
  const out = {};
  D.PICTURE_WORDS.forEach((w) => { out[w.id] = wordLines(w); });
  // Six short lines to a generation: a longer run gets rushed.
  const chunks = (prefix, list) => {
    for (let i = 0; i < list.length; i += 6) out[prefix + (i / 6 + 1)] = list.slice(i, i + 6);
  };
  chunks('_shared', SHARED);
  chunks('_stickers', D.STICKERS.map((s) => ({ key: 'got-' + s.id, text: `You got ${/^[aeio]|^u(?!n[ia])/.test(s.name) ? 'an' : 'a'} ${s.name}!` })));
  // Sticker names on their own, for the sticker book.
  chunks('_names', D.STICKERS.map((s) => ({ key: 'name-' + s.id, text: cap(s.name) + '!' })));
  // Category names for the picture book, and the wizard's own lines.
  out._extras = D.CATEGORIES.map((c) => ({ key: 'cat-' + c.id, text: CATEGORY_SAID[c.id] || cap(c.name) + '!' })).concat([
    { key: 'wizard-name', text: `Hi, ${CHILD}! I'm the Word Wizard!` },
    { key: 'magic-name', text: `Magic listening, ${CHILD}!` }
  ]);
  // Everyday words, five to a generation: a long run of breaks gets squeezed together.
  for (let i = 0; i < D.EVERYDAY_WORDS.length; i += 5) {
    out['_everyday' + (i / 5 + 1)] = [].concat(...D.EVERYDAY_WORDS.slice(i, i + 5).map((w) => [
      { key: w.id + '-word', text: cap(w.word) + '!' },
      { key: w.id + '-phrase', text: w.phrase.replace(/\{w\}/g, w.word).replace(/\{W\}/g, cap(w.word)) }
    ]));
  }
  Object.keys(out).forEach((g) => { out[g] = { prompt: out[g].map((x) => x.text).join(BREAK), lines: out[g] }; });
  return out;
}

module.exports = { groups, wordLines, SHARED, CHILD };
if (require.main === module) process.stdout.write(JSON.stringify(groups(), null, 2));
