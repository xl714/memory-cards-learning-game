// Moteur de répétition espacée (système Leitner à 3 boîtes) — logique pure, sans DOM.
//
// Boîtes : 0 = mémoire courte, 1 = mémoire moyenne, 2 = mémoire longue.
// La partie est une file de cartes ; la question courante est la tête de file.
// Après chaque réponse, la carte est réinsérée plus ou moins loin selon sa boîte :
//   - KO            -> boîte 0, réinsertion en position 2 (revient comme 3e question)
//   - OK (boîte 0)  -> boîte 1, réinsertion vers position 4-5
//   - OK x3 de suite -> boîte 2, réinsertion vers position 10-12
// Victoire dès que toutes les cartes sont en boîte 2.

const BOX = { SHORT: 0, MEDIUM: 1, LONG: 2 };
const STREAK_TO_LONG = 3;

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
  // memberIds : liste des identifiants de cartes ; rnd : source d'aléa injectable (tests)
  constructor(memberIds, rnd = Math.random) {
    this.rnd = rnd;
    this.cards = {};
    memberIds.forEach((id) => {
      this.cards[id] = { id, box: BOX.SHORT, streak: 0 };
    });
    this.queue = shuffle(memberIds, rnd);
    this.stats = { asked: 0, correct: 0, wrong: 0 };
  }

  current() {
    return this.queue[0] ?? null;
  }

  boxOf(id) {
    return this.cards[id].box;
  }

  isWon() {
    return Object.values(this.cards).every((c) => c.box === BOX.LONG);
  }

  // Progression vers la victoire, entre 0 et 1 : chaque membre doit atteindre
  // STREAK_TO_LONG réussites d'affilée, donc 100 % = nb membres x STREAK_TO_LONG étapes.
  // Une erreur remet la série du membre à zéro : le curseur redescend d'autant.
  progress() {
    const cards = Object.values(this.cards);
    const done = cards.reduce((sum, c) => sum + Math.min(c.streak, STREAK_TO_LONG), 0);
    return done / (cards.length * STREAK_TO_LONG);
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
      if (card.streak >= STREAK_TO_LONG) card.box = BOX.LONG;
      else if (card.box === BOX.SHORT) card.box = BOX.MEDIUM;
    } else {
      this.stats.wrong++;
      card.streak = 0;
      card.box = BOX.SHORT;
    }

    if (!this.isWon()) this._reinsert(card);
    return { correct, card };
  }

  _reinsert(card) {
    let pos = Math.min(GAP[card.box](this.rnd), this.queue.length);
    // Ne jamais reposer la même carte immédiatement s'il y a d'autres cartes en attente.
    if (pos === 0 && this.queue.length > 0) pos = 1;
    this.queue.splice(pos, 0, card.id);
  }

  toJSON() {
    return { cards: this.cards, queue: this.queue, stats: this.stats };
  }

  static fromJSON(data, rnd = Math.random) {
    const game = Object.create(MemoryGame.prototype);
    game.rnd = rnd;
    game.cards = data.cards;
    game.queue = data.queue;
    game.stats = data.stats;
    return game;
  }
}

if (typeof module !== 'undefined') module.exports = { MemoryGame, BOX, STREAK_TO_LONG, shuffle };
