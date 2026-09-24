#!/usr/bin/env node
/*
 * Prompts for the word photos (ElevenLabs image generation, gpt-image-2,
 * 2048x2048). Each picture word gets one 2x2 sheet of four separate photos:
 * three similar ones (the "narrow" pictures a new word starts with) and a
 * fourth that looks clearly different (a "wide" picture for checking the
 * word carries over). Everyday words are laid out four to a sheet.
 * tools/photos/crop.py cuts the sheets into img/photos/<id>-<n>.jpg.
 *   node tools/photos/prompts.js      print { sheet: { prompt, cells: [ids] } } as JSON
 */
'use strict';

const SHEET = 'A square photo sheet for a toddler\'s picture-word cards: four separate square photographs in a 2x2 grid, ' +
  'with thin pure-white gutters of equal width between them. Every photograph is a realistic, natural color photo ' +
  '(not a drawing, not 3D) of one clearly visible subject, centered and filling about 70% of its square, on a plain ' +
  'pure-white seamless studio background with soft, even daylight. No text, no labels, no borders, no logos, no ' +
  'watermarks and no other objects.';

// similar: the three similar photos (top-left, top-right, bottom-left); different: bottom-right.
const WORDS = {
  mommy: ['three photos of the same smiling young mother with shoulder-length brown hair and a teal sweater: waving, smiling at the camera, and laughing, from the waist up', 'a different smiling mother with curly black hair and a yellow top, from the waist up'],
  daddy: ['three photos of the same smiling young father with short brown hair and a navy t-shirt: waving, smiling at the camera, and laughing, from the waist up', 'a different smiling father with a beard and a red plaid shirt, from the waist up'],
  baby: ['three photos of the same happy baby, about 9 months old, in a white onesie: sitting, smiling, and crawling', 'a different happy baby in a yellow onesie, lying on its tummy'],
  dog: ['three friendly golden retriever dogs: standing side-on, sitting and facing the camera, and lying down', 'a small black-and-white Boston terrier, standing'],
  cat: ['three orange tabby cats: sitting and facing the camera, standing side-on, and lying down', 'a fluffy white cat, sitting'],
  cow: ['three black-and-white dairy cows, whole animal, standing side-on in slightly different poses', 'a brown cow, whole animal, standing'],
  duck: ['three yellow ducklings in slightly different poses', 'a grown mallard duck with a green head, standing'],
  pig: ['three pink pigs, whole animal, in slightly different poses', 'a small black-and-pink spotted pig, standing'],
  bird: ['three small blue birds (bluebirds), perched and in slightly different poses', 'a red cardinal bird, perched'],
  fish: ['three bright orange goldfish, side-on, swimming in slightly different poses', 'a blue and yellow tropical fish, side-on'],
  milk: ['three clear glasses of white milk, slightly different glasses', 'a small carton of milk'],
  water: ['three clear glasses of plain water, slightly different glasses', 'a clear water bottle full of water'],
  juice: ['three clear glasses of orange juice, slightly different glasses', 'a small juice box with a straw'],
  cookie: ['three round chocolate chip cookies, slightly different', 'a round sandwich cookie with white cream filling'],
  apple: ['three shiny red apples with a stem, slightly different angles', 'a green apple'],
  banana: ['three single yellow bananas, slightly different angles', 'a half-peeled banana'],
  cup: ['three plain red plastic cups, slightly different angles', 'a toddler sippy cup with handles'],
  ball: ['three red rubber play balls, slightly different angles', 'a black-and-white soccer ball'],
  book: ['three closed colorful children\'s board books, standing slightly angled, with plain covers and no text', 'an open picture book lying flat, with plain colored pages and no text'],
  car: ['three small red toy cars, side-on and slightly angled', 'a real blue family car, side-on'],
  bubbles: ['three sets of floating soap bubbles, clear and shiny with rainbow reflections', 'one big soap bubble'],
  teddy: ['three brown teddy bears, sitting, slightly different angles', 'a white teddy bear, sitting'],
  shoes: ['three pairs of small children\'s blue sneakers, slightly different angles', 'a pair of small red rain boots'],
  hat: ['three small children\'s red knit winter hats, slightly different angles', 'a straw sun hat'],
  socks: ['three pairs of small children\'s striped socks laid flat, slightly different colors', 'a pair of plain white socks laid flat'],
  bath: ['three white bathtubs filled with water and bubbles, slightly different angles', 'a small baby bathtub with water and a rubber duck'],
  bed: ['three small children\'s beds with blue blankets and a pillow, slightly different angles', 'a white baby crib'],
  sun: ['three photos of the bright yellow sun in a clear blue sky (for this word only, the background is a blue sky instead of white)', 'a big orange sun setting over the sea (for this word only, the background is the sky)'],
  moon: ['three photos of a bright full moon in a dark night sky (for this word only, the background is the night sky instead of white)', 'a thin crescent moon in a dark night sky'],
  nose: ['three close-up photos of the same toddler\'s nose, the face cropped from the eyes down to the lips, the nose in the center', 'a close-up of a grown-up\'s nose, the face cropped from the eyes down to the lips'],
  eyes: ['three close-up photos of the same toddler\'s two open eyes, the face cropped from the eyebrows to the nose', 'a close-up of a grown-up\'s two open eyes, cropped the same way'],
  feet: ['three photos of a toddler\'s two bare feet, seen from above, slightly different angles', 'a grown-up\'s two bare feet, seen from above'],
  mouth: ['three close-up photos of the same toddler\'s smiling mouth, the face cropped from the nose to the chin', 'a close-up of a grown-up\'s smiling mouth, cropped the same way'],
  ears: ['three close-up photos of the side of the same toddler\'s head showing one ear clearly, slightly different angles', 'a close-up of a grown-up\'s ear, cropped the same way']
};

// Everyday words: one photo each, four to a sheet (top-left, top-right, bottom-left, bottom-right).
const EVERYDAY = [
  ['hi', 'a smiling toddler waving hello with one hand raised', 'bye-bye', 'a toddler waving goodbye at an open front door',
    'more', 'a small white plate with three chocolate chip cookies', 'all-done', 'an empty white bowl with a spoon in it'],
  ['help', 'a grown-up\'s hand helping a toddler\'s hand open a jar', 'yes', 'a smiling toddler giving a big thumbs up',
    'no', 'a serious-looking toddler holding up one hand, palm out, to say no', 'uh-oh', 'a sippy cup tipped over, with a little spilled milk'],
  ['up', 'a red balloon floating upward with its string hanging down', 'down', 'a toddler going down a yellow slide',
    'go', 'a toddler running forward on grass', 'stop', 'a red octagon stop sign on a pole with the word STOP on it (the only lettering allowed on the whole sheet)'],
  ['open', 'a gift box with its lid open', 'eat', 'a toddler eating with a spoon from a bowl',
    'sleep', 'a toddler sleeping peacefully under a blanket, eyes closed', null, 'a single yellow star-shaped cookie']
];

function sheets() {
  const out = {};
  Object.keys(WORDS).forEach((id) => {
    const [similar, different] = WORDS[id];
    out[id] = {
      prompt: `${SHEET} Top-left, top-right and bottom-left: ${similar}. Bottom-right: ${different}.`,
      cells: [1, 2, 3, 4].map((n) => `${id}-${n}`)
    };
  });
  EVERYDAY.forEach((s, i) => {
    const pos = ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right'];
    const parts = [];
    const cells = [];
    for (let k = 0; k < 4; k++) {
      parts.push(`${pos[k]}: ${s[k * 2 + 1]}.`);
      cells.push(s[k * 2]);
    }
    out['_everyday' + (i + 1)] = { prompt: `${SHEET} ${parts.join(' ')}`, cells };
  });
  return out;
}

module.exports = { sheets, WORDS, EVERYDAY };
if (require.main === module) process.stdout.write(JSON.stringify(sheets(), null, 2));
