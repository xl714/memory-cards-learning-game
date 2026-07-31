// UI orchestration: screens, question rendering, OK/KO feedback, stats, persistence.
(function () {
  'use strict';

  const SAVE_KEY = 'idol-memory-save-v1';
  const PREFS_KEY = 'idol-memory-prefs-v1';
  const FEEDBACK_MS_OK = 900;
  const FEEDBACK_MS_KO = 1700; // longer: leaves time to see the correct answer
  const FEEDBACK_MS_MATH_OK = 600;  // math cards chain faster
  const FEEDBACK_MS_MATH_KO = 1200;
  const FEEDBACK_MS_HANGUL_OK = 1000; // time to read the revealed romanization
  const FEEDBACK_MS_HANGUL_KO = 1600;
  const MAX_TURN_MS = 30000;   // beyond this, question time is no longer counted (AFK player)

  const $ = (sel) => document.querySelector(sel);
  const screens = {
    home: $('#screen-home'),
    game: $('#screen-game'),
    win: $('#screen-win'),
  };

  let game = null;
  let elapsedMs = 0;
  let turnStart = 0;
  let locked = false;   // blocks clicks during feedback
  let nextTimer = null; // timeout to the next question (cancelled on quit/restart)

  // Preferences (persisted):
  //  - scoreMode: 'global' (single bar + tokens) or 'perMember' (one bar per member)
  //  - difficulty: consecutive correct answers per memory level
  //  - fillerType: interleaved-card type ('math' or 'hangul')
  const SPL = { facile: 1, moyen: 2, difficile: 3 };
  const prefs = { scoreMode: 'global', difficulty: 'moyen', fillerType: 'math' };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY)) || {}); } catch (e) { /* defaults */ }
  if (!SPL[prefs.difficulty]) prefs.difficulty = 'moyen';
  if (!['math', 'hangul'].includes(prefs.fillerType)) prefs.fillerType = 'math';

  // Hangul mode requires Korean names in the data; otherwise fall back to math.
  function fillerType() {
    return prefs.fillerType === 'hangul' && GROUP.members.some((m) => m.hangul) ? 'hangul' : 'math';
  }

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

  // Applies the difficulty to the graduations and the ongoing game (streaks
  // stay, only thresholds move — the game may even become won).
  function applyDifficulty() {
    const total = SPL[prefs.difficulty] * MEMORY_LEVELS; // steps in a gauge (3 levels to complete)
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

  // Portrait with a fallback avatar (colored initial) when the image fails to load.
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
    } catch (e) { /* storage unavailable: the game stays playable without saving */ }
  }

  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // The save must match the current group members.
      const ids = Object.keys(data.game.cards).sort().join(',');
      const expected = GROUP.members.map((m) => m.id).sort().join(',');
      if (ids !== expected) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  // ---------- Home screen ----------

  function renderHome() {
    $('#group-logo').textContent = GROUP.name;
    $('.tagline').textContent = `Learn to recognize all ${GROUP.members.length} members!`;
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

  // ---------- Game screen ----------

  function renderVictoryMeter() {
    const pct = Math.round(game.progress() * 100);
    $('#victory-fill').style.width = pct + '%';
    $('#victory-pct').textContent = pct + '%';
  }

  // Makes progress/regression visible, depending on the score display mode:
  //  - global mode: green '+8.3%' / red '-X%' chip + red flash of the bar;
  //  - per-member mode: the member's bar bounces, and flashes red on regression.
  function showScoreDelta(memberId, deltaSteps, correct) {
    if (prefs.scoreMode !== 'perMember') {
      if (deltaSteps !== 0) showVictoryDelta(deltaSteps / (GROUP.members.length * game.masterStreak));
      return;
    }
    const idx = GROUP.members.findIndex((m) => m.id === memberId);
    const bar = $('#member-bars').children[idx];
    if (!bar) return;
    const fill = bar.querySelector('.mbar-fill');

    // Gauge already full (long-term memory) and a passed check-up: green glow, it cannot rise further.
    if (deltaSteps === 0) {
      if (correct) {
        fill.classList.add('gain-glow');
        setTimeout(() => fill.classList.remove('gain-glow'), 900);
      }
      return;
    }

    bar.classList.remove('bump');
    void bar.offsetWidth; // restarts the animation
    bar.classList.add('bump');

    // '+1' / '-N' badge flying up above the member's bar
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
    const signed = (delta > 0 ? '+' : '−') + (Math.abs(delta) * 100).toFixed(1) + '%';
    chip.textContent = signed;
    chip.className = 'victory-delta ' + (delta > 0 ? 'gain' : 'loss');
    void chip.offsetWidth; // restarts the animation
    chip.classList.add('show');
    if (delta < 0) {
      const fill = $('#victory-fill');
      fill.classList.add('regress');
      setTimeout(() => fill.classList.remove('regress'), 900);
    }
  }

  // Mode 2: one vertical bar per member — the fill climbs one step per
  // consecutive correct answer, colored by the memory level reached.
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
    renderFillerScore();
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
      renderFillerQuestion();
      return;
    }

    const member = membersById[game.current()];

    // Current photo (with entrance animation)
    const card = $('#photo-card');
    card.classList.remove('slide-in', 'shake', 'math');
    void card.offsetWidth; // restarts the animation
    card.classList.add('slide-in');
    card.replaceChildren(makePortrait(member));
    $('.prompt').textContent = 'Who is this?';

    // Names shuffled on every question (prevents spatial memorization)
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

  // ---------- Interference cards (math or hangul) ----------

  // '🧮 3/4' pill next to the score: correct answers on interleaved cards
  function renderFillerScore() {
    const el = $('#filler-score');
    const asked = game && (game.stats.fillerAsked || 0);
    if (!asked) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const score = `${game.stats.fillerCorrect || 0}/${asked}`;
    el.innerHTML = fillerType() === 'hangul'
      ? `한 <em class="romaja-inline">han</em> ${score}`
      : `🧮 ${score}`;
  }

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
    return {
      display: q.text,
      prompt: 'Quick math!',
      answer: String(q.answer),
      choices: shuffled([...choices].map(String)),
      hangul: false,
    };
  }

  // A group name written in hangul: find which member spells that way.
  function makeHangulQuestion() {
    const candidates = GROUP.members.filter((m) => m.hangul);
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    return {
      display: target.hangul,
      prompt: 'Whose name is this?',
      answer: target.name,
      choices: shuffled(GROUP.members.map((m) => m.name)),
      hangul: true,
      // Revealed only with the answer: showing it during the question would give the name away.
      romaja: target.romaja || target.name.toLowerCase(),
    };
  }

  // Interference question: keeps memory busy between two sightings of a face.
  // No effect on the gauges — the spacing is what matters.
  function renderFillerQuestion() {
    const q = fillerType() === 'hangul' ? makeHangulQuestion() : makeMathQuestion();

    const card = $('#photo-card');
    card.classList.remove('slide-in', 'shake');
    void card.offsetWidth;
    card.classList.add('slide-in', 'math');
    const op = document.createElement('div');
    op.className = 'math-op' + (q.hangul ? ' hangul' : '');
    op.textContent = q.display;
    card.replaceChildren(op);
    $('.prompt').textContent = q.prompt;

    const grid = $('#names-grid');
    grid.replaceChildren();
    q.choices.forEach((label) => {
      const btn = document.createElement('button');
      btn.className = 'name-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => onFillerAnswer(label, q));
      grid.appendChild(btn);
    });

    locked = false;
    turnStart = Date.now();
  }

  function onFillerAnswer(chosen, q) {
    if (locked) return;
    locked = true;

    elapsedMs += Math.min(Date.now() - turnStart, MAX_TURN_MS);
    const correct = chosen === q.answer;
    game.resolveFiller(correct);
    save();
    renderFillerScore();

    // Along with the answer, reveal how the hangul reads (italic below the name)
    if (q.hangul) {
      const romaja = document.createElement('em');
      romaja.className = 'romaja';
      romaja.textContent = q.romaja;
      $('.math-op')?.appendChild(romaja);
    }

    const buttons = [...document.querySelectorAll('.name-btn')];
    buttons.forEach((b) => { b.disabled = true; });
    const chosenBtn = buttons.find((b) => b.textContent === chosen);
    const correctBtn = buttons.find((b) => b.textContent === q.answer);

    stamp(correct ? 'ok' : 'ko');
    if (correct) {
      chosenBtn.classList.add('correct');
    } else {
      chosenBtn.classList.add('wrong');
      correctBtn.classList.add('correct', 'reveal');
    }

    nextTimer = setTimeout(renderQuestion, correct
      ? (q.hangul ? FEEDBACK_MS_HANGUL_OK : FEEDBACK_MS_MATH_OK)
      : (q.hangul ? FEEDBACK_MS_HANGUL_KO : FEEDBACK_MS_MATH_KO));
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
      // Pedagogy: show the correct answer before moving on
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

  // ---------- Victory screen ----------

  function formatTime(ms) {
    const totalSec = Math.round(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  function showWin() {
    const { asked, correct, fillerAsked, fillerCorrect } = game.stats;
    $('#win-text').innerHTML =
      `All ${GROUP.members.length} members of <strong>${GROUP.name}</strong> are anchored in long-term memory.`;
    $('#stat-asked').textContent = asked;
    $('#stat-accuracy').textContent = Math.round((correct / asked) * 100) + '%';
    $('#stat-time').textContent = formatTime(elapsedMs);
    $('#stat-filler-wrap').classList.toggle('hidden', !fillerAsked);
    if (fillerAsked) {
      $('#stat-filler-label').textContent = fillerType() === 'hangul' ? 'Hangul' : 'Math';
      $('#stat-filler').textContent = `${fillerCorrect || 0}/${fillerAsked}`;
    }
    clearSave();
    show('win');
  }

  // ---------- Startup ----------

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

  // ---------- Settings ----------

  const settingsDialog = $('#settings-dialog');

  function openSettings() {
    document.querySelectorAll('input[name="score-mode"]').forEach((r) => {
      r.checked = r.value === prefs.scoreMode;
    });
    document.querySelectorAll('input[name="difficulty"]').forEach((r) => {
      r.checked = r.value === prefs.difficulty;
    });
    document.querySelectorAll('input[name="filler-type"]').forEach((r) => {
      r.checked = r.value === prefs.fillerType;
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

  document.querySelectorAll('input[name="filler-type"]').forEach((r) => {
    r.addEventListener('change', () => {
      prefs.fillerType = r.value;
      savePrefs();
      if (game) renderFillerScore(); // refreshes the pill icon
    });
  });

  // Click on the backdrop = close
  settingsDialog.addEventListener('click', (e) => {
    if (e.target === settingsDialog) settingsDialog.close();
  });

  applyDifficulty();
  applyScoreMode();
  renderHome();
  show('home');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline / unsupported */ });
    });
  }
})();
