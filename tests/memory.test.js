// Test rapide du moteur de répétition espacée : node tests/memory.test.js
const assert = require('assert');
const { MemoryGame, BOX } = require('../js/memory.js');

const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
// Aléa déterministe : toujours 0 => pas de mélange, gaps minimaux (moyenne=4, longue=10)
const rnd0 = () => 0;

// --- KO : retour en mémoire courte, réinsertion en position 2 (revient comme 3e question)
{
  const g = new MemoryGame(IDS, rnd0);
  const first = g.current();
  const { correct } = g.answer('WRONG');
  assert.strictEqual(correct, false);
  assert.strictEqual(g.cards[first].box, BOX.SHORT);
  assert.strictEqual(g.cards[first].streak, 0);
  assert.strictEqual(g.queue.indexOf(first), 2, 'une carte ratée revient en position 2');
}

// --- OK : promotion courte -> moyenne, réinsertion vers position 4
{
  const g = new MemoryGame(IDS, rnd0);
  const first = g.current();
  const { correct } = g.answer(first);
  assert.strictEqual(correct, true);
  assert.strictEqual(g.cards[first].box, BOX.MEDIUM);
  assert.strictEqual(g.cards[first].streak, 1);
  assert.strictEqual(g.queue.indexOf(first), 4, 'une carte réussie revient vers la position 4');
}

// --- 3 OK d'affilée : promotion en mémoire longue
{
  const g = new MemoryGame(IDS, rnd0);
  const target = g.current();
  for (let guard = 0; guard < 100 && g.cards[target].box !== BOX.LONG; guard++) {
    const cur = g.current();
    g.answer(cur === target ? target : cur);
  }
  assert.strictEqual(g.cards[target].box, BOX.LONG);
  assert.strictEqual(g.cards[target].streak, 3);
  assert.ok(g.queue.indexOf(target) >= 6, 'une carte en mémoire longue est replanifiée loin');
}

// --- Un KO fait retomber une carte de la mémoire moyenne/longue en courte
{
  const g = new MemoryGame(IDS, rnd0);
  const first = g.current();
  g.answer(first); // -> moyenne
  while (g.current() !== first) g.answer(g.current());
  g.answer('WRONG');
  assert.strictEqual(g.cards[first].box, BOX.SHORT);
  assert.strictEqual(g.cards[first].streak, 0);
}

// --- Victoire : tout juste => toutes les cartes finissent en longue, partie gagnée
{
  const g = new MemoryGame(IDS);
  let turns = 0;
  while (!g.isWon()) {
    assert.ok(++turns < 500, 'la partie doit converger');
    g.answer(g.current());
  }
  assert.ok(Object.values(g.cards).every((c) => c.box === BOX.LONG));
  assert.strictEqual(g.stats.asked, turns);
  assert.strictEqual(g.stats.correct, turns);
  assert.strictEqual(g.stats.wrong, 0);
  // Minimum théorique : 7 cartes x 3 réussites = 21. Les contrôles des cartes déjà en
  // mémoire longue (réaffichées rarement) ajoutent quelques questions en plus.
  console.log(`victoire en ${turns} questions (minimum théorique : 21)`);
  assert.ok(turns >= 21 && turns <= 60, `nombre de questions plausible (${turns})`);
}

// --- Jamais deux fois la même carte de suite (sur une partie chaotique)
{
  const g = new MemoryGame(IDS);
  let prev = null;
  for (let i = 0; i < 300 && !g.isWon(); i++) {
    const cur = g.current();
    assert.notStrictEqual(cur, prev, 'la même carte ne doit pas être posée deux fois de suite');
    // une réponse sur trois est fausse
    g.answer(i % 3 === 0 ? 'WRONG' : cur);
    prev = cur;
  }
}

// --- Progression vers la victoire : 100 % = nb membres x 3 étapes, une erreur fait redescendre
{
  const g = new MemoryGame(IDS, rnd0);
  assert.strictEqual(g.progress(), 0);
  const first = g.current();
  g.answer(first); // 1 réussite sur 21 étapes
  assert.ok(Math.abs(g.progress() - 1 / 21) < 1e-9);
  while (g.current() !== first) g.answer(g.current());
  const before = g.progress();
  g.answer('WRONG'); // la série de `first` retombe à 0 : le curseur redescend
  assert.ok(g.progress() < before);
  // Partie parfaite : la progression finit à 100 %
  const g2 = new MemoryGame(IDS);
  while (!g2.isWon()) g2.answer(g2.current());
  assert.strictEqual(g2.progress(), 1);
}

// --- Sérialisation / reprise
{
  const g = new MemoryGame(IDS, rnd0);
  g.answer(g.current());
  g.answer('WRONG');
  const restored = MemoryGame.fromJSON(JSON.parse(JSON.stringify(g.toJSON())), rnd0);
  assert.deepStrictEqual(restored.queue, g.queue);
  assert.deepStrictEqual(restored.stats, g.stats);
  assert.strictEqual(restored.current(), g.current());
}

console.log('✔ tous les tests du moteur passent');
