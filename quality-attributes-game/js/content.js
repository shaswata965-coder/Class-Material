/* Trade-off Arena — question content for CSE 444 Lecture 2 (Quality Attributes).
 *
 * Every decision adds one part to a blueprint of the system the class is building.
 * Options are written so that, without the lecture's ideas, the trap looks best:
 * traps carry the attractive promise, the best part shows its price.
 *
 * Verdicts: "correct" (full points), "partial" (half points),
 * "trap" (0 points, the tempting gut-feeling answer), "wrong" (0 points).
 * `demo` drives the small animation (js/demos.js): "preview" before locking in, "stress" at the reveal.
 * Final-round options carry `sim` for the Result Day simulation. Icon names refer to js/icons.js.
 */
(function () {
  "use strict";

  /* ---- shared demo pieces ---- */
  var DB = { id: "db", label: "Database", icon: "db", slots: 2, service: 0.55 };
  var WORKERS = { id: "workers", label: "Workers", icon: "users", slots: 4, service: 0.25 };
  var WALLET_STAGE = { id: "workers", label: "Workers", icon: "users", slots: 4, service: 0.35, ext: 0.3, hold: { label: "Wallet co.", icon: "wallet", types: ["wallet"] } };
  var SRV3 = { id: "srv", label: "Servers", icon: "servers", slots: 6, service: 0.15 };
  var CGPA_DB = { id: "db", label: "Database", icon: "db", slots: 2, service: 0.5, learn: "cache" };
  var SMS_SRV = { id: "srv", label: "Servers", icon: "servers", slots: 4, service: 0.3 };
  function ext(base, more) { var o = JSON.parse(JSON.stringify(base)); for (var k in more) o[k] = more[k]; return o; }

  window.ARENA_CONTENT = {
    rounds: {
      /* ================================================================ */
      warm: {
        id: "warm",
        kicker: "Round 1 · Warm-up",
        name: "Eid Ticket Rush",
        when: "Before the lecture",
        tagline: "Build a ticket system part by part. Gut feeling will try to trick you.",
        story: "Eid bus tickets go on sale at 9:00. Last year the site crashed in minutes. Build this year’s system, one part per turn.",
        facts: [
          { k: "Sale opens", v: "Friday 9:00" },
          { k: "The crowd", v: "Everyone at once" },
          { k: "Last year", v: "Crashed in minutes" }
        ],
        blueprint: {
          title: "Eid Express",
          nodes: [
            { id: "travellers", label: "Travellers", icon: "users", x: 26, y: 9 },
            { id: "db", label: "Routes & fares", icon: "db", x: 26, y: 90 }
          ],
          slots: { w1: { x: 75, y: 9 }, w6: { x: 26, y: 28 }, w3: { x: 26, y: 48 }, w5: { x: 75, y: 48 }, w2: { x: 26, y: 69 }, w4: { x: 75, y: 70 } },
          links: [["w1", "travellers", "dotted"], ["travellers", "w6"], ["w6", "w3"], ["w3", "w2"], ["w2", "db"], ["w3", "w5"], ["w5", "w4"]]
        },
        questions: [
          {
            id: "w1", quality: "performance", slot: "Speed check", slotIcon: "gauge",
            title: "Which number proves we’re fast?",
            prompt: "One number goes on the sale-day dashboard.",
            demo: { kind: "grid100" },
            options: [
              { key: "A", verdict: "trap", icon: "barChart", name: "Average time", text: "Counts every booking fairly",
                why: "Hides the few who wait ages", demo: { variant: "avg" } },
              { key: "B", verdict: "wrong", icon: "cpu", name: "Server load", text: "Measures the machine directly",
                why: "A calm server can still keep people waiting", demo: { variant: "cpu" } },
              { key: "C", verdict: "trap", icon: "gauge", name: "Typical time", text: "Ignores freak outliers",
                why: "The “outliers” are real, angry customers", demo: { variant: "median" } },
              { key: "D", verdict: "correct", icon: "target", name: "Slowest 1 in 100", text: "Judged by our worst moments",
                why: "Catches the customers who give up", demo: { variant: "p99" } }
            ],
            reveal: { headline: "Averages hide the people who suffer.", rule: "Measure the slowest, not the average.",
              why: "On sale day, “1 in 100” is hundreds of real people.", slide: "Slide 5" }
          },
          {
            id: "w2", quality: "performance", slot: "Booking engine", slotIcon: "cpu",
            title: "9:00 — the line won’t stop growing",
            prompt: "Every booking waits on the slow database. What do you add?",
            demo: {
              kind: "flow",
              base: { source: { label: "Travellers", icon: "users", rate: 3 }, slowAt: 3, patience: 6 },
              stress: { source: { rates: [[0, 3], [0.8, 8]] }, events: [{ at: 0.8, caption: "9:00 rush", icon: "users" }] }
            },
            options: [
              { key: "A", verdict: "correct", icon: "zap", name: "Cache the fare list", text: "Copy may be an hour old",
                why: "Most bookings skip the slow step",
                demo: { stages: [WORKERS, { id: "cache", label: "Cache", icon: "zap", cache: { hit: 0.85 } }, DB] } },
              { key: "B", verdict: "trap", icon: "userPlus", name: "Double the workers", text: "Twice the bookings at once",
                why: "More workers queue at the same database",
                demo: { stages: [ext(WORKERS, { label: "Workers ×2", icon: "userPlus", slots: 8 }), DB] } },
              { key: "C", verdict: "wrong", icon: "cpu", name: "Faster web server", text: "More power for every booking",
                why: "The slow part is the database",
                demo: { stages: [ext(WORKERS, { label: "Fast server", icon: "cpu", big: true, service: 0.08 }), DB] } },
              { key: "D", verdict: "wrong", icon: "hourglass", name: "Virtual waiting room", text: "Orderly, fair, no crashes",
                why: "Polite waiting is still waiting",
                demo: { stages: [{ id: "room", label: "Waiting room", icon: "hourglass", slots: 30, service: 1.1 }, WORKERS, DB] } }
            ],
            reveal: { headline: "More workers can’t fix a slow step. Removing it can.", rule: "Shorten the work, don’t just add workers.",
              why: "How crowded it gets depends on how long each booking takes.", slide: "Slides 6–9" }
          },
          {
            id: "w3", quality: "availability", slot: "Server setup", slotIcon: "server",
            title: "Last year the only server crashed",
            prompt: "How do you build this year’s servers?",
            demo: {
              kind: "flow",
              base: { source: { label: "Travellers", icon: "users", rate: 4 }, patience: 5 },
              stress: { events: [{ at: 2.5, caption: "A server crashes", icon: "power" }] }
            },
            options: [
              { key: "A", verdict: "trap", icon: "pieces", name: "Five microservices", text: "Modern: every part independent",
                why: "Five links, any one stops a booking",
                demo: {
                  stages: [
                    { id: "login", label: "Login", icon: "lock", slots: 3, service: 0.25 },
                    { id: "search", label: "Search", icon: "search", slots: 3, service: 0.25 },
                    { id: "seats", label: "Seats", icon: "grid", slots: 3, service: 0.25 },
                    { id: "book", label: "Booking", icon: "card", slots: 3, service: 0.25 },
                    { id: "pay", label: "Payment", icon: "wallet", slots: 3, service: 0.25 }
                  ],
                  stress: { stages: { seats: { fail: { at: 2.5 } } } }
                } },
              { key: "B", verdict: "correct", icon: "copy", name: "Two identical servers", text: "Pay double; one mostly idle",
                why: "One falls, the other keeps selling",
                demo: { stages: [{ id: "srv", label: "Servers ×2", icon: "server", copies: 2, slots: 3, service: 0.35 }], stress: { stages: { srv: { fail: { at: 2.5, copy: 0 } } } } } },
              { key: "C", verdict: "wrong", icon: "hardDrive", name: "One premium server", text: "Top-grade, rarely fails",
                why: "Rarely is not never",
                demo: { stages: [{ id: "srv", label: "Premium", icon: "hardDrive", big: true, slots: 6, service: 0.3 }], stress: { stages: { srv: { fail: { at: 2.5 } } } } } },
              { key: "D", verdict: "wrong", icon: "moon", name: "Nightly fresh restart", text: "Clean start every morning",
                why: "Crashes don’t wait for night",
                demo: { stages: [{ id: "srv", label: "Server", icon: "server", badge: "moon", slots: 3, service: 0.35 }], stress: { stages: { srv: { fail: { at: 2.5 } } } } } }
            ],
            reveal: { headline: "A chain breaks at any link. A spare keeps going.", rule: "Chains multiply risk. Spares divide it.",
              why: "Five parts in a row fail more often than one; two copies fail only together.", slide: "Slide 11" }
          },
          {
            id: "w4", quality: "availability", slot: "Calling the wallet", slotIcon: "wallet",
            title: "The wallet company slows to a crawl",
            prompt: "Wallet and card payments share the same workers.",
            demo: {
              kind: "flow",
              base: {
                source: { label: "Customers", icon: "users", rate: 4, types: [{ type: "wallet", p: 0.5, color: "#14B8A6", icon: "wallet" }, { type: "card", p: 0.5, color: "#3B82F6", icon: "card" }] },
                slowAt: 3, patience: 4.5
              },
              stress: { events: [{ at: 1.2, caption: "Wallet company slows down", icon: "hourglass", stage: "workers", set: { ext: 6 } }] }
            },
            options: [
              { key: "A", verdict: "trap", icon: "hourglass", name: "Wait patiently", text: "Never lose a payment",
                why: "Workers pile up; card payments stop too", demo: { stages: [WALLET_STAGE] } },
              { key: "B", verdict: "trap", icon: "refresh", name: "Retry instantly", text: "Keep trying until it works",
                why: "Floods a company that’s already struggling",
                demo: { stages: [ext(WALLET_STAGE, { timeout: 0.9, onTimeout: "retry", retries: 6 })] } },
              { key: "C", verdict: "wrong", icon: "userPlus", name: "More workers", text: "Room for the slow ones",
                why: "More workers just wait longer", demo: { stages: [ext(WALLET_STAGE, { slots: 8, label: "Workers ×2" })] } },
              { key: "D", verdict: "correct", icon: "timer", name: "Time limit, then back off", text: "Some see “payment pending”",
                why: "Workers stay free for everyone else",
                demo: { stages: [ext(WALLET_STAGE, { timeout: 1.0, onTimeout: "pending", breaker: 3 })] } }
            ],
            reveal: { headline: "A slow partner can freeze everything.", rule: "Every outside call needs a time limit.",
              why: "A call that never times out holds a worker hostage.", slide: "Slides 10–14" }
          },
          {
            id: "w5", quality: "modifiability", slot: "Payment options", slotIcon: "plug",
            title: "A new wallet every few months",
            prompt: "Wallet number 3 launches next week. How do you add it?",
            demo: { kind: "code", base: { item: "wallet", core: "card" } },
            options: [
              { key: "A", verdict: "trap", icon: "branch", name: "One more if-else", text: "Five lines, live today",
                why: "Every wallet edits the core again", demo: { variant: "ifelse" } },
              { key: "B", verdict: "correct", icon: "plug", name: "Plug-in socket", text: "Slower first time: build the socket",
                why: "New wallets plug in; core never changes", demo: { variant: "plugin" } },
              { key: "C", verdict: "wrong", icon: "copy", name: "Copy & customise", text: "Old code stays untouched",
                why: "Every fix needed in every copy", demo: { variant: "copy" } },
              { key: "D", verdict: "wrong", icon: "link", name: "Give them DB access", text: "No code change for us",
                why: "Outsiders now touch our data", demo: { variant: "direct" } }
            ],
            reveal: { headline: "Build sockets, not special cases.", rule: "What changes often should plug in.",
              why: "Each if-else ties the core to one more company.", slide: "Slides 15–17" }
          },
          {
            id: "w6", quality: "security", slot: "Login gate", slotIcon: "lock",
            title: "Bots at the login page",
            prompt: "Bots try thousands of leaked passwords on customer accounts.",
            demo: { kind: "gate", base: { attack: "guess" } },
            options: [
              { key: "A", verdict: "trap", icon: "password", name: "Strong-password rule", text: "Long, complex passwords only",
                why: "Leaked passwords already work", demo: { variant: "strongpw" } },
              { key: "B", verdict: "trap", icon: "ban", name: "Lock after 3 misses", text: "Bots locked out fast",
                why: "Bots can lock out real customers", demo: { variant: "lockout" } },
              { key: "C", verdict: "correct", icon: "shieldCheck", name: "Slow down + alert", text: "Real users may wait a minute",
                why: "Guessing crawls and staff are alerted", demo: { variant: "ratelimit" } },
              { key: "D", verdict: "wrong", icon: "eyeOff", name: "Hidden login page", text: "Can’t attack what they can’t find",
                why: "Bots find it within minutes", demo: { variant: "hidden" } }
            ],
            reveal: { headline: "The strictest rule can become the attacker’s weapon.", rule: "Slow the attacker, not the customer.",
              why: "Lockout lets an attacker lock out real customers on purpose.", slide: "Slides 18–20" }
          }
        ]
      },

      /* ================================================================ */
      final: {
        id: "final",
        kicker: "Round 2 · Final challenge",
        name: "Result Day",
        when: "After the lecture",
        tagline: "Eight harder parts for a result portal, then watch it face result day.",
        story: "Results go live at 10:00 and 40,000 students rush in. Last semester the portal was down for two hours. Build it, then watch it face result day.",
        facts: [
          { k: "The rush", v: "First 10 minutes" },
          { k: "Slow step", v: "Computing each CGPA" },
          { k: "Results", v: "Fixed once published" },
          { k: "Each student", v: "Opens only their own" },
          { k: "Guardian SMS", v: "Sent per result" },
          { k: "Student IDs", v: "On ID cards, in order" },
          { k: "Grading rules", v: "Change every semester" }
        ],
        blueprint: {
          title: "ResultHub",
          nodes: [
            { id: "students", label: "Students", icon: "users", x: 26, y: 8 },
            { id: "db", label: "Database", icon: "db", x: 26, y: 92 }
          ],
          slots: { f1: { x: 75, y: 9 }, f7: { x: 26, y: 24 }, f2: { x: 26, y: 41 }, f4: { x: 75, y: 31 }, f6: { x: 75, y: 52 }, f8: { x: 26, y: 58 }, f3: { x: 26, y: 75 }, f5: { x: 75, y: 89 } },
          links: [["f1", "students", "dotted"], ["students", "f7"], ["f7", "f2"], ["f2", "f8"], ["f8", "f3"], ["f3", "db"], ["f2", "f4"], ["f2", "f6"], ["db", "f5", "dashed"]]
        },
        questions: [
          {
            id: "f1", quality: "performance", slot: "The promise", slotIcon: "fileText",
            title: "Write the speed promise",
            prompt: "The registrar wants a speed promise in the contract.",
            demo: { kind: "promise" },
            options: [
              { key: "A", verdict: "trap", icon: "barChart", name: "Average under 1 s", text: "Fair to every student",
                why: "Passes while thousands wait", demo: { variant: "avg" }, sim: { req: "avg" } },
              { key: "B", verdict: "trap", icon: "sun", name: "Fast 99% of the day", text: "Covers almost all day",
                why: "The 10-minute rush is the missing 1%", demo: { variant: "day" }, sim: { req: "day" } },
              { key: "C", verdict: "trap", icon: "coffee", name: "Proven in a load test", text: "Already passed last week",
                why: "Last week wasn’t result day", demo: { variant: "lastweek" }, sim: { req: "p50normal" } },
              { key: "D", verdict: "correct", icon: "target", name: "99 in 100, even at 10:00", text: "Strict: judged at the worst moment",
                why: "Measures what students actually feel", demo: { variant: "peak" }, sim: { req: "p99peak" } }
            ],
            reveal: { headline: "A promise must name the worst moment.", rule: "Promise the slowest case at the busiest time.",
              why: "Averages and all-day numbers hide the rush.", slide: "Slide 5" }
          },
          {
            id: "f2", quality: "performance", slot: "Server pool", slotIcon: "servers",
            title: "How big is the server pool?",
            prompt: "You know what the 10:00 rush needs. How much do you buy?",
            demo: {
              kind: "flow",
              base: { source: { label: "Students", icon: "users", rate: 2, wobble: 0.5 }, slowAt: 2.5, patience: 3 },
              stress: { source: { rates: [[0, 2], [1, 7]], wobble: 0.9 }, events: [{ at: 1, caption: "10:00 rush", icon: "users" }] }
            },
            options: [
              { key: "A", verdict: "trap", icon: "trendUp", name: "Auto-scale on demand", text: "Pay only when busy",
                why: "New servers arrive after the rush",
                demo: { stages: [{ id: "pool", label: "Servers + auto", icon: "server", grid: true, copies: 3, ghost: 6, slots: 1, service: 1 }],
                  stress: { stages: { pool: { addCopies: { at: 8, n: 6 } } } } },
                sim: { servers: 2, autoscale: true } },
              { key: "B", verdict: "correct", icon: "gauge", name: "Two-thirds busy at peak", text: "Pay for a third sitting idle",
                why: "Spare room soaks up bursts",
                demo: { stages: [{ id: "pool", label: "9 servers", icon: "server", grid: true, copies: 9, slots: 1, service: 1 }] }, sim: { servers: 6 } },
              { key: "C", verdict: "trap", icon: "equal", name: "Exactly the need", text: "Zero waste, always busy",
                why: "Full servers can’t absorb a burst",
                demo: { stages: [{ id: "pool", label: "6 servers", icon: "server", grid: true, copies: 6, slots: 1, service: 1 }] }, sim: { servers: 4 } },
              { key: "D", verdict: "partial", icon: "warehouse", name: "Four times the need", text: "We’ll never run out",
                why: "Works, but most servers idle all year",
                demo: { stages: [{ id: "pool", label: "24 servers", icon: "server", grid: true, copies: 24, slots: 1, service: 1 }] }, sim: { servers: 16 } }
            ],
            reveal: { headline: "“Exactly enough” is never enough.", rule: "Keep about a third spare at the peak.",
              why: "Never-idle servers turn every burst into a queue that won’t clear.", slide: "Slides 6–7" }
          },
          {
            id: "f3", quality: "performance", slot: "Speed-up", slotIcon: "zap",
            title: "Speed up the slow CGPA step",
            prompt: "Each student opens only their own result. Which speed-up?",
            demo: {
              kind: "flow",
              base: { source: { label: "Students", icon: "users", rate: 2.5, keys: "repeat", keySpace: 6, colorByKey: true }, slowAt: 3, patience: 4.5 },
              stress: { source: { keys: "unique", rates: [[0, 2.5], [0.8, 7]] }, events: [{ at: 0.8, caption: "10:00: everyone opens their own", icon: "users" }] }
            },
            options: [
              { key: "A", verdict: "trap", icon: "history", name: "Cache on first visit", text: "The proven FoodRush fix",
                why: "Every visit is a first visit",
                demo: { stages: [SRV3, { id: "cache", label: "Cache", icon: "zap", cache: { keys: true } }, CGPA_DB] }, sim: { cache: "aside" } },
              { key: "B", verdict: "correct", icon: "alarm", name: "Pre-compute before 10:00", text: "Corrections must be redone",
                why: "Every result ready from second one",
                demo: { stages: [SRV3, { id: "cache", label: "Ready results", icon: "alarm", cache: { warm: true } }, CGPA_DB] }, sim: { cache: "warm" } },
              { key: "C", verdict: "trap", icon: "userPlus", name: "4× workers per server", text: "Serve 4× the students at once",
                why: "They all crowd the same database",
                demo: { stages: [ext(SRV3, { slots: 24, label: "Servers ×4" }), ext(CGPA_DB, { thrash: true })] }, sim: { cache: "threads" } },
              { key: "D", verdict: "partial", icon: "dbBig", name: "Upgrade the database", text: "Make the slow part faster",
                why: "A bit faster, very expensive",
                demo: { stages: [SRV3, ext(CGPA_DB, { big: true, slots: 3, service: 0.42, label: "Big database" })] }, sim: { cache: "bigdb" } }
            ],
            reveal: { headline: "A cache only helps when someone asks twice.", rule: "Known in advance? Prepare in advance.",
              why: "Each result is read once, so a cache that fills on first visit stays empty at 10:00.", slide: "Slides 8–9" }
          },
          {
            id: "f4", quality: "availability", slot: "Guardian SMS", slotIcon: "msg",
            title: "Result page and the guardian SMS",
            prompt: "The SMS company may turn slow on result day.",
            demo: {
              kind: "flow",
              base: { source: { label: "Students", icon: "users", rate: 3 }, slowAt: 3, patience: 4.5 },
              stress: { events: [{ at: 1.2, caption: "SMS company slows down", icon: "hourglass", stage: "srv", set: { ext: 5, drain: 0.4 } }] }
            },
            options: [
              { key: "A", verdict: "correct", icon: "mail", name: "Result now, SMS queued", text: "Some texts arrive late",
                why: "Pages stay fast; texts catch up",
                demo: { stages: [ext(SMS_SRV, { async: { icon: "mail", drain: 3 } })] }, sim: { sms: "queue" } },
              { key: "B", verdict: "trap", icon: "msg", name: "SMS first, then result", text: "Guardians always told first",
                why: "Every page waits on the SMS company",
                demo: { stages: [ext(SMS_SRV, { hold: { label: "SMS co.", icon: "msg" }, ext: 0.3 })] }, sim: { sms: "sync" } },
              { key: "C", verdict: "trap", icon: "refresh", name: "Retry SMS until sent", text: "No guardian ever missed",
                why: "Pages wait longer; SMS company drowns",
                demo: { stages: [ext(SMS_SRV, { hold: { label: "SMS co.", icon: "msg" }, ext: 0.3, timeout: 1, onTimeout: "retry", retries: 5 })] }, sim: { sms: "retry" } },
              { key: "D", verdict: "wrong", icon: "bellOff", name: "Skip SMS when busy", text: "Fastest possible pages",
                why: "Breaks a university requirement",
                demo: { stages: [ext(SMS_SRV, { drop: true })] }, sim: { sms: "none" } }
            ],
            reveal: { headline: "Keep slow partners out of the student’s path.", rule: "If nobody is waiting for it, do it later.",
              why: "A slow partner inside the page drags every page down.", slide: "Slides 12–14" }
          },
          {
            id: "f5", quality: "availability", slot: "Spare copy", slotIcon: "copy",
            title: "Money for ONE spare copy",
            prompt: "Every page passes through all four parts. Where does the spare go?",
            demo: {
              kind: "flow",
              base: {
                source: { label: "Students", icon: "users", rate: 4 }, patience: 4,
                stages: [
                  { id: "gw", label: "Gateway", icon: "network", slots: 6, service: 0.1, health: 0.99 },
                  { id: "srv", label: "Servers", icon: "servers", copies: 3, slots: 2, service: 0.3, health: 0.98 },
                  { id: "cache", label: "Cache", icon: "zap", slots: 6, service: 0.1, health: 0.9 },
                  { id: "db", label: "Database", icon: "db", slots: 3, service: 0.25, health: 0.7 }
                ]
              },
              stress: { stages: { db: { fail: { at: 2.5, copy: 0 } } }, events: [{ at: 2.5, caption: "The database fails", icon: "power" }] }
            },
            options: [
              { key: "A", verdict: "trap", icon: "servers", name: "Spare server", text: "Where most work happens",
                why: "Servers already had spares", demo: { stages: { srv: { copies: 4, spare: true } } }, sim: { spare: "app" } },
              { key: "B", verdict: "trap", icon: "network", name: "Spare gateway", text: "Every request enters here",
                why: "The gateway almost never fails", demo: { stages: { gw: { copies: 2, spare: true } } }, sim: { spare: "lb" } },
              { key: "C", verdict: "correct", icon: "dbTwin", name: "Database twin", text: "Expensive, mostly idle",
                why: "Protects the part that fails most", demo: { stages: { db: { copies: 2, spare: true } } }, sim: { spare: "db" } },
              { key: "D", verdict: "partial", icon: "zap", name: "Spare cache", text: "Keeps pages fast",
                why: "Small gain; not the weak spot", demo: { stages: { cache: { copies: 2, spare: true } } }, sim: { spare: "cache" } }
            ],
            reveal: { headline: "Put the safety net under the weakest link.", rule: "Spares go where failures happen.",
              why: "The health bars showed it: the database fails most often.", slide: "Slide 11" }
          },
          {
            id: "f6", quality: "modifiability", slot: "Grading rules", slotIcon: "blocks",
            title: "Grading rules change every semester",
            prompt: "Retakes, grace marks, improvements… where do the rules live?",
            demo: { kind: "code", base: { item: "blocks", core: "fileText" } },
            options: [
              { key: "A", verdict: "trap", icon: "comment", name: "One well-tested if-else", text: "Everything in one place",
                why: "Every new rule edits the core", demo: { variant: "ifelse" }, sim: { rules: "ifelse" } },
              { key: "B", verdict: "partial", icon: "table", name: "Admin formula editor", text: "Instant changes, no developer",
                why: "Untested rules go live for everyone", demo: { variant: "formula" }, sim: { rules: "formula" } },
              { key: "C", verdict: "correct", icon: "blocks", name: "Rule plug-ins", text: "More structure up front",
                why: "New rule = new plug-in; core untouched", demo: { variant: "plugin" }, sim: { rules: "strategy" } },
              { key: "D", verdict: "wrong", icon: "copy", name: "One copy per curriculum", text: "Old batches never break",
                why: "Every fix repeated in every copy", demo: { variant: "copy" }, sim: { rules: "copies" } }
            ],
            reveal: { headline: "Make the thing that changes most the easiest to change.", rule: "Keep what changes separate.",
              why: "A rule in its own tested piece never touches the rest.", slide: "Slides 15–17" }
          },
          {
            id: "f7", quality: "security", slot: "Login gate", slotIcon: "lock",
            title: "Bots try “123456” on every student",
            prompt: "One try per account, from hundreds of places.",
            demo: { kind: "gate", base: { attack: "spray" } },
            options: [
              { key: "A", verdict: "trap", icon: "shield", name: "5 tries per account", text: "The proven FoodRush fix",
                why: "One try per account never trips it", demo: { variant: "peraccount" }, sim: { login: "peraccount" } },
              { key: "B", verdict: "correct", icon: "activity", name: "Watch all + phone code", text: "Some students get asked for a code",
                why: "Sees the pattern; codes stop lucky guesses", demo: { variant: "layers" }, sim: { login: "layers" } },
              { key: "C", verdict: "trap", icon: "ban", name: "Lock after 3 misses", text: "Strict and simple",
                why: "Never triggers either", demo: { variant: "lockout" }, sim: { login: "lockout" } },
              { key: "D", verdict: "partial", icon: "grid", name: "CAPTCHA on every page", text: "Stops all bots",
                why: "Slows bots and every student", demo: { variant: "captcha" }, sim: { login: "captcha" } }
            ],
            reveal: { headline: "When the attack changes shape, one lock isn’t enough.", rule: "Layer your defences.",
              why: "Spraying never repeats on one account, so only a view of all logins spots it.", slide: "Slides 18–20" }
          },
          {
            id: "f8", quality: "security", slot: "Result door", slotIcon: "door",
            title: "Change one digit, see a friend’s result",
            prompt: "A logged-in student edits the ID in the link.",
            demo: { kind: "doors" },
            options: [
              { key: "A", verdict: "trap", icon: "shuffle", name: "Scramble the IDs", text: "Impossible to guess",
                why: "Shared links still open", demo: { variant: "scramble" }, sim: { authz: "encrypt" } },
              { key: "B", verdict: "trap", icon: "idCard", name: "Stricter login", text: "Only real students get in",
                why: "They already are a real student", demo: { variant: "stricter" }, sim: { authz: "login" } },
              { key: "C", verdict: "wrong", icon: "eyeOff", name: "Hide the ID", text: "Nothing left to edit",
                why: "Dev tools show it in one click", demo: { variant: "hide" }, sim: { authz: "post" } },
              { key: "D", verdict: "correct", icon: "userCheck", name: "Check owner every time", text: "One extra check per page",
                why: "Every door checks who’s asking", demo: { variant: "check" }, sim: { authz: "check" } }
            ],
            reveal: { headline: "Hiding the door isn’t locking it.", rule: "Check every request. Default to no.",
              why: "Nobody checked whether this student may open that result.", slide: "Slide 19" }
          }
        ]
      }
    }
  };
})();
