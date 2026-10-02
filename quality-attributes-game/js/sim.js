/* Trade-off Arena — Result Day simulation.
 *
 * compute(params) turns the class's eight decisions into a minute-by-minute model of
 * result day (09:55 to 11:00). mount() animates it; reportHTML() renders the debrief.
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
  function clock(m) {
    var total = 600 + Math.floor(m);
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
    return '<svg class="' + (cls || "nicon") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
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

  function compute(params) {
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
    } else if (P.req === "p50normal") {
      req = { status: peakP99 > 1 ? "bad" : "warn",
        title: "Promise “tested on a quiet day”: PASSED",
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
    var reqL = { p99peak: "A+", avg: "C", p50normal: "D", fast: "F" }[P.req];
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
    return result;
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
    if (x.dbDown) return "down";
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
    s.push('<svg viewBox="0 0 ' + CH.w + " " + CH.h + '" role="img" aria-label="p99 latency over result day, log scale, with a 1 second target line">');
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
      s.push('<text x="' + cx(m).toFixed(1) + '" y="' + (CH.h - 8) + '" text-anchor="middle">' + clock(m) + "</text>");
    });
    s.push('<line class="xh" x1="0" x2="0" y1="' + CH.mt + '" y2="' + (CH.mt + ph) + '" style="stroke:var(--ink);stroke-width:1;opacity:0"/>');
    s.push('<rect class="hit" x="' + CH.ml + '" y="0" width="' + (CH.w - CH.ml - CH.mr) + '" height="' + CH.h + '" style="fill:transparent"/>');
    s.push("</svg>");
    return s.join("");
  }

  function chartLegend() {
    return '<div class="legend">' +
      '<span><i style="background:var(--avail)"></i>Slowest 1 in 100 pages (p99)</span>' +
      '<span><i style="background:repeating-linear-gradient(90deg,var(--ink-2) 0 5px,transparent 5px 9px)"></i>1-second promise</span>' +
      '<span><i class="sq" style="background:var(--good)"></i>Served ≥ 99.5%</span>' +
      '<span><i class="sq" style="background:var(--warn)"></i>80–99.5%</span>' +
      '<span><i class="sq" style="background:var(--bad)"></i>Under 80%</span>' +
      '<span><i class="sq" style="background:var(--bad-tint);outline:1px solid var(--bad)"></i>Portal down</span>' +
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
      tip.innerHTML = "<b>" + clock(m) + "</b> · " + fmtInt(x.lambda) + " requests/s<br>slowest pages " + fmtLatency(x.p99) + " · served " + fmtPct(x.served * 100, 0);
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
    var M = R.metrics, P = R.params;
    var rows = R.courses.map(function (c) {
      return "<tr><td class=\"code-c\">" + c.code + "</td><td><b>" + c.name + "</b><span class=\"m\">" + esc(c.measured) + "</span></td>" +
        '<td class="mono">' + c.credits.toFixed(1) + '</td><td><span class="grade ' + gradeClass(c.l) + '">' + c.l + '</span></td><td class="mono">' + c.gp.toFixed(2) + "</td></tr>";
    }).join("");
    function tile(k, v, n, st) { return '<div class="tile ' + (st || "") + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="n">' + n + "</div></div>"; }
    var smsText = P.sms === "none" ? "Not sent" : fmtInt(M.smsDelivered);
    var smsNote = { queue: "All sent, some up to 20 minutes late", sync: "Sent, but pages froze while waiting", retry: "Sent, with duplicate texts", none: "Guardians were never told" }[P.sms];
    var tiles =
      tile("Slowest pages at 10:00", fmtLatency(M.rushP99), "99 of 100 pages were faster. Promise: 1 s", M.rushP99 <= 1 ? "good" : M.rushP99 <= 3 ? "warn" : "bad") +
      tile("Requests served", fmtPct(M.availability, 2), "10:00 to 11:00", M.availability >= 99 ? "good" : M.availability >= 90 ? "warn" : "bad") +
      tile("Saw their result first try", fmtInt(M.studentsOk), "of 40,000 students", M.studentsOk >= 38000 ? "good" : M.studentsOk >= 30000 ? "warn" : "bad") +
      tile("Accounts taken over", fmtInt(M.compromised), P.login === "layers" ? fmtInt(M.attemptsBlocked) + " attempts blocked" : "by password spraying", M.compromised === 0 ? "good" : M.compromised <= 10 ? "warn" : "bad") +
      tile("Results exposed", fmtInt(M.leaked), "to someone other than the student", M.leaked === 0 ? "good" : "bad") +
      tile("Guardian SMS", smsText, smsNote, P.sms === "queue" ? "good" : P.sms === "none" ? "bad" : "warn") +
      tile("New grading rule", M.rules.lead, M.rules.risk, P.rules === "strategy" ? "good" : P.rules === "formula" ? "warn" : "bad") +
      tile("Monthly bill", taka(M.billTotal), M.bill.map(function (b) { return b[0]; }).join(" · "), M.billTotal <= 130000 ? "good" : M.billTotal <= 200000 ? "warn" : "bad");
    var outcomes = R.events.map(function (e) {
      return '<li class="' + e.status + '">' + statusIcon(e.status) + "<div><span class=\"t\">" + clock(e.m) + "</span><b>" + esc(e.title) + "</b><br>" + esc(e.out) + "</div></li>";
    }).join("");
    var insights = R.insights.map(function (i) { return '<div class="insight q-' + i.q + '">' + i.html + "</div>"; }).join("");

    return '' +
      '<div class="report">' +
        '<div style="display:grid;gap:20px;min-width:0">' +
          '<div class="card marksheet">' +
            '<div class="ms-head"><div><div class="eyebrow">ResultHub · Result day report</div><h2>Your architecture’s mark sheet</h2>' +
            '<div class="id">Course: CSE 444 · Lecture 2 · Quality Attributes</div></div>' +
            '<div class="cgpa"><div class="num">' + R.cgpa.toFixed(2) + '</div><div class="lt">CGPA · ' + R.cgpaLetter + "</div></div></div>" +
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
      '<div class="card timeline-card"><div class="lbl"><span>How long the slowest pages took, 09:55 to 11:00</span><span>Hover for details</span></div>' +
      '<div class="chart-wrap" data-chart>' + chartSVG(R, END - 1) + "</div>" + chartLegend() + "</div>";
  }

  function attachReport(root, R) {
    var wrap = root.querySelector("[data-chart]");
    if (wrap) attachChartHover(wrap, R, function () { return END - 1; });
  }

  /* ------------------------------------------------------------------ live view */
  var COLORS = { good: "#16A34A", warn: "#F59E0B", bad: "#EF4444", attack: "#EC4899", sms: "#3B82F6", blocked: "#94A3B8", edge: "#CBD5E1" };

  function node(id, x, y, ic, label, sub, extra) {
    return '<div class="node ' + (extra || "") + '" data-node="' + id + '" style="left:' + x + "%;top:" + y + '%">' + icon(ic) +
      "<span>" + label + '</span><span class="sub" data-sub>' + (sub || "") + "</span></div>";
  }

  function templateHTML(R) {
    var P = R.params;
    var cacheUsed = P.cache === "warm" || P.cache === "aside";
    var nodes =
      node("students", 10, 50, "users", "Students", "40,000", "students") +
      node("bot", 10, 86, "bot", "Botnet", "", "bot off") +
      node("lb", 28, 50, "split", "Load balancer", P.spare === "lb" ? "×2" : "") +
      '<div class="node app" data-node="app" style="left:49%;top:52%">' + icon("server") + '<span>App servers</span><span class="sub" data-sub></span><div class="servers" data-servers></div></div>' +
      node("cache", 73, 42, "zap", "Cache", cacheUsed ? "" : "not used", cacheUsed ? "" : "off") +
      node("db", 73, 79, "db", P.spare === "db" ? "Database ×2" : "Database", "") +
      (P.sms === "queue" ? node("smsq", 71, 16, "layers", "SMS queue", "0 waiting") : "") +
      (P.sms !== "none" ? node("sms", 89, 16, "msg", "SMS provider", "") : node("sms", 89, 16, "msg", "SMS provider", "not used", "off"));

    return '' +
      '<div class="sim">' +
        '<div class="sim-main">' +
          '<div class="sim-head"><div><div class="eyebrow">Round 2 · Live simulation</div><h1>Result Day, with your design</h1></div>' +
            '<div class="sim-controls">' +
              '<button class="btn btn-sm" data-sim="play">Pause</button>' +
              '<div class="seg" role="group" aria-label="Speed"><button data-sim="speed" data-v="1" class="on">1×</button><button data-sim="speed" data-v="2">2×</button><button data-sim="speed" data-v="4">4×</button></div>' +
              '<label class="toggle"><input type="checkbox" id="sim-pause-events" data-sim="pauseev" checked> Pause at each event</label>' +
              '<button class="btn btn-ghost btn-sm" data-sim="skip">Skip to the end</button>' +
            "</div></div>" +
          '<div class="event-banner idle" data-banner aria-live="polite"></div>' +
          '<div class="diagram-wrap"><div class="diagram"><canvas></canvas>' + nodes + "</div></div>" +
          '<div class="legend" aria-label="Dot colours"><span><i class="sq" style="background:' + COLORS.good + ';border-radius:50%"></i>Request served fast</span>' +
            '<span><i class="sq" style="background:' + COLORS.warn + ';border-radius:50%"></i>Slow</span>' +
            '<span><i class="sq" style="background:' + COLORS.bad + ';border-radius:50%"></i>Failed</span>' +
            '<span><i class="sq" style="background:' + COLORS.sms + ';border-radius:50%"></i>Guardian SMS</span>' +
            '<span><i class="sq" style="background:' + COLORS.attack + ';border-radius:50%"></i>Bot login attempt</span></div>' +
          '<div class="card timeline-card"><div class="lbl"><span>How long the slowest pages took</span><span>Log scale</span></div>' +
            '<div class="chart-wrap" data-chart></div>' + chartLegend() + "</div>" +
        "</div>" +
        '<aside class="gauges">' +
          '<div class="clock"><span class="phase" data-phase>Before results</span><span class="time" data-clock>09:55</span><span class="phase" data-lambda>20 requests / s</span></div>' +
          '<div class="gauge"><div class="lbl"><span>Slowest pages now</span><span>promise 1 s</span></div><div class="val" data-p99>–</div><div class="state" data-p99s></div></div>' +
          '<div class="gauge"><div class="lbl"><span>Servers busy</span><span data-rhot></span></div><div class="meter"><i data-rho></i><span class="mark" style="left:65%" data-l="65%"></span></div><div style="height:12px"></div></div>' +
          '<div class="gauge-pair">' +
            '<div class="gauge"><div class="lbl"><span>Served</span></div><div class="val" data-served>–</div></div>' +
            '<div class="gauge"><div class="lbl"><span>Got results</span></div><div class="val" data-students>0</div></div>' +
          "</div>" +
          '<div class="gauge-pair">' +
            '<div class="gauge"><div class="lbl"><span>Accounts lost</span></div><div class="val" data-comp>0</div></div>' +
            '<div class="gauge"><div class="lbl"><span>Results leaked</span></div><div class="val" data-leak>0</div></div>' +
          "</div>" +
          '<div class="gauge"><div class="lbl"><span>Guardian SMS</span></div><div class="val" data-sms style="font-size:20px">–</div></div>' +
          '<div class="feed-wrap" style="display:grid;gap:8px"><div class="eyebrow">#ResultDay</div><div class="feed" data-feed></div></div>' +
        "</aside>" +
      "</div>";
  }

  function mount(root, R, opts) {
    opts = opts || {};
    var P = R.params;
    root.innerHTML = templateHTML(R);
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

    /* ---- per-minute UI ---- */
    function setNode(id, cls, sub) {
      var el = nodes[id];
      if (!el) return;
      el.classList.remove("ok", "warn", "bad");
      if (cls) el.classList.add(cls);
      if (sub != null) { var s = el.querySelector("[data-sub]"); if (s) s.textContent = sub; }
    }
    function renderServers(x) {
      var holder = root.querySelector("[data-servers]");
      if (serverCount !== x.servers) {
        var html = "";
        for (var i = 0; i < x.servers; i++) html += '<div class="srv' + (serverCount && i >= serverCount ? " new" : "") + '"><i></i></div>';
        holder.innerHTML = html;
        serverCount = x.servers;
      }
      var fill = x.dbDown ? 0.05 : Math.min(1, x.rho);
      var col = x.overloaded ? "var(--bad)" : x.rho > 0.8 ? "var(--warn)" : "var(--good)";
      holder.querySelectorAll(".srv i").forEach(function (b) { b.style.height = (fill * 100).toFixed(0) + "%"; b.style.background = col; });
    }

    function cumulative(mi) {
      var tot = 0, ok = 0, okFast = 0;
      R.minutes.forEach(function (x) {
        if (x.m < 0 || x.m > mi) return;
        tot += x.lambda; ok += x.lambda * x.served;
        var f = x.p99 == null ? 0 : x.p99 <= 1 ? 1 : x.p99 <= 3 ? 0.8 : 0.5;
        okFast += x.lambda * x.served * f;
      });
      var lambdaTotal = 0;
      R.minutes.forEach(function (x) { if (x.m >= 0) lambdaTotal += x.lambda; });
      var students = STUDENTS * okFast / lambdaTotal * (P.login === "captcha" ? 0.9 : 1);
      return { served: tot ? ok / tot * 100 : null, students: students };
    }

    function updateMinute(mi) {
      var x = at(R, mi);
      $("[data-clock]").textContent = clock(mi);
      $("[data-phase]").textContent = mi < 0 ? "Before results" : mi < 10 ? "The rush" : mi < 20 ? "Still busy" : mi < 40 ? "Settling down" : "Quiet";
      $("[data-lambda]").textContent = fmtInt(x.lambda) + " requests / s";

      var p99El = $("[data-p99]"), p99s = $("[data-p99s]");
      var st = x.p99 == null || x.p99 >= 3 ? "bad" : x.p99 > 1 ? "warn" : "good";
      p99El.className = "val " + st;
      p99El.textContent = x.p99 == null ? "DOWN" : fmtLatency(x.p99);
      p99s.className = "state " + st;
      p99s.innerHTML = icon(st, "status-ico") + (x.dbDown ? "Database down" : x.overloaded ? "Timing out" : st === "warn" ? "Above target" : "Within target");

      var rhoEl = $("[data-rho]");
      rhoEl.style.width = Math.min(100, x.rho * 100).toFixed(0) + "%";
      rhoEl.style.background = x.overloaded ? "var(--bad)" : x.rho > 0.8 ? "var(--warn)" : "var(--good)";
      $("[data-rhot]").textContent = x.dbDown ? "idle, DB down" : x.overloaded ? Math.round(x.rho * 100) + "%, overloaded" : Math.round(x.rho * 100) + "%";

      var c = cumulative(mi);
      var sv = $("[data-served]");
      sv.textContent = c.served == null ? "–" : fmtPct(c.served, 1);
      sv.className = "val " + (c.served == null ? "" : c.served >= 99 ? "good" : c.served >= 90 ? "warn" : "bad");
      $("[data-students]").textContent = fmtInt(c.students);
      var comp = $("[data-comp]"); comp.textContent = fmtInt(x.compromised); comp.className = "val " + (x.compromised ? "bad" : "good");
      var lk = $("[data-leak]"); lk.textContent = fmtInt(x.leaked); lk.className = "val " + (x.leaked ? "bad" : "good");
      $("[data-sms]").textContent = P.sms === "none" ? "Not sent" : fmtInt(x.smsDelivered) + " sent" + (P.sms === "queue" ? " · " + fmtInt(x.smsQueue) + " queued" : "");

      // nodes
      setNode("students", "ok");
      setNode("lb", "ok");
      nodes.lb.classList.toggle("shielded", x.attack && x.blockedNow > 0);
      setNode("app", x.dbDown ? "warn" : x.overloaded ? "bad" : (x.rho > 0.8 || x.p99 > 1) ? "warn" : "ok",
        x.servers + " servers · " + (x.dbDown ? "waiting on DB" : Math.round(x.rho * 100) + "% busy"));
      renderServers(x);
      if (P.cache === "warm" || P.cache === "aside") {
        var hr = hitRate(P.cache, mi);
        setNode("cache", mi >= 0 && hr < 0.5 ? "warn" : "ok", mi < 0 ? (P.cache === "warm" ? "warming…" : "empty") : Math.round(hr * 100) + "% hits" + (P.cache === "aside" && mi < 10 ? " (cold)" : ""));
      }
      var dbBusy = mi >= 0 && mi < 10 && P.cache !== "warm";
      setNode("db", x.dbDown ? "bad" : x.failover ? "warn" : dbBusy ? "warn" : "ok",
        x.dbDown ? "DOWN until 10:35" : x.failover ? "failing over" : dbBusy ? "very busy" : P.spare === "db" ? "primary + replica" : "");
      if (P.sms !== "none") setNode("sms", x.smsSlow ? "bad" : "ok", x.smsSlow ? "20 s / message" : "normal");
      if (P.sms === "queue") setNode("smsq", x.smsQueue > 0 ? "warn" : "ok", fmtInt(x.smsQueue) + " waiting");
      nodes.bot.classList.toggle("off", !x.attack);
      if (x.attack) setNode("bot", "", x.blockedNow ? Math.round(x.blockedNow * 100) + "% blocked" : "6,000 tries / min");

      // chart
      upto = mi;
      chartWrap.querySelectorAll("svg").forEach(function (s) { s.remove(); });
      chartWrap.insertAdjacentHTML("afterbegin", chartSVG(R, mi));

      // feed
      while (feedShown < R.feed.length && R.feed[feedShown].m <= mi) {
        addPost(R.feed[feedShown]);
        feedShown++;
      }
    }

    var AV = ["var(--perf-hi)", "var(--avail-hi)", "var(--mod-hi)", "var(--sec-hi)", "var(--mango)", "var(--guava)"];
    function addPost(p) {
      var i = 0;
      for (var k = 0; k < p.who.length; k++) i += p.who.charCodeAt(k);
      var el = document.createElement("div");
      el.className = "post";
      el.innerHTML = '<span class="pav" style="background:' + AV[i % AV.length] + '">' + esc(p.who.charAt(1).toUpperCase()) + "</span><div><span class=\"h\">" + esc(p.who) + " · " + clock(p.m) + "</span><p>" + esc(p.text) + "</p></div>";
      feedEl.insertBefore(el, feedEl.firstChild);
      while (feedEl.children.length > 6) feedEl.removeChild(feedEl.lastChild);
    }

    function setBanner(cls, time, title, body, side) {
      banner.className = "event-banner " + cls;
      banner.innerHTML = '<div class="ev-main"><span class="t">' + time + "</span><h3>" + esc(title) + '</h3><p class="body">' + esc(body) + '</p></div><div class="ev-side">' + side + "</div>";
      if (cls !== "idle") { banner.style.animation = "none"; void banner.offsetWidth; banner.style.animation = ""; }
    }

    function showIdle() {
      setBanner("idle", "09:55", "Waiting for results", "40,000 students are refreshing ResultHub. Results go live at 10:00.",
        '<div class="out">Each event pauses the simulation so the class can talk about it. Press Continue to move on.</div>');
    }

    function showEvent(e, paused) {
      setBanner(e.status, clock(e.m), e.title, e.body,
        '<div class="out ' + e.status + '">' + icon(e.status, "status-ico") + "<span>" + esc(e.out) + "</span></div>" +
        (paused ? '<div class="row end"><button class="btn btn-sm" data-sim="continue">Continue</button></div>' : ""));
    }

    function showEnd() {
      setBanner("good", "11:00", "Result day is over", "See how your architecture scored, then reveal the answers.",
        '<div class="row end"><button class="btn btn-ghost btn-sm" data-sim="replay">Replay</button><button class="btn btn-sm" data-sim="report">See the report</button></div>');
    }

    function setPlaying(p) {
      playing = p;
      var b = root.querySelector('[data-sim="play"]');
      b.textContent = finished ? "Replay" : p ? "Pause" : "Play";
      var cont = banner.querySelector('[data-sim="continue"]');
      if (p && cont) cont.parentNode.remove();
    }

    function finish() {
      finished = true;
      setPlaying(false);
      showEnd();
      if (opts.onFinish) opts.onFinish();
    }

    function replay() {
      simM = START; finished = false; nextEvent = 0; lastMinute = null; feedShown = 0; particles = []; serverCount = 0;
      feedEl.innerHTML = ""; showIdle();
      setPlaying(true);
    }

    function skip() {
      simM = END - 0.001; nextEvent = R.events.length; particles = [];
      updateMinute(END - 1); lastMinute = END - 1;
      finish();
    }

    /* ---- particles ---- */
    function serverPoint() {
      var srvs = root.querySelectorAll(".srv");
      var d = diagram.getBoundingClientRect();
      if (!srvs.length) return box("app");
      var r = srvs[Math.floor(Math.random() * srvs.length)].getBoundingClientRect();
      return { x: r.left - d.left + r.width / 2, y: r.top - d.top + r.height / 2 };
    }
    function queueSlot() {
      var a = box("app");
      return { x: a.x - a.w / 2 - 14 - Math.random() * 30, y: a.y + (Math.random() - 0.5) * a.h * 0.5 };
    }

    function spawnRequest(x, mi) {
      var S = box("students"), L = box("lb"), A = serverPoint();
      var start = jitter(S, 24);
      var pts, color = COLORS.good, die = false, slow = false;
      var toCache = Math.random() < hitRate(P.cache, mi);
      var D = box(toCache ? "cache" : "db");
      var aBox = box("app");
      if (x.dbDown) {
        var dbB = box("db");
        pts = [start, L, A, edge(dbB, aBox)]; color = COLORS.bad; die = true;
      } else if (x.smsSlow && (P.sms === "sync" || P.sms === "retry")) {
        var smsB = box("sms");
        pts = [start, L, A, edge(smsB, aBox)]; color = Math.random() < 0.6 ? COLORS.bad : COLORS.warn; die = true; slow = true;
      } else if (x.overloaded && Math.random() > x.served) {
        pts = [start, edge(L, start), L, queueSlot()]; color = COLORS.bad; die = true; slow = true;
      } else {
        pts = [start, L, A, edge(D, aBox)];
        if (x.overloaded || x.p99 > 1) { color = COLORS.warn; slow = true; }
      }
      particles.push({ pts: pts, t: 0, dur: (slow ? 2.6 : 1.3) / Math.sqrt(speed), color: color, die: die, r: 3.4, fade: 0 });

      if (!x.dbDown && P.sms !== "none" && Math.random() < 0.18) {
        var SM = box("sms");
        if (P.sms === "queue") {
          var Q = box("smsq");
          var stuck = x.smsSlow && Math.random() < 0.7;
          particles.push({ pts: stuck ? [A, edge(Q, aBox)] : [A, Q, edge(SM, Q)], t: 0, dur: 1.6 / Math.sqrt(speed), color: COLORS.sms, die: stuck, r: 2.6, fade: 0 });
        } else if (!x.smsSlow) {
          particles.push({ pts: [A, edge(SM, aBox)], t: 0, dur: 1.2 / Math.sqrt(speed), color: COLORS.sms, die: false, r: 2.6, fade: 0 });
        }
      }
    }

    function spawnAttack(x) {
      var B = box("bot"), L = box("lb"), A = serverPoint(), D = box("db");
      var start = jitter(B, 20);
      if (Math.random() < x.blockedNow) {
        particles.push({ pts: [start, edge(L, start)], t: 0, dur: 0.9 / Math.sqrt(speed), color: COLORS.attack, die: true, blocked: true, r: 3, fade: 0 });
      } else {
        particles.push({ pts: [start, L, A, edge(D, box("app"))], t: 0, dur: 1.5 / Math.sqrt(speed), color: COLORS.attack, die: false, r: 3, fade: 0 });
      }
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
        spawnAcc += dt * (3 + 24 * Math.min(1, x.lambda / 800));
        while (spawnAcc >= 1) { spawnAcc -= 1; spawnRequest(x, mi); }
        if (x.attack) {
          attackAcc += dt * 9;
          while (attackAcc >= 1) { attackAcc -= 1; spawnAttack(x); }
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
      // edges
      ctx.lineWidth = 2; ctx.strokeStyle = COLORS.edge; ctx.setLineDash([]);
      function line(a, b, dashed) {
        ctx.setLineDash(dashed ? [5, 6] : []);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      var S = box("students"), L = box("lb"), A = box("app"), Cc = box("cache"), D = box("db"), SM = box("sms");
      line(S, L); line(L, A); line(A, Cc, !(P.cache === "warm" || P.cache === "aside")); line(A, D);
      if (P.sms === "queue") { var Q = box("smsq"); line(A, Q); line(Q, SM); } else line(A, SM, P.sms === "none");
      if (x.attack) { ctx.strokeStyle = "#F9A8D4"; line(box("bot"), L, true); ctx.strokeStyle = COLORS.edge; }
      ctx.setLineDash([]);

      // queue in front of the app servers
      var qn = x.dbDown ? 0 : x.overloaded ? 36 : x.rho > 0.8 ? Math.round((x.rho - 0.8) * 120) : 0;
      if (qn > 0) {
        ctx.fillStyle = x.overloaded ? COLORS.bad : COLORS.warn;
        for (var k = 0; k < qn; k++) {
          var col = Math.floor(k / 6), rowi = k % 6;
          ctx.globalAlpha = 0.75;
          ctx.beginPath();
          ctx.arc(A.x - A.w / 2 - 10 - col * 8, A.y - 20 + rowi * 8, 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // particles
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i], pt = pointAt(p);
        var r = p.r, alpha = 1;
        if (p.t >= 1) {
          alpha = 1 - p.fade;
          if (p.die) r = p.r + p.fade * 7;
        }
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
          simM = e.m;
          nextEvent++;
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
      else if (a === "continue") { setPlaying(true); }
      else if (a === "speed") {
        speed = Number(b.dataset.v);
        root.querySelectorAll('[data-sim="speed"]').forEach(function (s) { s.classList.toggle("on", s === b); });
      }
      else if (a === "skip") skip();
      else if (a === "replay") replay();
      else if (a === "report" && opts.onReport) opts.onReport();
    }
    function onChange(ev) {
      if (ev.target.dataset && ev.target.dataset.sim === "pauseev") pauseAtEvents = ev.target.checked;
    }
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    attachChartHover(chartWrap, R, function () { return upto; });

    showIdle();
    updateMinute(START); lastMinute = START;
    raf = requestAnimationFrame(frame);

    return {
      destroy: function () {
        destroyed = true;
        cancelAnimationFrame(raf);
        if (ro) ro.disconnect(); else window.removeEventListener("resize", resize);
        root.removeEventListener("click", onClick);
        root.removeEventListener("change", onChange);
      },
      togglePlay: function () { if (finished) replay(); else setPlaying(!playing); },
      isFinished: function () { return finished; }
    };
  }

  return {
    compute: compute, mount: mount, reportHTML: reportHTML, attachReport: attachReport,
    fmtLatency: fmtLatency, START: START, END: END
  };
})();
