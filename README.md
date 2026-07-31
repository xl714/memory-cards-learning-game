# Idol Memory — NEBULA

A **vanilla JS PWA** memory game (zero dependencies): learn to match the faces and
names of the fictional group **NEBULA**, powered by **spaced repetition**
(a 3-box Leitner system).

The roster is **fully dynamic**: the member list lives in `js/data.js`
(2 demo members, 5 more commented out in reserve) — the meter, graduations, tokens and
copy all adapt automatically when you add or remove members.

## How to play

1. **Study screen**: every member is shown with their portrait and name. Memorize them, then hit **Start**.
2. **Game**: a photo appears — **tap the right name** among the choices (shuffled on every question).
3. Each member travels through **three memory levels**, each of which must be **completed**:
   - 🔴 **Short-term memory** — the member comes back very quickly (3rd question away);
   - 🟡 **Medium-term memory** — they come back a little later;
   - 🟢 **Long-term memory** — they only come back rarely: the final gauge steps are
     earned during these spaced check-ups.
4. The **difficulty** sets how many correct answers in a row complete each level:
   **easy** 1 (3-step gauge), **medium** 2 (6-step gauge, default), **hard** 3 (9-step gauge).
5. A mistake always sends the member back to short-term memory (and resets their streak).
6. **Spacing is guaranteed**: when the queue is too short to provide the intended gap
   (say, with only 1 or 2 members), **interleaved cards** fill the space between two
   sightings of a face — your pick (⚙): **mental math** or **Korean name** (a name shows
   in hangul, find which member spells that way). Without them, anything beyond
   short-term memory could never be tested with a small roster. Their answers never touch
   the gauges, but a **score pill** ("🧮 3/4" or "한 3/4") tracks your hits, echoed on the
   victory screen.
7. The **victory meter** shows overall progress: 100% = number of members × gauge steps,
   drawn as graduations on the bar. Every step earned moves the meter up with a green gain;
   every mistake shows the loss in red and moves it down by the same amount.
8. **Victory** once every gauge is full — each member's long-term memory must have been
   validated by its check-ups, not merely reached. Stats included (questions, accuracy, time).

The **⚙ Settings** button (home and game screens) opens the options, remembered across sessions:
- **Difficulty**: easy / medium / hard — switchable mid-game (current streaks are kept,
  only the thresholds move);
- **Interleaved cards**: **mental math** (default) or **Korean name** in hangul — the
  latter reinforces group knowledge while spacing the questions; the romanization is
  revealed in italics along with the answer;
- **Score display**: **global bar** (default, graduated + one colored token per member) or
  **bars per member** (one vertical bar per member, white cursor, photo below — the score
  climbs picture by picture, with a "+1" / "−N" badge on every change).

## Run it

It's a static site — any web server will do:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## PWA

- Installable (manifest + icons);
- Works **offline** after the first load (service worker: cache-first app shell,
  stale-while-revalidate portraits);
- If an image fails to load, a fallback avatar (colored initial) steps in.

## Project layout

```
index.html      The 3 screens (study / game / victory) + settings dialog
css/style.css   Styles, OK/KO animations, mobile-first responsive
js/data.js      The members (names + hangul + romaja + fixed api.images.cat portraits)
js/memory.js    Spaced-repetition engine (pure logic, testable under node)
js/app.js       UI orchestration, feedback, persistence
manifest.json   PWA manifest
sw.js           Service worker
icons/          App icons
```

## Test the engine

```bash
node tests/memory.test.js
```
