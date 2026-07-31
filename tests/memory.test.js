// Quick spaced-repetition engine test: node tests/memory.test.js
const assert = require('assert');
const { MemoryGame, BOX, FILLER } = require('../js/memory.js');

// Plays perfectly until victory (also resolving interference cards) and
// returns { turns: face answers, fillers: quizzes passed through }.
function playPerfect(g, maxTurns = 2000) {
  let turns = 0, fillers = 0;
  while (!g.isWon()) {
    assert.ok(turns + fillers < maxTurns, 'the game must converge');
    if (g.nextIsFiller()) { g.resolveFiller(true); fillers++; }
    else { g.answer(g.current()); turns++; }
  }
  return { turns, fillers };
}

const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
// Deterministic randomness: always 0 => no shuffle, minimal gaps (medium=4, long=10)
const rnd0 = () => 0;

// --- KO: back to short-term memory, reinserted at position 2 (returns as 3rd question)
{
  const g = new MemoryGame(IDS, rnd0);
  const first = g.current();
  const { correct } = g.answer('WRONG');
  assert.strictEqual(correct, false);
  assert.strictEqual(g.boxOf(first), BOX.SHORT);
  assert.strictEqual(g.cards[first].streak, 0);
  assert.strictEqual(g.queue.indexOf(first), 2, 'a failed card comes back at position 2');
}

// --- Thresholds follow the difficulty: each level completes in spl correct answers,
//     3 x spl step gauge (long-term memory must be completed too)
{
  for (const [spl, toMedium, toLong, master] of [[1, 1, 2, 3], [2, 2, 4, 6], [3, 3, 6, 9]]) {
    const g = new MemoryGame(['x'], rnd0, spl);
    assert.strictEqual(g.masterStreak, master, `${master}-step gauge for spl=${spl}`);
    for (let i = 0; i < master; i++) {
      const expected = i >= toLong ? BOX.LONG : i >= toMedium ? BOX.MEDIUM : BOX.SHORT;
      assert.strictEqual(g.boxOf('x'), expected, `spl=${spl}, streak=${i}`);
      assert.strictEqual(g.isWon(), false, `spl=${spl}, streak=${i}: not won yet`);
      while (g.nextIsFiller()) g.resolveFiller(true);
      g.answer('x');
    }
    assert.strictEqual(g.boxOf('x'), BOX.LONG);
    assert.ok(g.isWon(), `spl=${spl}: won after ${master} correct answers (full gauge)`);
  }
}

// --- A medium-memory card is rescheduled farther than a short-memory one
{
  const g = new MemoryGame(IDS, rnd0, 1); // easy: 1 correct answer -> medium
  const first = g.current();
  g.answer(first);
  assert.strictEqual(g.boxOf(first), BOX.MEDIUM);
  assert.strictEqual(g.queue.indexOf(first), 4, 'medium card rescheduled around position 4');
}

// --- Spacing guaranteed by interference cards: even with 1 or 2 members,
//     the intended gap is honored (padded with mini quizzes)
{
  const g = new MemoryGame(['solo'], rnd0, 1);
  g.answer('solo'); // -> medium, intended gap: 4
  assert.deepStrictEqual(g.queue, [FILLER, FILLER, FILLER, FILLER, 'solo'],
    'the queue is padded with 4 quizzes before the card returns');
  for (let i = 0; i < 4; i++) { assert.ok(g.nextIsFiller()); g.resolveFiller(true); }
  assert.strictEqual(g.current(), 'solo');
  g.answer('solo'); // -> long (easy), intended gap: 10
  assert.strictEqual(g.queue.indexOf('solo'), 10, 'long-term check-up after 10 cards');
  assert.strictEqual(g.queue.filter((x) => x === FILLER).length, 10);
  assert.strictEqual(g.stats.fillerAsked, 4);
  assert.strictEqual(g.stats.fillerCorrect, 4);
}

// --- A failed quiz affects no gauge
{
  const g = new MemoryGame(['solo'], rnd0, 1);
  g.answer('solo');
  const streakBefore = g.cards.solo.streak;
  const progressBefore = g.progress();
  g.resolveFiller(false);
  assert.strictEqual(g.cards.solo.streak, streakBefore);
  assert.strictEqual(g.progress(), progressBefore);
  assert.strictEqual(g.stats.fillerAsked, 1);
  assert.strictEqual(g.stats.fillerCorrect || 0, 0);
}

// --- Perfect solo game: winnable, with real gaps between sightings
{
  const g = new MemoryGame(['solo'], Math.random, 1);
  const { turns, fillers } = playPerfect(g);
  assert.strictEqual(turns, 3, '3 face answers suffice on easy (3-step gauge)');
  assert.ok(fillers >= 14, `at least 4 + 10 interference quizzes (got: ${fillers})`);
}

// --- A KO drops a climbed card back to short-term memory
{
  const g = new MemoryGame(IDS, rnd0, 1);
  const first = g.current();
  g.answer(first); // -> medium
  while (g.current() !== first) {
    if (g.nextIsFiller()) g.resolveFiller(true);
    else g.answer(g.current());
  }
  g.answer('WRONG');
  assert.strictEqual(g.boxOf(first), BOX.SHORT);
  assert.strictEqual(g.cards[first].streak, 0);
}

// --- Changing difficulty mid-game: streaks stay, thresholds move
{
  const g = new MemoryGame(['x', 'y'], rnd0, 3); // hard
  g.cards.x.streak = 2;
  // streak 2: still short on hard (level completes at 3)…
  assert.strictEqual(g.boxOf('x'), BOX.SHORT);
  g.setStepsPerLevel(1); // …but long on easy (long reached at 2, completed at 3)
  assert.strictEqual(g.boxOf('x'), BOX.LONG);
  assert.strictEqual(g.isWon(), false, 'long-term reached but not completed');
  g.cards.x.streak = 3;
  g.cards.y.streak = 3;
  assert.ok(g.isWon(), 'gauges full on easy (3 steps)');
  g.setStepsPerLevel(2); // on medium (long reached at 4): streak 3 => still medium
  assert.strictEqual(g.boxOf('x'), BOX.MEDIUM);
  assert.strictEqual(g.isWon(), false);
}

// --- Victory: all-correct play wins, in a plausible number of turns
{
  for (const [spl, minTurns] of [[1, 21], [2, 42], [3, 63]]) {
    const g = new MemoryGame(IDS, Math.random, spl);
    const { turns } = playPerfect(g);
    // Minimum 7 x 3 x spl; a few check-ups of already-mastered members may add
    // to it while the others finish.
    assert.ok(turns >= minTurns && turns <= minTurns + 15,
      `~${minTurns} face answers for spl=${spl} (got: ${turns})`);
    assert.strictEqual(g.progress(), 1);
    assert.strictEqual(g.stats.wrong, 0);
  }
}

// --- Progress: each consecutive correct answer is worth 1/(members x gauge), mistakes go down
{
  const g = new MemoryGame(IDS, rnd0); // medium: 6-step gauge
  assert.strictEqual(g.progress(), 0);
  const first = g.current();
  g.answer(first);
  assert.ok(Math.abs(g.progress() - 1 / (7 * 6)) < 1e-9);
  while (g.current() !== first) {
    if (g.nextIsFiller()) g.resolveFiller(true);
    else g.answer(g.current());
  }
  const before = g.progress();
  g.answer('WRONG');
  assert.ok(g.progress() < before, 'the meter goes down after a mistake');
}

// --- The engine is roster-agnostic: perfect 4-member game (easy)
{
  const g = new MemoryGame(['a', 'b', 'c', 'd'], Math.random, 1);
  const { turns } = playPerfect(g);
  assert.ok(turns >= 12 && turns <= 20, `~12 face answers minimum (got: ${turns})`);
}

// --- Never the same card twice in a row, quizzes included (chaotic game)
{
  const g = new MemoryGame(IDS);
  let prev = null;
  for (let i = 0; i < 400 && !g.isWon(); i++) {
    const cur = g.current();
    if (cur !== FILLER) {
      assert.notStrictEqual(cur, prev, 'the same face must not be asked twice in a row');
    }
    if (g.nextIsFiller()) g.resolveFiller(i % 4 === 0);
    else g.answer(i % 3 === 0 ? 'WRONG' : cur);
    prev = cur;
  }
}

// --- Serialization / resume (difficulty is reapplied on resume)
{
  const g = new MemoryGame(IDS, rnd0, 3);
  g.answer(g.current());
  g.answer('WRONG');
  const restored = MemoryGame.fromJSON(JSON.parse(JSON.stringify(g.toJSON())), rnd0, 3);
  assert.deepStrictEqual(restored.queue, g.queue);
  assert.deepStrictEqual(restored.stats, g.stats);
  assert.strictEqual(restored.current(), g.current());
  assert.strictEqual(restored.masterStreak, 9);
}

console.log('✔ all engine tests pass');
