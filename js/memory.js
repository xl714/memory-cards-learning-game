// Spaced-repetition engine (3-box Leitner system) — pure logic, no DOM.
//
// Boxes: 0 = short-term memory, 1 = medium-term, 2 = long-term.
// The difficulty sets `stepsPerLevel`: how many consecutive correct answers it
// takes to COMPLETE each memory level (easy 1, medium 2, hard 3).
// There are 3 levels, so a member's gauge holds 3 x stepsPerLevel steps:
//   - complete short  (streak >= spl)     -> the member enters medium-term memory
//   - complete medium (streak >= 2 x spl) -> the member enters long-term memory
//   - complete long   (streak >= 3 x spl) -> member mastered; those last steps are
//     earned during the spaced check-ups of long-term memory.
// The box is DERIVED from the streak; a mistake resets the streak to zero.
//
// A game is a queue of cards; the current question is the head of the queue.
// After each answer the card is reinserted nearer or farther based on its box:
//   - short  -> position 2 (comes back as the 3rd question)
//   - medium -> position 4-5
//   - long   -> position 10-12 (rare check-ups)
// Spacing is GUARANTEED: when the queue is too short to provide the intended gap
// (small roster), it is padded with interference cards (mini quizzes, FILLER
// token) that keep the player's memory busy between two sightings of a face.
// Victory when every gauge is full (all levels completed).

const BOX = { SHORT: 0, MEDIUM: 1, LONG: 2 };
const MEMORY_LEVELS = 3; // short, medium, long — each must be completed
const FILLER = '#math';  // interference card in the queue (cannot collide with a member id)

const GAP = {
  [BOX.SHORT]: () => 2,
  [BOX.MEDIUM]: (rnd) => 4 + Math.floor(rnd() * 2),  // 4-5
  [BOX.LONG]: (rnd) => 10 + Math.floor(rnd() * 3),   // 10-12
};

function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class MemoryGame {
  // memberIds: card identifiers; rnd: injectable randomness (tests);
  // stepsPerLevel: consecutive correct answers per memory level.
  constructor(memberIds, rnd = Math.random, stepsPerLevel = 2) {
    this.rnd = rnd;
    this.spl = stepsPerLevel;
    this.cards = {};
    memberIds.forEach((id) => {
      this.cards[id] = { id, streak: 0 };
    });
    this.queue = shuffle(memberIds, rnd);
    this.stats = { asked: 0, correct: 0, wrong: 0 };
  }

  // Total streak to fill a gauge: 3 levels x stepsPerLevel steps
  get masterStreak() {
    return this.spl * MEMORY_LEVELS;
  }

  // Change difficulty mid-game: streaks stay, thresholds move.
  setStepsPerLevel(n) {
    this.spl = n;
  }

  current() {
    return this.queue[0] ?? null;
  }

  nextIsFiller() {
    return this.queue[0] === FILLER;
  }

  // Consumes the current interference card (mini quiz); no effect on the gauges.
  resolveFiller(correct) {
    if (this.queue[0] !== FILLER) return;
    this.queue.shift();
    this.stats.fillerAsked = (this.stats.fillerAsked || 0) + 1;
    if (correct) this.stats.fillerCorrect = (this.stats.fillerCorrect || 0) + 1;
  }

  boxOf(id) {
    const s = this.cards[id].streak;
    if (s >= this.spl * 2) return BOX.LONG;   // short and medium completed
    if (s >= this.spl) return BOX.MEDIUM;     // short completed
    return BOX.SHORT;
  }

  // Steps earned by the card, capped at a full gauge
  stepsOf(id) {
    return Math.min(this.cards[id].streak, this.masterStreak);
  }

  // A member is mastered when their gauge is full: long-term memory must be
  // completed too (through its spaced check-ups), not merely reached.
  isWon() {
    return Object.keys(this.cards).every((id) => this.cards[id].streak >= this.masterStreak);
  }

  // Progress toward victory, between 0 and 1: every member must fill their gauge
  // (masterStreak steps); a mistake resets their streak and the meter goes down.
  progress() {
    const ids = Object.keys(this.cards);
    const done = ids.reduce((sum, id) => sum + this.stepsOf(id), 0);
    return done / (ids.length * this.masterStreak);
  }

  // Records the answer for the current card and schedules its next appearance.
  // Returns { correct, card } to drive the UI feedback.
  answer(chosenId) {
    if (this.nextIsFiller()) throw new Error('interference card at the head of the queue: use resolveFiller()');
    const id = this.queue.shift();
    const card = this.cards[id];
    const correct = chosenId === id;

    this.stats.asked++;
    if (correct) {
      this.stats.correct++;
      card.streak++;
    } else {
      this.stats.wrong++;
      card.streak = 0;
    }

    if (!this.isWon()) this._reinsert(card);
    return { correct, card };
  }

  _reinsert(card) {
    const pos = GAP[this.boxOf(card.id)](this.rnd);
    // Guaranteed spacing: when the queue cannot provide the intended gap, pad
    // it with interference cards before reinserting the card.
    while (this.queue.length < pos) this.queue.push(FILLER);
    this.queue.splice(pos, 0, card.id);
  }

  toJSON() {
    return { cards: this.cards, queue: this.queue, stats: this.stats };
  }

  static fromJSON(data, rnd = Math.random, stepsPerLevel = 2) {
    const game = Object.create(MemoryGame.prototype);
    game.rnd = rnd;
    game.spl = stepsPerLevel;
    game.cards = data.cards;
    game.queue = data.queue;
    game.stats = data.stats;
    return game;
  }
}

if (typeof module !== 'undefined') module.exports = { MemoryGame, BOX, MEMORY_LEVELS, FILLER, shuffle };
