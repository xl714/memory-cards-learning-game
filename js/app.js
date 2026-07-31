// Orchestration UI : écrans, rendu des questions, feedback OK/KO, stats, persistance.
(function () {
  'use strict';

  const SAVE_KEY = 'idol-memory-save-v1';
  const PREFS_KEY = 'idol-memory-prefs-v1';
  const FEEDBACK_MS_OK = 900;
  const FEEDBACK_MS_KO = 1700; // plus long : on laisse le temps de voir la bonne réponse
  const FEEDBACK_MS_MATH_OK = 600;  // les calculs s'enchaînent plus vite
  const FEEDBACK_MS_MATH_KO = 1200;
  const MAX_TURN_MS = 30000;   // au-delà, le temps d'une question n'est plus compté (joueur AFK)

  const $ = (sel) => document.querySelector(sel);
  const screens = {
    home: $('#screen-home'),
    game: $('#screen-game'),
    win: $('#screen-win'),
  };

  let game = null;
  let elapsedMs = 0;
  let turnStart = 0;
  let locked = false;   // bloque les clics pendant le feedback
  let nextTimer = null; // timeout vers la question suivante (annulé si on quitte/relance)

  // Préférences (persistées) :
  //  - scoreMode : 'global' (barre unique + jetons) ou 'perMember' (une barre par membre)
  //  - difficulty : bonnes réponses consécutives par niveau de mémoire
  const SPL = { facile: 1, moyen: 2, difficile: 3 };
  const prefs = { scoreMode: 'global', difficulty: 'moyen' };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY)) || {}); } catch (e) { /* défauts */ }
  if (!SPL[prefs.difficulty]) prefs.difficulty = 'moyen';

  function stepsPerLevel() {
    return SPL[prefs.difficulty];
  }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  }

  function applyScoreMode() {
    const per = prefs.scoreMode === 'perMember';
    $('.victory-meter').classList.toggle('hidden', per);
    $('#progress-tokens').classList.toggle('hidden', per);
    $('#member-bars').classList.toggle('hidden', !per);
    if (game) renderTokens();
  }

  // Applique la difficulté aux graduations et à la partie en cours (les séries
  // restent, seuls les seuils bougent — la partie peut même devenir gagnée).
  function applyDifficulty() {
    const total = SPL[prefs.difficulty] * MEMORY_LEVELS; // crans d'une jauge (3 niveaux à compléter)
    $('.victory-track').style.setProperty('--steps', GROUP.members.length * total);
    $('#member-bars').style.setProperty('--bar-steps', total);
    if (game) {
      game.setStepsPerLevel(SPL[prefs.difficulty]);
      renderTokens();
      if (game.isWon() && !screens.game.classList.contains('hidden')) showWin();
    }
  }

  const membersById = {};
  GROUP.members.forEach((m) => { membersById[m.id] = m; });

  // ---------- Helpers ----------

  function show(name) {
    Object.values(screens).forEach((s) => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');
  }

  function colorFor(name) {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h}, 60%, 45%)`;
  }

  // Portrait avec avatar de secours (initiale colorée) si l'image ne charge pas.
  function makePortrait(member) {
    const wrap = document.createElement('div');
    wrap.className = 'portrait';
    const img = document.createElement('img');
    img.src = member.img;
    img.alt = '';
    img.draggable = false;
    img.onerror = () => {
      const fb = document.createElement('div');
      fb.className = 'avatar-fallback';
      fb.style.background = colorFor(member.name);
      fb.textContent = member.name[0];
      wrap.replaceChildren(fb);
    };
    wrap.appendChild(img);
    return wrap;
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ game: game.toJSON(), elapsedMs }));
    } catch (e) { /* stockage indisponible : le jeu reste jouable sans sauvegarde */ }
  }

  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // La sauvegarde doit correspondre aux membres actuels du groupe.
      const ids = Object.keys(data.game.cards).sort().join(',');
      const expected = GROUP.members.map((m) => m.id).sort().join(',');
      if (ids !== expected) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  // ---------- Écran accueil ----------

  function renderHome() {
    $('#group-logo').textContent = GROUP.name;
    $('.tagline').textContent = `Apprends à reconnaître les ${GROUP.members.length} membres !`;
    const grid = $('#study-grid');
    grid.replaceChildren();
    GROUP.members.forEach((m, i) => {
      const card = document.createElement('div');
      card.className = 'study-card';
      card.style.setProperty('--i', i);
      card.appendChild(makePortrait(m));
      const name = document.createElement('span');
      name.className = 'member-name';
      name.textContent = m.name;
      card.appendChild(name);
      grid.appendChild(card);
    });
    $('#btn-resume').classList.toggle('hidden', loadSave() === null);
  }

  // ---------- Écran jeu ----------

  function renderVictoryMeter() {
    const pct = Math.round(game.progress() * 100);
    $('#victory-fill').style.width = pct + '%';
    $('#victory-pct').textContent = pct + '%';
  }

  // Rend la progression/régression visible, selon le mode d'affichage :
  //  - mode global : chip « +8,3 % » vert / « -X % » rouge + flash rouge de la barre ;
  //  - mode par membre : la barre du membre concerné rebondit, et flashe en rouge s'il régresse.
  function showScoreDelta(memberId, deltaSteps, correct) {
    if (prefs.scoreMode !== 'perMember') {
      if (deltaSteps !== 0) showVictoryDelta(deltaSteps / (GROUP.members.length * game.masterStreak));
      return;
    }
    const idx = GROUP.members.findIndex((m) => m.id === memberId);
    const bar = $('#member-bars').children[idx];
    if (!bar) return;
    const fill = bar.querySelector('.mbar-fill');

    // Barre déjà pleine (mémoire longue) et contrôle réussi : halo vert, la jauge ne peut plus monter.
    if (deltaSteps === 0) {
      if (correct) {
        fill.classList.add('gain-glow');
        setTimeout(() => fill.classList.remove('gain-glow'), 900);
      }
      return;
    }

    bar.classList.remove('bump');
    void bar.offsetWidth; // relance l'animation
    bar.classList.add('bump');

    // Badge « +1 » / « -N » qui s'envole au-dessus de la barre du membre
    let badge = bar.querySelector('.mbar-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'mbar-badge';
      bar.appendChild(badge);
    }
    badge.textContent = deltaSteps > 0 ? `+${deltaSteps}` : `−${Math.abs(deltaSteps)}`;
    badge.classList.toggle('loss', deltaSteps < 0);
    badge.classList.remove('show');
    void badge.offsetWidth;
    badge.classList.add('show');

    if (deltaSteps < 0) {
      fill.classList.add('regress');
      setTimeout(() => fill.classList.remove('regress'), 900);
    } else {
      fill.classList.add('gain-glow');
      setTimeout(() => fill.classList.remove('gain-glow'), 900);
    }
  }

  function showVictoryDelta(delta) {
    if (delta === 0) return;
    const chip = $('#victory-delta');
    const signed = (delta > 0 ? '+' : '−') + (Math.abs(delta) * 100).toFixed(1).replace('.', ',') + ' %';
    chip.textContent = signed;
    chip.className = 'victory-delta ' + (delta > 0 ? 'gain' : 'loss');
    void chip.offsetWidth; // relance l'animation
    chip.classList.add('show');
    if (delta < 0) {
      const fill = $('#victory-fill');
      fill.classList.add('regress');
      setTimeout(() => fill.classList.remove('regress'), 900);
    }
  }

  // Mode 2 : une barre verticale par membre — le remplissage monte d'un cran (1/3)
  // par bonne réponse consécutive, coloré selon la mémoire atteinte.
  function renderMemberBars() {
    const wrap = $('#member-bars');
    GROUP.members.forEach((m, i) => {
      let bar = wrap.children[i];
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'mbar';
        const track = document.createElement('div');
        track.className = 'mbar-track';
        track.appendChild(document.createElement('div')).className = 'mbar-fill';
        const photo = document.createElement('div');
        photo.className = 'mbar-photo';
        photo.appendChild(makePortrait(m));
        bar.append(track, photo);
        wrap.appendChild(bar);
      }
      const box = game.boxOf(m.id);
      const fill = bar.querySelector('.mbar-fill');
      fill.style.height = (game.stepsOf(m.id) / game.masterStreak) * 100 + '%';
      fill.classList.remove('box-1', 'box-2');
      if (box > 0) fill.classList.add('box-' + box);
    });
  }

  function renderTokens() {
    renderVictoryMeter();
    renderMemberBars();
    const box = $('#progress-tokens');
    GROUP.members.forEach((m, i) => {
      let token = box.children[i];
      if (!token) {
        token = document.createElement('div');
        token.className = 'token';
        box.appendChild(token);
      }
      const b = game.boxOf(m.id);
      const cls = `token box-${b}`;
      if (token.className.replace(' bump', '') !== cls) {
        token.className = cls + ' bump';
        setTimeout(() => token.classList.remove('bump'), 300);
      }
    });
  }

  function renderQuestion() {
    $('#turn-counter').textContent = '#' + (game.stats.asked + 1);
    renderTokens();

    if (game.nextIsFiller()) {
      renderMathQuestion();
      return;
    }

    const member = membersById[game.current()];

    // Photo courante (avec animation d'entrée)
    const card = $('#photo-card');
    card.classList.remove('slide-in', 'shake', 'math');
    void card.offsetWidth; // relance l'animation
    card.classList.add('slide-in');
    card.replaceChildren(makePortrait(member));
    $('.prompt').textContent = 'Qui est-ce ?';

    // Noms mélangés à chaque question (anti-mémorisation spatiale)
    const grid = $('#names-grid');
    grid.replaceChildren();
    shuffled(GROUP.members).forEach((m) => {
      const btn = document.createElement('button');
      btn.className = 'name-btn';
      btn.textContent = m.name;
      btn.dataset.id = m.id;
      btn.addEventListener('click', () => onAnswer(m.id));
      grid.appendChild(btn);
    });

    locked = false;
    turnStart = Date.now();
  }

  // ---------- Cartes d'interférence (mini-calculs) ----------

  function makeMathQuestion() {
    const r = (n) => Math.floor(Math.random() * n);
    const ops = [
      () => { const a = 2 + r(18), b = 2 + r(18); return { text: `${a} + ${b}`, answer: a + b }; },
      () => { const a = 6 + r(19), b = 2 + r(a - 2); return { text: `${a} − ${b}`, answer: a - b }; },
      () => { const a = 2 + r(8), b = 2 + r(8); return { text: `${a} × ${b}`, answer: a * b }; },
    ];
    const q = ops[r(ops.length)]();
    const choices = new Set([q.answer]);
    while (choices.size < 4) {
      const offset = (1 + r(4)) * (r(2) ? 1 : -1);
      if (q.answer + offset >= 0) choices.add(q.answer + offset);
    }
    q.choices = shuffled([...choices]);
    return q;
  }

  // Question d'interférence : occupe la mémoire entre deux passages d'un visage.
  // Sans effet sur les jauges — c'est l'espacement qui compte.
  function renderMathQuestion() {
    const q = makeMathQuestion();

    const card = $('#photo-card');
    card.classList.remove('slide-in', 'shake');
    void card.offsetWidth;
    card.classList.add('slide-in', 'math');
    const op = document.createElement('div');
    op.className = 'math-op';
    op.textContent = q.text;
    card.replaceChildren(op);
    $('.prompt').textContent = 'Petit calcul !';

    const grid = $('#names-grid');
    grid.replaceChildren();
    q.choices.forEach((n) => {
      const btn = document.createElement('button');
      btn.className = 'name-btn';
      btn.textContent = n;
      btn.addEventListener('click', () => onMathAnswer(n, q.answer));
      grid.appendChild(btn);
    });

    locked = false;
    turnStart = Date.now();
  }

  function onMathAnswer(value, expected) {
    if (locked) return;
    locked = true;

    elapsedMs += Math.min(Date.now() - turnStart, MAX_TURN_MS);
    const correct = value === expected;
    game.resolveFiller(correct);
    save();

    const buttons = [...document.querySelectorAll('.name-btn')];
    buttons.forEach((b) => { b.disabled = true; });
    const chosenBtn = buttons.find((b) => Number(b.textContent) === value);
    const correctBtn = buttons.find((b) => Number(b.textContent) === expected);

    stamp(correct ? 'ok' : 'ko');
    if (correct) {
      chosenBtn.classList.add('correct');
    } else {
      chosenBtn.classList.add('wrong');
      correctBtn.classList.add('correct', 'reveal');
    }

    nextTimer = setTimeout(renderQuestion, correct ? FEEDBACK_MS_MATH_OK : FEEDBACK_MS_MATH_KO);
  }

  function stamp(kind) {
    const fb = $('#feedback');
    fb.replaceChildren();
    const s = document.createElement('div');
    s.className = 'stamp ' + kind;
    s.textContent = kind === 'ok' ? 'OK' : 'KO';
    fb.appendChild(s);
    fb.classList.remove('hidden');
    setTimeout(() => fb.classList.add('hidden'), kind === 'ok' ? FEEDBACK_MS_OK : FEEDBACK_MS_KO);
  }

  function onAnswer(chosenId) {
    if (locked) return;
    locked = true;

    elapsedMs += Math.min(Date.now() - turnStart, MAX_TURN_MS);

    const currentId = game.current();
    const stepsBefore = game.stepsOf(currentId);
    const { correct } = game.answer(chosenId);
    save();
    showScoreDelta(currentId, game.stepsOf(currentId) - stepsBefore, correct);

    const buttons = [...document.querySelectorAll('.name-btn')];
    buttons.forEach((b) => { b.disabled = true; });
    const chosenBtn = buttons.find((b) => b.dataset.id === chosenId);
    const correctBtn = buttons.find((b) => b.dataset.id === currentId);

    stamp(correct ? 'ok' : 'ko');
    renderTokens();

    if (correct) {
      chosenBtn.classList.add('correct');
    } else {
      chosenBtn.classList.add('wrong');
      // Pédagogie : on montre la bonne réponse avant de passer à la suite
      correctBtn.classList.add('correct', 'reveal');
      $('#photo-card').classList.add('shake');
    }

    nextTimer = setTimeout(() => {
      if (game.isWon()) {
        showWin();
      } else {
        renderQuestion();
      }
    }, correct ? FEEDBACK_MS_OK : FEEDBACK_MS_KO);
  }

  // ---------- Écran victoire ----------

  function formatTime(ms) {
    const totalSec = Math.round(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  function showWin() {
    const { asked, correct } = game.stats;
    $('#win-text').innerHTML =
      `Les ${GROUP.members.length} membres de <strong>${GROUP.name}</strong> sont ancrés en mémoire long terme.`;
    $('#stat-asked').textContent = asked;
    $('#stat-accuracy').textContent = Math.round((correct / asked) * 100) + '%';
    $('#stat-time').textContent = formatTime(elapsedMs);
    clearSave();
    show('win');
  }

  // ---------- Démarrage ----------

  function startNewGame() {
    clearTimeout(nextTimer);
    game = new MemoryGame(GROUP.members.map((m) => m.id), Math.random, stepsPerLevel());
    elapsedMs = 0;
    save();
    show('game');
    renderQuestion();
  }

  function resumeGame(data) {
    clearTimeout(nextTimer);
    game = MemoryGame.fromJSON(data.game, Math.random, stepsPerLevel());
    elapsedMs = data.elapsedMs || 0;
    show('game');
    renderQuestion();
  }

  $('#btn-start').addEventListener('click', () => {
    clearSave();
    startNewGame();
  });

  $('#btn-resume').addEventListener('click', () => {
    const data = loadSave();
    if (data) resumeGame(data);
    else startNewGame();
  });

  $('#btn-quit').addEventListener('click', () => {
    clearTimeout(nextTimer);
    renderHome();
    show('home');
  });

  $('#btn-replay').addEventListener('click', () => startNewGame());

  // ---------- Réglages ----------

  const settingsDialog = $('#settings-dialog');

  function openSettings() {
    document.querySelectorAll('input[name="score-mode"]').forEach((r) => {
      r.checked = r.value === prefs.scoreMode;
    });
    document.querySelectorAll('input[name="difficulty"]').forEach((r) => {
      r.checked = r.value === prefs.difficulty;
    });
    settingsDialog.showModal();
  }

  $('#btn-settings-home').addEventListener('click', openSettings);
  $('#btn-settings-game').addEventListener('click', openSettings);

  document.querySelectorAll('input[name="score-mode"]').forEach((r) => {
    r.addEventListener('change', () => {
      prefs.scoreMode = r.value;
      savePrefs();
      applyScoreMode();
    });
  });

  document.querySelectorAll('input[name="difficulty"]').forEach((r) => {
    r.addEventListener('change', () => {
      prefs.difficulty = r.value;
      savePrefs();
      applyDifficulty();
    });
  });

  // Clic sur le fond = fermer
  settingsDialog.addEventListener('click', (e) => {
    if (e.target === settingsDialog) settingsDialog.close();
  });

  applyDifficulty();
  applyScoreMode();
  renderHome();
  show('home');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne / non supporté */ });
    });
  }
})();
