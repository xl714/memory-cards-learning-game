// Moteur de répétition espacée (système Leitner à 3 boîtes) — logique pure, sans DOM.
//
// Boîtes : 0 = mémoire courte, 1 = mémoire moyenne, 2 = mémoire longue.
// La difficulté fixe `stepsPerLevel` : le nombre de bonnes réponses consécutives
// nécessaires pour monter d'un niveau de mémoire (facile 1, moyen 2, difficile 3).
// La boîte est DÉRIVÉE de la série : streak >= 2 x stepsPerLevel -> longue,
// streak >= stepsPerLevel -> moyenne, sinon courte. Une erreur remet la série à zéro.
//
// La partie est une file de cartes ; la question courante est la tête de file.
// Après chaque réponse, la carte est réinsérée plus ou moins loin selon sa boîte :
//   - courte  -> position 2 (revient comme 3e question)
//   - moyenne -> position 4-5
//   - longue  -> position 10-12 (contrôles rares)
// Victoire dès que toutes les cartes sont en boîte longue.

const BOX = { SHORT: 0, MEDIUM: 1, LONG: 2 };
const MEMORY_LEVELS = 2; // deux montées : courte -> moyenne -> longue

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
  // memberIds : identifiants de cartes ; rnd : aléa injectable (tests) ;
  // stepsPerLevel : bonnes réponses consécutives par niveau de mémoire.
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

  // Série totale requise pour la mémoire longue (= nombre de crans d'une jauge)
  get streakToLong() {
    return this.spl * MEMORY_LEVELS;
  }

  // Changer la difficulté en cours de partie : les séries restent, les seuils bougent.
  setStepsPerLevel(n) {
    this.spl = n;
  }

  current() {
    return this.queue[0] ?? null;
  }

  boxOf(id) {
    const s = this.cards[id].streak;
    if (s >= this.streakToLong) return BOX.LONG;
    if (s >= this.spl) return BOX.MEDIUM;
    return BOX.SHORT;
  }

  // Crans acquis par la carte, bornés à la jauge pleine
  stepsOf(id) {
    return Math.min(this.cards[id].streak, this.streakToLong);
  }

  isWon() {
    return Object.keys(this.cards).every((id) => this.boxOf(id) === BOX.LONG);
  }

  // Progression vers la victoire, entre 0 et 1 : chaque membre doit remplir sa jauge
  // (streakToLong crans) ; une erreur remet sa série à zéro et le curseur redescend.
  progress() {
    const ids = Object.keys(this.cards);
    const done = ids.reduce((sum, id) => sum + this.stepsOf(id), 0);
    return done / (ids.length * this.streakToLong);
  }

  // Enregistre la réponse pour la carte courante et replanifie sa prochaine apparition.
  // Renvoie { correct, card } pour piloter le feedback UI.
  answer(chosenId) {
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
    let pos = Math.min(GAP[this.boxOf(card.id)](this.rnd), this.queue.length);
    // Ne jamais reposer la même carte immédiatement s'il y a d'autres cartes en attente.
    if (pos === 0 && this.queue.length > 0) pos = 1;
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

if (typeof module !== 'undefined') module.exports = { MemoryGame, BOX, MEMORY_LEVELS, shuffle };
