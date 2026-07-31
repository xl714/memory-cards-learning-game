// Orchestration UI : écrans, rendu des questions, feedback OK/KO, stats, persistance.
(function () {
  'use strict';

  const SAVE_KEY = 'idol-memory-save-v1';
  const FEEDBACK_MS_OK = 900;
  const FEEDBACK_MS_KO = 1700; // plus long : on laisse le temps de voir la bonne réponse
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
    $('.tagline').textContent = GROUP.tagline;
    const grid = $('#study-grid');
    grid.replaceChildren();
    GROUP.members.forEach((m) => {
      const card = document.createElement('div');
      card.className = 'study-card';
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

  // Rend la progression/régression visible : « +4,8 % » en vert quand un membre monte
  // d'une mémoire (court -> moyen -> long), « -9,5 % » en rouge + barre rouge quand une
  // erreur le fait retomber en mémoire courte.
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

  function renderTokens() {
    renderVictoryMeter();
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
    const id = game.current();
    const member = membersById[id];

    $('#turn-counter').textContent = '#' + (game.stats.asked + 1);
    renderTokens();

    // Photo courante (avec animation d'entrée)
    const card = $('#photo-card');
    card.classList.remove('slide-in', 'shake');
    void card.offsetWidth; // relance l'animation
    card.classList.add('slide-in');
    card.replaceChildren(makePortrait(member));

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
    const progressBefore = game.progress();
    const { correct } = game.answer(chosenId);
    save();
    showVictoryDelta(game.progress() - progressBefore);

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
    $('#stat-asked').textContent = asked;
    $('#stat-accuracy').textContent = Math.round((correct / asked) * 100) + '%';
    $('#stat-time').textContent = formatTime(elapsedMs);
    clearSave();
    show('win');
  }

  // ---------- Démarrage ----------

  function startNewGame() {
    clearTimeout(nextTimer);
    game = new MemoryGame(GROUP.members.map((m) => m.id));
    elapsedMs = 0;
    save();
    show('game');
    renderQuestion();
  }

  function resumeGame(data) {
    clearTimeout(nextTimer);
    game = MemoryGame.fromJSON(data.game);
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

  renderHome();
  show('home');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne / non supporté */ });
    });
  }
})();
