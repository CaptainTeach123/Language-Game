# Word Wizard

A bright **listening game** made for **Anthony**, a toddler (around 30 months) with a speech delay, to help him **understand 50 important first words**. A friendly little cartoon wizard says a word ("Where's the ball?") and Anthony taps the matching **real photo**. Nothing asks him to talk. The game builds receptive language (understanding), which comes before speaking.

- **Every line is a warm recorded voice** (made with ElevenLabs), with cheers that use Anthony's name: "Great job, Anthony!", "High five, Anthony!"
- **Real photos** of every word: three similar ones to learn from, and one that looks different to check the word has really stuck.
- **A cartoon castle world**: a fairytale castle on rolling green hills under a sunny, sparkly sky, with a spellbook, crystal ball and treasure chest for the menu, all drawn in the wizard's style. The wizard blinks, bobs, hops and waves, and his wand sparkles; screens slide in and pictures pop into place (all of it stops while a word is being said, and with "Reduce Motion" on).

- It installs on an **iPhone** like an app: full screen, its own Home Screen icon, and it works offline.

![Word Wizard screens](docs/preview.png)

## Put it on the iPhone

The game is a web app (a "PWA"), so it doesn't need the App Store.

1. **It's hosted on GitHub Pages.** Every push to this branch is published by the workflow in `.github/workflows/jekyll-gh-pages.yml` (in the repository go to **Settings → Pages** and make sure *Source* is **GitHub Actions**). The game is at:
   **https://captainteach123.github.io/Language-Game/**
2. **On the iPhone**, open that link in **Safari**, tap **Share** (the square with an arrow), then **Add to Home Screen → Add**.
3. Open **Word Wizard** from the Home Screen. It runs full screen, works without internet after the first visit, and keeps progress on the phone.

The first visit shows the game as soon as the small app files are in (about 1 MB); the photos, stickers and voice clips (another 6 MB) are stored in the background over the next minute or so, and anything played before then is fetched on the spot. Later versions only download the files that changed.

Tip: turn on **Guided Access** (Settings → Accessibility → Guided Access, then triple-click the side button) to keep little fingers inside the game.

## How it teaches

The design follows a research brief on receptive "hear the word, tap the picture" games for 2-year-olds with speech delay.

**Play together.** A short card before each session reminds the grown-up to sit beside Anthony, say the word too, wait, and not point. After the session, a card suggests how to use today's words with real things, and **Real things** mode shows the picture while you hold up the real ball.

**Each round.** A quiet half second to look, then "Where's the ball?" with the word last. Taps only count once the question has been said (so a tap means "I heard you"), and two-finger, palm and rapid repeat taps are ignored. If Anthony waits: "Find the ball!", then the right picture glows with "Here's the ball!" (counted as *needed a hint*). A wrong tap gets a calm "Hmm, let's look. This is the ball." and a do-over with the pictures moved. A right tap gets short, varied praise ("Yes!", "You found it, Anthony!") and "That's the ball!"

**New words** start with a single big picture: "Here's the ball! Touch the ball."

**Calm screen.** No confetti on every round, the wizard stays still while the question is asked, and there's a small celebration every 5 finds ("Magic listening, Anthony!"). After each session he picks a present and gets a sticker for his sticker book (36 to collect).

**Learning → Review → Mastered.**
- A word starts with **2 pictures**, moves to **3**, then **4** at about 80% found with no hint across 2 sessions, and drops back after 2 sessions under 50%.
- Other words still being learned are mixed in as wrong choices, so the answer can't be found by ruling out words he already knows. Words that sound alike ("cat" and "hat") or look alike (two face close-ups) are never shown together.
- At 4 pictures and about 80% on 2 different days, a word moves to **Review**: it's checked again 2 days and 7 days later, each time with a photo he hasn't seen. Passing both makes it **Mastered**. Mastered words still come back now and then, and go back to learning if missed twice in a row.
- Sessions are 10 to 20 pictures and stop by themselves after 5 or 10 minutes, always ending on a success. About 60% of each session is words being learned, 30% review and 10% older words, with only 1 or 2 new words at a time.

## The grown-ups area

**Press and hold the purple gear** on the home screen for about 2 seconds.

- **Progress:** words mastered, in review and being learned, a 7-day chart, today's minutes and accuracy, and progress by category.
- **Report for the speech therapist:** a spreadsheet (CSV) or printable page with, for every word: stage, pictures shown, trials, % correct with no hint, how often a hint was needed, wrong first taps, right on the do-over, photos used, dates introduced and mastered, and your notes.
- **Words:** start, pause or resume words, and tap the pencil on a word to:
  - **add photos** of Anthony's own things and people (for Mommy, Daddy and baby your photos replace the stock photos, and "Anthony" joins the game once there's a photo of him),
  - mark it as **already understood**,
  - write **notes** (these go in the report),
  - see a way to say it in play and in real life.
- **Everyday words** (up, more, all done...) with tips and baby signs for daily routines.
- **Settings:** words learning at once, pictures per session, time limit, sound effects, backup and restore.
- **Help:** playing together, how the stages work, screen-time guidance, and when to ask for a speech-language evaluation.

Everything stays on the phone: no accounts, no ads, no tracking.

## The 50 words

**35 picture words** (the listening game):

| Category | Words |
| --- | --- |
| People | Mommy, Daddy, baby, Anthony (with your photo) |
| Animals | dog, cat, cow, duck, pig, bird, fish |
| Food | milk, water, juice, cookie, apple, banana, cup |
| Toys | ball, book, car, bubbles, teddy |
| Clothes | shoes, hat, socks |
| Home & Sky | bath, bed, sun, moon |
| Body | nose, eyes, feet, mouth, ears |

**15 everyday words** that a still picture can't really show, practiced in daily routines and browsable in the picture book: hi, bye-bye, more, all done, help, yes, no, uh-oh, up, down, go, stop, open, eat, sleep.

The list draws on first-word research (MacArthur-Bates CDI and Wordbank). Words are introduced familiar-first (see `START_ORDER` in `js/words.js`).

## For developers

Plain HTML, CSS and JavaScript with no build step and no dependencies.

```
index.html              app shell (iPhone meta tags, manifest, scripts)
css/app.css             styles and animations
js/words.js             the 50 words, categories, photos, stickers, introduction order
js/progress.js          learning engine: levels, review schedule, session planner, report (unit tested)
js/storage.js           localStorage progress + IndexedDB for grown-up photos
js/audio.js             voice clip player and sound effects
js/app.js               screens, games and the wizard
audio/                  408 voice clips: <word>-<line>.mp3 and common-<line>.mp3
img/photos/             151 word photos (WebP): <word>-1..4.webp and one per everyday word
img/stickers, img/ui, img/icons   stickers, the wizard (quiet, talking and blinking), castle, hills, icons (all WebP) and the PNG app icons
sw.js                   offline cache: the app shell first, the media in the background, unchanged files kept across versions (file list and hashes generated by tools/build-sw.js)
tests/                  unit and data tests (node --test)
tools/voice/            the spoken lines (lines.js) and the clip splitter (split_voice.py)
tools/photos/           the photo prompts (prompts.js) and the sheet cropper (crop.py)
tools/                  offline-list builder, icon renderer, picture cut-out and WebP converters, end-to-end playthrough
```

```sh
npm start        # serve at http://localhost:8080
npm test         # unit + data tests (every spoken line has a clip, every photo is used, ...)
npm run build    # refresh the offline file list after changing any app file (tests fail if you forget)
npm run e2e      # plays through every screen at iPhone sizes and saves screenshots (needs Playwright)
npm run icons    # re-render the app icons from the wizard (needs Playwright)
```

**Voice.** `node tools/voice/lines.js` prints every line, grouped the way they were generated with ElevenLabs (voice "Emma - Bright Kids Educator", model `eleven_multilingual_v2`): one generation per word, and groups of up to six for shared lines, with a 1.5 s break between lines. `tools/voice/split_voice.py` cuts each generation into one small MP3 per line. To change a line, regenerate its group, split it, and run the tests.

**Photos.** `tools/photos/prompts.js` has the prompt for each word: a 2x2 sheet of real photos on white (three similar, one different-looking), generated with ElevenLabs image generation (GPT Image 2, 2048x2048). `tools/photos/crop.py` cuts each sheet into four 520 px WebP pictures.

**Pictures.** Everything the game shows is WebP (a third to an eighth of the size of PNG or JPEG at the same look; iPhones have shown it since iOS 14). `tools/webp.py` converts a PNG or JPEG; `tools/cutout.py` removes a white background first. The app icons stay PNG, as the Home Screen expects.

## Credits

- Voice and word photos: made with [ElevenLabs](https://elevenlabs.io).
- Stickers and the speaker icon: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji), MIT License (`img/LICENSE-fluent-emoji.txt`).
- Font: [Fredoka](https://github.com/hafontia/Fredoka-One), SIL Open Font License (`fonts/OFL.txt`).
- The wizard (three pictures: quiet, talking and blinking), the castle, the hills and the menu icons: made with ElevenLabs image generation (the wizard was chosen by Anthony's family), cut out of their white backgrounds with `tools/cutout.py` and shrunk with `tools/webp.py`; the hills strip is mirrored so it tiles seamlessly; the app icons are rendered from the wizard (`tools/make-icons.js`). Sound effects are synthesized in code.
