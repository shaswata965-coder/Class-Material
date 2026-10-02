/* Trade-off Arena — app shell: teams, turns, hidden picks, reveal and scores. */
(function () {
  "use strict";

  var C = window.ARENA_CONTENT;
  var SIM = window.ResultDaySim;
  var STORE_KEY = "tradeoff-arena-v1";
  /* Team colours: a hand-picked palette first, then generated hues, so any number of teams works. */
  var PALETTE = [
    { name: "Mango", c: "#F97316", tint: "#FFEDD5", ink: "#9A3412", on: "#FFFFFF" },
    { name: "Guava", c: "#4D9A12", tint: "#E5F5D3", ink: "#2F5E0B", on: "#FFFFFF" },
    { name: "Banana", c: "#E0A800", tint: "#FFF4C2", ink: "#6E5200", on: "#3D2E00" },
    { name: "Jamun", c: "#9333EA", tint: "#F3E8FF", ink: "#6B21A8", on: "#FFFFFF" },
    { name: "Lychee", c: "#E11D48", tint: "#FFE4E6", ink: "#9F1239", on: "#FFFFFF" },
    { name: "Blueberry", c: "#2563EB", tint: "#DBEAFE", ink: "#1E40AF", on: "#FFFFFF" },
    { name: "Amla", c: "#0D9488", tint: "#CCFBF1", ink: "#115E59", on: "#FFFFFF" },
    { name: "Coconut", c: "#8B5A2B", tint: "#F3E7DB", ink: "#5C3A1A", on: "#FFFFFF" },
    { name: "Watermelon", c: "#DB2777", tint: "#FCE7F3", ink: "#9D174D", on: "#FFFFFF" },
    { name: "Lime", c: "#65A30D", tint: "#ECFCCB", ink: "#3F6212", on: "#FFFFFF" },
    { name: "Grape", c: "#4338CA", tint: "#E0E7FF", ink: "#312E81", on: "#FFFFFF" },
    { name: "Jackfruit", c: "#A16207", tint: "#FEF3C7", ink: "#713F12", on: "#FFFFFF" },
    { name: "Pomelo", c: "#C026D3", tint: "#FAE8FF", ink: "#86198F", on: "#FFFFFF" },
    { name: "Olive", c: "#57534E", tint: "#F5F5F4", ink: "#292524", on: "#FFFFFF" }
  ];
  var LEGACY_COLORS = { mango: 0, guava: 1, banana: 2, jamun: 3 };
  function colorOf(key) {
    var m = /^p(\d+)$/.exec(key || "");
    if (m && PALETTE[+m[1]]) return PALETTE[+m[1]];
    var n = parseInt(String(key).replace(/\D/g, ""), 10) || 0;
    var h = Math.round((n * 137.508) % 360);
    return { c: "hsl(" + h + " 62% 42%)", tint: "hsl(" + h + " 80% 93%)", ink: "hsl(" + h + " 65% 24%)", on: "#FFFFFF" };
  }
  function nextColorKey() {
    var used = state.teams.map(function (t) { return t.color; });
    for (var i = 0; i < PALETTE.length; i++) if (used.indexOf("p" + i) < 0) return "p" + i;
    var n = PALETTE.length;
    while (used.indexOf("g" + n) >= 0) n++;
    return "g" + n;
  }
  function defaultTeamName(key) {
    var m = /^p(\d+)$/.exec(key);
    return m ? PALETTE[+m[1]].name : "Team " + (state.teams.length + 1);
  }
  function applyTeamStyles() {
    var el = document.getElementById("team-styles");
    if (!el) { el = document.createElement("style"); el.id = "team-styles"; document.head.appendChild(el); }
    el.textContent = state.teams.map(function (t) {
      var c = colorOf(t.color);
      return ".t-" + t.color + "{--t:" + c.c + ";--t-tint:" + c.tint + ";--t-ink:" + c.ink + ";--t-on:" + c.on + "}";
    }).join("\n");
  }
  function teamHasPicks(id) {
    return ["warm", "final"].some(function (rid) {
      var picks = state.rounds[rid].picks;
      return Object.keys(picks).some(function (k) { return picks[k].team === id; });
    });
  }
  var POINTS = { warm: { correct: 10, partial: 5 }, final: { correct: 20, partial: 10 } };
  var TIMER_SECONDS = 60;

  var $app = document.getElementById("app");
  var $top = document.getElementById("topbar");

  /* ------------------------------------------------------------------ state */
  function freshRound() { return { stage: "intro", q: 0, picks: {}, order: [], overrides: {}, revealIdx: 0, revealed: 0 }; }
  function freshState() {
    return {
      v: 1, screen: "home",
      teams: [0, 1, 2].map(function (i) { return { id: "t" + i, name: PALETTE[i].name, color: "p" + i }; }),
      rounds: { warm: freshRound(), final: freshRound() }
    };
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || s.v !== 1 || !Array.isArray(s.teams) || !s.rounds || !s.rounds.warm || !s.rounds.final) return null;
      s.teams.forEach(function (t) { if (LEGACY_COLORS[t.color] != null) t.color = "p" + LEGACY_COLORS[t.color]; });
      return s;
    } catch (e) { return null; }
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable: keep going */ } }

  var state = load() || freshState();
  var ui = { selected: null, demo: null, demoTab: null, locking: false, justPlaced: null, timer: null, timerTick: 0, drawer: false, armed: null, armTimer: 0, sim: null, simResult: null, shownScores: {} };

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
      '<div class="team-chips' + (state.teams.length > 5 ? " compact" : "") + '">' + chips + "</div>" +
      (actions ? '<div class="topbar-actions">' + actions + "</div>" : "");
  }

  /* ------------------------------------------------------------------ screens */
  function render() {
    var rid = currentRound();
    var stage = rid ? state.rounds[rid].stage : null;
    if (ui.sim && !(rid === "final" && stage === "sim")) { ui.sim.destroy(); ui.sim = null; }
    applyTeamStyles();
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
    if (ui.demo) { ui.demo.destroy(); ui.demo = null; }
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
    if (stage === "play") {
      updateTimer();
      var r = state.rounds[rid], q = R(rid).questions[r.q], key = (r.picks[q.id] && r.picks[q.id].opt) || ui.selected;
      var holder = document.getElementById("demo-stage");
      if (holder && key) ui.demo = window.ArenaDemos.mount(holder, q.demo, optionOf(q, key).demo, "preview");
    }
    if (stage === "reveal") {
      var rr = state.rounds[rid], qq = R(rid).questions[rr.revealIdx], pk = rr.picks[qq.id];
      var host = document.getElementById("demo-stage");
      var tab = ui.demoTab || (pk && pk.opt) || "A";
      if (host) ui.demo = window.ArenaDemos.mount(host, qq.demo, optionOf(qq, tab).demo, rr.revealIdx < rr.revealed ? "stress" : "preview");
    }
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
    var rows = state.teams.map(function (t) {
      var removable = state.teams.length > 2 && !teamHasPicks(t.id);
      return '<div class="team-row t-' + t.color + '">' + avatar(t) +
        '<input id="team-name-' + t.id + '" data-team-name="' + t.id + '" value="' + esc(t.name) + '" maxlength="18" aria-label="Team name" autocomplete="off">' +
        (removable ? '<button class="icon-btn" data-act="team-remove" data-team="' + t.id + '" aria-label="Remove ' + esc(t.name) + '">' + ICON.x + "</button>" : "<span></span>") +
        "</div>";
    }).join("");
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
        '<div class="card teams-editor"><div class="row between"><h2 style="font-size:26px">Teams</h2><span class="team-count">' + state.teams.length + ' teams</span></div>' +
          '<div class="team-rows' + (state.teams.length > 4 ? " two-col" : "") + '">' + rows + "</div>" +
          '<div class="row"><button class="btn btn-ghost btn-sm" data-act="team-add">' + ICON.plus + "Add a team</button>" +
          '<button class="btn btn-ghost btn-sm" data-act="team-add" data-n="5">' + ICON.plus + "Add 5</button>" +
          '<span class="muted" style="font-size:14px">As many as you like. Teams take turns, one decision each.</span></div></div>' +
        '<div class="card" style="display:grid;gap:18px"><h2 style="font-size:26px">How to run it</h2><ol class="steps">' +
          "<li><div><b>Name the teams.</b><span class=\"muted\">Each decision goes to the next team in turn. One student per team comes up to choose.</span></div></li>" +
          "<li><div><b>Before the lecture: Eid Ticket Rush.</b><span class=\"muted\">Teams build a ticket system part by part. The blueprint is graded only once every part is in.</span></div></li>" +
          "<li><div><b>Teach Lecture 2.</b><span class=\"muted\">Every warm-up answer points to the slides that explain it.</span></div></li>" +
          "<li><div><b>After the lecture: Result Day.</b><span class=\"muted\">Eight harder parts for a result portal, then a live simulation of the class’s design, a mark sheet, and the answers.</span></div></li>" +
        "</ol>" +
        '<div class="row"><button class="btn btn-danger btn-sm' + (ui.armed === "reset-all" ? " armed" : "") + '" data-act="reset-all">' +
          (ui.armed === "reset-all" ? "Click again to erase all picks and scores" : "Reset everything") + "</button></div></div>" +
      "</div></section>";
  }

  /* ---------- blueprint ---------- */
  var I = window.ARENA_ICONS;
  var VERDICT_CLASS = { correct: "v-good", partial: "v-half", trap: "v-bad", wrong: "v-bad" };
  var VERDICT_ICON = { correct: "check", partial: "minus", trap: "x", wrong: "x" };

  function blueprintHTML(rid, mode) {
    var Rd = R(rid), bp = Rd.blueprint, r = state.rounds[rid], qs = Rd.questions;
    var pos = {}, isNode = {};
    bp.nodes.forEach(function (n) { pos[n.id] = n; isNode[n.id] = true; });
    Object.keys(bp.slots).forEach(function (id) { pos[id] = bp.slots[id]; });
    function ready(id) { return isNode[id] || !!r.picks[id]; }
    var lines = bp.links.map(function (l) {
      var a = pos[l[0]], b = pos[l[1]], on = ready(l[0]) && ready(l[1]);
      return '<line class="bp-link' + (l[2] ? " " + l[2] : "") + (on ? " on" : "") + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>';
    }).join("");
    var nodes = bp.nodes.map(function (n) {
      return '<div class="bp-node" style="left:' + n.x + "%;top:" + n.y + '%">' + I.svg(n.icon) + "<span>" + esc(n.label) + "</span></div>";
    }).join("");
    var slots = qs.map(function (q, i) {
      var p = r.picks[q.id], s = bp.slots[q.id];
      var current = mode === "play" && r.stage === "play" && i === r.q && !p;
      var st = p ? "filled" : current ? "current" : "empty";
      var t = p ? team(p.team) : current ? turnTeam(rid, i) : null;
      var o = p ? optionOf(q, p.opt) : (current && ui.selected ? optionOf(q, ui.selected) : null);
      var graded = p && (mode === "graded" || mode === "reveal") && i < r.revealed;
      var cls = "bp-slot " + st + (t ? " t-" + t.color : "") + (current && o ? " preview" : "") + (ui.justPlaced === q.id ? " placed" : "") +
        (graded ? " " + VERDICT_CLASS[o.verdict] : "") + (mode === "reveal" && i === r.revealIdx ? " focus" : "");
      var sub = p ? esc(q.slot) : current ? (o ? "Ready to lock in" : "Choosing now…") : "Part " + (i + 1);
      return '<div class="' + cls + '" data-slot="' + q.id + '" style="left:' + s.x + "%;top:" + s.y + '%">' +
        '<span class="bp-num">' + (i + 1) + "</span>" +
        '<span class="bp-ico">' + I.svg(o ? o.icon : q.slotIcon) + "</span>" +
        '<span class="bp-txt"><b>' + esc(o ? o.name : q.slot) + "</b><small>" + sub + "</small></span>" +
        (graded ? '<span class="bp-mark">' + I.svg(VERDICT_ICON[o.verdict], "ico", 3) + "</span>" : "") +
        (p && t && !graded ? '<span class="bp-team">' + initial(t) + "</span>" : "") +
        "</div>";
    }).join("");
    return '<div class="bp"><svg class="bp-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' + lines + "</svg>" + nodes + slots + "</div>";
  }

  function blueprintPanel(rid, mode, caption, footer) {
    var Rd = R(rid), r = state.rounds[rid], n = Rd.questions.length, placed = Object.keys(r.picks).length;
    var right = mode === "graded" || mode === "reveal"
      ? Math.min(r.revealed, n) + " / " + n + " graded"
      : placed + " / " + n + " parts";
    return '<aside class="card bp-panel"><div class="bp-head"><div><span class="eyebrow">Blueprint</span><b>' + esc(Rd.blueprint.title) + "</b></div>" +
      '<span class="bp-count">' + right + "</span></div>" + blueprintHTML(rid, mode) +
      (caption ? '<p class="bp-caption">' + caption + "</p>" : "") + (footer || "") + "</aside>";
  }

  /* ---------- part cards ---------- */
  function partHTML(rid, q, o, opt) {
    opt = opt || {};
    var t = opt.team;
    var cls = "part";
    if (opt.selected && t) cls += " selected t-" + t.color;
    if (opt.placed) cls += " placed";
    if (opt.dim) cls += " dim";
    if (opt.tabOn) cls += " tab-on";
    if (opt.pickedBy) cls += " mine t-" + opt.pickedBy.color;
    var badge = "";
    if (opt.reveal) {
      cls += " " + VERDICT_CLASS[o.verdict] + (o.verdict === "trap" ? " v-trap" : "");
      if (o.verdict === "correct") badge = '<span class="badge best">Best part</span>';
      else if (o.verdict === "partial") badge = '<span class="badge half">Half right</span>';
      else if (o.verdict === "trap") badge = '<span class="badge gut">Gut feeling</span>';
    }
    var by = opt.pickedBy ? '<span class="picked-by t-' + opt.pickedBy.color + '">' + avatar(opt.pickedBy) + esc(opt.pickedBy.name) +
      (opt.reveal ? '<span class="points-pop' + (opt.pts ? "" : " zero") + '">+' + opt.pts + "</span>" : "") + "</span>" : "";
    var inner = by + badge +
      '<span class="part-key">' + (opt.placed ? "Placed" : o.key) + "</span>" +
      '<span class="part-icon">' + I.svg(o.icon) + "</span>" +
      '<span class="part-name">' + esc(o.name) + "</span>" +
      '<span class="part-desc">' + esc(o.text) + "</span>" +
      (opt.reveal ? '<span class="part-why">' + I.svg(VERDICT_ICON[o.verdict], "ico", 3) + "<span>" + esc(o.why) + "</span></span>" : "") +
      (opt.act === "demo-tab" ? '<span class="part-watch">' + I.svg("play") + "</span>" : "");
    if (opt.static) return '<div class="' + cls + '">' + inner + "</div>";
    return '<button class="' + cls + '" data-act="' + (opt.act || "select") + '" data-key="' + o.key + '"' + (opt.disabled ? " disabled" : "") +
      ' aria-pressed="' + !!opt.selected + '" aria-label="' + esc(o.key + ": " + o.name + ". " + o.text) + '">' + inner + "</button>";
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
    var seen = [], orderChips = "";
    Rd.questions.forEach(function (q, i) {
      var t = turnTeam(rid, i);
      if (seen.indexOf(t.id) < 0) { seen.push(t.id); orderChips += '<span class="team-chip t-' + t.color + '">' + avatar(t) + esc(t.name) + "</span>"; }
    });
    return '<section class="screen"><div class="intro">' +
      '<div class="card" style="display:grid;gap:18px">' +
        '<span class="eyebrow">' + esc(Rd.kicker) + " · " + esc(Rd.when) + "</span>" +
        "<h1>" + esc(Rd.name) + "</h1>" +
        '<p class="lead">' + esc(Rd.story) + "</p>" +
        factsHTML(rid) +
        '<div class="turn-order"><span class="muted" style="font-weight:700">Turn order:</span>' + orderChips + "</div>" +
        (state.teams.length > Rd.questions.length ? '<p class="muted" style="font-size:14px">' + state.teams.length + " teams, " + Rd.questions.length + " parts: the teams without a turn here go first " + (rid === "warm" ? "in Result Day." : "next time.") + "</p>" : "") +
        '<p class="muted" style="font-size:14px">Scoring: ' + POINTS[rid].correct + " points for the best part, " + POINTS[rid].partial + " for a half-right part, 0 for the rest.</p>" +
        '<div class="row"><button class="btn btn-lg" data-act="start-round">' + (started ? "Continue building" : "Start building") + ICON.arrow + "</button>" +
        '<button class="btn btn-ghost" data-act="home">' + ICON.back + "Back</button></div>" +
      "</div>" +
      blueprintPanel(rid, "intro", "Each decision fills one slot. By the end of the round, your class has designed the whole system.") +
      "</div></section>";
  }

  /* ---------- play ---------- */
  function playHTML(rid) {
    var r = state.rounds[rid], qs = R(rid).questions, i = r.q, q = qs[i];
    var t = turnTeam(rid, i);
    var pick = r.picks[q.id];
    var sel = pick ? pick.opt : ui.selected;
    var parts = q.options.map(function (o) {
      return partHTML(rid, q, o, {
        team: t, selected: sel === o.key, disabled: ui.locking,
        placed: ui.locking && pick && pick.opt === o.key, dim: ui.locking && sel && sel !== o.key
      });
    }).join("");
    var selOpt = sel ? optionOf(q, sel) : null;
    var lockLabel = ui.locking ? "Placed!" : selOpt ? "Lock in “" + esc(selOpt.name) + "”" : "Pick a part first";
    var footer = '<div class="bp-actions"><button class="btn btn-lg btn-team t-' + t.color + '" data-act="lock"' + (!sel || ui.locking ? " disabled" : "") + ">" + ICON.lock + "<span>" + lockLabel + "</span></button>" +
      (r.order.length ? '<button class="btn btn-ghost btn-sm" data-act="undo"' + (ui.locking ? " disabled" : "") + ">" + ICON.undo + "Undo last part</button>" : "") + "</div>";
    return '<section class="screen q-' + q.quality + '"><div class="play-grid"><div class="play-main">' +
      '<div class="turn-banner t-' + t.color + '">' + avatar(t) +
        '<div class="who"><b>Team ' + esc(t.name) + ", your turn</b><span>One person comes up to choose.</span></div>" +
        '<div style="display:grid;justify-items:center;gap:2px"><button class="timer" data-act="timer" aria-label="Start or stop the 60 second timer"></button><span class="timer-label">Timer</span></div>' +
      "</div>" +
      '<article class="card question">' +
        '<div class="row between"><span class="slot-label">' + I.svg(q.slotIcon) + "Part " + (i + 1) + " of " + qs.length + ": " + esc(q.slot) + "</span>" + qtag(q.quality) + "</div>" +
        "<h2>" + esc(q.title) + "</h2>" +
        '<p class="prompt">' + esc(q.prompt) + "</p>" +
        '<div class="parts">' + parts + "</div>" +
        '<div class="demo-panel"><div id="demo-stage" class="demo-stage">' +
          (selOpt ? "" : '<div class="demo-empty">' + I.svg("play") + "<span>Pick a part to see it in action</span></div>") + "</div></div>" +
        '<div class="lock-bar"><span class="hint"><span class="kbd">A</span>–<span class="kbd">D</span> choose · <span class="kbd">Enter</span> lock in · tap the animation to replay</span></div>' +
      "</article></div>" +
      blueprintPanel(rid, "play", null, footer) +
      "</div></section>";
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
    var r = state.rounds[rid], Rd = R(rid);
    var list = Rd.questions.map(function (q) {
      var p = r.picks[q.id], t = team(p.team) || state.teams[0], o = optionOf(q, p.opt);
      return '<li class="t-' + t.color + '"><span class="li-ico">' + I.svg(o.icon) + '</span><span><b>' + esc(o.name) + "</b><small>" + esc(q.slot) + " · Team " + esc(t.name) + "</small></span></li>";
    }).join("");
    var warm = rid === "warm";
    return '<section class="screen"><div class="intro">' +
      '<div class="card" style="display:grid;gap:18px;align-content:start">' +
        '<span class="eyebrow">' + esc(Rd.name) + "</span><h1>The blueprint is complete.</h1>" +
        '<p class="lead">Your class picked every part of ' + esc(Rd.blueprint.title) + ". Nobody knows which parts were right yet. " +
          (warm ? "Time to find out which gut feelings held up." : "Now we see how this design survives result day.") + "</p>" +
        '<ul class="parts-list">' + list + "</ul>" +
        '<div class="row"><button class="btn btn-ghost" data-act="undo">' + ICON.undo + "Undo last part</button>" +
        (warm ? '<button class="btn btn-lg" data-act="start-reveal">Grade the blueprint' + ICON.arrow + "</button>"
              : '<button class="btn btn-lg" data-act="run-sim">' + ICON.play + "Run Result Day</button>") + "</div>" +
      "</div>" +
      blueprintPanel(rid, "done") +
      "</div></section>";
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
    var tab = ui.demoTab || (p && p.opt) || "A", tabOpt = optionOf(q, tab);
    var parts = q.options.map(function (o) {
      var mine = p && p.opt === o.key;
      return partHTML(rid, q, o, { act: shown ? "demo-tab" : null, static: !shown, reveal: shown, pickedBy: mine ? t : null, pts: pts, dim: !shown && !mine, tabOn: shown && o.key === tab });
    }).join("");

    var side;
    if (shown) {
      var o = p && optionOf(q, p.opt);
      var verdictLine = !o ? "" : o.verdict === "correct" ? "Team " + esc(t.name) + " picked the best part: +" + pts :
        o.verdict === "partial" ? "Team " + esc(t.name) + " was half right: +" + pts :
        o.verdict === "trap" ? "Team " + esc(t.name) + " went with the gut feeling: +0" : "Team " + esc(t.name) + ": +0";
      var tabs = q.options.map(function (op) {
        return '<button class="demo-tab' + (op.key === tab ? " on" : "") + (op.verdict === "correct" ? " best" : "") + '" data-act="demo-tab" data-key="' + op.key + '" title="' + esc(op.name) + '">' +
          I.svg(op.icon) + "<span>" + op.key + "</span></button>";
      }).join("");
      side = '<aside class="card explain"><h3>' + esc(q.reveal.headline) + "</h3>" +
        '<div class="demo-panel stress"><div class="demo-head"><span class="demo-title">' + I.svg("zap") + "Under pressure: <b>" + esc(tabOpt.name) + '</b></span><div class="demo-tabs">' + tabs + "</div></div>" +
          '<div id="demo-stage" class="demo-stage"></div></div>' +
        '<div class="rule"><span class="eyebrow">Rule to remember</span><b>' + esc(q.reveal.rule) + "</b><p>" + esc(q.reveal.why) + "</p></div>" +
        '<div class="row between"><span class="slide-ref">Lecture 2 · ' + esc(q.reveal.slide) + '</span><span class="team-chip t-' + t.color + '">' + avatar(t) + verdictLine + "</span></div></aside>";
    } else {
      var po = p && optionOf(q, p.opt);
      side = '<aside class="card mystery"><div class="row" style="justify-content:center"><div class="qmark">?</div></div><h3 style="font-size:26px;font-weight:900">Team ' + esc(t.name) + " chose " + (po ? "“" + esc(po.name) + "”" : "a part") + ".</h3>" +
        '<div class="demo-panel"><div id="demo-stage" class="demo-stage"></div></div>' +
        '<p class="muted">Best part, half right, or gut feeling? Press reveal to put it under pressure.</p><button class="btn btn-lg btn-quality" data-act="reveal-show">Reveal the answer</button></aside>';
    }

    var last = i === qs.length - 1;
    var strip = '<div class="parts-strip" role="group" aria-label="Parts">' + qs.map(function (qq, k) {
      var pk = r.picks[qq.id], tt = pk ? team(pk.team) : null, oo = pk ? optionOf(qq, pk.opt) : null;
      var rev = k < r.revealed && oo;
      return '<button class="strip-part' + (tt ? " t-" + tt.color : "") + (rev ? " " + VERDICT_CLASS[oo.verdict] : "") + (k === i ? " current" : "") + '" data-act="reveal-jump" data-i="' + k + '"' +
        (k > r.revealed ? " disabled" : "") + ' title="' + esc(qq.slot + (oo ? ": " + oo.name : "")) + '">' + I.svg(oo ? oo.icon : qq.slotIcon) +
        (rev ? '<span class="sm">' + I.svg(VERDICT_ICON[oo.verdict], "ico", 3.5) + "</span>" : "") + "</button>";
    }).join("") + "</div>";

    return '<section class="screen q-' + q.quality + '">' +
      '<div class="reveal-nav"><span class="eyebrow">Grading the blueprint · Part ' + (i + 1) + " of " + qs.length + ": " + esc(q.slot) + "</span>" + strip + "</div>" +
      '<div class="reveal"><article class="card question"><div class="row between"><span class="slot-label">' + I.svg(q.slotIcon) + esc(q.slot) + "</span>" + qtag(q.quality) + "</div><h2>" + esc(q.title) + '</h2><p class="prompt" style="font-size:17px">' + esc(q.prompt) + "</p>" +
        '<div class="parts list">' + parts + "</div></article>" + side + "</div>" +
      '<div class="reveal-nav"><button class="btn btn-ghost" data-act="reveal-prev"' + (i === 0 ? " disabled" : "") + ">" + ICON.back + "Previous</button>" +
        (shown ? '<button class="btn btn-lg" data-act="reveal-next">' + (last ? "See the scores" : "Next part") + ICON.arrow + "</button>"
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
    var r = state.rounds[rid], good = 0;
    Rd.questions.forEach(function (q) { var p = r.picks[q.id], o = p && optionOf(q, p.opt); if (o && o.verdict === "correct") good++; });
    var totals = rid === "final" ? '<p class="muted" style="font-weight:700">Season totals, both rounds: ' + state.teams.map(function (t) { return esc(t.name) + " " + totalScore(t.id); }).join(" · ") + "</p>" : "";
    var actions = rid === "warm"
      ? '<button class="btn btn-ghost" data-act="home">' + ICON.home + 'Home</button><button class="btn btn-lg" data-act="open-round" data-round="final">After the lecture: Result Day' + ICON.arrow + "</button>"
      : '<button class="btn btn-ghost" data-act="home">' + ICON.home + 'Home</button><button class="btn btn-ghost" data-act="show-report">See the simulation report</button>';
    return '<section class="screen">' +
      '<div class="card winner-banner">' + ICON.crown.replace('class="crown"', 'class="crown" style="width:56px;height:56px"') + '<span class="eyebrow">' + esc(Rd.kicker) + "</span><h1>" + title + "</h1>" +
        '<p class="lead">The class picked the best part ' + good + " times out of " + Rd.questions.length + ". " +
        (rid === "warm" ? "Keep the traps in mind: the lecture explains every one of them." : "Every fix had a price. Your class just paid some of them.") + "</p></div>" +
      '<div class="intro">' +
        '<div style="display:grid;gap:20px;align-content:start;min-width:0"><div class="card scoreboard"><div class="row between"><h2 style="font-size:24px">' + esc(Rd.name) + ' scores</h2><span class="muted">out of ' + max + "</span></div>" + bars + totals + "</div>" +
        '<div class="row between"><button class="btn btn-danger btn-sm' + (ui.armed === "replay-" + rid ? " armed" : "") + '" data-act="replay-round">' +
          (ui.armed === "replay-" + rid ? "Click again to clear this round" : "Replay this round") + '</button><div class="row">' + actions + "</div></div></div>" +
        blueprintPanel(rid, "graded") +
      "</div></section>";
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
    var q = R(rid).questions[r.q], t = turnTeam(rid, r.q), o = optionOf(q, ui.selected);
    var card = $app.querySelector(".part.selected .part-icon"), slot = $app.querySelector(".bp-slot.current");
    r.picks[q.id] = { opt: ui.selected, team: t.id };
    r.order.push(q.id);
    ui.locking = true;
    stopTimer();
    save();
    var lockBtn = $app.querySelector('[data-act="lock"]');
    if (lockBtn) { lockBtn.disabled = true; }
    $app.querySelectorAll(".part").forEach(function (b) { b.disabled = true; });
    function placed() {
      ui.justPlaced = q.id;
      render();
      setTimeout(function () {
        ui.locking = false; ui.selected = null; ui.justPlaced = null;
        advance(rid);
        save(); render(); scrollTop();
      }, 1000);
    }
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!card || !slot || reduced || !document.body.animate) { placed(); return; }
    flyPart(card, slot, t, o, placed);
  }

  function flyPart(from, to, t, o, done) {
    var a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    var tok = document.createElement("div");
    tok.className = "flight t-" + t.color;
    tok.innerHTML = '<span class="part-icon">' + I.svg(o.icon) + "</span><span>" + esc(o.name) + "</span>";
    document.body.appendChild(tok);
    var w = tok.offsetWidth, h = tok.offsetHeight;
    var sx = a.left + a.width / 2 - w / 2, sy = a.top + a.height / 2 - h / 2;
    var ex = b.left + b.width / 2 - w / 2, ey = b.top + b.height / 2 - h / 2;
    tok.style.left = sx + "px"; tok.style.top = sy + "px";
    var dx = ex - sx, dy = ey - sy, lift = Math.min(140, 40 + Math.abs(dx) * 0.15);
    var anim = tok.animate([
      { transform: "translate(0,0) scale(.7)", opacity: 0.4 },
      { transform: "translate(0,-14px) scale(1.12)", opacity: 1, offset: 0.18 },
      { transform: "translate(" + dx * 0.55 + "px," + (dy * 0.55 - lift) + "px) scale(1.08) rotate(-4deg)", offset: 0.6 },
      { transform: "translate(" + dx + "px," + dy + "px) scale(.92)", opacity: 1 }
    ], { duration: 900, easing: "cubic-bezier(.45,.05,.3,1)", fill: "forwards" });
    anim.onfinish = function () { tok.remove(); done(); };
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
      ui.demoTab = null;
      if (r.revealIdx >= R(rid).questions.length - 1) r.stage = "scores";
      else r.revealIdx++;
      save(); render(); scrollTop();
    },
    "reveal-prev": function () { var r = state.rounds[currentRound()]; if (r.revealIdx > 0) { r.revealIdx--; ui.demoTab = null; save(); render(); } },
    "reveal-jump": function (el) { var r = state.rounds[currentRound()], i = Number(el.dataset.i); if (i <= r.revealed) { r.revealIdx = i; ui.demoTab = null; save(); render(); } },
    "run-sim": function () { state.rounds.final.stage = "sim"; ui.drawer = false; save(); render(); scrollTop(); },
    "show-report": function () { state.rounds.final.stage = "report"; save(); render(); scrollTop(); },
    facts: function () { ui.drawer = !ui.drawer; renderDrawer(); },
    "team-add": function (el) {
      var n = Number(el.dataset.n) || 1;
      for (var i = 0; i < n; i++) {
        var key = nextColorKey();
        state.teams.push({ id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: defaultTeamName(key), color: key });
      }
      save(); render();
      if (anyPicks()) toast("New teams join the rotation from the next undecided part.");
    },
    "team-remove": function (el) {
      if (state.teams.length <= 2 || teamHasPicks(el.dataset.team)) return;
      state.teams = state.teams.filter(function (t) { return t.id !== el.dataset.team; });
      save(); render();
    },
    "demo-tab": function (el) { ui.demoTab = el.dataset.key; render(); },
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
      var tk = { a: "A", b: "B", c: "C", d: "D" }[e.key.toLowerCase()];
      if (tk && r.revealIdx < r.revealed) { e.preventDefault(); ui.demoTab = tk; render(); return; }
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
