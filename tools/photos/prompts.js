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
  mommy: ['three photos of the same smiling young mother with shoulder-length brown hair and a teal sweater: waving, smiling at the camera, and laughing, from the waist up', 'the very same mother on another day, in a grey hoodie with her hair in a ponytail, smiling, from the waist up'],
  daddy: ['three photos of the same smiling young father with short brown hair and a navy t-shirt: waving, smiling at the camera, and laughing, from the waist up', 'the very same father on another day, in a green hoodie and a baseball cap, smiling, from the waist up'],
  baby: ['three clearly different photos of the same happy baby, about 9 months old, in a white onesie: sitting up and smiling at the camera, crawling toward the camera, and lying on its back holding its feet', 'a different happy baby in a yellow onesie, lying on its tummy'],
  dog: ['three friendly golden retriever dogs: standing side-on, sitting and facing the camera, and lying down', 'a small black-and-white Boston terrier, standing'],
  cat: ['three orange tabby cats: sitting and facing the camera, standing side-on, and lying down', 'a fluffy white cat, sitting'],
  cow: ['three black-and-white dairy cows, whole animal, in clearly different poses: standing side-on, head down grazing, and facing the camera', 'a brown cow, whole animal, standing'],
  duck: ['three single yellow ducklings in clearly different poses: standing facing left, standing facing right, and sitting down', 'a grown mallard duck with a green head, standing'],
  pig: ['three pink pigs, whole animal, in slightly different poses', 'a small black-and-pink spotted pig, standing'],
  bird: ['three small blue birds (bluebirds), perched and in slightly different poses', 'a red cardinal bird, perched'],
  fish: ['three single bright orange goldfish in clearly different poses: swimming to the left, swimming to the right, and seen slightly from above', 'a blue and yellow tropical fish, side-on'],
  milk: ['three clear glasses of white milk, slightly different glasses', 'a small carton of milk'],
  water: ['three photos where the water itself is easy to see: a clear glass being filled with water pouring from a jug with a small splash, a full clear glass of water with drops of condensation on a light-grey table, and water pouring from a tap into a glass', 'a clear water bottle full of water'],
  juice: ['three clear glasses of orange juice, slightly different glasses', 'a small juice box with a straw'],
  cookie: ['three round chocolate chip cookies, clearly different: one whole, one with a bite taken out, one broken in half', 'a round sandwich cookie with white cream filling'],
  apple: ['three shiny red apples, clearly different: one whole with a stem, one with a green leaf seen from above, one with a bite taken out of it', 'a green apple'],
  banana: ['three single yellow bananas, slightly different angles', 'a half-peeled banana'],
  cup: ['three small upright toddler cups without lids, each a different color: a green one, a yellow one, and a blue one with two handles', 'a toddler sippy cup with a lid and handles'],
  ball: ['three different play balls: a blue rubber ball, a yellow-and-blue striped beach ball, and a green bouncy ball', 'a black-and-white soccer ball'],
  book: ['three children\'s board books standing slightly open at a three-quarter angle so the thick pages show, each with one big simple picture on the cover (a bear, a duck, a sun) and no letters or words', 'an open picture book lying flat with one large simple animal illustration across its pages and no words'],
  car: ['three small red toy cars, side-on and slightly angled', 'a real blue family car, side-on'],
  bubbles: ['three photos of large shiny rainbow soap bubbles filling most of the square against a clear blue sky (for this word only, the background is a blue sky instead of white)', 'a toddler\'s hand holding a bubble wand with one big soap bubble on it, against a blue sky'],
  teddy: ['three brown teddy bears, sitting, slightly different angles', 'a white teddy bear, sitting'],
  shoes: ['three pairs of small children\'s blue sneakers, slightly different angles', 'a pair of small red rain boots'],
  hat: ['three small children\'s knit winter hats, each a different color: a blue one, a green one, and a striped one with a pompom', 'a straw sun hat'],
  socks: ['three pairs of small children\'s striped socks laid flat, slightly different colors', 'a pair of plain light-blue socks laid flat'],
  bath: ['three white bathtubs filled with water and bubbles, clearly different: one seen from the side, one seen from above, one with a folded washcloth on the rim', 'a small baby bathtub with water, a little foam and a folded washcloth on the rim, with no toys and no duck'],
  bed: ['three small children\'s beds with blue blankets and a pillow, slightly different angles', 'a white baby crib'],
  sun: ['three clearly different photos of the bright yellow sun: high in a clear blue sky with rays, peeking out from behind a small white cloud, and low and golden over green hills (for this word only, the background is the sky instead of white)', 'a big orange sun setting over the sea (for this word only, the background is the sky)'],
  moon: ['three clearly different photos of the moon in a dark night sky: a bright full moon, a full moon above a dark line of trees, and a bright gibbous moon with a few stars (for this word only, the background is the night sky instead of white, and the night sky must fill the whole square right to its edges)', 'a thin crescent moon in a dark night sky that fills the whole square'],
  nose: ['three close-up photos of the same toddler\'s nose, the face cropped tightly from just below the eyes to the top lip so the nose fills the middle and the mouth is not in the picture', 'a close-up of a grown-up\'s nose, cropped the same way'],
  eyes: ['three close-up photos of the same toddler\'s two open eyes, the face cropped from the eyebrows to the nose', 'a close-up of a grown-up\'s two open eyes, cropped the same way'],
  feet: ['three photos of a toddler\'s two bare feet, seen from above, slightly different angles', 'a grown-up\'s two bare feet, seen from above'],
  mouth: ['three close-up photos of the same toddler\'s smiling mouth, the face cropped tightly from just under the nose to the chin so the nostrils are not in the picture', 'a close-up of a grown-up\'s smiling mouth, cropped the same way'],
  ears: ['three photos of the back of the same toddler\'s head seen from straight behind, with both ears sticking out clearly and no face visible', 'the back of a grown-up\'s head seen from behind, with both ears showing']
};

// Everyday words: one photo each, four to a sheet (top-left, top-right, bottom-left, bottom-right).
const EVERYDAY = [
  ['hi', 'a smiling toddler waving hello with one hand raised', 'bye-bye', 'a toddler from the waist up, turned slightly away, waving goodbye over the shoulder with one hand',
    'more', 'a small white plate with three chocolate chip cookies', 'all-done', 'an empty white bowl with a spoon in it'],
  ['help', 'a toddler holding a closed snack pouch up toward a grown-up\'s open hand, both hands fully inside the picture', 'yes', 'a smiling toddler giving a big thumbs up',
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
