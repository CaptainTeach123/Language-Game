# Word Buddies

A bright, cartoon talking-picture game that helps a toddler (around 30 months) with a speech delay learn **50 important first words**. It's built to install on an **iPhone** like an app: full screen, its own Home Screen icon, and it works offline.

![Word Buddies screens](docs/preview.png)

## Put it on your iPhone

The game is a web app (a "PWA"), so it doesn't need the App Store. Host it once, then add it to the Home Screen.

1. **Host it with GitHub Pages (free).** In this repository on GitHub go to **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**, pick the branch with this code (for example `main`) and the **/(root)** folder, then **Save**. About a minute later it's live at:
   **https://captainteach123.github.io/Language-Game/**
2. **On the iPhone**, open that link in **Safari**, tap **Share** (the square with an arrow), then **Add to Home Screen → Add**.
3. Open **Word Buddies** from the Home Screen. It runs full screen, works without internet after the first visit, and keeps progress on the phone.

Tip for toddlers: turn on **Guided Access** (Settings → Accessibility → Guided Access, then triple-click the side button) to keep little fingers inside the game.

## How it teaches

Each **Play** session is about 10 short rounds (3 to 6 minutes) that mix three activities:

| Activity | What happens | What it builds |
| --- | --- | --- |
| **Learn** | A big picture, the word said slowly, a short model sentence ("Kick the ball!"), the picture animates when tapped | Hearing the word many times |
| **Find it** | "Where's the dog?" with 2, 3 or 4 pictures. A wrong tap gently names that picture, then the right one glows (and a pointing hand appears after a second miss), so every round ends in success | Understanding (receptive language) |
| **Say it** | A fill-in-the-blank starter ("Ready, set...") and a pause, then a clear model ("Go! Say go!") and another pause. A grown-up taps **Said it!**, **Tried** or **Not yet** | Talking (expressive language) |

### Mastery, not just exposure

Every word earns three stars:

- **Understands (blue):** picks the right picture on the first try when there are 3 or 4 choices, on 2 different days, and gets most recent tries right. Wins with only 2 pictures don't count, since they could be lucky guesses.
- **Tries it (orange):** any attempt: a sound, a sign, or part of the word.
- **Says it (green):** a grown-up tapped **Said it!** on 3 different days. The child's own consistent version counts ("ba" for ball).

A word is **mastered** when it has the blue and green stars. The game works on a small set of words at a time (5 by default). When one is mastered, the next word joins, and mastered words come back for quick reviews after 1, 3, 7, 14 and 30 days so they stick. "Find it" also gets harder on its own, going from 2 pictures to 4 as the child gets them right.

### Speech-therapy techniques built in

- Slow, clear speech (speed adjustable) and short model sentences one step above single words.
- Fill-in-the-blank prompts ("Up, up, up, and...", "Uh...", "Ready, set...") that invite the child to finish.
- Built-in wait time before the app models the word.
- Close tries are celebrated. Each word lists the approximations to accept (for example "wawa" for water).
- Errorless "Find it" hints, so the child is never told they're wrong.
- Baby-sign tips for key words (more, all done, help, eat, milk, and others).
- Animal and vehicle sounds ("woof", "moo", "vroom"), which are often easier first words.

### Keeping it fun

- **Pip**, a friendly purple mascot whose mouth moves while it talks, and who jumps and cheers.
- Bright 3D cartoon pictures that wiggle, hop, float and spin when tapped.
- Confetti, stars flying into the progress trail, and cheerful sound effects.
- **Pick a present** after every session: tap a gift box to reveal a surprise sticker for the **sticker book** (36 to collect).
- An optional **voice balloon** that grows when the child makes sounds. It uses the microphone for loudness only; nothing is recorded or saved.

## The grown-ups area

**Press and hold the purple gear** on the home screen for about 2 seconds (a quick tap won't open it).

- **Progress:** words mastered, the three star counts, a 7-day practice chart and streak, the words being learned now, and progress by category.
- **Share with your speech therapist:** exports a spreadsheet (CSV) of every word, covering what the child understands, tries and says, and how often.
- **Words:** every word with its stars and stats. Choose which words to learn now, or tap the pencil to:
  - **rename it** (for example "Mama", "Abuela", "Nana"),
  - **record your own voice** saying it (many kids respond best to a familiar voice),
  - **use a real photo** (your child's own cup, dog or grandparent), which helps words carry over to real life,
  - mark it as **"already says this word"**.
- **Settings:** child's name (used in cheers), words at a time, play length, fill-in-the-blank on/off, sound effects, voice balloon, speaking speed, voice choice, backup and restore, and reset.
- **Help:** how to play together, what the stars mean, and iPhone tips.

Everything stays on the device: no accounts, no ads, no tracking.

## The 50 words

| Category | Words |
| --- | --- |
| People | Mommy, Daddy, baby |
| Talking | hi, bye-bye, more, all done, help, yes, no, please, uh-oh |
| Actions | up, down, go, stop, open, eat, drink, sleep, hug |
| Animals | dog, cat, cow, duck, pig, bird, fish |
| Food | milk, water, juice, cookie, apple, banana |
| Body | eyes, nose, mouth, ears |
| Clothes | shoes, hat, socks |
| Toys | ball, book, car, bubbles, teddy |
| Home & Sky | bed, bath, sun, moon |

The list draws on common first-word research (MacArthur-Bates CDI and the Language Development Survey) and the "core words" speech-language pathologists teach first. It mixes words a child can use to ask for things (more, help, all done, up, open, go) with everyday people, animals, food, body parts, clothes, toys and household things. Words are introduced in an easy-first order (see `START_ORDER` in `js/words.js`).

> Word Buddies supports, but doesn't replace, speech therapy. If you have concerns about your child's speech or language, talk with your pediatrician or a speech-language pathologist.

## For developers

Plain HTML, CSS and JavaScript with no build step and no dependencies.

```
index.html              app shell (iPhone meta tags, manifest, scripts)
css/app.css             all styles and animations
js/words.js             the 50 words, categories, stickers, introduction order
js/progress.js          mastery engine: stars, review schedule, session planner (unit tested)
js/storage.js           localStorage progress + IndexedDB for photos and recordings
js/audio.js             speech, recordings, sound effects, microphone level
js/app.js               screens and games
sw.js                   offline cache (file list generated by tools/build-sw.js)
manifest.webmanifest    Home Screen app settings
img/words, img/stickers, img/ui, img/icons   pictures
tests/                  unit and data tests (node --test)
tools/                  offline-list builder, icon renderer, end-to-end playthrough
```

```sh
npm start        # serve at http://localhost:8080
npm test         # unit + data tests
npm run build    # refresh the offline file list after changing any app file (tests fail if you forget)
npm run e2e      # plays through every screen at iPhone sizes and saves screenshots (needs Playwright)
npm run icons    # re-render the app icons (needs Playwright)
```

If you later want it in the App Store, the same code can be wrapped with [Capacitor](https://capacitorjs.com/). That needs a Mac with Xcode and an Apple Developer account.

## Credits

- Pictures: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji), MIT License (`img/LICENSE-fluent-emoji.txt`).
- Font: [Fredoka](https://github.com/hafontia/Fredoka-One), SIL Open Font License (`fonts/OFL.txt`).
- Pip the mascot, app icons and sound effects are drawn and synthesized in code.
