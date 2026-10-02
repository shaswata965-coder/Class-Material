/* Trade-off Arena — live simulations for both rounds.
 *
 * compute(params, "final") models Result Day (09:55 to 11:00) from the eight final-round parts;
 * compute(params, "warm") models Sale Day (08:55 to 10:00) from the six warm-up parts.
 * mount() animates either one with a shared engine and a per-scenario view; reportHTML() renders the debrief.
 *
 * The model is deliberately simple and uses the lecture's formulas:
 *   L = λ × W (Little's Law), ρ = L ÷ threads, waiting grows like ρ ÷ (1 − ρ),
 *   series availability multiplies, and a slow dependency inside a request adds to W.
 */
window.ResultDaySim = (function () {
  "use strict";

  var START = -5, END = 60;           // minutes relative to 10:00
  var STUDENTS = 40000;
  var MS_PER_MIN = 800;               // real milliseconds per simulated minute at 1x

  var DEFAULTS = {
    req: "fast", servers: 4, autoscale: false, cache: "none", sms: "sync",
    spare: "app", rules: "ifelse", login: "peraccount", authz: "login"
  };

  /* ------------------------------------------------------------------ helpers */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtLatency(s) {
    if (s == null) return "down";
    if (s >= 10) return "10 s+";
    if (s < 1) return Math.round(s * 1000) + " ms";
    return s.toFixed(1) + " s";
  }
  function fmtInt(n) { return Math.round(n).toLocaleString("en-US"); }
  function fmtPct(v, d) { return v.toFixed(d == null ? 1 : d) + "%"; }
  function taka(n) { return "৳" + fmtInt(n); }
  function clock(m, base) {
    var total = (base == null ? 600 : base) + Math.floor(m);
    var h = Math.floor(total / 60), mm = total % 60;
    return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
  }

  var ICONS = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    split: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.17-2.83L3 3"/><path d="m15 9 6-6"/>',
    server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>',
    msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    bot: '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><path d="M8 16h.01M16 16h.01"/>',
    good: '<circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
    warn: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    bad: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>'
  };
  function icon(name, cls) {
    var paths = ICONS[name] || (window.ARENA_ICONS ? window.ARENA_ICONS.markup(name) : "");
    return '<svg class="' + (cls || "nicon") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
  }

  /* ------------------------------------------------------------------ model */
  function lambdaAt(m) { return m < 0 ? 20 : m < 10 ? 800 : m < 20 ? 400 : m < 40 ? 150 : 60; }

  function serviceTime(cache, m) {
    if (m < 0) return cache === "warm" ? 0.05 : cache === "bigdb" ? 0.21 : 0.25;
    switch (cache) {
      case "warm": return 0.05;
      case "aside": return m < 10 ? 0.28 : m < 20 ? 0.10 : 0.07;   // cold at 10:00: misses + cache writes
      case "bigdb": return 0.21;
      case "threads": return m < 10 ? 0.9 : m < 20 ? 0.4 : 0.25;   // 4x connections make the DB thrash
      default: return 0.25;
    }
  }

  function hitRate(cache, m) {
    if (cache === "warm") return 0.97;
    if (cache === "aside") return m < 10 ? 0.15 : 0.75;
    return 0;
  }

  var GRADE_SCALE = [
    { l: "A+", gp: 4.00 }, { l: "A", gp: 3.75 }, { l: "A-", gp: 3.50 }, { l: "B+", gp: 3.25 },
    { l: "B", gp: 3.00 }, { l: "B-", gp: 2.75 }, { l: "C+", gp: 2.50 }, { l: "C", gp: 2.25 },
    { l: "D", gp: 2.00 }, { l: "F", gp: 0.00 }
  ];
  function grade(l) { for (var i = 0; i < GRADE_SCALE.length; i++) if (GRADE_SCALE[i].l === l) return GRADE_SCALE[i]; return GRADE_SCALE[9]; }
  function letterFor(gp) {
    for (var i = 0; i < GRADE_SCALE.length; i++) if (gp >= GRADE_SCALE[i].gp - 1e-9) return GRADE_SCALE[i].l;
    return "F";
  }
  function gradeClass(l) { return l[0] === "A" ? "g-a" : l[0] === "B" ? "g-b" : (l[0] === "C" || l === "D") ? "g-c" : "g-f"; }

  function computeFinal(params) {
    var P = {};
    var k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    for (k in (params || {})) P[k] = params[k];

    var lambdaTotal = 0, m;
    for (m = 0; m < END; m++) lambdaTotal += lambdaAt(m);

    var minutes = [];
    var compromised = 0, leaked = 0, smsQueue = 0, smsDelivered = 0, attemptsBlocked = 0;
    for (m = START; m < END; m++) {
      var lambda = lambdaAt(m);
      var servers = (P.autoscale && m >= 8) ? 6 : P.servers;
      var tps = P.cache === "threads" ? 200 : 50;
      var threads = servers * tps;
      var W = serviceTime(P.cache, m);
      var smsSlow = m >= 7 && m < 27;
      if (smsSlow && P.sms === "sync") W += 20;
      if (smsSlow && P.sms === "retry") W += 45;
      var rho = lambda * W / threads;
      var p99, served, avg, overloaded = false;
      if (rho < 0.95) {
        p99 = W * (1.5 + rho / (1 - rho));
        avg = W * (1 + 0.5 * rho / (1 - rho));
        served = 1;
      } else {
        overloaded = true;
        p99 = 10; avg = 6;
        served = Math.max(0.02, Math.min(1, 0.9 / rho));
      }
      p99 = Math.min(p99, 10);
      var dbDown = m >= 15 && m < 35 && P.spare !== "db";
      var failover = m === 15 && P.spare === "db";
      if (dbDown) { served = 0; p99 = null; avg = null; }
      if (failover) served *= 0.85;

      // Guardian SMS
      var smsDemand = m >= 0 ? STUDENTS * lambda / lambdaTotal : 0;
      if (P.sms === "queue") {
        smsQueue += smsDemand * served;
        var sent = Math.min(smsQueue, smsSlow ? 250 : 4000);
        smsQueue -= sent; smsDelivered += sent;
      } else if (P.sms === "sync" || P.sms === "retry") {
        smsDelivered += smsDemand * served * (smsSlow ? 0.7 : 1);
      }

      // Password spraying, 10:42 to 10:54
      var attack = m >= 42 && m < 54, blockedNow = 0;
      if (attack) {
        if (P.login === "layers") blockedNow = m >= 43 ? 0.98 : 0;
        else if (P.login === "captcha") { blockedNow = 0.8; if (m % 2 === 0) compromised += 1; }
        else compromised += 5;
        attemptsBlocked += 6000 * blockedNow;
      }

      // URL tampering, from 10:38
      if (m >= 38) {
        if (P.authz === "encrypt") leaked += 30;
        else if ((P.authz === "post" || P.authz === "login") && m >= 40) leaked = Math.min(STUDENTS, leaked + 2000);
      }

      minutes.push({
        m: m, lambda: lambda, servers: servers, threads: threads, W: W, rho: rho,
        p99: p99, avg: avg, served: served, overloaded: overloaded,
        dbDown: dbDown, failover: failover, smsSlow: smsSlow, attack: attack, blockedNow: blockedNow,
        compromised: compromised, leaked: Math.round(leaked),
        smsQueue: Math.round(smsQueue), smsDelivered: Math.round(smsDelivered)
      });
    }

    /* ---- headline metrics ---- */
    var rushP99 = 0, peakP99 = 0, peakAvg = 0, peakN = 0;
    var tot = 0, ok = 0, okFast = 0;
    minutes.forEach(function (x) {
      if (x.m >= 0 && x.m < 7) rushP99 = Math.max(rushP99, x.p99 == null ? 10 : x.p99);
      if (x.m >= 0 && x.m < 10) { peakP99 = Math.max(peakP99, x.p99 == null ? 10 : x.p99); peakAvg += (x.avg == null ? 6 : x.avg); peakN++; }
      if (x.m >= 0) {
        tot += x.lambda; ok += x.lambda * x.served;
        var f = x.p99 == null ? 0 : x.p99 <= 1 ? 1 : x.p99 <= 3 ? 0.8 : 0.5;
        okFast += x.lambda * x.served * f;
      }
    });
    peakAvg = peakAvg / peakN;
    var availability = ok / tot * 100;
    var studentsOk = STUDENTS * okFast / tot;
    if (P.login === "captcha") studentsOk *= 0.9;
    var last = minutes[minutes.length - 1];
    var p50Normal = serviceTime(P.cache, -3) * 0.6;

    /* ---- monthly bill ---- */
    var bill = [];
    if (P.autoscale) bill.push(["2 app servers + auto-scaling", 23000]);
    else bill.push([P.servers + " app servers", P.servers * 10000]);
    if (P.cache === "warm" || P.cache === "aside") bill.push(["Cache", 8000]);
    if (P.cache === "bigdb") bill.push(["Bigger database", 60000]);
    bill.push({ app: ["2 spare app servers", 20000], lb: ["Second load balancer", 5000], cache: ["Second cache node", 8000], db: ["Database replica", 25000] }[P.spare]);
    if (P.sms === "queue") bill.push(["SMS queue worker", 3000]);
    if (P.login === "layers") bill.push(["Login watch + phone codes", 4000]);
    if (P.login === "captcha") bill.push(["CAPTCHA service", 2000]);
    var billTotal = bill.reduce(function (s, b) { return s + b[1]; }, 0);

    /* ---- requirement verdict ---- */
    var req;
    if (P.req === "fast") {
      req = { status: "bad", title: "Promise “fast and smooth”: can’t be checked",
        text: "There is no number in it, so nobody can say whether result day passed. The registrar and the developers argue about it for a week." };
    } else if (P.req === "avg") {
      var passAvg = peakAvg <= 1;
      req = { status: passAvg ? (peakP99 > 1 ? "warn" : "good") : "bad",
        title: "Promise “good on average”: " + (passAvg ? "PASSED" : "FAILED"),
        text: "The average page during the rush took " + fmtLatency(peakAvg) + "." +
          (passAvg && peakP99 > 1 ? " It passed on paper, yet the slowest pages took " + fmtLatency(peakP99) + ": thousands of students waited that long." : "") };
    } else if (P.req === "day") {
      req = { status: peakP99 > 1 ? "bad" : "warn",
        title: "Promise “fast 99% of the day”: PASSED",
        text: "The 10-minute rush is less than 1% of the day, so it was never counted. In the rush the slowest pages took " + fmtLatency(peakP99) + "." };
    } else if (P.req === "p50normal") {
      req = { status: peakP99 > 1 ? "bad" : "warn",
        title: "Promise “proven in a load test”: PASSED",
        text: "At 09:57, with few visitors, pages were quick. In the 10:00 rush the slowest pages took " + fmtLatency(peakP99) +
          ". The test never looked at the moment that mattered." };
    } else {
      var passP99 = peakP99 <= 1;
      req = { status: passP99 ? "good" : "bad",
        title: "Promise “99 in 100, even at the peak”: " + (passP99 ? "PASSED" : "FAILED"),
        text: "In the rush, the slowest 1 in 100 pages took " + fmtLatency(peakP99) + ". " +
          (passP99 ? "A clear promise, checked and kept." : "Because the promise was clear, everyone knows exactly what failed and by how much.") };
    }

    /* ---- mark sheet ---- */
    var perfL = rushP99 <= 0.3 ? "A+" : rushP99 <= 0.6 ? "A" : rushP99 <= 1 ? "A-" : rushP99 <= 1.5 ? "B" : rushP99 <= 3 ? "C" : rushP99 <= 6 ? "D" : "F";
    var avL = availability >= 99.3 ? "A+" : availability >= 98 ? "A" : availability >= 96 ? "A-" : availability >= 93 ? "B+" :
      availability >= 90 ? "B" : availability >= 85 ? "C+" : availability >= 80 ? "C" : availability >= 70 ? "D" : "F";
    var modL = { strategy: "A+", formula: "B", ifelse: "C", copies: "D" }[P.rules];
    var secScore = 4 - (last.compromised === 0 ? 0 : last.compromised <= 10 ? 1 : 2) - (last.leaked === 0 ? 0 : last.leaked < 1000 ? 1.5 : 2.5);
    var secL = secScore >= 4 ? "A+" : secScore >= 3 ? "B" : secScore >= 2.5 ? "C+" : secScore >= 2 ? "D" : "F";
    var reqL = { p99peak: "A+", avg: "C", day: "D", p50normal: "D", fast: "F" }[P.req];
    var costL = billTotal <= 105000 ? "A+" : billTotal <= 130000 ? "A" : billTotal <= 160000 ? "B+" : billTotal <= 200000 ? "B" : billTotal <= 250000 ? "C" : "D";

    var rules = {
      strategy: { lead: "1 day", risk: "Low: one new plug-in with its own test" },
      formula: { lead: "20 minutes", risk: "High: an untested formula goes live for everyone" },
      ifelse: { lead: "3 weeks", risk: "High: edits the giant if-else in the core code" },
      copies: { lead: "2 weeks", risk: "High: three copies to patch" }
    }[P.rules];

    var courses = [
      { code: "QA-101", name: "Performance", credits: 3, l: perfL, measured: "Slowest 1 in 100 pages at 10:00: " + fmtLatency(rushP99) + " (promise: 1 s)" },
      { code: "QA-102", name: "Availability", credits: 3, l: avL, measured: fmtPct(availability, 2) + " of requests served, 10:00–11:00" },
      { code: "QA-103", name: "Modifiability", credits: 2, l: modL, measured: "New grading rule: " + rules.lead + ". " + rules.risk },
      { code: "QA-104", name: "Security", credits: 3, l: secL, measured: fmtInt(last.compromised) + " accounts taken over, " + fmtInt(last.leaked) + " results exposed" },
      { code: "QA-105", name: "Requirements", credits: 1, l: reqL, measured: req.title },
      { code: "QA-106", name: "Cost", credits: 1, l: costL, measured: taka(billTotal) + " a month" }
    ];
    var cr = 0, pts = 0;
    courses.forEach(function (c) { c.gp = grade(c.l).gp; cr += c.credits; pts += c.credits * c.gp; });
    var cgpa = pts / cr;

    var result = {
      scenario: "final", base: 600, peak: 800, people: STUDENTS, peopleFactor: P.login === "captcha" ? 0.9 : 1,
      labels: {
        reportEyebrow: "ResultHub · Result day report", sheetTitle: "Your architecture’s mark sheet", gpa: "CGPA",
        chartTitle: "How long the slowest pages took, 09:55 to 11:00", unit: "pages", downText: "Database down", downShort: "DB down"
      },
      params: P, minutes: minutes,
      metrics: {
        rushP99: rushP99, peakP99: peakP99, peakAvg: peakAvg, availability: availability, studentsOk: studentsOk,
        compromised: last.compromised, leaked: last.leaked, attemptsBlocked: attemptsBlocked,
        smsDelivered: last.smsDelivered, bill: bill, billTotal: billTotal, rules: rules
      },
      req: req, courses: courses, cgpa: cgpa, cgpaLetter: letterFor(cgpa)
    };
    result.events = buildEvents(result);
    result.feed = buildFeed(result);
    result.insights = buildInsights(result);
    result.tiles = finalTiles(result);
    return result;
  }

  function finalTiles(R) {
    var M = R.metrics, P = R.params;
    var smsText = P.sms === "none" ? "Not sent" : fmtInt(M.smsDelivered);
    var smsNote = { queue: "All sent, some up to 20 minutes late", sync: "Sent, but pages froze while waiting", retry: "Sent, with duplicate texts", none: "Guardians were never told" }[P.sms];
    return [
      ["Slowest pages at 10:00", fmtLatency(M.rushP99), "99 of 100 pages were faster. Promise: 1 s", M.rushP99 <= 1 ? "good" : M.rushP99 <= 3 ? "warn" : "bad"],
      ["Requests served", fmtPct(M.availability, 2), "10:00 to 11:00", M.availability >= 99 ? "good" : M.availability >= 90 ? "warn" : "bad"],
      ["Saw their result first try", fmtInt(M.studentsOk), "of 40,000 students", M.studentsOk >= 38000 ? "good" : M.studentsOk >= 30000 ? "warn" : "bad"],
      ["Accounts taken over", fmtInt(M.compromised), P.login === "layers" ? fmtInt(M.attemptsBlocked) + " attempts blocked" : "by password spraying", M.compromised === 0 ? "good" : M.compromised <= 10 ? "warn" : "bad"],
      ["Results exposed", fmtInt(M.leaked), "to someone other than the student", M.leaked === 0 ? "good" : "bad"],
      ["Guardian SMS", smsText, smsNote, P.sms === "queue" ? "good" : P.sms === "none" ? "bad" : "warn"],
      ["New grading rule", M.rules.lead, M.rules.risk, P.rules === "strategy" ? "good" : P.rules === "formula" ? "warn" : "bad"],
      ["Monthly bill", taka(M.billTotal), M.bill.map(function (b) { return b[0]; }).join(" · "), M.billTotal <= 130000 ? "good" : M.billTotal <= 200000 ? "warn" : "bad"]
    ];
  }

  function at(result, m) { return result.minutes[m - START]; }

  /* ------------------------------------------------------------------ events */
  function buildEvents(R) {
    var P = R.params, ev = [];
    var x0 = at(R, 1);
    var publish = { m: 0, id: "publish", label: "Rush", title: "Results are published",
      body: "Traffic jumps from 20 to 800 requests per second." };
    if (x0.overloaded) {
      publish.status = "bad";
      publish.out = "Overloaded: more students arrive than the servers can handle. About " + Math.round(x0.served * 10) + " in 10 pages load; the rest time out." +
        (P.autoscale ? " Extra servers are starting, but they need 8 minutes." : "");
    } else if (R.metrics.rushP99 > 1) {
      publish.status = "warn";
      publish.out = "Slow: the servers are " + fmtPct(x0.rho * 100, 0) + " busy, and the slowest pages take " + fmtLatency(R.metrics.rushP99) + ", more than the 1-second promise.";
    } else {
      publish.status = "good";
      publish.out = "Holding: the servers are only " + fmtPct(x0.rho * 100, 0) + " busy, and even the slowest pages take " + fmtLatency(R.metrics.rushP99) + ".";
    }
    ev.push(publish);

    var smsOut = {
      sync: ["bad", "Every result page now waits 20 s for the SMS. The threads fill up and the whole portal stops."],
      retry: ["bad", "Pages wait through up to 5 retries. The threads fill up, and the retries bury the provider."],
      queue: ["good", "Pages don’t wait. The SMS queue grows and drains once the provider recovers."],
      none: ["warn", "Pages are fine, but guardians get no SMS at all."]
    }[P.sms];
    ev.push({ m: 7, id: "sms", label: "SMS", title: "The SMS provider slows to 20 s per message",
      body: "It also fails 30% of the time, for the next 20 minutes.", status: smsOut[0], out: smsOut[1] });

    if (P.autoscale) {
      var x8 = at(R, 8);
      ev.push({ m: 8, id: "autoscale", label: "", title: "Auto-scaling adds 4 servers",
        body: "The new servers finished starting 8 minutes after the spike began.",
        status: x8.overloaded ? "bad" : "warn",
        out: "Two minutes of the rush are left. Most of the damage is done." });
    }

    var spareNote = { app: " The two spare app servers sit idle.", lb: " The spare load balancer can’t help.", cache: " The spare cache node can’t help." }[P.spare] || "";
    ev.push({ m: 15, id: "db", label: "DB", title: "The database disk fails",
      body: "Repairing it takes 20 minutes.",
      status: P.spare === "db" ? "good" : "bad",
      out: P.spare === "db" ? "The replica takes over in about 10 seconds." : "No replica. Every login and result page fails until 10:35." + spareNote });

    var urlOut = {
      check: ["good", "Access denied. The attempt is logged and nothing leaks."],
      encrypt: ["bad", "The server never checks who is asking. Encrypted links shared in group chats open other students’ results."],
      post: ["bad", "They copy the request from developer tools and change the ID. By 11:00 a script has downloaded every result."],
      login: ["bad", "They are logged in, so every request is trusted. By 11:00 a script has downloaded every result."]
    }[P.authz];
    ev.push({ m: 38, id: "url", label: "URL", title: "A student changes the ID in the URL",
      body: "They try 221-15-4513, a classmate’s ID.", status: urlOut[0], out: urlOut[1] });

    var sprayOut = {
      layers: ["good", "Spotted within a minute: suspicious networks are slowed down, staff are alerted, and a phone code stops the 2 lucky guesses."],
      captcha: ["warn", "The CAPTCHA blocks most bots, but solving services get some through, and every student has to solve puzzles."],
      peraccount: ["bad", "No account ever reaches 5 attempts. About 60 accounts are taken over by 10:54."],
      lockout: ["bad", "No account ever reaches 3 wrong passwords. About 60 accounts are taken over by 10:54."]
    }[P.login];
    ev.push({ m: 42, id: "spray", label: "Bots", title: "Bots start password spraying",
      body: "6,000 login attempts a minute, 1–2 per student ID, from hundreds of IP addresses.", status: sprayOut[0], out: sprayOut[1] });

    var rulesOut = {
      strategy: ["good", "A grace-mark plug-in with its own test, added to the list. Ready tomorrow."],
      formula: ["warn", "An admin can type the formula in 20 minutes, but it goes live for 40,000 students untested."],
      ifelse: ["bad", "Edit the giant if-else, retest every rule and release everything again: about 3 weeks."],
      copies: ["bad", "Patch every copy of the result code and hope none is missed: about 2 weeks."]
    }[P.rules];
    ev.push({ m: 56, id: "rules", label: "Rules", title: "Email from the academic council",
      body: "Next semester: grace marks for anyone within 2 marks of passing.", status: rulesOut[0], out: rulesOut[1] });

    ev.sort(function (a, b) { return a.m - b.m; });
    return ev;
  }

  /* ------------------------------------------------------------------ feed */
  var MOOD_POSTS = {
    good: ["Got my result in a second. CGPA 3.62!", "ResultHub loaded instantly this time. Who fixed it?",
      "Checked my result on mobile data in two seconds.", "Passed everything, and the portal didn’t even lag."],
    slow: ["It loads… eventually. Four seconds a click.", "Spinner, spinner, spinner… oh, there it is.",
      "Takes ages, but it does load.", "Refreshed five times before it showed up."],
    down: ["“Request timed out.” Every. Single. Semester.", "ResultHub is down again 😭",
      "Is it just me or is the portal dead?", "Error 503. My heart can’t take this."]
  };
  var HANDLES = ["@tanvir.codes", "@mim_ru", "@arif.eee", "@labiba.law", "@farhan.dev", "@nusrat.arch", "@rafi.bba", "@tasnim.cse"];

  function moodAt(x) {
    if (x.down || x.dbDown) return "down";
    if (x.overloaded) return x.served < 0.5 ? "down" : "slow";
    if (x.p99 > 1) return "slow";
    return "good";
  }

  function buildFeed(R) {
    var P = R.params, f = [], n = 0;
    function mood(m) {
      var md = moodAt(at(R, m));
      f.push({ m: m, who: HANDLES[n % HANDLES.length], text: MOOD_POSTS[md][n % 4], mood: md });
      n++;
    }
    f.push({ m: -4, who: "@rakib_cse", text: "Results at 10. Refresh button ready.", mood: "good" });
    f.push({ m: -1, who: "@nafisa.221", text: "Heart rate: 140. One minute to go.", mood: "good" });
    mood(1);
    if (P.login === "captcha") f.push({ m: 2, who: "@sakib.me", text: "A CAPTCHA just to see my result? Picking buses at 10 am…", mood: "slow" });
    mood(4);
    if (P.sms === "sync" || P.sms === "retry") f.push({ m: 8, who: "@sumaiya.bba", text: "Clicked “View result” and the page froze 😭", mood: "down" });
    if (P.sms === "queue") f.push({ m: 9, who: "@mim_ru", text: "Result showed instantly. Ammu got the SMS a bit later.", mood: "good" });
    if (P.sms === "none") f.push({ m: 12, who: "@rakibs_abbu", text: "The university used to text me the result. Nothing this time?", mood: "slow" });
    mood(11);
    if (P.spare === "db") f.push({ m: 17, who: "@labiba.law", text: "Checked again, still working. Who fixed this portal?", mood: "good" });
    else f.push({ m: 16, who: "@arif.eee", text: "ResultHub is completely down now??", mood: "down" });
    mood(24);
    if (P.spare !== "db") f.push({ m: 30, who: "@farhan.dev", text: "15 minutes of “Service unavailable”. Classic.", mood: "down" });
    if (P.authz === "check") f.push({ m: 39, who: "@shuvo.textile", text: "Tried changing the ID in the link for fun. “Access denied.” Fair enough.", mood: "good" });
    else f.push({ m: 39, who: "@priya.pharm", text: "Why can I see my roommate’s grades by changing the link??", mood: "down" });
    if (P.authz === "encrypt") f.push({ m: 47, who: "@batch221.official", text: "Links that open other people’s results are going around in Messenger groups…", mood: "down" });
    if (P.authz === "post" || P.authz === "login") f.push({ m: 46, who: "@batch221.official", text: "Someone posted a spreadsheet with EVERY student’s CGPA in the batch group…", mood: "down" });
    if (P.login === "layers") f.push({ m: 44, who: "@nusrat.arch", text: "Got a phone code for a login I didn’t make. Glad it asked!", mood: "good" });
    if (P.login === "captcha") f.push({ m: 45, who: "@sakib.me", text: "Clicked every traffic light three times to see a C+.", mood: "slow" });
    if (P.login === "peraccount" || P.login === "lockout") f.push({ m: 50, who: "@jahid.civil", text: "Someone logged into my account and changed my phone number??", mood: "down" });
    mood(52);
    var rulesPost = {
      strategy: ["@it.helpdesk", "The council’s new rule ships tomorrow. One new plug-in, nothing else touched.", "good"],
      formula: ["@it.helpdesk", "Typing the new grading rule straight into production. What could go wrong?", "slow"],
      ifelse: ["@it.helpdesk", "New grading rule? See you in three weeks.", "down"],
      copies: ["@it.helpdesk", "New grading rule. Which copy of the result code is the real one?", "down"]
    }[P.rules];
    f.push({ m: 57, who: rulesPost[0], text: rulesPost[1], mood: rulesPost[2] });
    f.sort(function (a, b) { return a.m - b.m; });
    return f;
  }

  /* ------------------------------------------------------------------ insights */
  function buildInsights(R) {
    var P = R.params, ins = [];
    if (P.cache === "warm" && P.servers < 6) ins.push({ q: "performance", html: "<b>Making each page faster beat buying servers.</b> With every result prepared in advance, each page took a fraction of the time, so even the smaller pool coped." });
    if (P.cache === "warm" && P.servers === 16) ins.push({ q: "performance", html: "<b>Most of the 16 servers sat idle.</b> With results prepared in advance, the pool was only about 5% busy at the peak. A much smaller pool would have done." });
    if (P.cache === "aside") ins.push({ q: "performance", html: "<b>Nothing was remembered when it mattered.</b> At 10:00 almost every visit was a first visit, so the database did all the work. Remembering only helped after 10:10, when students refreshed." });
    if (P.cache === "threads") ins.push({ q: "performance", html: "<b>More workers made the database slower.</b> Four times as many requests hit the database at once, and every page slowed down for everyone." });
    if (P.cache === "bigdb") ins.push({ q: "performance", html: "<b>The bigger database helped a little, at a high price.</b> Pages got slightly faster, and the monthly bill jumped." });
    if (!P.autoscale && P.servers === 4 && P.cache !== "warm") ins.push({ q: "performance", html: "<b>“Exactly enough” ran out.</b> The servers were almost never idle, so every small burst turned into a queue that kept growing." });
    if (P.autoscale && P.cache !== "warm") ins.push({ q: "performance", html: "<b>The extra servers arrived too late.</b> They came online at 10:08, after most of the rush had already timed out." });
    if (P.sms === "sync" || P.sms === "retry") ins.push({ q: "availability", html: "<b>One slow dependency stopped everything.</b> From 10:07 to 10:27 every page waited for the SMS provider, so the threads ran out and the portal froze." });
    if (P.spare !== "db") ins.push({ q: "availability", html: "<b>The weakest link failed.</b> The database outage took the portal down for 20 minutes. A replica would have taken over in seconds." });
    if (P.rules === "formula") ins.push({ q: "modifiability", html: "<b>Fast to change, risky to change.</b> Live formulas skip testing, so one typo reaches every student at once." });
    if (P.rules === "ifelse" || P.rules === "copies") ins.push({ q: "modifiability", html: "<b>The rule that changes every semester was the hardest thing to change.</b> Rule plug-ins would have made it a one-day job." });
    if (P.login === "peraccount" || P.login === "lockout") ins.push({ q: "security", html: "<b>No single account ever looked attacked.</b> One or two tries per ID stayed under every per-account limit." });
    if (P.login === "captcha") ins.push({ q: "security", html: "<b>The CAPTCHA taxed every student to slow the bots.</b> About 1 in 10 students failed it the first time." });
    if (P.authz !== "check") ins.push({ q: "security", html: "<b>Nobody checked who was asking.</b> Authorization has to happen on every request, not once at login." });
    if (!ins.length) ins.push({ q: "performance", html: "<b>Every part held up.</b> Results prepared in advance, room to breathe, SMS sent later, a database twin and layered security: result day was boring, which is exactly the goal." });
    return ins;
  }

  /* ================================================================== SALE DAY (Round 1) */
  /* Eid Express, 08:55 to 10:00. Every warm-up part changes something visible:
   *   metric  → whether the dashboard notices a slow-tail bug at 9:05
   *   engine  → whether the 9:00 rush swamps the database (DB capacity 40 bookings/s)
   *   setup   → what a server crash at 9:15 does (repair takes 15 minutes)
   *   wallet  → what the wallet company slowing down at 9:22 does
   *   pay     → how long adding wallet number 3 takes (9:40)
   *   login   → what bots guessing passwords at 9:45 do
   */
  var TRAVELLERS = 50000;
  var W_DEFAULTS = { metric: "avg", engine: "workers", setup: "one", wallet: "wait", pay: "ifelse", login: "strongpw" };
  function wLambda(m) { return m < 0 ? 5 : m < 10 ? 60 : m < 20 ? 35 : m < 40 ? 15 : 8; }

  function computeWarm(params) {
    var P = {}, k;
    for (k in W_DEFAULTS) P[k] = W_DEFAULTS[k];
    for (k in (params || {})) P[k] = params[k];
    var lambdaTotal = 0, m;
    for (m = 0; m < END; m++) lambdaTotal += wLambda(m);
    var fixAt = P.metric === "p99" ? 8 : 30;
    var minutes = [], breached = 0, lockedOut = 0, pending = 0, doubles = 0, unseen = 0, seen = 0, tailPeople = 0;
    for (m = START; m < END; m++) {
      var lambda = wLambda(m);
      var baseThreads = { one: 10, premium: 12, nightly: 10, two: 16, micro5: 10 }[P.setup];
      var threads = baseThreads * (P.engine === "workers" ? 2 : 1) * (P.wallet === "more" ? 2 : 1);
      var crashed = m >= 15 && m < 30, down = false, failedIdx = [];
      if (crashed) {
        if (P.setup === "two") { threads = threads / 2; failedIdx = [0]; }
        else { down = true; failedIdx = P.setup === "micro5" ? [2] : [0]; }
      }
      if (P.setup === "micro5" && m >= 50 && m < 53) { down = true; failedIdx = [4]; }
      var miss = P.engine === "cache" ? 0.1 : 1;
      var dbLoad = lambda * miss / 40, dbOver = dbLoad >= 0.95;
      var tdb = dbOver ? 2.5 : 0.25 / (1 - dbLoad);
      var W = (P.engine === "fast" ? 0.02 : 0.05) + miss * tdb;
      if (P.setup === "premium") W *= 0.9;
      var walletSlow = m >= 22 && m < 40;
      if (walletSlow) {
        if (P.wallet === "wait" || P.wallet === "more") W += 0.5 * 20;
        else if (P.wallet === "retry") W += 0.5 * 45;
        else if (P.wallet === "timeout" && m === 22) W += 0.15;
      }
      var rho = lambda * W / threads;
      var p99, avg, served, overloaded = false;
      if (rho < 0.95) { p99 = W * (1.5 + rho / (1 - rho)); avg = W * (1 + 0.5 * rho / (1 - rho)); served = 1; }
      else { overloaded = true; p99 = 10; avg = 6; served = Math.max(0.02, Math.min(1, 0.9 / rho)); }
      if (dbOver) { overloaded = true; served = Math.min(served, 0.9 / dbLoad); p99 = 10; avg = Math.max(avg, 5); }
      if (P.engine === "room" && overloaded) served = Math.min(1, served + 0.15);
      p99 = Math.min(p99, 10);
      var tail = m >= 5 && m < fixAt, pCore = p99;
      if (tail && !overloaded) { p99 = Math.max(p99, 6.2); avg += 0.06; }
      if (down) { served = 0; p99 = null; avg = null; pCore = null; }
      // what the dashboard shows
      var dash, alarm;
      if (P.metric === "p99") { dash = p99 == null ? "down" : fmtLatency(p99); alarm = p99 == null || p99 > 1; }
      else if (P.metric === "avg") { dash = avg == null ? "down" : fmtLatency(avg); alarm = avg == null || avg > 1; }
      else if (P.metric === "median") { var med = down ? null : overloaded ? 4 : W * 0.85; dash = med == null ? "down" : fmtLatency(med); alarm = med == null || med > 1; }
      else { var cpu = down ? 0 : dbOver ? 38 : Math.min(97, Math.round(rho * 60 + 12)); dash = cpu + "%"; alarm = cpu > 90; }
      // who suffered, and whether anyone noticed
      if (m >= 0) {
        var hurt = down ? lambda * 60 : overloaded ? lambda * 60 * (1 - served * 0.4) : (p99 > 1 ? lambda * 60 * (tail ? 0.01 : 0.05) : 0);
        if (alarm) seen += hurt; else unseen += hurt;
        if (tail && !down) tailPeople += lambda * 60 * 0.01;
      }
      if (walletSlow && m >= 0) {
        if (P.wallet === "timeout") pending += lambda * 60 * 0.5 * served;
        if (P.wallet === "retry") doubles += lambda * 60 * 0.5 * served * 0.04;
      }
      var attack = m >= 45 && m < 57, blockedNow = 0;
      if (attack) {
        if (P.login === "strongpw") breached += 1.5;
        else if (P.login === "lockout") { lockedOut += 30; blockedNow = 0.75; }
        else if (P.login === "ratelimit") blockedNow = m >= 46 ? 0.97 : 0.4;
        else if (P.login === "hidden") { if (m >= 48) breached += 1.5; else blockedNow = 1; }
      }
      minutes.push({
        m: m, lambda: lambda, servers: P.setup === "two" ? 2 : P.setup === "micro5" ? 5 : 1, failedIdx: failedIdx,
        threads: threads, W: W, rho: rho, p99: p99, pCore: pCore, avg: avg, served: served, overloaded: overloaded, down: down,
        dbOver: dbOver, dbLoad: dbLoad, tail: tail, walletSlow: walletSlow, dash: dash, alarm: alarm,
        attack: attack, blockedNow: blockedNow, compromised: Math.round(breached), lockedOut: Math.round(lockedOut),
        pending: Math.round(pending), doubles: Math.round(doubles)
      });
    }
    var rushP99 = 0, tot = 0, ok = 0, okFast = 0;
    minutes.forEach(function (x) {
      if (x.m >= 0 && x.m < 5) rushP99 = Math.max(rushP99, x.p99 == null ? 10 : x.p99);
      if (x.m >= 0) {
        tot += x.lambda; ok += x.lambda * x.served;
        var f = x.pCore == null ? 0 : x.pCore <= 1 ? 1 : x.pCore <= 3 ? 0.8 : 0.5;
        okFast += x.lambda * x.served * f * (x.tail ? 0.99 : 1);
      }
    });
    var availability = ok / tot * 100, ticketsOk = TRAVELLERS * okFast / tot;
    var last = minutes[minutes.length - 1];
    var pay = {
      plugin: { lead: "1 day", risk: "Low: one new plug-in, booking code untouched" },
      ifelse: { lead: "2 weeks", risk: "High: edits and retests the core booking code" },
      copy: { lead: "1 week", risk: "High: a third copy of the code to fix forever" },
      direct: { lead: "1 day", risk: "High: outside code writes into our database" }
    }[P.pay];
    var metricName = { p99: "Slowest 1 in 100", avg: "Average time", median: "Typical time", cpu: "Server load" }[P.metric];
    var req = P.metric === "p99"
      ? { status: "good", title: "Speed check “" + metricName + "”: caught it", text: "The 9:05 seat-map bug set off the alarm at once and was fixed by 9:08. About " + fmtInt(tailPeople) + " travellers waited 6 s." }
      : { status: "bad", title: "Speed check “" + metricName + "”: looked fine",
          text: "When 1 in 100 bookings took 6 s from 9:05, the dashboard " + (P.metric === "cpu" ? "showed normal server load" : "barely moved") +
            ". Nobody noticed until complaints at 9:30: about " + fmtInt(tailPeople) + " travellers waited 6 s." };

    var perfL = rushP99 <= 0.3 ? "A+" : rushP99 <= 0.6 ? "A" : rushP99 <= 1 ? "A-" : rushP99 <= 1.5 ? "B" : rushP99 <= 3 ? "C" : rushP99 <= 6 ? "D" : "F";
    var avL = availability >= 99.3 ? "A+" : availability >= 98 ? "A" : availability >= 96 ? "A-" : availability >= 93 ? "B+" :
      availability >= 90 ? "B" : availability >= 85 ? "C+" : availability >= 80 ? "C" : availability >= 70 ? "D" : "F";
    var measL = { p99: "A+", avg: "C", median: "C", cpu: "D" }[P.metric];
    var modL = { plugin: "A+", ifelse: "C", copy: "D", direct: "D" }[P.pay];
    var secScore = 4 - (last.compromised === 0 ? 0 : last.compromised <= 10 ? 1.5 : 2) - (last.lockedOut > 0 ? 1.75 : 0);
    var secL = secScore >= 4 ? "A+" : secScore >= 3 ? "B" : secScore >= 2.25 ? "C" : secScore >= 2 ? "D" : "F";
    var courses = [
      { code: "EID-101", name: "Measurement", credits: 2, l: measL, measured: req.title },
      { code: "EID-102", name: "Performance", credits: 3, l: perfL, measured: "Slowest 1 in 100 bookings at 9:00: " + fmtLatency(rushP99) + " (aim: 1 s)" },
      { code: "EID-103", name: "Availability", credits: 3, l: avL, measured: fmtPct(availability, 2) + " of bookings served, 9:00–10:00" },
      { code: "EID-104", name: "Modifiability", credits: 2, l: modL, measured: "Wallet number 3: " + pay.lead + ". " + pay.risk },
      { code: "EID-105", name: "Security", credits: 3, l: secL, measured: fmtInt(last.compromised) + " accounts taken over, " + fmtInt(last.lockedOut) + " customers locked out" }
    ];
    var cr = 0, pts = 0;
    courses.forEach(function (c) { c.gp = grade(c.l).gp; cr += c.credits; pts += c.credits * c.gp; });
    var R = {
      scenario: "warm", base: 540, peak: 60, people: TRAVELLERS, peopleFactor: 1,
      labels: {
        reportEyebrow: "Eid Express · Sale day report", sheetTitle: "Your design’s report card", gpa: "GPA",
        chartTitle: "How long the slowest bookings took, 08:55 to 10:00", unit: "bookings", downText: "Servers crashed", downShort: "crashed"
      },
      params: P, minutes: minutes,
      metrics: { rushP99: rushP99, availability: availability, ticketsOk: ticketsOk, unseen: unseen, seen: seen, tailPeople: tailPeople,
        compromised: last.compromised, lockedOut: last.lockedOut, pending: last.pending, doubles: last.doubles, pay: pay, metricName: metricName },
      req: req, courses: courses, cgpa: pts / cr
    };
    R.cgpaLetter = letterFor(R.cgpa);
    R.events = warmEvents(R);
    R.feed = warmFeed(R);
    R.insights = warmInsights(R);
    R.tiles = warmTiles(R);
    return R;
  }

  function warmEvents(R) {
    var P = R.params, ev = [], x0 = at(R, 1);
    var rush = { m: 0, label: "Rush", title: "Ticket sales open", body: "Thousands of travellers arrive in the first minutes." };
    if (x0.dbOver) { rush.status = "bad"; rush.out = "The database is swamped: every booking waits for the routes and fares list. Only about " + Math.round(x0.served * 10) + " in 10 bookings get through."; }
    else if (x0.overloaded) { rush.status = "bad"; rush.out = "Overloaded: about " + Math.round(x0.served * 10) + " in 10 bookings get through; the rest time out."; }
    else if (R.metrics.rushP99 > 1) { rush.status = "warn"; rush.out = "Slow: the slowest bookings take " + fmtLatency(R.metrics.rushP99) + "."; }
    else { rush.status = "good"; rush.out = "Holding: most bookings skip the slow database, and even the slowest take " + fmtLatency(R.metrics.rushP99) + "."; }
    ev.push(rush);
    var mName = R.metrics.metricName;
    ev.push({ m: 5, label: "Bug", title: "A seat-map bug slows 1 in 100 bookings to 6 s", body: "Everyone else is unaffected. Does the dashboard notice?",
      status: P.metric === "p99" ? "good" : "bad",
      out: P.metric === "p99" ? "“Slowest 1 in 100” jumps to 6 s and the alarm goes off. Fixed by 9:08."
        : P.metric === "cpu" ? "Server load looks perfectly normal. Nobody notices until complaints at 9:30."
        : "“" + mName + "” barely moves. Nobody notices until complaints at 9:30." });
    ev.push({ m: 15, label: "Crash", title: "A server crashes", body: "Repairing it takes 15 minutes.",
      status: P.setup === "two" ? "good" : "bad",
      out: { two: "The second server carries on. Bookings slow a little but keep selling.",
        micro5: "The seat service is down, so no booking can finish until 9:30.",
        premium: "The premium server is down: no sales at all until 9:30.",
        nightly: "Last night’s fresh restart didn’t prevent it: no sales until 9:30." }[P.setup] });
    ev.push({ m: 22, label: "Wallet", title: "The wallet company slows to 20 s per payment", body: "Half of all bookings pay by wallet, for the next 18 minutes.",
      status: P.wallet === "timeout" ? "good" : "bad",
      out: { timeout: "Wallet payments give up after 2 s and show “payment pending”. Card payments keep flowing.",
        wait: "Workers sit waiting on the wallet. Soon card payments stop too.",
        retry: "Retries pile up, the wallet company drowns, and some customers are charged twice.",
        more: "More workers just means more of them waiting. The site still freezes." }[P.wallet] });
    ev.push({ m: 40, label: "Wallet 3", title: "Marketing: a new wallet goes live next week", body: "How long does adding it take?",
      status: P.pay === "plugin" ? "good" : "bad",
      out: { plugin: "One new plug-in; the booking code is untouched. Ready tomorrow.",
        ifelse: "Edit the booking code again, retest every payment and redeploy: about 2 weeks.",
        copy: "Copy the code again: now there are three versions to fix forever.",
        direct: "Their code writes straight into our database. Quick, and a security hole." }[P.pay] });
    ev.push({ m: 45, label: "Bots", title: "Bots try thousands of leaked passwords", body: "Customers keep logging in at the same time.",
      status: P.login === "ratelimit" ? "good" : P.login === "lockout" ? "warn" : "bad",
      out: { ratelimit: "Guesses slow to a crawl and staff are alerted within a minute. No accounts lost.",
        lockout: "No accounts lost, but the bots lock out 360 real customers on sale day.",
        strongpw: "The bots use real leaked passwords, so the rule doesn’t matter: 18 accounts taken over.",
        hidden: "The bots find the hidden page by 9:48: 14 accounts taken over." }[P.login] });
    if (P.setup === "micro5") ev.push({ m: 50, label: "", title: "Another of the five services crashes", body: "This time it is payments.",
      status: "bad", out: "Three more minutes with no sales. More pieces in a chain means more crashes." });
    ev.sort(function (a, b) { return a.m - b.m; });
    return ev;
  }

  var W_POSTS = {
    good: ["Got my Eid ticket in seconds!", "Booked two seats home. Smooth this year.", "Ticket done before my tea got cold.", "Eid Express actually worked this time."],
    slow: ["The booking page takes forever…", "Spinner, spinner, spinner… booked, finally.", "So slow, but it went through.", "Refreshed five times before it worked."],
    down: ["Eid Express is DOWN on sale day 😭", "“Request timed out.” Every. Single. Eid.", "Is it just me or is the site dead?", "Error 503. There go my seats."]
  };
  var W_HANDLES = ["@rahim.goes.home", "@nadia_travels", "@sabbir.bus", "@tumpa.eid", "@karim.cse", "@mitu_bd", "@rony.road", "@sharmin.home"];

  function warmFeed(R) {
    var P = R.params, f = [], n = 0;
    function mood(m) {
      var md = moodAt(at(R, m));
      f.push({ m: m, who: W_HANDLES[n % W_HANDLES.length], text: W_POSTS[md][n % 4], mood: md });
      n++;
    }
    f.push({ m: -4, who: "@rahim.goes.home", text: "Ticket sale at 9. Alarm set, phone charged.", mood: "good" });
    f.push({ m: -1, who: "@nadia_travels", text: "One minute to go. Fingers ready.", mood: "good" });
    mood(1); mood(3);
    if (P.metric !== "p99") f.push({ m: 7, who: "@tumpa.eid", text: "Seat map took 6 seconds to load, every single time…", mood: "slow" });
    else f.push({ m: 8, who: "@eidexpress.it", text: "Spotted a slow seat-map query on the dashboard. Fixed.", mood: "good" });
    mood(11);
    if (P.setup === "two") f.push({ m: 17, who: "@karim.cse", text: "Site got a bit slow for a while, but my ticket came through.", mood: "good" });
    else f.push({ m: 16, who: "@mitu_bd", text: "The site is completely down now??", mood: "down" });
    if (P.wallet === "timeout") f.push({ m: 24, who: "@sharmin.home", text: "Wallet said “payment pending”, so I paid by card. Done.", mood: "good" });
    if (P.wallet === "retry") f.push({ m: 26, who: "@rony.road", text: "I got charged TWICE for one ticket!", mood: "down" });
    if (P.wallet === "wait" || P.wallet === "more") f.push({ m: 25, who: "@rony.road", text: "Even card payments are stuck now. What is going on?", mood: "down" });
    if (P.metric !== "p99") f.push({ m: 30, who: "@eidexpress.it", text: "Complaints about a slow seat map? The dashboard looked fine…", mood: "slow" });
    mood(34);
    var payPost = { plugin: ["@eidexpress.it", "Wallet 3 plugs in tomorrow. Booking code untouched.", "good"],
      ifelse: ["@eidexpress.it", "Wallet 3? See you in two weeks, after we retest everything.", "down"],
      copy: ["@eidexpress.it", "Wallet 3 gets its own copy of the code. Copy number three.", "slow"],
      direct: ["@eidexpress.it", "Wallet 3’s team now writes straight into our database. Fingers crossed.", "slow"] }[P.pay];
    f.push({ m: 41, who: payPost[0], text: payPost[1], mood: payPost[2] });
    if (P.login === "lockout") f.push({ m: 48, who: "@nadia_travels", text: "My account is LOCKED and I never even typed a wrong password!", mood: "down" });
    if (P.login === "strongpw" || P.login === "hidden") f.push({ m: 50, who: "@sabbir.bus", text: "Someone booked a ticket on MY account??", mood: "down" });
    if (P.login === "ratelimit") f.push({ m: 47, who: "@eidexpress.it", text: "Bot attack slowed to a crawl. Nobody got in.", mood: "good" });
    mood(55);
    f.sort(function (a, b) { return a.m - b.m; });
    return f;
  }

  function warmInsights(R) {
    var P = R.params, ins = [];
    if (P.metric !== "p99") ins.push({ q: "performance", html: "<b>The dashboard was watching the wrong number.</b> One slow booking in a hundred hardly moves an average, so a real problem hid for 25 minutes." });
    if (P.engine !== "cache") ins.push({ q: "performance", html: "<b>Every booking still waited on the database.</b> " +
      ({ workers: "More workers just made a longer line at the same database.", fast: "A faster web server can’t speed up the database.", room: "The waiting room made the line polite, not shorter." }[P.engine]) + " A cached fare list removes the slow step." });
    if (P.setup !== "two") ins.push({ q: "availability", html: "<b>One crash stopped all sales.</b> " +
      ({ micro5: "With five services in a chain, any one of them can stop a booking, and two of them did.", premium: "A premium server still fails sometimes, and then there is nothing else.", nightly: "A nightly restart doesn’t stop a crash in the middle of the morning." }[P.setup]) });
    if (P.wallet !== "timeout") ins.push({ q: "availability", html: "<b>A slow partner froze the whole site.</b> Without a time limit, every wallet call held a worker hostage, and card payments queued behind them." });
    if (P.pay !== "plugin") ins.push({ q: "modifiability", html: "<b>The next wallet is already expensive.</b> Payment options change every few months; a plug-in socket would make each one a one-day job." });
    if (P.login === "lockout") ins.push({ q: "security", html: "<b>The lock became the attacker’s weapon.</b> Bots locked real customers out of their own accounts on sale day." });
    if (P.login === "strongpw" || P.login === "hidden") ins.push({ q: "security", html: "<b>Nothing slowed the guessing down.</b> Leaked passwords already work, and hidden pages are found. Limiting tries per account would have stopped it." });
    if (!ins.length) ins.push({ q: "performance", html: "<b>Every part held up.</b> The right dashboard, a cached fare list, a spare server, a time limit on the wallet, plug-in payments and a login limit: sale day was boring, which is exactly the goal." });
    return ins;
  }

  function warmTiles(R) {
    var M = R.metrics, P = R.params;
    var walletV = { timeout: fmtInt(M.pending) + " pending", retry: fmtInt(M.doubles) + " charged twice", wait: "Site froze", more: "Site froze" }[P.wallet];
    var walletN = { timeout: "Card payments kept flowing", retry: "And the site froze too", wait: "Card payments stopped too", more: "More workers waited longer" }[P.wallet];
    return [
      ["Slowest bookings at 9:00", fmtLatency(M.rushP99), "99 of 100 were faster. Aim: 1 s", M.rushP99 <= 1 ? "good" : M.rushP99 <= 3 ? "warn" : "bad"],
      ["Bookings served", fmtPct(M.availability, 2), "9:00 to 10:00", M.availability >= 99 ? "good" : M.availability >= 90 ? "warn" : "bad"],
      ["Got a ticket first try", fmtInt(M.ticketsOk), "of 50,000 travellers", M.ticketsOk >= 47000 ? "good" : M.ticketsOk >= 38000 ? "warn" : "bad"],
      ["Suffering nobody noticed", fmtInt(M.unseen), "travellers, while the dashboard looked fine", M.unseen < 500 ? "good" : M.unseen < 3000 ? "warn" : "bad"],
      ["Wallet payments", walletV, walletN, P.wallet === "timeout" ? "good" : "bad"],
      ["Wallet number 3", M.pay.lead, M.pay.risk, P.pay === "plugin" ? "good" : "bad"],
      ["Accounts taken over", fmtInt(M.compromised), "by password-guessing bots", M.compromised === 0 ? "good" : "bad"],
      ["Customers locked out", fmtInt(M.lockedOut), "of their own accounts", M.lockedOut === 0 ? "good" : "bad"]
    ];
  }


  /* ------------------------------------------------------------------ chart */
  var CH = { w: 760, h: 214, ml: 54, mr: 14, mt: 30, mb: 44 };
  function cx(m) { return CH.ml + (m - START) / (END - START) * (CH.w - CH.ml - CH.mr); }
  function cy(v) {
    var lo = Math.log10(0.03), hi = Math.log10(10), ph = CH.h - CH.mt - CH.mb;
    var t = (Math.log10(Math.max(0.03, Math.min(10, v))) - lo) / (hi - lo);
    return CH.mt + ph - t * ph;
  }

  function chartSVG(R, upto) {
    var ph = CH.h - CH.mt - CH.mb, s = [];
    s.push('<svg viewBox="0 0 ' + CH.w + " " + CH.h + '" role="img" aria-label="Slowest 1 in 100 ' + R.labels.unit + ' over time, log scale, with a 1 second line">');
    // down bands
    R.minutes.forEach(function (x) {
      if (x.m <= upto && x.p99 == null) s.push('<rect x="' + cx(x.m).toFixed(1) + '" y="' + CH.mt + '" width="' + (cx(x.m + 1) - cx(x.m)).toFixed(1) + '" height="' + ph + '" style="fill:var(--bad-tint)"/>');
    });
    // grid + y labels
    [[0.05, "50 ms"], [0.1, "100 ms"], [0.3, "300 ms"], [1, "1 s"], [3, "3 s"], [10, "10 s"]].forEach(function (t) {
      var y = cy(t[0]).toFixed(1);
      s.push('<line x1="' + CH.ml + '" x2="' + (CH.w - CH.mr) + '" y1="' + y + '" y2="' + y + '" style="stroke:var(--line);stroke-width:1"/>');
      s.push('<text x="' + (CH.ml - 8) + '" y="' + y + '" text-anchor="end" dominant-baseline="middle">' + t[1] + "</text>");
    });
    // target line
    var ty = cy(1).toFixed(1);
    s.push('<line x1="' + CH.ml + '" x2="' + (CH.w - CH.mr) + '" y1="' + ty + '" y2="' + ty + '" style="stroke:var(--ink-2);stroke-width:1.5;stroke-dasharray:6 5"/>');
    s.push('<text x="' + (CH.w - CH.mr - 2) + '" y="' + (cy(1) - 6).toFixed(1) + '" text-anchor="end" style="fill:var(--ink-2);font-weight:700">1 s promise</text>');
    // event markers (only those reached)
    var row = 0;
    R.events.forEach(function (e) {
      if (!e.label || e.m > upto) return;
      var x = cx(e.m).toFixed(1);
      s.push('<line x1="' + x + '" x2="' + x + '" y1="' + (CH.mt - 4) + '" y2="' + (CH.mt + ph) + '" style="stroke:var(--ink-2);stroke-width:1;stroke-dasharray:2 3;opacity:.45"/>');
      s.push('<text x="' + x + '" y="' + (row % 2 ? CH.mt - 8 : CH.mt - 19) + '" text-anchor="middle" style="fill:var(--ink-2);font-weight:700">' + esc(e.label) + "</text>");
      row++;
    });
    // p99 line
    var d = "", pen = false, lastPt = null;
    R.minutes.forEach(function (x) {
      if (x.m > upto) return;
      if (x.p99 == null) { pen = false; return; }
      var px = cx(x.m + 0.5).toFixed(1), py = cy(x.p99).toFixed(1);
      d += (pen ? "L" : "M") + px + " " + py + " ";
      pen = true; lastPt = [px, py];
    });
    if (d) s.push('<path d="' + d + '" style="fill:none;stroke:var(--avail);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round"/>');
    if (lastPt) s.push('<circle cx="' + lastPt[0] + '" cy="' + lastPt[1] + '" r="4.5" style="fill:var(--avail);stroke:var(--surface);stroke-width:2"/>');
    // served strip
    var sy = CH.mt + ph + 8;
    R.minutes.forEach(function (x) {
      if (x.m > upto) return;
      var c = x.served >= 0.995 ? "var(--good)" : x.served >= 0.8 ? "var(--warn)" : "var(--bad)";
      s.push('<rect x="' + (cx(x.m) + 0.5).toFixed(1) + '" y="' + sy + '" width="' + Math.max(1, cx(x.m + 1) - cx(x.m) - 1.5).toFixed(1) + '" height="8" rx="2" style="fill:' + c + '"/>');
    });
    // x labels
    [-5, 0, 10, 20, 30, 40, 50, 60].forEach(function (m) {
      s.push('<text x="' + cx(m).toFixed(1) + '" y="' + (CH.h - 8) + '" text-anchor="' + (m === END ? "end" : "middle") + '">' + clock(m, R.base) + "</text>");
    });
    s.push('<line class="xh" x1="0" x2="0" y1="' + CH.mt + '" y2="' + (CH.mt + ph) + '" style="stroke:var(--ink);stroke-width:1;opacity:0"/>');
    s.push('<rect class="hit" x="' + CH.ml + '" y="0" width="' + (CH.w - CH.ml - CH.mr) + '" height="' + CH.h + '" style="fill:transparent"/>');
    s.push("</svg>");
    return s.join("");
  }

  function chartLegend(R) {
    return '<div class="legend">' +
      '<span><i style="background:var(--avail)"></i>Slowest 1 in 100 ' + R.labels.unit + ' (p99)</span>' +
      '<span><i style="background:repeating-linear-gradient(90deg,var(--ink-2) 0 5px,transparent 5px 9px)"></i>1-second promise</span>' +
      '<span><i class="sq" style="background:var(--good)"></i>Served ≥ 99.5%</span>' +
      '<span><i class="sq" style="background:var(--warn)"></i>80–99.5%</span>' +
      '<span><i class="sq" style="background:var(--bad)"></i>Under 80%</span>' +
      '<span><i class="sq" style="background:var(--bad-tint);outline:1px solid var(--bad)"></i>Site down</span>' +
      "</div>";
  }

  function attachChartHover(wrap, R, getUpto) {
    var tip = document.createElement("div");
    tip.className = "chart-tip"; tip.hidden = true;
    wrap.appendChild(tip);
    function move(ev) {
      var svg = wrap.querySelector("svg");
      if (!svg) return;
      var r = svg.getBoundingClientRect();
      var vx = (ev.clientX - r.left) / r.width * CH.w;
      var m = Math.floor(START + (vx - CH.ml) / (CH.w - CH.ml - CH.mr) * (END - START));
      var upto = getUpto();
      if (m < START || m >= END || m > upto) { hide(); return; }
      var x = at(R, m);
      var line = svg.querySelector(".xh");
      var lx = cx(m + 0.5);
      line.setAttribute("x1", lx); line.setAttribute("x2", lx); line.style.opacity = ".5";
      tip.innerHTML = "<b>" + clock(m, R.base) + "</b> · " + fmtInt(x.lambda) + " requests/s<br>slowest " + R.labels.unit + " " + fmtLatency(x.p99) + " · served " + fmtPct(x.served * 100, 0);
      var wr = wrap.getBoundingClientRect();
      tip.style.left = (r.left - wr.left + lx / CH.w * r.width + wrap.scrollLeft) + "px";
      tip.style.top = (r.top - wr.top + (x.p99 == null ? CH.mt + 30 : cy(x.p99)) / CH.h * r.height) + "px";
      tip.hidden = false;
    }
    function hide() {
      tip.hidden = true;
      var line = wrap.querySelector(".xh");
      if (line) line.style.opacity = "0";
    }
    wrap.addEventListener("mousemove", move);
    wrap.addEventListener("mouseleave", hide);
  }

  /* ------------------------------------------------------------------ report */
  function statusIcon(s) { return icon(s, "status-ico"); }

  function reportHTML(R) {
    var L = R.labels;
    var rows = R.courses.map(function (c) {
      return "<tr><td class=\"code-c\">" + c.code + "</td><td><b>" + c.name + "</b><span class=\"m\">" + esc(c.measured) + "</span></td>" +
        '<td class="mono">' + c.credits.toFixed(1) + '</td><td><span class="grade ' + gradeClass(c.l) + '">' + c.l + '</span></td><td class="mono">' + c.gp.toFixed(2) + "</td></tr>";
    }).join("");
    function tile(t) { return '<div class="tile ' + (t[3] || "") + '"><div class="k">' + t[0] + '</div><div class="v">' + t[1] + '</div><div class="n">' + t[2] + "</div></div>"; }
    var tiles = R.tiles.map(tile).join("");
    var outcomes = R.events.map(function (e) {
      return '<li class="' + e.status + '">' + statusIcon(e.status) + "<div><span class=\"t\">" + clock(e.m, R.base) + "</span><b>" + esc(e.title) + "</b><br>" + esc(e.out) + "</div></li>";
    }).join("");
    var insights = R.insights.map(function (i) { return '<div class="insight q-' + i.q + '">' + i.html + "</div>"; }).join("");

    return '' +
      '<div class="report">' +
        '<div style="display:grid;gap:20px;min-width:0">' +
          '<div class="card marksheet">' +
            '<div class="ms-head"><div><div class="eyebrow">' + L.reportEyebrow + "</div><h2>" + L.sheetTitle + "</h2>" +
            '<div class="id">Course: CSE 444 · Lecture 2 · Quality Attributes</div></div>' +
            '<div class="cgpa"><div class="num">' + R.cgpa.toFixed(2) + '</div><div class="lt">' + L.gpa + " · " + R.cgpaLetter + "</div></div></div>" +
            '<div class="ms-table-wrap"><table class="ms-table"><thead><tr><th>Code</th><th>Course &amp; what we measured</th><th>Credit</th><th>Grade</th><th>Point</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
          "</div>" +
          '<div class="req-verdict ' + R.req.status + '">' + statusIcon(R.req.status) + "<div><b>" + esc(R.req.title) + "</b><br>" + esc(R.req.text) + "</div></div>" +
          '<div class="card" style="display:grid;gap:14px"><div class="eyebrow">Why it turned out this way</div><div class="insights">' + insights + "</div></div>" +
        "</div>" +
        '<div style="display:grid;gap:20px;min-width:0">' +
          '<div class="tiles">' + tiles + "</div>" +
          '<div class="card" style="display:grid;gap:14px"><div class="eyebrow">What happened</div><ul class="outcomes">' + outcomes + "</ul></div>" +
        "</div>" +
      "</div>" +
      '<div class="card timeline-card"><div class="lbl"><span>' + L.chartTitle + '</span><span>Hover for details</span></div>' +
      '<div class="chart-wrap" data-chart>' + chartSVG(R, END - 1) + "</div>" + chartLegend(R) + "</div>";
  }

  function attachReport(root, R) {
    var wrap = root.querySelector("[data-chart]");
    if (wrap) attachChartHover(wrap, R, function () { return END - 1; });
  }

  /* ------------------------------------------------------------------ live view: shared engine */
  var COLORS = { good: "#16A34A", warn: "#F59E0B", bad: "#EF4444", attack: "#EC4899", sms: "#3B82F6", wallet: "#14B8A6", blocked: "#94A3B8", edge: "#CBD5E1" };

  function node(id, x, y, ic, label, sub, extra) {
    return '<div class="node ' + (extra || "") + '" data-node="' + id + '" style="left:' + x + "%;top:" + y + '%">' + icon(ic) +
      "<span>" + label + '</span><span class="sub" data-sub>' + (sub || "") + "</span></div>";
  }
  function appNode(x, y, label) {
    return '<div class="node app" data-node="app" style="left:' + x + "%;top:" + y + '%">' + icon("server") + "<span>" + label + '</span><span class="sub" data-sub></span><div class="servers" data-servers></div></div>';
  }
  function gauge(label, valAttr) {
    return '<div class="gauge"><div class="lbl"><span>' + label + '</span></div><div class="val" data-' + valAttr + ">–</div></div>";
  }

  function shellHTML(R, V) {
    var legend = V.legend.map(function (l) { return '<span><i class="sq" style="background:' + l[0] + ';border-radius:50%"></i>' + l[1] + "</span>"; }).join("");
    return '' +
      '<div class="sim">' +
        '<div class="sim-main">' +
          '<div class="sim-head"><div><div class="eyebrow">' + V.eyebrow + "</div><h1>" + V.title + "</h1></div>" +
            '<div class="sim-controls">' +
              '<button class="btn btn-sm" data-sim="play">Pause</button>' +
              '<div class="seg" role="group" aria-label="Speed"><button data-sim="speed" data-v="1" class="on">1×</button><button data-sim="speed" data-v="2">2×</button><button data-sim="speed" data-v="4">4×</button></div>' +
              '<label class="toggle"><input type="checkbox" id="sim-pause-events" data-sim="pauseev" checked> Pause at each event</label>' +
              '<button class="btn btn-ghost btn-sm" data-sim="skip">Skip to the end</button>' +
            "</div></div>" +
          '<div class="event-banner idle" data-banner aria-live="polite"></div>' +
          '<div class="diagram-wrap"><div class="diagram"><canvas></canvas>' + V.nodes(R) + "</div></div>" +
          '<div class="legend" aria-label="Dot colours">' + legend + "</div>" +
          '<div class="card timeline-card"><div class="lbl"><span>' + V.chartTitle + '</span><span>Log scale</span></div>' +
            '<div class="chart-wrap" data-chart></div>' + chartLegend(R) + "</div>" +
        "</div>" +
        '<aside class="gauges">' +
          '<div class="clock"><span class="phase" data-phase></span><span class="time" data-clock></span><span class="phase" data-lambda></span></div>' +
          '<div class="gauge"><div class="lbl"><span>' + V.p99Label + '</span><span>aim 1 s</span></div><div class="val" data-p99>–</div><div class="state" data-p99s></div></div>' +
          V.gaugesTop(R) +
          '<div class="gauge"><div class="lbl"><span>' + V.busyLabel + '</span><span data-rhot></span></div><div class="meter"><i data-rho></i><span class="mark" style="left:65%" data-l="65%"></span></div><div style="height:12px"></div></div>' +
          '<div class="gauge-pair">' + gauge("Served", "served") + gauge(V.peopleLabel, "people") + "</div>" +
          V.gauges(R) +
          '<div class="feed-wrap" style="display:grid;gap:8px"><div class="eyebrow">' + V.feedTag + '</div><div class="feed" data-feed></div></div>' +
        "</aside>" +
      "</div>";
  }

  function mount(root, R, opts) {
    opts = opts || {};
    var V = VIEWS[R.scenario];
    root.innerHTML = shellHTML(R, V);
    function $(s) { return root.querySelector(s); }
    var diagram = $(".diagram"), canvas = $("canvas"), ctx = canvas.getContext("2d");
    var nodes = {};
    root.querySelectorAll("[data-node]").forEach(function (n) { nodes[n.dataset.node] = n; });
    var chartWrap = $("[data-chart]"), banner = $("[data-banner]"), feedEl = $("[data-feed]");
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var simM = START, speed = 1, playing = true, pauseAtEvents = true, finished = false, destroyed = false;
    var nextEvent = 0, lastMinute = null, feedShown = 0, particles = [], spawnAcc = 0, attackAcc = 0;
    var last = performance.now(), raf = 0, dpr = 1, W = 0, H = 0, upto = START - 1;
    var serverCount = 0;
    var lambdaTotal = 0;
    R.minutes.forEach(function (x) { if (x.m >= 0) lambdaTotal += x.lambda; });

    function resize() {
      var r = diagram.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    var ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(diagram); else window.addEventListener("resize", resize);
    resize();

    function box(id) {
      var el = nodes[id];
      if (!el) return { x: 0, y: 0, w: 0, h: 0 };
      var d = diagram.getBoundingClientRect(), r = el.getBoundingClientRect();
      return { x: r.left - d.left + r.width / 2, y: r.top - d.top + r.height / 2, w: r.width, h: r.height };
    }
    function edge(b, from) {
      var dx = from.x - b.x, dy = from.y - b.y;
      if (!dx && !dy) return { x: b.x, y: b.y };
      var t = Math.min(Math.abs(dx) > 0 ? (b.w / 2 + 5) / Math.abs(dx) : Infinity, Math.abs(dy) > 0 ? (b.h / 2 + 5) / Math.abs(dy) : Infinity);
      return { x: b.x + dx * t, y: b.y + dy * t };
    }
    function jitter(p, a) { return { x: p.x + (Math.random() - 0.5) * a, y: p.y + (Math.random() - 0.5) * a }; }
    function setNode(id, cls, sub) {
      var el = nodes[id];
      if (!el) return;
      el.classList.remove("ok", "warn", "bad");
      if (cls) el.classList.add(cls);
      if (sub != null) { var s = el.querySelector("[data-sub]"); if (s) s.textContent = sub; }
    }
    function toggle(id, cls, on) { if (nodes[id]) nodes[id].classList.toggle(cls, !!on); }
    function renderServers(x) {
      var holder = root.querySelector("[data-servers]");
      if (!holder) return;
      if (serverCount !== x.servers) {
        var html = "";
        for (var i = 0; i < x.servers; i++) html += '<div class="srv' + (serverCount && i >= serverCount ? " new" : "") + '"><i></i></div>';
        holder.innerHTML = html;
        serverCount = x.servers;
      }
      var down = x.down || x.dbDown;
      var fill = down ? 0.05 : Math.min(1, x.rho);
      var col = x.overloaded ? "var(--bad)" : x.rho > 0.8 ? "var(--warn)" : "var(--good)";
      holder.querySelectorAll(".srv").forEach(function (b, i) {
        var failed = (x.failedIdx || []).indexOf(i) >= 0;
        b.classList.toggle("failed", failed);
        var bar = b.querySelector("i");
        bar.style.height = (failed ? 100 : fill * 100).toFixed(0) + "%";
        bar.style.background = failed ? "var(--bad)" : col;
      });
    }
    function serverPoint() {
      var srvs = Array.prototype.filter.call(root.querySelectorAll(".srv"), function (s) { return !s.classList.contains("failed"); });
      var d = diagram.getBoundingClientRect();
      if (!srvs.length) return box("app");
      var r = srvs[Math.floor(Math.random() * srvs.length)].getBoundingClientRect();
      return { x: r.left - d.left + r.width / 2, y: r.top - d.top + r.height / 2 };
    }
    function queueSlot() {
      var a = box("app");
      return { x: a.x - a.w / 2 - 14 - Math.random() * 30, y: a.y + (Math.random() - 0.5) * a.h * 0.5 };
    }
    function push(p) {
      p.t = 0; p.fade = 0; p.r = p.r || 3.4;
      p.dur = (p.dur || 1.3) / Math.sqrt(speed);
      particles.push(p);
    }
    var api = { $: $, setNode: setNode, toggle: toggle, renderServers: renderServers, box: box, edge: edge, jitter: jitter,
      serverPoint: serverPoint, queueSlot: queueSlot, push: push, C: COLORS };

    function cumulative(mi) {
      var tot = 0, ok = 0, okFast = 0;
      R.minutes.forEach(function (x) {
        if (x.m < 0 || x.m > mi) return;
        tot += x.lambda; ok += x.lambda * x.served;
        var pv = x.pCore !== undefined ? x.pCore : x.p99;
        var f = pv == null ? 0 : pv <= 1 ? 1 : pv <= 3 ? 0.8 : 0.5;
        okFast += x.lambda * x.served * f * (x.tail ? 0.99 : 1);
      });
      return { served: tot ? ok / tot * 100 : null, people: R.people * okFast / lambdaTotal * (R.peopleFactor || 1) };
    }

    function updateMinute(mi) {
      var x = at(R, mi), L = R.labels;
      var down = x.down || x.dbDown;
      $("[data-clock]").textContent = clock(mi, R.base);
      $("[data-phase]").textContent = V.phase(mi);
      $("[data-lambda]").textContent = fmtInt(x.lambda) + " requests / s";
      var p99El = $("[data-p99]"), p99s = $("[data-p99s]");
      var st = x.p99 == null || x.p99 >= 3 ? "bad" : x.p99 > 1 ? "warn" : "good";
      p99El.className = "val " + st;
      p99El.textContent = x.p99 == null ? "DOWN" : fmtLatency(x.p99);
      p99s.className = "state " + st;
      p99s.innerHTML = icon(st, "status-ico") + (down ? L.downText : x.overloaded ? "Timing out" : st === "good" ? "Fine" : "Too slow");
      var rhoEl = $("[data-rho]");
      rhoEl.style.width = Math.min(100, x.rho * 100).toFixed(0) + "%";
      rhoEl.style.background = x.overloaded ? "var(--bad)" : x.rho > 0.8 ? "var(--warn)" : "var(--good)";
      $("[data-rhot]").textContent = down ? "idle, " + L.downShort : x.overloaded ? Math.round(x.rho * 100) + "%, overloaded" : Math.round(x.rho * 100) + "%";
      var c = cumulative(mi);
      var sv = $("[data-served]");
      sv.textContent = c.served == null ? "–" : fmtPct(c.served, 1);
      sv.className = "val " + (c.served == null ? "" : c.served >= 99 ? "good" : c.served >= 90 ? "warn" : "bad");
      $("[data-people]").textContent = fmtInt(c.people);
      V.updateGauges(api, R, x, mi);
      V.updateNodes(api, R, x, mi);
      renderServers(x);
      upto = mi;
      chartWrap.querySelectorAll("svg").forEach(function (s) { s.remove(); });
      chartWrap.insertAdjacentHTML("afterbegin", chartSVG(R, mi));
      while (feedShown < R.feed.length && R.feed[feedShown].m <= mi) { addPost(R.feed[feedShown]); feedShown++; }
    }

    var AV = ["var(--perf-hi)", "var(--avail-hi)", "var(--mod-hi)", "var(--sec-hi)", "var(--mango)", "var(--guava)"];
    function addPost(p) {
      var i = 0;
      for (var k = 0; k < p.who.length; k++) i += p.who.charCodeAt(k);
      var el = document.createElement("div");
      el.className = "post";
      el.innerHTML = '<span class="pav" style="background:' + AV[i % AV.length] + '">' + esc(p.who.charAt(1).toUpperCase()) + "</span><div><span class=\"h\">" + esc(p.who) + " · " + clock(p.m, R.base) + "</span><p>" + esc(p.text) + "</p></div>";
      feedEl.insertBefore(el, feedEl.firstChild);
      while (feedEl.children.length > 6) feedEl.removeChild(feedEl.lastChild);
    }
    function setBanner(cls, time, title, body, side) {
      banner.className = "event-banner " + cls;
      banner.innerHTML = '<div class="ev-main"><span class="t">' + time + "</span><h3>" + esc(title) + '</h3><p class="body">' + esc(body) + '</p></div><div class="ev-side">' + side + "</div>";
      if (cls !== "idle") { banner.style.animation = "none"; void banner.offsetWidth; banner.style.animation = ""; }
    }
    function showIdle() {
      setBanner("idle", clock(START, R.base), V.idle.title, V.idle.body,
        '<div class="out">Each event pauses the simulation so the class can talk about it. Press Continue to move on.</div>');
    }
    function showEvent(e, paused) {
      setBanner(e.status, clock(e.m, R.base), e.title, e.body,
        '<div class="out ' + e.status + '">' + icon(e.status, "status-ico") + "<span>" + esc(e.out) + "</span></div>" +
        (paused ? '<div class="row end"><button class="btn btn-sm" data-sim="continue">Continue</button></div>' : ""));
    }
    function showEnd() {
      setBanner("good", clock(END, R.base), V.end.title, V.end.body,
        '<div class="row end"><button class="btn btn-ghost btn-sm" data-sim="replay">Replay</button><button class="btn btn-sm" data-sim="report">See the report</button></div>');
    }
    function setPlaying(p) {
      playing = p;
      var b = root.querySelector('[data-sim="play"]');
      b.textContent = finished ? "Replay" : p ? "Pause" : "Play";
      var cont = banner.querySelector('[data-sim="continue"]');
      if (p && cont) cont.parentNode.remove();
    }
    function finish() { finished = true; setPlaying(false); showEnd(); if (opts.onFinish) opts.onFinish(); }
    function replay() {
      simM = START; finished = false; nextEvent = 0; lastMinute = null; feedShown = 0; particles = []; serverCount = 0;
      feedEl.innerHTML = ""; showIdle(); setPlaying(true);
    }
    function skip() {
      simM = END - 0.001; nextEvent = R.events.length; particles = [];
      updateMinute(END - 1); lastMinute = END - 1;
      finish();
    }

    function pointAt(p) {
      var n = p.pts.length - 1;
      var u = Math.min(1, p.t) * n, i = Math.min(n - 1, Math.floor(u)), f = u - i;
      var a = p.pts[i], b = p.pts[i + 1];
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    function step(dt, mi) {
      var x = at(R, mi);
      if (!reduced) {
        spawnAcc += dt * (3 + 24 * Math.min(1, x.lambda / R.peak));
        while (spawnAcc >= 1) { spawnAcc -= 1; V.spawn(api, R, x, mi); }
        if (x.attack) {
          attackAcc += dt * 9;
          while (attackAcc >= 1) { attackAcc -= 1; V.attack(api, R, x); }
        }
      }
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        if (p.t < 1) p.t += dt / p.dur;
        else p.fade += dt / (p.die ? 0.45 : 0.15);
        if (p.fade >= 1) particles.splice(i, 1);
      }
      if (particles.length > 500) particles.splice(0, particles.length - 500);
    }
    function draw(mi) {
      ctx.clearRect(0, 0, W, H);
      var x = at(R, mi);
      ctx.lineWidth = 2; ctx.setLineDash([]);
      V.edges(function (a, b, dashed, color) {
        var A = box(a), B = box(b);
        ctx.strokeStyle = color || COLORS.edge; ctx.setLineDash(dashed ? [5, 6] : []);
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }, R, x);
      ctx.setLineDash([]);
      var A = box("app");
      var down = x.down || x.dbDown;
      var qn = down ? 0 : x.overloaded ? 36 : x.rho > 0.8 ? Math.round((x.rho - 0.8) * 120) : 0;
      if (qn > 0) {
        ctx.fillStyle = x.overloaded ? COLORS.bad : COLORS.warn;
        for (var k = 0; k < qn; k++) {
          var col = Math.floor(k / 6), rowi = k % 6;
          ctx.globalAlpha = 0.75;
          ctx.beginPath(); ctx.arc(A.x - A.w / 2 - 10 - col * 8, A.y - 20 + rowi * 8, 2.8, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i], pt = pointAt(p);
        var r = p.r, alpha = 1;
        if (p.t >= 1) { alpha = 1 - p.fade; if (p.die) r = p.r + p.fade * 7; }
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2); ctx.fill();
        if (p.die && p.t >= 1) {
          ctx.strokeStyle = p.blocked ? COLORS.good : p.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, r + 3, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    function frame(now) {
      if (destroyed) return;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (playing && !finished) {
        simM += dt * 1000 * speed / MS_PER_MIN;
        if (nextEvent < R.events.length && simM >= R.events[nextEvent].m) {
          var e = R.events[nextEvent];
          simM = e.m; nextEvent++;
          updateMinute(e.m); lastMinute = e.m;
          showEvent(e, pauseAtEvents);
          if (pauseAtEvents) setPlaying(false);
        }
        if (simM >= END) { simM = END - 0.001; finish(); }
      }
      var mi = Math.max(START, Math.min(END - 1, Math.floor(simM)));
      if (mi !== lastMinute) { lastMinute = mi; updateMinute(mi); }
      if (playing && !finished) step(dt, mi);
      else if (finished) step(dt * 0.5, mi);
      draw(mi);
      raf = requestAnimationFrame(frame);
    }
    function onClick(ev) {
      var b = ev.target.closest("[data-sim]");
      if (!b || !root.contains(b)) return;
      var a = b.dataset.sim;
      if (a === "play") { if (finished) replay(); else setPlaying(!playing); }
      else if (a === "continue") setPlaying(true);
      else if (a === "speed") {
        speed = Number(b.dataset.v);
        root.querySelectorAll('[data-sim="speed"]').forEach(function (s) { s.classList.toggle("on", s === b); });
      }
      else if (a === "skip") skip();
      else if (a === "replay") replay();
      else if (a === "report" && opts.onReport) opts.onReport();
    }
    function onChange(ev) { if (ev.target.dataset && ev.target.dataset.sim === "pauseev") pauseAtEvents = ev.target.checked; }
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    attachChartHover(chartWrap, R, function () { return upto; });
    showIdle();
    updateMinute(START); lastMinute = START;
    raf = requestAnimationFrame(frame);
    return {
      destroy: function () {
        destroyed = true; cancelAnimationFrame(raf);
        if (ro) ro.disconnect(); else window.removeEventListener("resize", resize);
        root.removeEventListener("click", onClick); root.removeEventListener("change", onChange);
      },
      togglePlay: function () { if (finished) replay(); else setPlaying(!playing); },
      isFinished: function () { return finished; }
    };
  }

  /* ------------------------------------------------------------------ live view: scenario views */
  function valState(el, v, cls) { el.textContent = v; el.className = "val " + (cls || ""); }

  var VIEWS = {
    final: {
      eyebrow: "Round 2 · Live simulation", title: "Result Day, with your design",
      feedTag: "#ResultDay", chartTitle: "How long the slowest pages took",
      p99Label: "Slowest pages now", busyLabel: "Servers busy", peopleLabel: "Got results",
      legend: [[COLORS.good, "Request served fast"], [COLORS.warn, "Slow"], [COLORS.bad, "Failed"], [COLORS.sms, "Guardian SMS"], [COLORS.attack, "Bot login attempt"]],
      idle: { title: "Waiting for results", body: "40,000 students are refreshing ResultHub. Results go live at 10:00." },
      end: { title: "Result day is over", body: "See how your architecture scored, then reveal the answers." },
      phase: function (mi) { return mi < 0 ? "Before results" : mi < 10 ? "The rush" : mi < 20 ? "Still busy" : mi < 40 ? "Settling down" : "Quiet"; },
      nodes: function (R) {
        var P = R.params, cacheUsed = P.cache === "warm" || P.cache === "aside";
        return node("students", 10, 50, "users", "Students", "40,000", "students") +
          node("bot", 10, 86, "bot", "Botnet", "", "bot off") +
          node("lb", 28, 50, "split", "Load balancer", P.spare === "lb" ? "×2" : "") +
          appNode(49, 52, "App servers") +
          node("cache", 73, 42, "zap", "Cache", cacheUsed ? "" : "not used", cacheUsed ? "" : "off") +
          node("db", 73, 79, "db", P.spare === "db" ? "Database ×2" : "Database", "") +
          (P.sms === "queue" ? node("smsq", 71, 16, "layers", "SMS queue", "0 waiting") : "") +
          (P.sms !== "none" ? node("sms", 89, 16, "msg", "SMS provider", "") : node("sms", 89, 16, "msg", "SMS provider", "not used", "off"));
      },
      gaugesTop: function () { return ""; },
      gauges: function () {
        return '<div class="gauge-pair">' + gauge("Accounts lost", "comp") + gauge("Results leaked", "leak") + "</div>" +
          '<div class="gauge"><div class="lbl"><span>Guardian SMS</span></div><div class="val" data-sms style="font-size:20px">–</div></div>';
      },
      updateGauges: function (api, R, x) {
        var P = R.params;
        valState(api.$("[data-comp]"), fmtInt(x.compromised), x.compromised ? "bad" : "good");
        valState(api.$("[data-leak]"), fmtInt(x.leaked), x.leaked ? "bad" : "good");
        api.$("[data-sms]").textContent = P.sms === "none" ? "Not sent" : fmtInt(x.smsDelivered) + " sent" + (P.sms === "queue" ? " · " + fmtInt(x.smsQueue) + " queued" : "");
      },
      updateNodes: function (api, R, x, mi) {
        var P = R.params;
        api.setNode("students", "ok");
        api.setNode("lb", "ok");
        api.toggle("lb", "shielded", x.attack && x.blockedNow > 0);
        api.setNode("app", x.dbDown ? "warn" : x.overloaded ? "bad" : (x.rho > 0.8 || x.p99 > 1) ? "warn" : "ok",
          x.servers + " servers · " + (x.dbDown ? "waiting on DB" : Math.round(x.rho * 100) + "% busy"));
        if (P.cache === "warm" || P.cache === "aside") {
          var hr = hitRate(P.cache, mi);
          api.setNode("cache", mi >= 0 && hr < 0.5 ? "warn" : "ok", mi < 0 ? (P.cache === "warm" ? "warming…" : "empty") : Math.round(hr * 100) + "% hits" + (P.cache === "aside" && mi < 10 ? " (cold)" : ""));
        }
        var dbBusy = mi >= 0 && mi < 10 && P.cache !== "warm";
        api.setNode("db", x.dbDown ? "bad" : x.failover ? "warn" : dbBusy ? "warn" : "ok",
          x.dbDown ? "DOWN until 10:35" : x.failover ? "failing over" : dbBusy ? "very busy" : P.spare === "db" ? "primary + replica" : "");
        if (P.sms !== "none") api.setNode("sms", x.smsSlow ? "bad" : "ok", x.smsSlow ? "20 s / message" : "normal");
        if (P.sms === "queue") api.setNode("smsq", x.smsQueue > 0 ? "warn" : "ok", fmtInt(x.smsQueue) + " waiting");
        api.toggle("bot", "off", !x.attack);
        if (x.attack) api.setNode("bot", "", x.blockedNow ? Math.round(x.blockedNow * 100) + "% blocked" : "6,000 tries / min");
      },
      edges: function (line, R, x) {
        var P = R.params;
        line("students", "lb"); line("lb", "app"); line("app", "cache", !(P.cache === "warm" || P.cache === "aside")); line("app", "db");
        if (P.sms === "queue") { line("app", "smsq"); line("smsq", "sms"); } else line("app", "sms", P.sms === "none");
        if (x.attack) line("bot", "lb", true, "#F9A8D4");
      },
      spawn: function (api, R, x, mi) {
        var P = R.params, C = api.C;
        var S = api.box("students"), L = api.box("lb"), A = api.serverPoint(), aBox = api.box("app");
        var start = api.jitter(S, 24), pts, color = C.good, die = false, slow = false;
        var D = api.box(Math.random() < hitRate(P.cache, mi) ? "cache" : "db");
        if (x.dbDown) { pts = [start, L, A, api.edge(api.box("db"), aBox)]; color = C.bad; die = true; }
        else if (x.smsSlow && (P.sms === "sync" || P.sms === "retry")) { pts = [start, L, A, api.edge(api.box("sms"), aBox)]; color = Math.random() < 0.6 ? C.bad : C.warn; die = true; slow = true; }
        else if (x.overloaded && Math.random() > x.served) { pts = [start, api.edge(L, start), L, api.queueSlot()]; color = C.bad; die = true; slow = true; }
        else { pts = [start, L, A, api.edge(D, aBox)]; if (x.overloaded || x.p99 > 1) { color = C.warn; slow = true; } }
        api.push({ pts: pts, dur: slow ? 2.6 : 1.3, color: color, die: die });
        if (!x.dbDown && P.sms !== "none" && Math.random() < 0.18) {
          var SM = api.box("sms");
          if (P.sms === "queue") {
            var Q = api.box("smsq"), stuck = x.smsSlow && Math.random() < 0.7;
            api.push({ pts: stuck ? [A, api.edge(Q, aBox)] : [A, Q, api.edge(SM, Q)], dur: 1.6, color: C.sms, die: stuck, r: 2.6 });
          } else if (!x.smsSlow) api.push({ pts: [A, api.edge(SM, aBox)], dur: 1.2, color: C.sms, r: 2.6 });
        }
      },
      attack: function (api, R, x) {
        var B = api.box("bot"), L = api.box("lb"), start = api.jitter(B, 20);
        if (Math.random() < x.blockedNow) api.push({ pts: [start, api.edge(L, start)], dur: 0.9, color: api.C.attack, die: true, blocked: true, r: 3 });
        else api.push({ pts: [start, L, api.serverPoint(), api.edge(api.box("db"), api.box("app"))], dur: 1.5, color: api.C.attack, r: 3 });
      }
    },

    warm: {
      eyebrow: "Round 1 · Live simulation", title: "Sale Day, with your design",
      feedTag: "#EidTickets", chartTitle: "How long the slowest bookings took",
      p99Label: "Slowest bookings now", busyLabel: "Workers busy", peopleLabel: "Got tickets",
      legend: [[COLORS.good, "Booking done fast"], [COLORS.warn, "Slow or pending"], [COLORS.bad, "Failed"], [COLORS.wallet, "Wallet payment"], [COLORS.attack, "Bot login attempt"]],
      idle: { title: "Waiting for the sale", body: "Thousands of travellers are refreshing Eid Express. Tickets go on sale at 9:00." },
      end: { title: "Sale day is over", body: "See how your design scored, then grade the blueprint." },
      phase: function (mi) { return mi < 0 ? "Before the sale" : mi < 10 ? "The rush" : mi < 20 ? "Still busy" : mi < 40 ? "Settling down" : "Quiet"; },
      nodes: function (R) {
        var P = R.params, cache = P.engine === "cache";
        var dashIcon = { p99: "target", avg: "barChart", median: "gauge", cpu: "cpu" }[P.metric];
        var gateIcon = { strongpw: "password", lockout: "ban", ratelimit: "timer", hidden: "eyeOff" }[P.login];
        var appLabel = { two: "Servers ×2", micro5: "5 services", premium: "Premium server", one: "Server", nightly: "Server" }[P.setup];
        return node("travellers", 9, 50, "users", "Travellers", "50,000", "students") +
          node("bot", 9, 86, "bot", "Bots", "", "bot off") +
          node("gate", 25, 50, gateIcon, "Login gate", "") +
          node("dash", 46, 13, dashIcon, "Dashboard", "") +
          appNode(46, 55, appLabel) +
          node("cache", 70, 36, "zap", "Fare cache", cache ? "" : "not used", cache ? "" : "off") +
          node("db", 70, 78, "db", "Routes & fares", "") +
          node("wallet", 90, 20, "wallet", "Wallet co.", "");
      },
      gaugesTop: function (R) {
        var name = { p99: "slowest 1 in 100", avg: "average", median: "typical", cpu: "server load" }[R.params.metric];
        return '<div class="gauge"><div class="lbl"><span>Dashboard says</span><span>' + name + '</span></div><div class="val" data-dash>–</div><div class="state" data-dashs></div></div>';
      },
      gauges: function () {
        return '<div class="gauge-pair">' + gauge("Accounts lost", "comp") + gauge("Locked out", "locked") + "</div>" +
          '<div class="gauge"><div class="lbl"><span>Wallet payments</span></div><div class="val" data-wallet style="font-size:20px">–</div></div>';
      },
      updateGauges: function (api, R, x) {
        var P = R.params, d = api.$("[data-dash]"), ds = api.$("[data-dashs]");
        var suffering = x.m >= 0 && (x.p99 == null || x.p99 > 1 || x.served < 0.99);
        d.textContent = x.dash;
        d.className = "val " + (x.alarm ? "bad" : suffering ? "warn" : "good");
        ds.className = "state " + (x.alarm ? "bad" : suffering ? "warn" : "good");
        ds.innerHTML = x.alarm ? icon("bad", "status-ico") + "Alarm: something is wrong" : suffering ? icon("warn", "status-ico") + "Looks fine, but customers are suffering" : icon("good", "status-ico") + "All quiet";
        valState(api.$("[data-comp]"), fmtInt(x.compromised), x.compromised ? "bad" : "good");
        valState(api.$("[data-locked]"), fmtInt(x.lockedOut), x.lockedOut ? "bad" : "good");
        api.$("[data-wallet]").textContent = !x.walletSlow && !x.pending && !x.doubles ? "Normal" :
          P.wallet === "timeout" ? fmtInt(x.pending) + " pending" : P.wallet === "retry" ? fmtInt(x.doubles) + " charged twice" : x.walletSlow ? "Frozen" : "Recovered";
      },
      updateNodes: function (api, R, x, mi) {
        var P = R.params;
        api.setNode("travellers", "ok");
        var gateSub = { strongpw: "strong passwords", lockout: x.lockedOut ? fmtInt(x.lockedOut) + " locked" : "3 strikes", ratelimit: "5 tries / min", hidden: x.attack && x.m >= 48 ? "found!" : "hidden" }[P.login];
        api.setNode("gate", P.login === "lockout" && x.lockedOut ? "warn" : x.attack && x.blockedNow === 0 ? "bad" : "ok", gateSub);
        api.toggle("gate", "shielded", x.attack && P.login === "ratelimit" && x.blockedNow > 0.9);
        api.setNode("dash", x.alarm ? "bad" : "ok", x.alarm ? "ALARM · " + x.dash : x.dash);
        var down = x.down;
        api.setNode("app", down ? "bad" : x.overloaded ? "bad" : (x.rho > 0.8 || x.p99 > 1) ? "warn" : "ok",
          down ? (x.m >= 50 ? "payments down" : "crashed · back 9:30") : (x.failedIdx && x.failedIdx.length ? "1 down · " : "") + Math.round(Math.min(x.rho, 9.99) * 100) + "% busy");
        if (P.engine === "cache") api.setNode("cache", "ok", "90% hits");
        api.setNode("db", x.dbOver ? "bad" : x.dbLoad > 0.7 ? "warn" : "ok", x.dbOver ? "swamped" : x.dbLoad > 0.7 ? "very busy" : Math.round(x.dbLoad * 100) + "% busy");
        api.setNode("wallet", x.walletSlow ? "bad" : "ok", x.walletSlow ? (P.wallet === "timeout" && x.m > 22 ? "breaker open" : "20 s / payment") : "normal");
        api.toggle("bot", "off", !x.attack);
        if (x.attack) api.setNode("bot", "", x.blockedNow ? Math.round(x.blockedNow * 100) + "% blocked" : "guessing…");
      },
      edges: function (line, R, x) {
        var P = R.params;
        line("travellers", "gate"); line("gate", "app"); line("app", "cache", P.engine !== "cache"); line("app", "db");
        line("app", "wallet", P.wallet === "timeout" && x.walletSlow && x.m > 22, x.walletSlow ? "#FCA5A5" : null);
        line("dash", "app", true);
        if (x.attack) line("bot", "gate", true, "#F9A8D4");
      },
      spawn: function (api, R, x) {
        var P = R.params, C = api.C;
        var T = api.box("travellers"), G = api.box("gate"), aBox = api.box("app"), A = api.serverPoint();
        var start = api.jitter(T, 24), pts, color = C.good, die = false, slow = false;
        var toCache = P.engine === "cache" && Math.random() < 0.9;
        var D = api.box(toCache ? "cache" : "db");
        if (x.down) { pts = [start, G, api.edge(aBox, G)]; color = C.bad; die = true; }
        else if (x.dbOver && !toCache && Math.random() > x.served) { pts = [start, G, A, api.edge(api.box("db"), aBox)]; color = C.bad; die = true; slow = true; }
        else if (x.overloaded && Math.random() > x.served) { pts = [start, api.edge(G, start), G, api.queueSlot()]; color = C.bad; die = true; slow = true; }
        else { pts = [start, G, A, api.edge(D, aBox)]; if (x.overloaded || x.p99 > 1) { color = C.warn; slow = true; } }
        api.push({ pts: pts, dur: slow ? 2.6 : 1.3, color: color, die: die });
        if (!x.down && Math.random() < 0.3) {
          var WB = api.box("wallet"), wEdge = api.edge(WB, aBox);
          if (x.walletSlow) {
            if (P.wallet === "timeout") {
              var mid = x.m > 22 ? { x: (A.x + wEdge.x) / 2, y: (A.y + wEdge.y) / 2 } : wEdge;
              api.push({ pts: [A, mid], dur: 1, color: C.warn, die: true, r: 2.8 });
            } else api.push({ pts: [A, wEdge], dur: 2.6, color: Math.random() < 0.5 ? C.bad : C.warn, die: true, r: 2.8 });
          } else api.push({ pts: [A, wEdge], dur: 1.2, color: C.wallet, r: 2.8 });
        }
      },
      attack: function (api, R, x) {
        var B = api.box("bot"), G = api.box("gate"), start = api.jitter(B, 20);
        if (Math.random() < x.blockedNow) api.push({ pts: [start, api.edge(G, start)], dur: 0.9, color: api.C.attack, die: true, blocked: true, r: 3 });
        else api.push({ pts: [start, G, api.serverPoint()], dur: 1.4, color: api.C.attack, r: 3 });
      }
    }
  };

  /* ------------------------------------------------------------------ public */
  function compute(params, scenario) { return scenario === "warm" ? computeWarm(params) : computeFinal(params); }

  return {
    compute: compute, mount: mount, reportHTML: reportHTML, attachReport: attachReport,
    fmtLatency: fmtLatency, START: START, END: END
  };
})();
