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
  assert.strictEqual(g.boxOf(first), BOX.SHORT);
  assert.strictEqual(g.cards[first].streak, 0);
  assert.strictEqual(g.queue.indexOf(first), 2, 'une carte ratée revient en position 2');
}

// --- Les seuils suivent la difficulté : facile 1/niveau, moyen 2, difficile 3
{
  for (const [spl, toMedium, toLong] of [[1, 1, 2], [2, 2, 4], [3, 3, 6]]) {
    const g = new MemoryGame(['x'], rnd0, spl);
    assert.strictEqual(g.streakToLong, toLong);
    for (let i = 0; i < toLong; i++) {
      const expected = i >= toLong ? BOX.LONG : i >= toMedium ? BOX.MEDIUM : BOX.SHORT;
      assert.strictEqual(g.boxOf('x'), expected, `spl=${spl}, streak=${i}`);
      g.answer('x');
    }
    assert.strictEqual(g.boxOf('x'), BOX.LONG, `spl=${spl} : longue après ${toLong} réussites`);
    assert.ok(g.isWon());
  }
}

// --- Une carte en mémoire moyenne est replanifiée plus loin qu'une carte courte
{
  const g = new MemoryGame(IDS, rnd0, 1); // facile : 1 réussite -> moyenne
  const first = g.current();
  g.answer(first);
  assert.strictEqual(g.boxOf(first), BOX.MEDIUM);
  assert.strictEqual(g.queue.indexOf(first), 4, 'carte moyenne replanifiée vers la position 4');
}

// --- Un KO fait retomber une carte montée en mémoire courte
{
  const g = new MemoryGame(IDS, rnd0, 1);
  const first = g.current();
  g.answer(first); // -> moyenne
  while (g.current() !== first) g.answer(g.current());
  g.answer('WRONG');
  assert.strictEqual(g.boxOf(first), BOX.SHORT);
  assert.strictEqual(g.cards[first].streak, 0);
}

// --- Changement de difficulté en cours de partie : les séries restent, les seuils bougent
{
  const g = new MemoryGame(['x', 'y'], rnd0, 3); // difficile
  g.cards.x.streak = 2;
  // streak 2 : encore courte en difficile (seuil 3)…
  assert.strictEqual(g.boxOf('x'), BOX.SHORT);
  g.setStepsPerLevel(1); // …mais longue en facile (jauge de 2)
  assert.strictEqual(g.boxOf('x'), BOX.LONG);
  g.setStepsPerLevel(2); // et moyenne en moyen (seuil 2, jauge de 4)
  assert.strictEqual(g.boxOf('x'), BOX.MEDIUM);
}

// --- Victoire : tout juste => partie gagnée, en un nombre de tours plausible
{
  for (const [spl, minTurns] of [[1, 14], [2, 28], [3, 42]]) {
    const g = new MemoryGame(IDS, Math.random, spl);
    let turns = 0;
    while (!g.isWon()) {
      assert.ok(++turns < 700, `la partie (spl=${spl}) doit converger`);
      g.answer(g.current());
    }
    assert.ok(turns >= minTurns, `minimum théorique ${minTurns} pour spl=${spl} (obtenu : ${turns})`);
    assert.strictEqual(g.progress(), 1);
    assert.strictEqual(g.stats.wrong, 0);
  }
}

// --- Progression : chaque réussite consécutive vaut 1/(membres x jauge), une erreur redescend
{
  const g = new MemoryGame(IDS, rnd0); // moyen : jauge de 4
  assert.strictEqual(g.progress(), 0);
  const first = g.current();
  g.answer(first);
  assert.ok(Math.abs(g.progress() - 1 / (7 * 4)) < 1e-9);
  while (g.current() !== first) g.answer(g.current());
  const before = g.progress();
  g.answer('WRONG');
  assert.ok(g.progress() < before, 'le curseur redescend après une erreur');
}

// --- Le moteur est agnostique de l'effectif : partie parfaite à 4 membres (facile)
{
  const g = new MemoryGame(['a', 'b', 'c', 'd'], Math.random, 1);
  let turns = 0;
  while (!g.isWon()) {
    assert.ok(++turns < 300, 'la partie à 4 doit converger');
    g.answer(g.current());
  }
  assert.ok(turns >= 8, `minimum théorique 4 x 2 = 8 (obtenu : ${turns})`);
}

// --- Jamais deux fois la même carte de suite (sur une partie chaotique)
{
  const g = new MemoryGame(IDS);
  let prev = null;
  for (let i = 0; i < 300 && !g.isWon(); i++) {
    const cur = g.current();
    assert.notStrictEqual(cur, prev, 'la même carte ne doit pas être posée deux fois de suite');
    g.answer(i % 3 === 0 ? 'WRONG' : cur);
    prev = cur;
  }
}

// --- Sérialisation / reprise (la difficulté est réappliquée à la reprise)
{
  const g = new MemoryGame(IDS, rnd0, 3);
  g.answer(g.current());
  g.answer('WRONG');
  const restored = MemoryGame.fromJSON(JSON.parse(JSON.stringify(g.toJSON())), rnd0, 3);
  assert.deepStrictEqual(restored.queue, g.queue);
  assert.deepStrictEqual(restored.stats, g.stats);
  assert.strictEqual(restored.current(), g.current());
  assert.strictEqual(restored.streakToLong, 6);
}

console.log('✔ tous les tests du moteur passent');
