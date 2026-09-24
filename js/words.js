/*
 * Word Buddies: the 50 target words.
 *
 * Chosen from common first-word research (MacArthur-Bates CDI, Rescorla's
 * Language Development Survey) and the "core words" speech therapists teach
 * first. The list mixes functional words a child can use to ask for things
 * (more, help, all done, up, go, open) with everyday people, animals, food,
 * body parts, clothes, toys and household things.
 *
 * Fields
 *   id      stable key (also the image file name in img/words/)
 *   word    what is shown and spoken (grown-ups can rename it, e.g. "Mama")
 *   cat     category id
 *   kind    'name' | 'noun' | 'plural' | 'core'   (drives prompt grammar)
 *   look    optional look-alike group; words that share a look are never
 *           shown side by side in "Find it" (e.g. several yellow faces)
 *   img     image file name when it differs from id
 *   stack   show the picture this many times ("more" = lots of cookies)
 *   anim    animation played when the picture is tapped
 *   phrase  short model sentence, {w} = the word, {W} = capitalised word
 *   cloze   fill-in-the-blank starter the child can finish ("Ready, set...")
 *   easy    close tries worth celebrating (shown to grown-ups)
 *   sign    optional baby sign tip
 */
(function (root) {
  'use strict';

  var CATEGORIES = [
    { id: 'people', name: 'People', color: '#FF5C8A', icon: 'mommy' },
    { id: 'talk', name: 'Talking', color: '#9B5DE5', icon: 'bye-bye' },
    { id: 'actions', name: 'Actions', color: '#FF8A00', icon: 'go' },
    { id: 'animals', name: 'Animals', color: '#20B26B', icon: 'dog' },
    { id: 'food', name: 'Food', color: '#F04438', icon: 'apple' },
    { id: 'body', name: 'Body', color: '#E4A11B', icon: 'nose' },
    { id: 'clothes', name: 'Clothes', color: '#00A6C8', icon: 'shoes' },
    { id: 'toys', name: 'Toys', color: '#2F7BFF', icon: 'ball' },
    { id: 'home', name: 'Home & Sky', color: '#5B5BD6', icon: 'moon' }
  ];

  var WORDS = [
    // People
    { id: 'mommy', word: 'Mommy', cat: 'people', kind: 'name', look: 'person', anim: 'bounce',
      phrase: 'I love {w}!', cloze: 'I love...', easy: ['ma', 'mama'] },
    { id: 'daddy', word: 'Daddy', cat: 'people', kind: 'name', look: 'person', anim: 'bounce',
      phrase: 'Here comes {w}!', cloze: 'Here comes...', easy: ['da', 'dada'] },
    { id: 'baby', word: 'baby', cat: 'people', kind: 'noun', look: 'person', anim: 'rock',
      phrase: 'Rock the {w}.', cloze: 'Rock-a-bye...', easy: ['bay', 'baba'] },

    // Talking words (social + core)
    { id: 'hi', word: 'hi', cat: 'talk', kind: 'core', look: 'person', anim: 'wave',
      phrase: 'Wave {w}!', easy: ['hi', 'ai'], sign: 'Wave your hand.' },
    { id: 'bye-bye', word: 'bye-bye', cat: 'talk', kind: 'core', look: 'hand', anim: 'wave',
      phrase: 'Wave {w}!', cloze: 'Bye...', easy: ['ba', 'bye'], sign: 'Wave your hand.' },
    { id: 'more', word: 'more', cat: 'talk', kind: 'core', img: 'cookie', stack: 3, anim: 'pulse',
      phrase: '{W} cookies, please!', easy: ['muh', 'mo'], sign: 'Tap your fingertips together.' },
    { id: 'all-done', word: 'all done', cat: 'talk', kind: 'core', look: 'hand', anim: 'wave',
      phrase: '{W}! No more.', cloze: 'All...', easy: ['a-da', 'done'],
      sign: 'Hold both hands up and twist them side to side.' },
    { id: 'help', word: 'help', cat: 'talk', kind: 'core', look: 'hand', anim: 'lift',
      phrase: 'I need {w}.', cloze: 'I need...', easy: ['hep', 'eh'],
      sign: 'Put a thumbs-up fist on your flat palm and lift it.' },
    { id: 'yes', word: 'yes', cat: 'talk', kind: 'core', look: 'hand', anim: 'nod',
      phrase: 'Nod your head, {w}!', easy: ['yeh', 'eh'], sign: 'Nod your head.' },
    { id: 'no', word: 'no', cat: 'talk', kind: 'core', look: 'person', anim: 'shake',
      phrase: 'Shake your head, {w}!', easy: ['no', 'nah'], sign: 'Shake your head.' },
    { id: 'please', word: 'please', cat: 'talk', kind: 'core', look: 'hand', anim: 'pulse',
      phrase: 'Juice, {w}!', easy: ['pee', 'peas'], sign: 'Rub a flat hand in a circle on your chest.' },
    { id: 'uh-oh', word: 'uh-oh', cat: 'talk', kind: 'core', look: 'face', anim: 'wobble',
      phrase: '{W}! It fell down.', cloze: 'Uh...', easy: ['uh-oh', 'oh-oh'] },

    // Actions
    { id: 'up', word: 'up', cat: 'actions', kind: 'core', anim: 'float',
      phrase: 'The balloon goes {w}!', cloze: 'The balloon goes...', easy: ['uh', 'up'], sign: 'Point up.' },
    { id: 'down', word: 'down', cat: 'actions', kind: 'core', anim: 'slide',
      phrase: '{W} the slide!', cloze: 'Up, up, up, and...', easy: ['dow', 'da'], sign: 'Point down.' },
    { id: 'go', word: 'go', cat: 'actions', kind: 'core', look: 'person', anim: 'zoom',
      phrase: 'Ready, set, {w}!', cloze: 'Ready, set...', easy: ['go', 'doe'] },
    { id: 'stop', word: 'stop', cat: 'actions', kind: 'core', anim: 'pulse',
      phrase: '{W}! Red means stop.', cloze: 'Go, go, go... and...', easy: ['top', 'tah'],
      sign: 'Chop one hand down onto your flat palm.' },
    { id: 'open', word: 'open', cat: 'actions', kind: 'core', anim: 'pop',
      phrase: '{W} the present!', cloze: 'Knock knock, please...', easy: ['o-puh', 'o'],
      sign: 'Put your hands together, then open them like a book.' },
    { id: 'eat', word: 'eat', cat: 'actions', kind: 'core', look: 'face', anim: 'chomp',
      phrase: 'Yum yum, let\'s {w}!', cloze: 'Yum yum, let\'s...', easy: ['ee', 'eat'],
      sign: 'Tap your fingertips to your mouth.' },
    { id: 'drink', word: 'drink', cat: 'actions', kind: 'core', anim: 'sip',
      phrase: 'Sip, sip, {w}!', cloze: 'Sip, sip, let\'s...', easy: ['dink', 'di'],
      sign: 'Tip a "C" hand to your mouth like a cup.' },
    { id: 'sleep', word: 'sleep', cat: 'actions', kind: 'core', look: 'face', anim: 'breathe',
      phrase: 'Shh, time to {w}.', cloze: 'Shh... close your eyes and...', easy: ['seep', 'nigh-nigh'],
      sign: 'Pull an open hand down over your face and close your eyes.' },
    { id: 'hug', word: 'hug', cat: 'actions', kind: 'core', look: 'face', anim: 'squeeze',
      phrase: 'Give me a big {w}!', cloze: 'Give me a big...', easy: ['huh', 'hug'], sign: 'Hug yourself!' },

    // Animals
    { id: 'dog', word: 'dog', cat: 'animals', kind: 'noun', anim: 'hop',
      phrase: 'The {w} says woof woof!', cloze: 'Woof woof! It\'s a...', easy: ['doh', 'woof'] },
    { id: 'cat', word: 'cat', cat: 'animals', kind: 'noun', anim: 'hop',
      phrase: 'The {w} says meow!', cloze: 'Meow! It\'s a...', easy: ['ca', 'meow'] },
    { id: 'cow', word: 'cow', cat: 'animals', kind: 'noun', anim: 'hop',
      phrase: 'The {w} says moo!', cloze: 'Moo! It\'s a...', easy: ['ca', 'moo'] },
    { id: 'duck', word: 'duck', cat: 'animals', kind: 'noun', anim: 'waddle',
      phrase: 'The {w} says quack quack!', cloze: 'Quack quack! It\'s a...', easy: ['duh', 'quack'] },
    { id: 'pig', word: 'pig', cat: 'animals', kind: 'noun', anim: 'hop',
      phrase: 'The {w} says oink oink!', cloze: 'Oink oink! It\'s a...', easy: ['pi', 'oink'] },
    { id: 'bird', word: 'bird', cat: 'animals', kind: 'noun', anim: 'fly',
      phrase: 'The {w} says tweet tweet!', cloze: 'Tweet tweet! It\'s a...', easy: ['buh', 'tweet'] },
    { id: 'fish', word: 'fish', cat: 'animals', kind: 'noun', anim: 'swim',
      phrase: 'The {w} goes swim, swim!', cloze: 'Swim, swim! It\'s a...', easy: ['fi', 'ish'] },

    // Food and drink
    { id: 'milk', word: 'milk', cat: 'food', kind: 'noun', anim: 'sip',
      phrase: 'Drink your {w}.', cloze: 'Drink your...', easy: ['mi', 'mih'], sign: 'Squeeze your fist open and closed.' },
    { id: 'water', word: 'water', cat: 'food', kind: 'noun', anim: 'drip',
      phrase: 'A cup of {w}.', cloze: 'Splash, splash, it\'s...', easy: ['wawa', 'wah'] },
    { id: 'juice', word: 'juice', cat: 'food', kind: 'noun', anim: 'squeeze',
      phrase: 'Yummy {w}!', cloze: 'Apple...', easy: ['doo', 'joo'] },
    { id: 'cookie', word: 'cookie', cat: 'food', kind: 'noun', anim: 'chomp',
      phrase: 'Yum, a {w}!', cloze: 'Yum yum, a...', easy: ['coo', 'kiki'] },
    { id: 'apple', word: 'apple', cat: 'food', kind: 'noun', anim: 'bounce',
      phrase: 'Crunch, crunch, {w}!', cloze: 'Crunch, crunch, an...', easy: ['a-puh', 'ap'] },
    { id: 'banana', word: 'banana', cat: 'food', kind: 'noun', anim: 'rock',
      phrase: 'Peel the {w}.', cloze: 'Monkeys love...', easy: ['nana', 'nah'] },

    // Body
    { id: 'eyes', word: 'eyes', cat: 'body', kind: 'plural', anim: 'blink',
      phrase: 'Peekaboo! I see your {w}!', cloze: 'Peekaboo! I see your...', easy: ['ai', 'eye'] },
    { id: 'nose', word: 'nose', cat: 'body', kind: 'noun', anim: 'boop',
      phrase: 'Beep! Touch your {w}.', cloze: 'Beep beep, touch your...', easy: ['no', 'noh'] },
    { id: 'mouth', word: 'mouth', cat: 'body', kind: 'noun', anim: 'chomp',
      phrase: 'Open your {w}.', cloze: 'Open wide, open your...', easy: ['mow', 'mou'] },
    { id: 'ears', word: 'ears', cat: 'body', kind: 'plural', anim: 'wiggle',
      phrase: 'Listen with your {w}.', cloze: 'Listen with your...', easy: ['ee', 'eez'] },

    // Clothes
    { id: 'shoes', word: 'shoes', cat: 'clothes', kind: 'plural', anim: 'hop',
      phrase: 'Put on your {w}.', cloze: 'Put on your...', easy: ['shoo', 'doo'] },
    { id: 'hat', word: 'hat', cat: 'clothes', kind: 'noun', anim: 'lift',
      phrase: 'A {w} on my head!', cloze: 'On my head, I wear a...', easy: ['ha', 'at'] },
    { id: 'socks', word: 'socks', cat: 'clothes', kind: 'plural', anim: 'wiggle',
      phrase: '{W} on your feet!', cloze: 'Shoes and...', easy: ['sa', 'dok'] },

    // Toys
    { id: 'ball', word: 'ball', cat: 'toys', kind: 'noun', anim: 'spin',
      phrase: 'Kick the {w}!', cloze: 'Kick the...', easy: ['ba', 'bah'] },
    { id: 'book', word: 'book', cat: 'toys', kind: 'noun', anim: 'pop',
      phrase: 'Let\'s read a {w}.', cloze: 'Let\'s read a...', easy: ['boo', 'buh'],
      sign: 'Open your hands like a book.' },
    { id: 'car', word: 'car', cat: 'toys', kind: 'noun', anim: 'zoom',
      phrase: 'The {w} goes vroom!', cloze: 'Vroom vroom! It\'s a...', easy: ['ca', 'vroom'] },
    { id: 'bubbles', word: 'bubbles', cat: 'toys', kind: 'plural', anim: 'float',
      phrase: 'Pop the {w}!', cloze: 'Pop, pop, pop the...', easy: ['bubba', 'bu'] },
    { id: 'teddy', word: 'teddy', cat: 'toys', kind: 'noun', anim: 'squeeze',
      phrase: 'Hug your {w}.', cloze: 'Hug your...', easy: ['teh', 'deddy'] },

    // Home and sky
    { id: 'bed', word: 'bed', cat: 'home', kind: 'noun', anim: 'breathe',
      phrase: 'Time for {w}.', cloze: 'Night night, into your...', easy: ['beh', 'be'] },
    { id: 'bath', word: 'bath', cat: 'home', kind: 'noun', anim: 'wobble',
      phrase: 'Splash, splash, {w} time!', cloze: 'Splash, splash! Time for a...', easy: ['ba', 'baf'],
      sign: 'Rub your fists up and down on your chest.' },
    { id: 'sun', word: 'sun', cat: 'home', kind: 'noun', anim: 'spin',
      phrase: 'Hello, {w}!', cloze: 'Good morning, Mister...', easy: ['sa', 'un'] },
    { id: 'moon', word: 'moon', cat: 'home', kind: 'noun', anim: 'rock',
      phrase: 'Goodnight, {w}.', cloze: 'Goodnight...', easy: ['moo', 'mun'] }
  ];

  // The order new words are introduced: easy-to-say, high-use words first,
  // with categories mixed so "Find it" choices look different from each other.
  var START_ORDER = [
    'mommy', 'daddy', 'ball', 'more', 'dog', 'milk', 'bye-bye', 'up', 'all-done', 'cat',
    'baby', 'book', 'banana', 'no', 'go', 'duck', 'shoes', 'water', 'hi', 'eat',
    'car', 'cow', 'nose', 'help', 'uh-oh', 'cookie', 'bubbles', 'down', 'yes', 'juice',
    'bath', 'pig', 'eyes', 'open', 'hat', 'apple', 'bird', 'sleep', 'please', 'teddy',
    'drink', 'mouth', 'fish', 'bed', 'stop', 'socks', 'hug', 'ears', 'sun', 'moon'
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

  var byId = {};
  WORDS.forEach(function (w) { byId[w.id] = w; });

  var catById = {};
  CATEGORIES.forEach(function (c) { catById[c.id] = c; });

  var api = {
    CATEGORIES: CATEGORIES,
    WORDS: WORDS,
    START_ORDER: START_ORDER,
    STICKERS: STICKERS,
    byId: byId,
    catById: catById
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WB_DATA = api;
})(this);
