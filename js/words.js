/*
 * Word Wizard: the 50 words.
 *
 * PICTURE WORDS (35) are what the listening game teaches: concrete,
 * picturable, high-frequency nouns from early-vocabulary research
 * (MacArthur-Bates CDI / Wordbank): people, animals, food, body parts,
 * clothes, toys and household things. "me" is Anthony, and joins the game
 * once a grown-up adds a photo of him.
 *
 * EVERYDAY WORDS (15) such as up, more, go and all done are just as
 * important, but a still picture can't show what they mean. They are
 * practiced in daily routines instead (tips in the grown-ups area) and
 * are browsable in the picture book, but never tested in the game.
 *
 * Every picture word has four real photos ("exemplars"), because toddlers
 * learn a word better from a few different examples than from one image:
 *   narrow: photos 1-3, three similar ones (three golden retrievers)
 *   wide:   photo 4, one that looks different (a Boston terrier), used for
 *           review checks once the word is nearly mastered
 * Grown-ups can add photos of Anthony's own things and people, which are the
 * best examples of all. See tools/photos/ for how the photos were made.
 *
 * Fields
 *   id      stable key; photos are img/photos/<id>-1.jpg ... <id>-4.jpg, voice clips audio/<id>-*.mp3
 *   word    what is shown and spoken
 *   cat     category id
 *   kind    'name' | 'noun' | 'plural'   (prompt grammar: "Where's Mommy?", "Where's the ball?", "Where are the shoes?")
 *   look    look-alike group; never shown side by side in the game
 *   anim    small animation on the picture when it is found
 *   phrase  short model sentence for grown-ups and the picture book ({w} = word, {W} = Capitalised)
 *   personal  needs a grown-up's photo before it can be played ("me")
 * Everyday words have one photo (img/photos/<id>.jpg), `life` (how to use
 * the word in routines) and sometimes `sign`.
 */
(function (root) {
  'use strict';

  var CATEGORIES = [
    { id: 'people', name: 'People', color: '#FF5C8A', icon: 'mommy' },
    { id: 'animals', name: 'Animals', color: '#20B26B', icon: 'dog' },
    { id: 'food', name: 'Food', color: '#F04438', icon: 'apple' },
    { id: 'toys', name: 'Toys', color: '#2F7BFF', icon: 'ball' },
    { id: 'clothes', name: 'Clothes', color: '#00A6C8', icon: 'shoes' },
    { id: 'home', name: 'Home & Sky', color: '#5B5BD6', icon: 'moon' },
    { id: 'body', name: 'Body', color: '#E4A11B', icon: 'nose' },
    { id: 'everyday', name: 'Everyday', color: '#9B5DE5', icon: 'bye-bye', everyday: true }
  ];

  var PICTURE_WORDS = [
    // People
    { id: 'mommy', word: 'Mommy', cat: 'people', kind: 'name', look: 'person', anim: 'bounce', phrase: 'I love {w}!' },
    { id: 'daddy', word: 'Daddy', cat: 'people', kind: 'name', look: 'person', anim: 'bounce', phrase: 'Here comes {w}!' },
    { id: 'baby', word: 'baby', cat: 'people', kind: 'noun', look: 'person', anim: 'rock', phrase: 'Rock the {w}.' },
    { id: 'me', word: 'Anthony', cat: 'people', kind: 'name', look: 'person', anim: 'bounce', phrase: 'Look, it\'s {w}!', personal: true },

    // Animals
    { id: 'dog', word: 'dog', cat: 'animals', kind: 'noun', anim: 'hop', phrase: 'The {w} says woof woof!' },
    { id: 'cat', word: 'cat', cat: 'animals', kind: 'noun', anim: 'hop', phrase: 'The {w} says meow!' },
    { id: 'cow', word: 'cow', cat: 'animals', kind: 'noun', anim: 'hop', phrase: 'The {w} says moo!' },
    { id: 'duck', word: 'duck', cat: 'animals', kind: 'noun', anim: 'waddle', phrase: 'The {w} says quack quack!' },
    { id: 'pig', word: 'pig', cat: 'animals', kind: 'noun', anim: 'hop', phrase: 'The {w} says oink oink!' },
    { id: 'bird', word: 'bird', cat: 'animals', kind: 'noun', anim: 'fly', phrase: 'The {w} says tweet tweet!' },
    { id: 'fish', word: 'fish', cat: 'animals', kind: 'noun', anim: 'swim', phrase: 'The {w} goes swim, swim!' },

    // Food and drink
    { id: 'milk', word: 'milk', cat: 'food', kind: 'noun', anim: 'bounce', phrase: 'Drink your {w}.' },
    { id: 'water', word: 'water', cat: 'food', kind: 'noun', anim: 'drip', phrase: 'A cup of {w}.' },
    { id: 'juice', word: 'juice', cat: 'food', kind: 'noun', anim: 'squeeze', phrase: 'Yummy {w}!' },
    { id: 'cookie', word: 'cookie', cat: 'food', kind: 'noun', anim: 'chomp', phrase: 'Yum, a {w}!' },
    { id: 'apple', word: 'apple', cat: 'food', kind: 'noun', anim: 'bounce', phrase: 'Crunch, crunch, {w}!' },
    { id: 'banana', word: 'banana', cat: 'food', kind: 'noun', anim: 'rock', phrase: 'Peel the {w}.' },
    { id: 'cup', word: 'cup', cat: 'food', kind: 'noun', anim: 'bounce', phrase: 'Drink from your {w}.' },

    // Toys
    { id: 'ball', word: 'ball', cat: 'toys', kind: 'noun', anim: 'spin', phrase: 'Kick the {w}!' },
    { id: 'book', word: 'book', cat: 'toys', kind: 'noun', anim: 'pop', phrase: 'Let\'s read a {w}.' },
    { id: 'car', word: 'car', cat: 'toys', kind: 'noun', anim: 'zoom', phrase: 'The {w} goes vroom!' },
    { id: 'bubbles', word: 'bubbles', cat: 'toys', kind: 'plural', anim: 'float', phrase: 'Pop the {w}!' },
    { id: 'teddy', word: 'teddy', cat: 'toys', kind: 'noun', anim: 'squeeze', phrase: 'Hug your {w}.' },

    // Clothes
    { id: 'shoes', word: 'shoes', cat: 'clothes', kind: 'plural', anim: 'hop', phrase: 'Put on your {w}.' },
    { id: 'hat', word: 'hat', cat: 'clothes', kind: 'noun', anim: 'lift', phrase: 'A {w} on my head!' },
    { id: 'socks', word: 'socks', cat: 'clothes', kind: 'plural', anim: 'wiggle', phrase: '{W} on your feet!' },

    // Home and sky
    { id: 'bath', word: 'bath', cat: 'home', kind: 'noun', anim: 'wobble', phrase: 'Splash, splash, {w} time!' },
    { id: 'bed', word: 'bed', cat: 'home', kind: 'noun', anim: 'breathe', phrase: 'Time for {w}.' },
    { id: 'sun', word: 'sun', cat: 'home', kind: 'noun', anim: 'spin', phrase: 'Hello, {w}!' },
    { id: 'moon', word: 'moon', cat: 'home', kind: 'noun', anim: 'rock', phrase: 'Goodnight, {w}.' },

    // Body (learned a little later)
    { id: 'nose', word: 'nose', cat: 'body', look: 'face', kind: 'noun', anim: 'boop', phrase: 'Beep! Touch your {w}.' },
    { id: 'eyes', word: 'eyes', cat: 'body', look: 'face', kind: 'plural', anim: 'blink', phrase: 'Peekaboo! I see your {w}!' },
    { id: 'feet', word: 'feet', cat: 'body', kind: 'plural', anim: 'hop', phrase: 'Stomp your {w}!' },
    { id: 'mouth', word: 'mouth', cat: 'body', look: 'face', kind: 'noun', anim: 'chomp', phrase: 'Open your {w}.' },
    { id: 'ears', word: 'ears', cat: 'body', look: 'face', kind: 'plural', anim: 'wiggle', phrase: 'Listen with your {w}.' }
  ];

  var EVERYDAY_WORDS = [
    { id: 'hi', word: 'hi', anim: 'wave', phrase: 'Wave {w}!', life: 'Wave and say "hi" every time someone comes in.', sign: 'Wave your hand.' },
    { id: 'bye-bye', word: 'bye-bye', anim: 'wave', phrase: 'Wave {w}!', life: 'Wave and say "bye-bye" every time someone leaves.', sign: 'Wave your hand.' },
    { id: 'more', word: 'more', anim: 'pulse', phrase: '{W} cookies!', life: 'Give a little snack, pause, then say "more?" before you give more.', sign: 'Tap your fingertips together.' },
    { id: 'all-done', word: 'all done', anim: 'wave', phrase: '{W}! No more.', life: 'Say "all done" as you clear the plate or finish a game.', sign: 'Hold both hands up and twist them side to side.' },
    { id: 'help', word: 'help', anim: 'lift', phrase: 'I need {w}.', life: 'Say "help" each time you help open a snack or a toy.', sign: 'Put a thumbs-up fist on your flat palm and lift it.' },
    { id: 'yes', word: 'yes', anim: 'nod', phrase: 'Nod your head, {w}!', life: 'Nod and say "yes" when you answer your child.', sign: 'Nod your head.' },
    { id: 'no', word: 'no', anim: 'shake', phrase: 'Shake your head, {w}!', life: 'Shake your head and say "no" in silly play: "Is the shoe a hat? No!"', sign: 'Shake your head.' },
    { id: 'uh-oh', word: 'uh-oh', anim: 'wobble', phrase: '{W}! It fell down.', life: 'Drop a toy on purpose and say "uh-oh!"' },
    { id: 'up', word: 'up', anim: 'float', phrase: 'The balloon goes {w}!', life: 'Say "up" before you pick your child up, and when a ball goes up.', sign: 'Point up.' },
    { id: 'down', word: 'down', anim: 'slide', phrase: '{W} the slide!', life: 'Say "down" going down the slide or putting your child down.', sign: 'Point down.' },
    { id: 'go', word: 'go', anim: 'zoom', phrase: 'Ready, set, {w}!', life: 'Play "Ready, set... go!" with a car or a ball.' },
    { id: 'stop', word: 'stop', anim: 'pulse', phrase: '{W}! Red means stop.', life: 'Walk together, then call "stop!" and freeze.', sign: 'Chop one hand down onto your flat palm.' },
    { id: 'open', word: 'open', anim: 'pop', phrase: '{W} the present!', life: 'Say "open" before you open a door, a box or a snack.', sign: 'Put your hands together, then open them like a book.' },
    { id: 'eat', word: 'eat', anim: 'chomp', phrase: 'Yum yum, let\'s {w}!', life: 'Say "eat" at snack time: "Let\'s eat!"', sign: 'Tap your fingertips to your mouth.' },
    { id: 'sleep', word: 'sleep', anim: 'breathe', phrase: 'Shh, time to {w}.', life: 'Put a teddy to bed and whisper "sleep, shh."', sign: 'Pull an open hand down over your face and close your eyes.' }
  ];
  EVERYDAY_WORDS.forEach(function (w) { w.cat = 'everyday'; w.kind = 'core'; w.everyday = true; });

  var WORDS = PICTURE_WORDS.concat(EVERYDAY_WORDS);

  // New picture words are introduced in this order (most common, everyday
  // things first; body parts later), 1-2 at a time.
  var START_ORDER = [
    'mommy', 'daddy', 'ball', 'dog', 'banana', 'milk', 'book', 'car', 'baby', 'cat',
    'cookie', 'shoes', 'duck', 'apple', 'cup', 'bath', 'bed', 'hat', 'juice', 'fish',
    'bird', 'cow', 'teddy', 'bubbles', 'water', 'socks', 'pig', 'sun', 'moon', 'nose',
    'eyes', 'feet', 'mouth', 'ears', 'me'
  ];

  // Words that sound alike are never put in the same round, so the game
  // tests the word, not fine listening ("cat" vs "hat").
  var SOUND_ALIKE = [
    ['cat', 'hat'], ['book', 'cookie'], ['daddy', 'teddy'], ['eyes', 'ears'], ['cup', 'duck'],
    ['juice', 'shoes'], ['nose', 'shoes'], ['cow', 'mouth']
  ];

  var STICKERS = [
    { id: 'unicorn', name: 'unicorn' }, { id: 't-rex', name: 'dinosaur' }, { id: 'dino', name: 'big dinosaur' },
    { id: 'rocket', name: 'rocket' }, { id: 'rainbow', name: 'rainbow' }, { id: 'ice-cream', name: 'ice cream' },
    { id: 'octopus', name: 'octopus' }, { id: 'butterfly', name: 'butterfly' }, { id: 'whale', name: 'whale' },
    { id: 'lion', name: 'lion' }, { id: 'panda', name: 'panda' }, { id: 'monkey', name: 'monkey' },
    { id: 'frog', name: 'frog' }, { id: 'turtle', name: 'turtle' }, { id: 'penguin', name: 'penguin' },
    { id: 'dolphin', name: 'dolphin' }, { id: 'ladybug', name: 'ladybug' }, { id: 'fire-truck', name: 'fire truck' },
    { id: 'helicopter', name: 'helicopter' }, { id: 'sunflower', name: 'sunflower' }, { id: 'watermelon', name: 'watermelon' },
    { id: 'cupcake', name: 'cupcake' }, { id: 'lollipop', name: 'lollipop' }, { id: 'crown', name: 'crown' },
    { id: 'elephant', name: 'elephant' }, { id: 'koala', name: 'koala' }, { id: 'fox', name: 'fox' },
    { id: 'tiger', name: 'tiger' }, { id: 'chick', name: 'baby chick' }, { id: 'strawberry', name: 'strawberry' },
    { id: 'kite', name: 'kite' }, { id: 'planet', name: 'planet' }, { id: 'sloth', name: 'sloth' },
    { id: 'flamingo', name: 'flamingo' }, { id: 'tractor', name: 'tractor' }, { id: 'snowman', name: 'snowman' }
  ];

  // The built-in photos of a picture word, as exemplars (none for "me").
  var PHOTOS_PER_WORD = 4;
  function photos(w) {
    if (w.personal) return [];
    var list = [];
    for (var n = 1; n <= PHOTOS_PER_WORD; n++) {
      list.push({ key: w.id + '@' + n, src: 'img/photos/' + w.id + '-' + n + '.jpg', style: 'photo', tier: n < PHOTOS_PER_WORD ? 'narrow' : 'wide' });
    }
    return list;
  }

  // The photo for an everyday word.
  function everydayPhoto(w) { return 'img/photos/' + w.id + '.jpg'; }

  function soundAlike(a, b) {
    for (var i = 0; i < SOUND_ALIKE.length; i++) {
      var p = SOUND_ALIKE[i];
      if ((p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)) return true;
    }
    return false;
  }

  var byId = {};
  WORDS.forEach(function (w) { byId[w.id] = w; });

  var catById = {};
  CATEGORIES.forEach(function (c) { catById[c.id] = c; });

  var api = {
    CATEGORIES: CATEGORIES,
    PICTURE_WORDS: PICTURE_WORDS,
    EVERYDAY_WORDS: EVERYDAY_WORDS,
    WORDS: WORDS,
    START_ORDER: START_ORDER,
    SOUND_ALIKE: SOUND_ALIKE,
    STICKERS: STICKERS,
    photos: photos,
    everydayPhoto: everydayPhoto,
    soundAlike: soundAlike,
    byId: byId,
    catById: catById
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WB_DATA = api;
})(this);
