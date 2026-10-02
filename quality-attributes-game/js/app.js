/* Trade-off Arena — app shell: teams, turns, hidden picks, reveal and scores. */
(function () {
  "use strict";

  var C = window.ARENA_CONTENT;
  var SIM = window.ResultDaySim;
  var STORE_KEY = "tradeoff-arena-v1";
  var SLOTS = [
    { color: "mango", name: "Mango" },
    { color: "guava", name: "Guava" },
    { color: "banana", name: "Banana" },
    { color: "jamun", name: "Jamun" }
  ];
  var POINTS = { warm: { correct: 10, partial: 5 }, final: { correct: 20, partial: 10 } };
  var TIMER_SECONDS = 60;

  var $app = document.getElementById("app");
  var $top = document.getElementById("topbar");

  /* ------------------------------------------------------------------ state */
  function freshRound() { return { stage: "intro", q: 0, picks: {}, order: [], overrides: {}, revealIdx: 0, revealed: 0 }; }
  function freshState() {
    return {
      v: 1, screen: "home",
      teams: SLOTS.slice(0, 3).map(function (s, i) { return { id: "t" + i, name: s.name, color: s.color }; }),
      rounds: { warm: freshRound(), final: freshRound() }
    };
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || s.v !== 1 || !Array.isArray(s.teams) || !s.rounds || !s.rounds.warm || !s.rounds.final) return null;
      return s;
    } catch (e) { return null; }
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable: keep going */ } }

  var state = load() || freshState();
  var ui = { selected: null, locking: false, timer: null, timerTick: 0, drawer: false, armed: null, armTimer: 0, sim: null, simResult: null, shownScores: {} };

  /* ------------------------------------------------------------------ helpers */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function R(rid) { return C.rounds[rid]; }
  function team(id) { for (var i = 0; i < state.teams.length; i++) if (state.teams[i].id === id) return state.teams[i]; return null; }
  function initial(t) { return esc((t.name || "?").trim().charAt(0).toUpperCase() || "?"); }
  function avatar(t, cls) { return '<span class="avatar t-' + t.color + " " + (cls || "") + '">' + initial(t) + "</span>"; }
  function currentRound() { return state.screen === "warm" || state.screen === "final" ? state.screen : null; }
  function optionOf(q, key) { for (var i = 0; i < q.options.length; i++) if (q.options[i].key === key) return q.options[i]; return null; }
  function pointsFor(rid, q, key) { var o = optionOf(q, key); return (o && POINTS[rid][o.verdict]) || 0; }
  function anyPicks() { return Object.keys(state.rounds.warm.picks).length + Object.keys(state.rounds.final.picks).length > 0; }

  function turnTeam(rid, i) {
    var r = state.rounds[rid], q = R(rid).questions[i];
    var pick = r.picks[q.id];
    if (pick && team(pick.team)) return team(pick.team);
    if (r.overrides[q.id] && team(r.overrides[q.id])) return team(r.overrides[q.id]);
    var offset = rid === "final" ? R("warm").questions.length : 0;
    return state.teams[(offset + i) % state.teams.length];
  }

  function roundScore(rid, tid) {
    var r = state.rounds[rid], s = 0;
    R(rid).questions.forEach(function (q, i) {
      if (i >= r.revealed) return;
      var p = r.picks[q.id];
      if (p && p.team === tid) s += pointsFor(rid, q, p.opt);
    });
    return s;
  }
  function totalScore(tid) { return roundScore("warm", tid) + roundScore("final", tid); }
  function maxRound(rid) { return R(rid).questions.length * POINTS[rid].correct; }

  var QLABEL = { performance: "Performance", availability: "Availability", modifiability: "Modifiability", security: "Security" };
  function qtag(q) { return '<span class="qtag">' + QLABEL[q] + "</span>"; }

  var ICON = {
    arrow: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    back: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    lock: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    undo: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    play: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
    home: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    list: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    x: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    plus: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    crown: '<svg class="crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18 2 7l5.5 4L12 4l4.5 7L22 7l-1 11z" fill="#F5B301" stroke="#B57F00" stroke-width="1.5" stroke-linejoin="round"/><rect x="3" y="18.5" width="18" height="2.5" rx="1" fill="#B57F00"/></svg>'
  };
  var MARK = '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="13" height="13" rx="4" fill="#14B8A6"/><rect x="17" y="2" width="13" height="13" rx="4" fill="#3B82F6"/><rect x="2" y="17" width="13" height="13" rx="4" fill="#8B5CF6"/><rect x="17" y="17" width="13" height="13" rx="4" fill="#EC4899"/><path d="M9.5 8.5h13M16 8.5v15" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>';

  var ART = {
    warm: '<svg class="art" viewBox="0 0 170 170" aria-hidden="true">' +
      '<circle cx="100" cy="70" r="66" fill="#FFEDD5"/>' +
      '<rect x="38" y="48" width="104" height="58" rx="14" fill="#F97316"/>' +
      '<rect x="48" y="58" width="22" height="18" rx="4" fill="#FFF7ED"/><rect x="76" y="58" width="22" height="18" rx="4" fill="#FFF7ED"/><rect x="104" y="58" width="26" height="18" rx="4" fill="#FFF7ED"/>' +
      '<rect x="38" y="86" width="104" height="6" fill="#C2410C"/>' +
      '<circle cx="62" cy="108" r="10" fill="#0F1B2D"/><circle cx="62" cy="108" r="4" fill="#E2E8F2"/><circle cx="118" cy="108" r="10" fill="#0F1B2D"/><circle cx="118" cy="108" r="4" fill="#E2E8F2"/>' +
      '<g transform="rotate(-14 70 132)"><rect x="40" y="118" width="64" height="30" rx="6" fill="#14B8A6"/><circle cx="40" cy="133" r="6" fill="#FFEDD5"/><circle cx="104" cy="133" r="6" fill="#FFEDD5"/><path d="M58 128h28M58 138h18" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>' +
      "</svg>",
    final: '<svg class="art" viewBox="0 0 170 170" aria-hidden="true">' +
      '<circle cx="100" cy="70" r="66" fill="#E2EDFB"/>' +
      '<g transform="rotate(8 96 84)"><rect x="56" y="30" width="80" height="104" rx="10" fill="#fff" stroke="#1D5FA8" stroke-width="3"/>' +
      '<path d="M70 52h52M70 66h40M70 80h48M70 94h30" stroke="#B9C6D8" stroke-width="5" stroke-linecap="round"/></g>' +
      '<circle cx="62" cy="118" r="26" fill="#EC4899"/><text x="62" y="127" text-anchor="middle" font-family="Gabarito, sans-serif" font-weight="900" font-size="26" fill="#fff">A+</text>' +
      '<path d="M120 112l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2z" fill="#F5B301"/>' +
      "</svg>"
  };

  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  /* ------------------------------------------------------------------ confetti */
  function confetti(opts) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    opts = opts || {};
    var cv = document.getElementById("confetti"), ctx = cv.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var colors = opts.colors || ["#14B8A6", "#3B82F6", "#8B5CF6", "#EC4899", "#F97316", "#F5B301", "#4D9A12"];
    var n = opts.count || 160, ox = opts.x != null ? opts.x : innerWidth / 2, oy = opts.y != null ? opts.y : innerHeight * 0.35;
    var parts = [];
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = (opts.spread || 9) * (0.4 + Math.random());
      parts.push({ x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6, r: 4 + Math.random() * 5, c: colors[i % colors.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 0 });
    }
    var t0 = performance.now();
    cancelAnimationFrame(confetti._raf);
    (function tick(now) {
      var el = (now - t0) / 1000;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(function (p) {
        p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - el / 2.8);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        ctx.restore();
      });
      if (el < 2.8) confetti._raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(t0);
  }

  /* ------------------------------------------------------------------ top bar */
  function renderTop() {
    var rid = currentRound();
    var mid = "";
    var activeTeam = null;
    if (rid) {
      var r = state.rounds[rid];
      mid = '<span class="round-label">' + esc(R(rid).name) + "</span>";
      if (r.stage === "play" || r.stage === "done") {
        mid += '<div class="dots" aria-label="Decisions">' + R(rid).questions.map(function (q, i) {
          var p = r.picks[q.id], t = p ? team(p.team) : null;
          var cls = "dot" + (p ? " locked t-" + (t ? t.color : "mango") : "") + (r.stage === "play" && i === r.q ? " current" : "");
          return '<button class="' + cls + '" data-act="jump" data-i="' + i + '" ' + (p ? "disabled" : "") + ' aria-label="Decision ' + (i + 1) + (p ? ", locked" : "") + '">' + (i + 1) + "</button>";
        }).join("") + "</div>";
        if (r.stage === "play") activeTeam = turnTeam(rid, r.q);
      }
    }
    var playing = rid && state.rounds[rid].stage === "play";
    var chips = state.teams.map(function (t) {
      var sc = totalScore(t.id);
      var bump = ui.shownScores[t.id] != null && ui.shownScores[t.id] !== sc;
      ui.shownScores[t.id] = sc;
      var tag = playing ? "button" : "span";
      return "<" + tag + ' class="team-chip t-' + t.color + (activeTeam && activeTeam.id === t.id ? " active" : "") + '"' +
        (playing ? ' data-act="set-turn" data-team="' + t.id + '" title="Give this decision to ' + esc(t.name) + '"' : "") + ">" +
        avatar(t) + "<span>" + esc(t.name) + '</span><span class="score' + (bump ? " bump" : "") + '">' + sc + "</span></" + tag + ">";
    }).join("");
    var actions = "";
    if (rid === "final" && ["intro", "play", "done"].indexOf(state.rounds.final.stage) >= 0) actions += '<button class="btn btn-ghost btn-sm" data-act="facts">' + ICON.list + "Facts</button>";
    if (state.screen !== "home") actions += '<button class="btn btn-ghost btn-sm" data-act="home">' + ICON.home + "Home</button>";
    $top.innerHTML =
      '<button class="brand" data-act="home" aria-label="Trade-off Arena home">' + MARK + "<span>Trade-off Arena<small>CSE 444 · Lecture 2</small></span></button>" +
      '<div class="topbar-mid">' + mid + "</div>" +
      '<div class="team-chips">' + chips + "</div>" +
      (actions ? '<div class="topbar-actions">' + actions + "</div>" : "");
  }

  /* ------------------------------------------------------------------ screens */
  function render() {
    var rid = currentRound();
    var stage = rid ? state.rounds[rid].stage : null;
    if (ui.sim && !(rid === "final" && stage === "sim")) { ui.sim.destroy(); ui.sim = null; }
    renderTop();
    renderDrawer();
    if (rid === "final" && stage === "sim" && ui.sim) return;   // keep the running simulation
    var html;
    if (!rid) html = homeHTML();
    else if (stage === "intro") html = introHTML(rid);
    else if (stage === "play") html = playHTML(rid);
    else if (stage === "done") html = doneHTML(rid);
    else if (stage === "sim") html = '<section class="screen" id="sim-root"></section>';
    else if (stage === "report") html = reportScreenHTML();
    else if (stage === "reveal") html = revealHTML(rid);
    else if (stage === "scores") html = scoresHTML(rid);
    var r = rid ? state.rounds[rid] : null;
    var key = [state.screen, stage, r ? (stage === "play" ? r.q : stage === "reveal" ? r.revealIdx : "") : ""].join("|");
    var settled = key === ui.lastKey;
    ui.lastKey = key;
    $app.innerHTML = html;
    if (settled) { var sc = $app.querySelector(".screen"); if (sc) sc.classList.add("settled"); }
    afterRender(rid, stage, settled);
  }

  function afterRender(rid, stage, settled) {
    if (stage === "sim") {
      ui.simResult = SIM.compute(simParams());
      ui.sim = SIM.mount(document.getElementById("sim-root"), ui.simResult, {
        onReport: function () { state.rounds.final.stage = "report"; save(); render(); scrollTop(); }
      });
    }
    if (stage === "report") SIM.attachReport($app, ui.simResult || SIM.compute(simParams()));
    if (stage === "scores") {
      var fills = $app.querySelectorAll(".fill[data-w]");
      if (settled) fills.forEach(function (f) { f.style.transition = "none"; f.style.width = f.dataset.w; });
      else {
        requestAnimationFrame(function () { fills.forEach(function (f) { f.style.width = f.dataset.w; }); });
        setTimeout(function () { confetti(); }, 500);
      }
    }
    if (stage === "play") updateTimer();
  }

  function scrollTop() { window.scrollTo({ top: 0, behavior: "smooth" }); }

  /* ---------- home ---------- */
  function roundStatus(rid) {
    var r = state.rounds[rid], n = R(rid).questions.length, locked = Object.keys(r.picks).length;
    if (r.stage === "scores") return '<span class="pill good">Finished</span>';
    if (r.stage === "reveal") return '<span class="pill warn">Revealing ' + Math.min(n, r.revealed) + " of " + n + "</span>";
    if (r.stage === "sim" || r.stage === "report") return '<span class="pill warn">Simulation ready</span>';
    if (locked === n) return '<span class="pill warn">All locked</span>';
    if (locked) return '<span class="pill warn">' + locked + " of " + n + " locked</span>";
    return '<span class="pill">Not started</span>';
  }

  function homeHTML() {
    var teamsLocked = anyPicks();
    var rows = state.teams.map(function (t) {
      return '<div class="team-row t-' + t.color + '">' + avatar(t) +
        '<input id="team-name-' + t.id + '" data-team-name="' + t.id + '" value="' + esc(t.name) + '" maxlength="18" aria-label="Team name" autocomplete="off">' +
        (state.teams.length > 2 && !teamsLocked ? '<button class="icon-btn" data-act="team-remove" data-team="' + t.id + '" aria-label="Remove ' + esc(t.name) + '">' + ICON.x + "</button>" : "<span></span>") +
        "</div>";
    }).join("");
    var canAdd = state.teams.length < 4 && !teamsLocked;
    var startedFinal = state.rounds.final.stage !== "intro" || Object.keys(state.rounds.final.picks).length;
    var warmDone = state.rounds.warm.stage === "scores";

    function roundCard(rid, cta) {
      var Rd = R(rid);
      return '<button class="round-card ' + rid + '" data-act="open-round" data-round="' + rid + '">' + ART[rid] +
        '<span class="eyebrow">' + esc(Rd.kicker) + "</span><h2>" + esc(Rd.name) + '</h2><p class="lead" style="font-size:17px;max-width:30ch">' + esc(Rd.tagline) + "</p>" +
        '<span class="meta"><span class="pill">' + esc(Rd.when) + '</span><span class="pill">' + Rd.questions.length + " decisions</span>" + roundStatus(rid) + "</span>" +
        '<span class="btn go">' + cta + ICON.arrow + "</span></button>";
    }

    return '<section class="screen">' +
      '<div class="hero"><span class="eyebrow">CSE 444 · Software Architecture and Design Patterns · Lecture 2</span>' +
        '<h1>Trade-off <span class="swash">Arena</span></h1>' +
        '<p class="lead">Teams take turns making design decisions for systems under pressure. Nobody sees an answer until every decision is locked in. Every fix has a price: find out which ones your class is willing to pay.</p>' +
        '<div class="quality-strip"><span class="q-performance">' + qtag("performance") + '</span><span class="q-availability">' + qtag("availability") +
        '</span><span class="q-modifiability">' + qtag("modifiability") + '</span><span class="q-security">' + qtag("security") + "</span></div></div>" +
      '<div class="rounds">' +
        roundCard("warm", Object.keys(state.rounds.warm.picks).length ? "Continue warm-up" : "Start warm-up") +
        roundCard("final", startedFinal ? "Continue Result Day" : warmDone ? "Start Result Day" : "Open Result Day") +
      "</div>" +
      '<div class="home-grid">' +
        '<div class="card teams-editor"><div class="row between"><h2 style="font-size:26px">Teams</h2><span class="muted">2 to 4 teams, they take turns</span></div>' + rows +
          '<div class="row">' + (canAdd ? '<button class="btn btn-ghost btn-sm" data-act="team-add">' + ICON.plus + "Add a team</button>" : "") +
          (teamsLocked ? '<span class="muted" style="font-size:14px">Names can change at any time. To add or remove teams, reset everything first.</span>' : "") + "</div></div>" +
        '<div class="card" style="display:grid;gap:18px"><h2 style="font-size:26px">How to run it</h2><ol class="steps">' +
          "<li><div><b>Name the teams.</b><span class=\"muted\">Each decision goes to the next team in turn. One student per team comes up to choose.</span></div></li>" +
          "<li><div><b>Before the lecture: Eid Ticket Rush.</b><span class=\"muted\">Six decisions where gut feeling lies. The answers are revealed only after the last pick.</span></div></li>" +
          "<li><div><b>Teach Lecture 2.</b><span class=\"muted\">Every warm-up answer points to the slides that explain it.</span></div></li>" +
          "<li><div><b>After the lecture: Result Day.</b><span class=\"muted\">Eight harder decisions, then a live simulation of the class’s design, a mark sheet, and the answers.</span></div></li>" +
        "</ol>" +
        '<div class="row"><button class="btn btn-danger btn-sm' + (ui.armed === "reset-all" ? " armed" : "") + '" data-act="reset-all">' +
          (ui.armed === "reset-all" ? "Click again to erase all picks and scores" : "Reset everything") + "</button></div></div>" +
      "</div></section>";
  }

  /* ---------- intro ---------- */
  function factsHTML(rid) {
    return '<div class="facts">' + R(rid).facts.map(function (f) {
      return '<div class="fact"><div class="k">' + esc(f.k) + '</div><div class="v">' + esc(f.v) + "</div>" + (f.note ? '<div class="n">' + esc(f.note) + "</div>" : "") + "</div>";
    }).join("") + "</div>";
  }

  function introHTML(rid) {
    var Rd = R(rid), r = state.rounds[rid];
    var started = Object.keys(r.picks).length > 0;
    var order = Rd.questions.map(function (q, i) { return turnTeam(rid, i); });
    var seen = [], orderChips = "";
    order.forEach(function (t) { if (seen.indexOf(t.id) < 0) { seen.push(t.id); orderChips += '<span class="team-chip t-' + t.color + '">' + avatar(t) + esc(t.name) + "</span>"; } });
    return '<section class="screen"><div class="intro">' +
      '<div class="card" style="display:grid;gap:18px">' +
        '<span class="eyebrow">' + esc(Rd.kicker) + " · " + esc(Rd.when) + "</span>" +
        "<h1>" + esc(Rd.name) + "</h1>" +
        '<p class="lead">' + esc(Rd.story) + "</p>" +
        '<div class="turn-order"><span class="muted" style="font-weight:700">Turn order:</span>' + orderChips + "</div>" +
        '<p class="muted" style="font-size:14px">Scoring: ' + POINTS[rid].correct + " points for the best choice, " + POINTS[rid].partial + " for a half-right one, 0 for the rest.</p>" +
        '<div class="row"><button class="btn btn-lg" data-act="start-round">' + (started ? "Continue the round" : "Start the round") + ICON.arrow + "</button>" +
        '<button class="btn btn-ghost" data-act="home">' + ICON.back + "Back</button></div>" +
      "</div>" +
      '<div class="card" style="display:grid;gap:14px"><span class="eyebrow">The facts</span>' + factsHTML(rid) +
        (rid === "final" ? '<p class="muted" style="font-size:14px">Open these at any time with the <b>Facts</b> button at the top.</p>' : "") + "</div>" +
      "</div></section>";
  }

  /* ---------- question pieces ---------- */
  function highlightCode(src) {
    return esc(src)
      .replace(/(&quot;[^&]*?&quot;)/g, '<span class="str">$1</span>')
      .replace(/\b(if|elif|else|GET|return)\b/g, '<span class="kw">$1</span>');
  }

  function extrasHTML(q) {
    var h = "";
    if (q.chips) h += '<div class="chips">' + q.chips.map(function (c) { return '<span class="chip">' + esc(c) + "</span>"; }).join("") + "</div>";
    if (q.formula) h += '<div class="formula">' + esc(q.formula) + "</div>";
    if (q.table) {
      h += '<div><div class="table-wrap"><table class="cmp"><thead><tr>' + q.table.head.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        q.table.rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") +
        "</tbody></table></div>" + (q.table.note ? '<div class="table-note">' + esc(q.table.note) + "</div>" : "") + "</div>";
    }
    if (q.chain) {
      h += '<div style="display:grid;gap:8px"><div class="chain">' + q.chain.map(function (n, i) {
        return (i ? '<span class="chain-arrow"></span>' : "") + '<div class="chain-node"><b>' + esc(n.name) + "</b><span>" + esc(n.a) + "</span>" + (n.note ? "<small>" + esc(n.note) + "</small>" : "") + "</div>";
      }).join("") + '</div><div class="chain-total">' + esc(q.chainTotal) + "</div></div>";
    }
    if (q.code) h += '<pre class="code">' + highlightCode(q.code) + "</pre>";
    return h;
  }

  /* ---------- play ---------- */
  function playHTML(rid) {
    var r = state.rounds[rid], qs = R(rid).questions, i = r.q, q = qs[i];
    var t = turnTeam(rid, i);
    var pick = r.picks[q.id];
    var sel = pick ? pick.opt : ui.selected;
    var opts = q.options.map(function (o) {
      var isSel = sel === o.key;
      return '<button class="option' + (isSel ? " selected t-" + t.color : (sel && ui.locking ? " dim" : "")) + '" data-act="select" data-key="' + o.key + '"' +
        (ui.locking ? " disabled" : "") + ' aria-pressed="' + isSel + '"><span class="letter">' + o.key + "</span><span>" + esc(o.text) + "</span></button>";
    }).join("");
    var stamp = "";
    if (ui.locking && pick) {
      stamp = '<div class="stamp-layer t-' + t.color + '"><div class="stamp">Locked in!<small>' + esc(t.name) + " chose " + pick.opt + "</small></div></div>";
    }
    return '<section class="screen q-' + q.quality + '">' +
      '<div class="turn-banner t-' + t.color + '">' + avatar(t) +
        '<div class="who"><b>Team ' + esc(t.name) + ", your turn</b><span>Send one person up to choose. Decision " + (i + 1) + " of " + qs.length + ".</span></div>" +
        '<div style="display:grid;justify-items:center;gap:2px"><button class="timer" data-act="timer" aria-label="Start or stop the 60 second timer"></button><span class="timer-label">Timer</span></div>' +
      "</div>" +
      '<article class="card question">' +
        '<div class="row between">' + qtag(q.quality) + '<span class="mono muted" style="font-size:14px">Decision ' + (i + 1) + " / " + qs.length + "</span></div>" +
        "<h2>" + esc(q.title) + "</h2>" +
        '<p class="prompt">' + esc(q.prompt) + "</p>" +
        extrasHTML(q) +
        '<div class="options">' + opts + "</div>" +
        '<div class="lock-bar"><span class="hint"><span class="kbd">A</span>–<span class="kbd">D</span> to choose, <span class="kbd">Enter</span> to lock in. No answers until every decision is locked.</span>' +
          '<div class="row">' + (r.order.length ? '<button class="btn btn-ghost" data-act="undo"' + (ui.locking ? " disabled" : "") + ">" + ICON.undo + "Undo last pick</button>" : "") +
          '<button class="btn btn-lg btn-team t-' + t.color + '" data-act="lock"' + (!sel || ui.locking ? " disabled" : "") + ">" + ICON.lock + "Lock in" + (sel ? " " + sel : "") + "</button></div></div>" +
        stamp +
      "</article></section>";
  }

  /* ---------- timer ---------- */
  function updateTimer() {
    var el = $app.querySelector(".timer");
    if (!el) return;
    var T = ui.timer, left = TIMER_SECONDS, done = false;
    if (T && T.running) { left = Math.max(0, Math.ceil((T.end - Date.now()) / 1000)); if (left === 0) { T.running = false; T.done = true; } }
    if (T && T.done) { left = 0; done = true; }
    var c = 2 * Math.PI * 22, off = c * (1 - left / TIMER_SECONDS);
    el.classList.toggle("done", done);
    el.innerHTML = '<svg viewBox="0 0 52 52"><circle class="track" cx="26" cy="26" r="22" fill="none" stroke-width="5"/><circle class="arc" cx="26" cy="26" r="22" fill="none" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg><span>' + (done ? "0" : (T && T.running ? left : "60")) + "</span>";
  }
  function stopTimer() { ui.timer = null; }
  setInterval(function () { if (ui.timer && ui.timer.running) updateTimer(); }, 250);

  /* ---------- done ---------- */
  function doneHTML(rid) {
    var r = state.rounds[rid], Rd = R(rid), n = Rd.questions.length;
    var cards = Rd.questions.map(function (q, i) {
      var p = r.picks[q.id], t = team(p.team) || state.teams[0], o = optionOf(q, p.opt);
      return '<div class="locked-card q-' + q.quality + '" style="animation-delay:' + (i * 0.05) + 's"><div class="row between"><span class="n">#' + (i + 1) + "</span>" + qtag(q.quality) + "</div>" +
        "<h3>" + esc(q.title) + '</h3><div class="pick"><span class="letter-sm t-' + t.color + '">' + p.opt + "</span>" + esc(t.name) + "</div>" +
        '<div class="muted" style="font-size:14px">' + esc(o.text) + "</div></div>";
    }).join("");
    var warm = rid === "warm";
    return '<section class="screen">' +
      '<div class="card big-cta"><span class="eyebrow">' + esc(Rd.name) + "</span><h1>All " + n + " decisions are locked.</h1>" +
        '<p class="lead">Nobody knows the answers yet. ' + (warm ? "Time to find out which gut feelings were right." : "Now we run result day against the design your class just built.") + "</p>" +
        '<div class="row" style="justify-content:center"><button class="btn btn-ghost" data-act="undo">' + ICON.undo + "Undo last pick</button>" +
        (warm ? '<button class="btn btn-lg" data-act="start-reveal">Reveal the answers' + ICON.arrow + "</button>"
              : '<button class="btn btn-lg" data-act="run-sim">' + ICON.play + "Run Result Day</button>") + "</div></div>" +
      '<div class="locked-grid">' + cards + "</div></section>";
  }

  /* ---------- simulation & report ---------- */
  function simParams() {
    var r = state.rounds.final, p = {};
    R("final").questions.forEach(function (q) {
      var pk = r.picks[q.id], o = pk && optionOf(q, pk.opt);
      if (o && o.sim) for (var k in o.sim) p[k] = o.sim[k];
    });
    return p;
  }

  function reportScreenHTML() {
    var res = ui.simResult || (ui.simResult = SIM.compute(simParams()));
    return '<section class="screen">' +
      '<div class="row between"><div><span class="eyebrow">Round 2 · Result Day</span><h1 style="font-size:clamp(30px,4vw,46px);font-weight:900">How your design survived</h1></div>' +
      '<div class="row"><button class="btn btn-ghost" data-act="run-sim">' + ICON.play + "Replay the simulation</button>" +
      '<button class="btn btn-lg" data-act="start-reveal">Reveal the answers' + ICON.arrow + "</button></div></div>" +
      SIM.reportHTML(res) + "</section>";
  }

  /* ---------- reveal ---------- */
  function revealHTML(rid) {
    var r = state.rounds[rid], Rd = R(rid), qs = Rd.questions, i = r.revealIdx, q = qs[i];
    var p = r.picks[q.id], t = (p && team(p.team)) || state.teams[0];
    var shown = i < r.revealed;
    var pts = p ? pointsFor(rid, q, p.opt) : 0;
    var opts = q.options.map(function (o) {
      var mine = p && p.opt === o.key;
      var cls = "option";
      var badge = "";
      if (shown) {
        cls += o.verdict === "correct" ? " is-correct" : o.verdict === "partial" ? " is-partial" : o.verdict === "trap" ? " is-trap" : " is-wrong";
        if (o.verdict === "correct") badge = '<span class="badge best">Best choice</span>';
        else if (o.verdict === "partial") badge = '<span class="badge half">Half right</span>';
        else if (o.verdict === "trap") badge = '<span class="badge gut">Gut feeling</span>';
      }
      var by = mine ? '<span class="picked-by t-' + t.color + '">' + avatar(t) + esc(t.name) + (shown ? '<span class="points-pop' + (pts ? "" : " zero") + '">+' + pts + "</span>" : "") + "</span>" : "";
      return '<div class="' + cls + '" style="cursor:default">' + by + badge + '<span class="letter">' + o.key + "</span><span>" + esc(o.text) +
        (shown ? '<span class="why">' + esc(o.why) + "</span>" : "") + "</span></div>";
    }).join("");

    var side;
    if (shown) {
      var o = p && optionOf(q, p.opt);
      var verdictLine = !o ? "" : o.verdict === "correct" ? "Team " + esc(t.name) + " got it: +" + pts :
        o.verdict === "partial" ? "Team " + esc(t.name) + " was half right: +" + pts :
        o.verdict === "trap" ? "Team " + esc(t.name) + " went with the gut feeling: +0" : "Team " + esc(t.name) + ": +0";
      side = '<aside class="card explain"><span class="eyebrow">Why</span><h3>' + esc(q.reveal.headline) + "</h3><p>" + esc(q.reveal.why) + "</p>" +
        '<div class="proof"><div class="big">' + esc(q.reveal.proof) + '</div><div class="cap">' + esc(q.reveal.proofCaption) + "</div></div>" +
        '<div class="row between"><span class="slide-ref">Lecture 2 · ' + esc(q.reveal.slide) + '</span><span class="team-chip t-' + t.color + '">' + avatar(t) + verdictLine + "</span></div></aside>";
    } else {
      side = '<aside class="card mystery"><div class="qmark">?</div><h3 style="font-size:26px;font-weight:900">Team ' + esc(t.name) + " picked " + (p ? p.opt : "–") + ".</h3>" +
        '<p class="muted">Best choice, half right, or gut feeling?</p><button class="btn btn-lg btn-quality" data-act="reveal-show">Reveal the answer</button></aside>';
    }

    var last = i === qs.length - 1;
    var dots = '<div class="dots">' + qs.map(function (qq, k) {
      var pk = r.picks[qq.id], tt = pk ? team(pk.team) : null;
      return '<button class="dot' + (k < r.revealed && tt ? " locked t-" + tt.color : "") + (k === i ? " current" : "") + '" data-act="reveal-jump" data-i="' + k + '"' + (k > r.revealed ? " disabled" : "") + ' aria-label="Answer ' + (k + 1) + '">' + (k + 1) + "</button>";
    }).join("") + "</div>";

    return '<section class="screen q-' + q.quality + '">' +
      '<div class="reveal-nav"><span class="eyebrow">' + esc(Rd.name) + " · Answer " + (i + 1) + " of " + qs.length + "</span>" + dots + "</div>" +
      '<div class="reveal"><article class="card question"><div class="row between">' + qtag(q.quality) + "</div><h2>" + esc(q.title) + '</h2><p class="prompt" style="font-size:17px">' + esc(q.prompt) + "</p>" +
        '<div class="options">' + opts + "</div></article>" + side + "</div>" +
      '<div class="reveal-nav"><button class="btn btn-ghost" data-act="reveal-prev"' + (i === 0 ? " disabled" : "") + ">" + ICON.back + "Previous</button>" +
        (shown ? '<button class="btn btn-lg" data-act="reveal-next">' + (last ? "See the scores" : "Next answer") + ICON.arrow + "</button>"
               : '<button class="btn btn-lg btn-quality" data-act="reveal-show">Reveal the answer</button>') +
      "</div></section>";
  }

  /* ---------- scores ---------- */
  function scoresHTML(rid) {
    var Rd = R(rid), max = maxRound(rid);
    var rows = state.teams.map(function (t) { return { t: t, s: roundScore(rid, t.id), tot: totalScore(t.id) }; });
    rows.sort(function (a, b) { return b.s - a.s || b.tot - a.tot; });
    var top = rows[0].s, winners = rows.filter(function (x) { return x.s === top; });
    var names = winners.map(function (w) { return esc(w.t.name); });
    var title = winners.length === 1 ? "Team " + names[0] + " wins " + esc(Rd.name) + "!" :
      winners.length === 2 ? "It’s a tie: " + names[0] + " and " + names[1] + "!" :
      "A " + (winners.length === 3 ? "three" : "four") + "-way tie: " + names.slice(0, -1).join(", ") + " and " + names[names.length - 1] + "!";
    var bars = rows.map(function (x) {
      var w = max ? Math.max(4, x.s / max * 100) : 4;
      return '<div class="score-row t-' + x.t.color + '"><div class="name">' + avatar(x.t) + "<span>" + esc(x.t.name) + "</span>" + (x.s === top ? ICON.crown : "") + "</div>" +
        '<div class="bar"><div class="fill" data-w="' + w.toFixed(1) + '%"></div></div><div class="pts">' + x.s + "</div></div>";
    }).join("");
    var totals = rid === "final" ? '<p class="muted" style="font-weight:700">Season totals, both rounds: ' + state.teams.map(function (t) { return esc(t.name) + " " + totalScore(t.id); }).join(" · ") + "</p>" : "";
    var actions = rid === "warm"
      ? '<button class="btn btn-ghost" data-act="home">' + ICON.home + 'Home</button><button class="btn btn-lg" data-act="open-round" data-round="final">After the lecture: Result Day' + ICON.arrow + "</button>"
      : '<button class="btn btn-ghost" data-act="home">' + ICON.home + 'Home</button><button class="btn btn-ghost" data-act="show-report">See the simulation report</button>';
    return '<section class="screen">' +
      '<div class="card winner-banner">' + ICON.crown.replace('class="crown"', 'class="crown" style="width:56px;height:56px"') + '<span class="eyebrow">' + esc(Rd.kicker) + "</span><h1>" + title + "</h1>" +
        '<p class="lead">' + (rid === "warm" ? "Keep the traps in mind. The lecture explains every one of them." : "Every fix had a price. Your class just paid some of them.") + "</p></div>" +
      '<div class="card scoreboard"><div class="row between"><h2 style="font-size:24px">' + esc(Rd.name) + ' scores</h2><span class="muted">out of ' + max + "</span></div>" + bars + totals + "</div>" +
      '<div class="row between"><button class="btn btn-danger btn-sm' + (ui.armed === "replay-" + rid ? " armed" : "") + '" data-act="replay-round">' +
        (ui.armed === "replay-" + rid ? "Click again to clear this round" : "Replay this round") + '</button><div class="row">' + actions + "</div></div></section>";
  }

  /* ---------- facts drawer ---------- */
  function renderDrawer() {
    var holder = document.getElementById("drawer-root");
    if (!holder) { holder = document.createElement("div"); holder.id = "drawer-root"; document.body.appendChild(holder); }
    if (!ui.drawer || currentRound() !== "final") { holder.innerHTML = ""; return; }
    holder.innerHTML = '<div class="drawer-scrim" data-act="facts"></div><aside class="drawer" role="dialog" aria-label="Result Day facts">' +
      '<div class="row between"><h2 style="font-size:26px">Result Day facts</h2><button class="icon-btn" data-act="facts" aria-label="Close">' + ICON.x + "</button></div>" +
      factsHTML("final") + "</aside>";
  }

  /* ------------------------------------------------------------------ actions */
  function arm(key) {
    if (ui.armed === key) { ui.armed = null; clearTimeout(ui.armTimer); return true; }
    ui.armed = key;
    clearTimeout(ui.armTimer);
    ui.armTimer = setTimeout(function () { ui.armed = null; render(); }, 3500);
    render();
    return false;
  }

  function advance(rid) {
    var r = state.rounds[rid], qs = R(rid).questions;
    var idx = -1, k;
    for (k = r.q + 1; k < qs.length; k++) if (!r.picks[qs[k].id]) { idx = k; break; }
    if (idx < 0) for (k = 0; k < qs.length; k++) if (!r.picks[qs[k].id]) { idx = k; break; }
    if (idx < 0) r.stage = "done"; else r.q = idx;
  }

  function lock() {
    var rid = currentRound();
    if (!rid || !ui.selected || ui.locking) return;
    var r = state.rounds[rid];
    if (r.stage !== "play") return;
    var q = R(rid).questions[r.q], t = turnTeam(rid, r.q);
    r.picks[q.id] = { opt: ui.selected, team: t.id };
    r.order.push(q.id);
    ui.locking = true;
    stopTimer();
    save();
    render();
    setTimeout(function () {
      ui.locking = false; ui.selected = null;
      advance(rid);
      save(); render(); scrollTop();
    }, 1150);
  }

  function undo() {
    var rid = currentRound();
    if (!rid || ui.locking) return;
    var r = state.rounds[rid];
    var qid = r.order.pop();
    if (!qid) return;
    var p = r.picks[qid];
    delete r.picks[qid];
    r.q = R(rid).questions.findIndex(function (q) { return q.id === qid; });
    r.stage = "play";
    ui.selected = null; stopTimer();
    save(); render();
    var t = p && team(p.team);
    toast("Pick undone." + (t ? " Team " + t.name + " can choose again." : ""));
  }

  function revealShow() {
    var rid = currentRound(), r = state.rounds[rid];
    if (r.revealIdx < r.revealed) return;
    r.revealed = r.revealIdx + 1;
    save(); render();
    var q = R(rid).questions[r.revealIdx], p = r.picks[q.id], o = p && optionOf(q, p.opt);
    if (o && o.verdict === "correct") {
      var el = $app.querySelector(".picked-by");
      var b = el ? el.getBoundingClientRect() : null;
      confetti({ count: 70, spread: 7, x: b ? b.left + b.width / 2 : innerWidth / 2, y: b ? b.top : innerHeight / 3 });
    }
  }

  var actions = {
    home: function () { state.screen = "home"; ui.drawer = false; save(); render(); scrollTop(); },
    "open-round": function (el) { state.screen = el.dataset.round; ui.selected = null; save(); render(); scrollTop(); },
    "start-round": function () {
      var rid = currentRound(), r = state.rounds[rid];
      r.stage = Object.keys(r.picks).length === R(rid).questions.length ? "done" : "play";
      if (r.stage === "play" && r.picks[R(rid).questions[r.q].id]) advance(rid);
      save(); render(); scrollTop();
    },
    select: function (el) {
      if (ui.locking) return;
      ui.selected = el.dataset.key;
      render();
    },
    lock: lock,
    undo: undo,
    jump: function (el) {
      var rid = currentRound(), r = state.rounds[rid], i = Number(el.dataset.i);
      if (r.picks[R(rid).questions[i].id] || ui.locking) return;
      r.q = i; r.stage = "play"; ui.selected = null; stopTimer();
      save(); render();
    },
    "set-turn": function (el) {
      var rid = currentRound(), r = state.rounds[rid];
      if (r.stage !== "play" || ui.locking) return;
      r.overrides[R(rid).questions[r.q].id] = el.dataset.team;
      save(); render();
      toast("Team " + team(el.dataset.team).name + " takes this decision.");
    },
    timer: function () {
      var rid = currentRound(), q = R(rid).questions[state.rounds[rid].q];
      if (ui.timer && ui.timer.running) ui.timer = null;
      else ui.timer = { qid: q.id, end: Date.now() + TIMER_SECONDS * 1000, running: true, done: false };
      updateTimer();
    },
    "start-reveal": function () {
      var rid = currentRound(), r = state.rounds[rid];
      r.stage = "reveal"; r.revealIdx = Math.min(r.revealed, R(rid).questions.length - 1);
      save(); render(); scrollTop();
    },
    "reveal-show": revealShow,
    "reveal-next": function () {
      var rid = currentRound(), r = state.rounds[rid];
      if (r.revealIdx >= R(rid).questions.length - 1) r.stage = "scores";
      else r.revealIdx++;
      save(); render(); scrollTop();
    },
    "reveal-prev": function () { var r = state.rounds[currentRound()]; if (r.revealIdx > 0) { r.revealIdx--; save(); render(); } },
    "reveal-jump": function (el) { var r = state.rounds[currentRound()], i = Number(el.dataset.i); if (i <= r.revealed) { r.revealIdx = i; save(); render(); } },
    "run-sim": function () { state.rounds.final.stage = "sim"; ui.drawer = false; save(); render(); scrollTop(); },
    "show-report": function () { state.rounds.final.stage = "report"; save(); render(); scrollTop(); },
    facts: function () { ui.drawer = !ui.drawer; renderDrawer(); },
    "team-add": function () {
      if (state.teams.length >= 4 || anyPicks()) return;
      var used = state.teams.map(function (t) { return t.color; });
      var slot = SLOTS.filter(function (s) { return used.indexOf(s.color) < 0; })[0];
      var id = "t" + Date.now().toString(36);
      state.teams.push({ id: id, name: slot.name, color: slot.color });
      save(); render();
    },
    "team-remove": function (el) {
      if (state.teams.length <= 2 || anyPicks()) return;
      state.teams = state.teams.filter(function (t) { return t.id !== el.dataset.team; });
      save(); render();
    },
    "reset-all": function () {
      if (!arm("reset-all")) return;
      var teams = state.teams;
      state = freshState();
      state.teams = teams;
      ui.simResult = null; ui.shownScores = {};
      save(); render();
      toast("Everything is reset. Team names are kept.");
    },
    "replay-round": function () {
      var rid = currentRound();
      if (!arm("replay-" + rid)) return;
      state.rounds[rid] = freshRound();
      if (rid === "final") ui.simResult = null;
      save(); render(); scrollTop();
      toast(R(rid).name + " is cleared and ready to play again.");
    }
  };

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    var fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  document.addEventListener("input", function (e) {
    var id = e.target && e.target.dataset && e.target.dataset.teamName;
    if (!id) return;
    var t = team(id);
    if (!t) return;
    t.name = e.target.value.slice(0, 18);
    var av = e.target.closest(".team-row").querySelector(".avatar");
    if (av) av.textContent = (t.name.trim().charAt(0) || "?").toUpperCase();
    save(); renderTop();
  });

  document.addEventListener("keydown", function (e) {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var rid = currentRound();
    if (e.key === "Escape" && ui.drawer) { ui.drawer = false; renderDrawer(); return; }
    if (!rid) return;
    var r = state.rounds[rid];
    if (r.stage === "play" && !ui.locking) {
      var map = { a: "A", b: "B", c: "C", d: "D", 1: "A", 2: "B", 3: "C", 4: "D" };
      var k = map[e.key.toLowerCase()];
      if (k) { e.preventDefault(); ui.selected = k; render(); return; }
      if (e.key === "Enter" && ui.selected) { e.preventDefault(); lock(); return; }
    }
    if (r.stage === "reveal") {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        if (r.revealIdx < r.revealed) actions["reveal-next"](); else revealShow();
      } else if (e.key === "ArrowLeft") { e.preventDefault(); actions["reveal-prev"](); }
    }
    if (r.stage === "sim" && e.key === " " && ui.sim) { e.preventDefault(); ui.sim.togglePlay(); }
  });

  // Teams can be renamed between renders; keep scores' bump baseline in sync.
  state.teams.forEach(function (t) { ui.shownScores[t.id] = totalScore(t.id); });
  render();
})();
