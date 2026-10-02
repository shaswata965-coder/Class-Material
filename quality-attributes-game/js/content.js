/* Trade-off Arena — question content for CSE 444 Lecture 2 (Quality Attributes).
 *
 * Every decision adds one part to a blueprint of the system the class is building.
 * Questions are conceptual: students reason about ideas, not arithmetic.
 *
 * Verdicts: "correct" (full points), "partial" (half points),
 * "trap" (0 points, the tempting gut-feeling answer), "wrong" (0 points).
 * Each final-round option carries a `sim` object that feeds the Result Day simulation.
 * Icon names refer to js/icons.js.
 */
window.ARENA_CONTENT = {
  rounds: {
    /* ------------------------------------------------------------------ */
    warm: {
      id: "warm",
      kicker: "Round 1 · Warm-up",
      name: "Eid Ticket Rush",
      when: "Before the lecture",
      tagline: "Build a ticket system part by part, and see how often gut feeling picks the wrong part.",
      story:
        "Eid Express sells bus tickets for the journey home. Sales open on Friday morning, and last year the site crashed within minutes. " +
        "This year your teams build it again, one part at a time. Nobody sees which parts were right until the whole blueprint is finished.",
      facts: [
        { k: "Sale opens", v: "Friday, 9:00 am" },
        { k: "The crowd", v: "Everyone at once" },
        { k: "Last year", v: "Crashed in minutes" },
        { k: "Your job", v: "Pick the six parts" }
      ],
      blueprint: {
        title: "Eid Express",
        nodes: [
          { id: "travellers", label: "Travellers", icon: "users", x: 26, y: 9 },
          { id: "db", label: "Routes & fares", icon: "db", x: 26, y: 90 }
        ],
        slots: {
          w1: { x: 75, y: 9 },
          w6: { x: 26, y: 28 },
          w3: { x: 26, y: 48 },
          w5: { x: 75, y: 48 },
          w2: { x: 26, y: 69 },
          w4: { x: 75, y: 70 }
        },
        links: [
          ["w1", "travellers", "dotted"], ["travellers", "w6"], ["w6", "w3"], ["w3", "w2"], ["w2", "db"],
          ["w3", "w5"], ["w5", "w4"]
        ]
      },
      questions: [
        {
          id: "w1",
          quality: "performance",
          slot: "Speed check",
          slotIcon: "gauge",
          title: "How do we know it’s fast enough?",
          prompt:
            "Before sale day the team tests the site. They need one way to decide whether it is fast enough. Which speed check goes on the dashboard?",
          options: [
            { key: "A", verdict: "trap", icon: "barChart", name: "Average time",
              text: "Add up every booking’s time and divide. One tidy number.",
              why: "A few very slow bookings hide inside a nice-looking average. Those customers still wait, and they refresh." },
            { key: "B", verdict: "correct", icon: "target", name: "Slowest 1 in 100",
              text: "Look at the slow end: 99 of every 100 bookings must finish within a time limit.",
              why: "It watches the unlucky customers, the ones who give up and complain." },
            { key: "C", verdict: "wrong", icon: "zap", name: "Best time ever",
              text: "Show the fastest booking we managed. It looks great in a report.",
              why: "The best case says nothing about the people stuck waiting." },
            { key: "D", verdict: "wrong", icon: "loader", name: "Friendly spinner",
              text: "Skip measuring. Show a nice spinner so waiting feels shorter.",
              why: "The wait is just as long, and people refresh, which makes it worse." }
          ],
          reveal: {
            headline: "The average hides the people who are suffering.",
            why:
              "If 99 bookings take a moment and one takes forever, the average still looks fine. On sale day, “1 in 100” is hundreds of real people. " +
              "So we measure the slow end: “99 of every 100 bookings within one second”.",
            picture: "A class average of 70% can hide the student who failed. A good teacher looks at who is struggling, not only at the average.",
            rule: "Measure the slowest, not the average.",
            slide: "Slide 5"
          }
        },
        {
          id: "w2",
          quality: "performance",
          slot: "Booking engine",
          slotIcon: "cpu",
          title: "9:00 am and the line keeps growing",
          prompt:
            "Every booking first looks up the bus routes and fares in the database, which is the slowest step. That list almost never changes. " +
            "At 9:00 the database is struggling and bookings are piling up.",
          options: [
            { key: "A", verdict: "trap", icon: "userPlus", name: "More workers",
              text: "Double the number of workers handling bookings, so more run at the same time.",
              why: "Every extra worker waits on the same struggling database. The queue just moves there." },
            { key: "B", verdict: "wrong", icon: "cpu", name: "Faster processor",
              text: "Move the site to a machine with a faster processor.",
              why: "The time is spent waiting for the database, not thinking." },
            { key: "C", verdict: "wrong", icon: "hourglass", name: "Please-wait page",
              text: "Show a “please wait” page so people stop refreshing.",
              why: "Slightly fewer clicks, but every real booking is still slow." },
            { key: "D", verdict: "correct", icon: "zap", name: "Keep a copy nearby",
              text: "Keep the route and fare list in fast memory (a cache) and refresh it every hour.",
              why: "Bookings skip the slow step completely, so each one finishes far sooner." }
          ],
          reveal: {
            headline: "Don’t add people to a slow line. Make the slow step disappear.",
            why:
              "How crowded a system gets depends on how many people arrive and how long each one stays. We can’t send customers away, " +
              "but we can make each booking shorter. A nearby copy of data that rarely changes removes the slowest step.",
            picture: "A tea stall with one kettle doesn’t get faster by hiring more helpers: they all wait for the kettle. Keep a flask of hot tea ready instead.",
            rule: "Shorten the work, don’t just add workers.",
            slide: "Slides 6–9"
          }
        },
        {
          id: "w3",
          quality: "availability",
          slot: "Server setup",
          slotIcon: "server",
          title: "More pieces, more robust?",
          prompt:
            "Last Eid, the one and only server crashed, and ticket sales stopped completely. How should this year’s servers be set up?",
          options: [
            { key: "A", verdict: "correct", icon: "copy", name: "Two copies",
              text: "Run two identical servers side by side. If one falls over, the other keeps selling.",
              why: "Sales stop only if both fail at the same moment, which is very rare." },
            { key: "B", verdict: "trap", icon: "pieces", name: "Five small services",
              text: "Split the app into five small services: login, search, seats, booking and payment. Every booking goes through all five.",
              why: "Now there are five things that can break, and any one of them stops a booking." },
            { key: "C", verdict: "wrong", icon: "server", name: "Keep one server",
              text: "Keep a single server, the same as last year.",
              why: "Same as last year: one crash and everything stops." },
            { key: "D", verdict: "wrong", icon: "hardDrive", name: "One giant server",
              text: "Replace it with one much bigger, more powerful server.",
              why: "Faster, but still one machine. When it fails, everything stops." }
          ],
          reveal: {
            headline: "A chain is as weak as its weakest link. A spare copy is a safety net.",
            why:
              "When every part must work, each extra part is one more way to fail, so splitting into five pieces made the system more fragile. " +
              "Two copies side by side fail only when both break at once.",
            picture: "Old fairy lights: one bulb dies and the whole string goes dark. A house with two water tanks still has water when one runs dry.",
            rule: "Chains multiply risk. Spares divide it.",
            slide: "Slide 11"
          }
        },
        {
          id: "w4",
          quality: "availability",
          slot: "Calling the wallet",
          slotIcon: "card",
          title: "The wallet company slows down",
          prompt:
            "At 9:20 the mobile-wallet company starts taking ages to answer each payment. Card and cash bookings share the same workers. " +
            "What should Eid Express do when it calls the wallet?",
          options: [
            { key: "A", verdict: "trap", icon: "hourglass", name: "Wait forever",
              text: "Wait as long as it takes. Never give up on a customer’s payment.",
              why: "Soon every worker is stuck waiting, and card and cash bookings stop too." },
            { key: "B", verdict: "trap", icon: "refresh", name: "Keep retrying",
              text: "If it doesn’t answer, try again straight away, over and over.",
              why: "It floods a company that is already struggling, and can charge a customer twice." },
            { key: "C", verdict: "correct", icon: "timer", name: "Time limit, then step back",
              text: "Stop waiting after a couple of seconds, retry a few times with pauses, then stop calling for a while and show “payment pending”.",
              why: "Workers stay free, other payments keep working, and the wallet gets time to recover." },
            { key: "D", verdict: "wrong", icon: "power", name: "Restart when stuck",
              text: "Restart our server whenever the workers get stuck.",
              why: "Bookings in progress are lost, and the workers are stuck again a minute later." }
          ],
          reveal: {
            headline: "One slow partner can freeze everything, unless you limit how long you wait.",
            why:
              "Each waiting call ties up a worker. If calls never time out, the slow wallet quietly takes every worker hostage. " +
              "A time limit, polite retries and a “circuit breaker” that stops calling for a while keep the rest of the site alive.",
            picture: "A shopkeeper on hold forever with one supplier can’t serve anyone else. Hang up, note it down, call back later.",
            rule: "Every call to someone else needs a time limit.",
            slide: "Slides 10–14"
          }
        },
        {
          id: "w5",
          quality: "modifiability",
          slot: "Payment options",
          slotIcon: "plug",
          title: "Another wallet before Eid",
          prompt:
            "Marketing adds a new way to pay every few months, and next week it’s a third mobile wallet. Right now the booking code has a separate if-else branch for every payment company.",
          options: [
            { key: "A", verdict: "trap", icon: "branch", name: "One more if-else",
              text: "Add one more branch to the booking code. Five minutes, done today.",
              why: "Quick today, but every new company means editing and retesting the most important code." },
            { key: "B", verdict: "correct", icon: "plug", name: "Plug-in sockets",
              text: "Give every payment company the same socket (an interface). Each company becomes its own plug-in, and the booking code never changes.",
              why: "A new wallet is one new plug-in. The booking code doesn’t even notice." },
            { key: "C", verdict: "wrong", icon: "copy", name: "Copy the code",
              text: "Copy the booking code into a new version just for the new wallet.",
              why: "Every future bug must now be fixed in two places, then three, then four." },
            { key: "D", verdict: "wrong", icon: "link", name: "Let them in directly",
              text: "Let the wallet company’s code write straight into our database.",
              why: "It ties us to one company and lets outside code touch our data." }
          ],
          reveal: {
            headline: "Build sockets, not special cases.",
            why:
              "Every if-else ties the core code to one more company, so every change risks breaking the rest. With one shared socket, " +
              "new companies plug in from the outside and the core code stays untouched.",
            picture: "You don’t rewire your house for every new appliance. You plug it into a standard socket.",
            rule: "Things that change often should plug in, not be built in.",
            slide: "Slides 15–17"
          }
        },
        {
          id: "w6",
          quality: "security",
          slot: "Login gate",
          slotIcon: "lock",
          title: "Bots at the login page",
          prompt:
            "Sunday night: bots try thousands of logins a minute, using email and password pairs stolen from other websites. They’re betting that people reuse passwords.",
          options: [
            { key: "A", verdict: "trap", icon: "ban", name: "Lock out forever",
              text: "Lock an account permanently after three wrong passwords.",
              why: "Now the attacker can lock out any customer on sale day, on purpose." },
            { key: "B", verdict: "trap", icon: "password", name: "Super-long passwords",
              text: "Force everyone to use very long passwords full of symbols.",
              why: "The stolen passwords are real ones that already work, and existing users keep theirs." },
            { key: "C", verdict: "correct", icon: "shieldCheck", name: "Slow down and alert",
              text: "Allow only a few tries per account each minute, make the rest wait, and alert the team.",
              why: "Guessing becomes painfully slow, real users barely notice, and people know an attack is on." },
            { key: "D", verdict: "wrong", icon: "eyeOff", name: "Secret login page",
              text: "Move the login page to a secret web address.",
              why: "Bots find the new address within minutes." }
          ],
          reveal: {
            headline: "The strictest rule can become the attacker’s weapon.",
            why:
              "Permanent lockout lets an attacker lock out real customers whenever they like. Slowing guesses down and calling in people " +
              "stops the attack without punishing the customers we are protecting.",
            picture: "A shop that bolts its door forever after three wrong knocks lets anyone close the shop. A guard who slows suspicious visitors and radios for help is better.",
            rule: "Slow the attacker, not the customer.",
            slide: "Slides 18–20"
          }
        }
      ]
    },

    /* ------------------------------------------------------------------ */
    final: {
      id: "final",
      kicker: "Round 2 · Final challenge",
      name: "Result Day",
      when: "After the lecture",
      tagline: "Build a result portal from eight harder parts, then watch it face result day.",
      story:
        "At 10:00 am the university publishes final results, and within minutes 40,000 students and their parents rush to ResultHub. " +
        "Last semester it was down for two hours. Your class designs it again, one part at a time. When the blueprint is finished, " +
        "we run result day against it.",
      facts: [
        { k: "The rush", v: "Everyone in the first 10 minutes", note: "Then it calms down quickly" },
        { k: "Slowest step", v: "The database working out each CGPA" },
        { k: "Results", v: "Fixed once published", note: "Corrections are rare" },
        { k: "Each student", v: "Looks up only their own result" },
        { k: "Guardian SMS", v: "A text goes to each guardian", note: "The SMS company is sometimes slow" },
        { k: "Student IDs", v: "Printed on ID cards", note: "and numbered in order" },
        { k: "Grading rules", v: "Change most semesters" },
        { k: "Goal", v: "Fast, up and safe all morning" }
      ],
      blueprint: {
        title: "ResultHub",
        nodes: [
          { id: "students", label: "Students", icon: "users", x: 26, y: 8 },
          { id: "db", label: "Database", icon: "db", x: 26, y: 92 }
        ],
        slots: {
          f1: { x: 75, y: 9 },
          f7: { x: 26, y: 24 },
          f2: { x: 26, y: 41 },
          f4: { x: 75, y: 31 },
          f6: { x: 75, y: 52 },
          f8: { x: 26, y: 58 },
          f3: { x: 26, y: 75 },
          f5: { x: 75, y: 89 }
        },
        links: [
          ["f1", "students", "dotted"], ["students", "f7"], ["f7", "f2"], ["f2", "f8"], ["f8", "f3"], ["f3", "db"],
          ["f2", "f4"], ["f2", "f6"], ["db", "f5", "dashed"]
        ]
      },
      questions: [
        {
          id: "f1",
          quality: "performance",
          slot: "The promise",
          slotIcon: "fileText",
          title: "What exactly are we promising?",
          prompt:
            "Before paying for the new system, the registrar wants a written promise about speed on result day. Which promise goes into the contract?",
          options: [
            { key: "A", verdict: "wrong", icon: "sparkles", name: "“Fast and smooth”",
              text: "ResultHub will feel fast and responsive.",
              why: "Nobody can ever say whether it passed. It’s a wish, not a promise.", sim: { req: "fast" } },
            { key: "B", verdict: "trap", icon: "barChart", name: "Good on average",
              text: "On average, a page loads in under one second.",
              why: "The average can look fine while thousands of students wait far longer.", sim: { req: "avg" } },
            { key: "C", verdict: "trap", icon: "coffee", name: "Tested on a quiet day",
              text: "Pages load quickly, measured on a normal day with few visitors.",
              why: "Result day is nothing like a quiet day. The test never sees the rush.", sim: { req: "p50normal" } },
            { key: "D", verdict: "correct", icon: "target", name: "99 in 100, even at the peak",
              text: "99 of every 100 pages load within one second, even in the 10:00 rush.",
              why: "It protects the slow end and names the hardest moment, so it can be tested and checked.", sim: { req: "p99peak" } }
          ],
          reveal: {
            headline: "A good promise says how fast, for whom, and when it’s hardest.",
            why:
              "“Fast” can’t be checked. Averages hide the unlucky students, and a quiet-day test says nothing about the rush. " +
              "Naming the slow end and the busiest moment turns a wish into a promise you can test.",
            picture: "“The bus is usually on time” means little. “99 of 100 buses arrive within 5 minutes, even at Eid” is a promise you can hold someone to.",
            rule: "Promise the slowest case at the busiest time.",
            slide: "Slide 5"
          }
        },
        {
          id: "f2",
          quality: "performance",
          slot: "Server pool",
          slotIcon: "servers",
          title: "How big should the server pool be?",
          prompt:
            "You can work out how many servers the 10:00 rush needs. How much do you actually buy?",
          options: [
            { key: "A", verdict: "trap", icon: "trendUp", name: "Start small, grow later",
              text: "Start with a small pool and add servers automatically when it gets busy. A new server takes 8 minutes to start.",
              why: "The rush is over in about 10 minutes, so the help arrives when it’s nearly finished.",
              sim: { servers: 2, autoscale: true } },
            { key: "B", verdict: "trap", icon: "equal", name: "Exactly enough",
              text: "Buy exactly what the rush needs, so no server ever sits idle.",
              why: "Servers that are busy every moment can’t absorb one extra burst, so the queue never empties.",
              sim: { servers: 4 } },
            { key: "C", verdict: "correct", icon: "gauge", name: "Room to breathe",
              text: "Buy enough that the servers are busy about two-thirds of the time, even at the peak.",
              why: "There is spare room to soak up bursts, without paying for a warehouse of idle machines.",
              sim: { servers: 6 } },
            { key: "D", verdict: "partial", icon: "warehouse", name: "Four times more",
              text: "Buy four times what the rush needs, just to be safe.",
              why: "It works, but most of those servers sit idle all year.", sim: { servers: 16 } }
          ],
          reveal: {
            headline: "“Exactly enough” is never enough.",
            why:
              "When servers are busy every single moment, any small burst creates a queue that never clears, and waiting explodes. " +
              "Leaving about a third spare keeps things smooth. Adding servers later is too slow for a rush that is over in minutes.",
            picture: "A bus that is completely full at the first stop can’t pick anyone up at the second. Plan for some empty seats.",
            rule: "Keep about a third spare at the busiest moment.",
            slide: "Slides 6–7"
          }
        },
        {
          id: "f3",
          quality: "performance",
          slot: "Speed-up",
          slotIcon: "zap",
          title: "Speed up the slow step",
          prompt:
            "The slowest part is the database working out each student’s CGPA. Results don’t change after 10:00, and almost every student looks up only their own result. Which speed-up do you add?",
          options: [
            { key: "A", verdict: "trap", icon: "history", name: "Remember after the first visit",
              text: "Like FoodRush: the first time a result is asked for, work it out, then remember it for 10 minutes.",
              why: "Each result is asked for by about one student, so at 10:00 almost every visit is a first visit and nothing is remembered yet.",
              sim: { cache: "aside" } },
            { key: "B", verdict: "trap", icon: "userPlus", name: "More workers per server",
              text: "Let each server handle four times as many students at once.",
              why: "They all pile onto the same database, which gets slower for everyone.", sim: { cache: "threads" } },
            { key: "C", verdict: "correct", icon: "alarm", name: "Prepare in advance",
              text: "Work out all 40,000 results before 10:00 and keep them ready in fast memory.",
              why: "From the first second every result is already waiting, and the database barely works at all.",
              sim: { cache: "warm" } },
            { key: "D", verdict: "partial", icon: "dbBig", name: "Bigger database",
              text: "Buy a much more powerful database machine.",
              why: "A little faster, very expensive, and it still does all the work during the rush.", sim: { cache: "bigdb" } }
          ],
          reveal: {
            headline: "Remembering only helps if someone asks twice.",
            why:
              "FoodRush’s trick worked because thousands of customers read the same menu. Here each result is read by about one student, " +
              "so “remember after the first visit” remembers nothing in time. Results are known before 10:00, so prepare them in advance.",
            picture: "A teacher doesn’t start marking papers while 40,000 students queue at the notice board. The marks are ready before the notice goes up.",
            rule: "If you know the answers in advance, prepare them in advance.",
            slide: "Slides 8–9"
          }
        },
        {
          id: "f4",
          quality: "availability",
          slot: "Guardian SMS",
          slotIcon: "msg",
          title: "The guardian SMS",
          prompt:
            "Right now the result page waits until the guardian’s text message has been sent, and only then shows the grades. On result day the SMS company might get very slow.",
          options: [
            { key: "A", verdict: "correct", icon: "mail", name: "Send it later",
              text: "Show the result straight away. Put the text in a queue and send it in the background, with time limits and retries.",
              why: "Students never wait for the SMS. If the SMS company is slow, texts arrive late, but they all arrive.",
              sim: { sms: "queue" } },
            { key: "B", verdict: "trap", icon: "hourglass", name: "Keep waiting",
              text: "Change nothing. The guardian must be told before the student sees anything.",
              why: "If the SMS company takes 20 seconds, every page takes 20 seconds, and the whole portal jams.",
              sim: { sms: "sync" } },
            { key: "C", verdict: "trap", icon: "refresh", name: "Retry right away",
              text: "If the text fails, try again up to five times before showing the page.",
              why: "Pages wait even longer, and the extra attempts bury the struggling SMS company.", sim: { sms: "retry" } },
            { key: "D", verdict: "wrong", icon: "bellOff", name: "Drop the SMS",
              text: "Stop sending guardian texts altogether.",
              why: "Fast, but it removes something the university requires.", sim: { sms: "none" } }
          ],
          reveal: {
            headline: "Don’t make students wait for something they don’t need to see.",
            why:
              "A slow partner inside the page drags every page down with it. Moving the text into a queue separates the two: " +
              "the page stays fast, and the queue catches up once the SMS company recovers.",
            picture: "A shop doesn’t keep you at the counter until your receipt has been emailed. You walk out, and the email follows.",
            rule: "Keep slow partners out of the student’s path.",
            slide: "Slides 12–14"
          }
        },
        {
          id: "f5",
          quality: "availability",
          slot: "Spare copy",
          slotIcon: "copy",
          title: "One spare copy",
          prompt:
            "Every page passes through a front gateway, the servers, the fast memory and the database. The database breaks most often, and the server pool already has spares. You can afford one more spare copy. Where does it go?",
          options: [
            { key: "A", verdict: "trap", icon: "servers", name: "More spare servers",
              text: "Add two more servers to the pool.",
              why: "The pool already has spares, so this changes almost nothing.", sim: { spare: "app" } },
            { key: "B", verdict: "wrong", icon: "network", name: "Second gateway",
              text: "Add a second front gateway (load balancer).",
              why: "The gateway almost never fails, so a spare there buys very little.", sim: { spare: "lb" } },
            { key: "C", verdict: "partial", icon: "zap", name: "Second fast memory",
              text: "Add a second copy of the fast memory (cache).",
              why: "A small improvement, but it isn’t the weak spot.", sim: { spare: "cache" } },
            { key: "D", verdict: "correct", icon: "dbTwin", name: "Database twin",
              text: "Keep a live copy of the database that takes over automatically.",
              why: "The weakest link now has a safety net: if one copy fails, its twin carries on.", sim: { spare: "db" } }
          ],
          reveal: {
            headline: "Put the safety net under the weakest link.",
            why:
              "A chain breaks at its weakest point. Strengthening parts that rarely fail barely helps. A twin for the database, " +
              "the part that fails most often, removes the biggest risk.",
            picture: "If a bridge has one rotten plank, you replace that plank, not the strong ones.",
            rule: "Spares go where failures happen.",
            slide: "Slide 11"
          }
        },
        {
          id: "f6",
          quality: "modifiability",
          slot: "Grading rules",
          slotIcon: "blocks",
          title: "The grading rules",
          prompt:
            "Most semesters the academic council adds or changes a rule: retakes, grace marks, improvement exams. Today every rule lives in one enormous if-else inside the result code.",
          options: [
            { key: "A", verdict: "trap", icon: "comment", name: "Tidy the if-else",
              text: "Keep the big if-else, but add clear comments and more tests.",
              why: "Easier to read, but every new rule still means editing the core code and risking the others.",
              sim: { rules: "ifelse" } },
            { key: "B", verdict: "correct", icon: "blocks", name: "Rule plug-ins",
              text: "Make each rule its own small plug-in with a shared shape. Each curriculum simply lists the plug-ins it uses.",
              why: "A new rule is one new plug-in with its own test. The result code never changes.", sim: { rules: "strategy" } },
            { key: "C", verdict: "wrong", icon: "copy", name: "One copy per curriculum",
              text: "Copy the result code for each curriculum and edit each copy.",
              why: "Every fix must be repeated in every copy, and one will be missed.", sim: { rules: "copies" } },
            { key: "D", verdict: "partial", icon: "table", name: "Live formula editor",
              text: "Let admins type rules as formulas into a web form that goes live immediately.",
              why: "Very quick to change, but untested rules reach every student the moment they are saved.", sim: { rules: "formula" } }
          ],
          reveal: {
            headline: "Make the thing that changes most the easiest thing to change.",
            why:
              "Rules change every semester, so each rule should be a separate piece that can be added and tested on its own. " +
              "A live formula editor is quick, but skipping testing is too risky when the output is someone’s grades.",
            picture: "A phone gets new abilities by installing apps, not by being rewired.",
            rule: "Keep what changes separate from what doesn’t.",
            slide: "Slides 15–17"
          }
        },
        {
          id: "f7",
          quality: "security",
          slot: "Login gate",
          slotIcon: "lock",
          title: "Password spraying",
          prompt:
            "Bots try the most common passwords, like 123456, on thousands of student IDs, which are printed on ID cards and go in order. Each account gets only one or two tries, from hundreds of different places.",
          options: [
            { key: "A", verdict: "trap", icon: "shield", name: "Limit each account",
              text: "Allow only a few tries per account each minute, just like the FoodRush fix.",
              why: "One or two tries per account never reaches the limit.", sim: { login: "peraccount" } },
            { key: "B", verdict: "trap", icon: "ban", name: "Lock after 3 misses",
              text: "Lock an account after three wrong passwords.",
              why: "It never triggers either, and anyone can lock a classmate out on result day.", sim: { login: "lockout" } },
            { key: "C", verdict: "partial", icon: "grid", name: "Puzzles everywhere",
              text: "Make everyone solve a picture puzzle (a CAPTCHA) on every page.",
              why: "It slows the bots a little, but 40,000 stressed students solve puzzles too.", sim: { login: "captcha" } },
            { key: "D", verdict: "correct", icon: "activity", name: "Watch the whole gate",
              text: "Watch for floods of failed logins across all accounts, slow down suspicious networks, alert staff, and ask for a phone code when a login looks unusual.",
              why: "It spots the pattern no single account shows, and the phone code stops any lucky guesses.", sim: { login: "layers" } }
          ],
          reveal: {
            headline: "When the attack changes shape, one lock isn’t enough.",
            why:
              "A per-account limit catches many guesses at one account. Spraying makes a few guesses at many accounts, so it only shows up " +
              "when you watch everything together. Layers of defence mean no single lock has to be perfect.",
            picture: "A thief who tries one door handle on every house in the street never rattles any single door. A neighbourhood watch sees the pattern.",
            rule: "Layer your defences.",
            slide: "Slides 18–20"
          }
        },
        {
          id: "f8",
          quality: "security",
          slot: "Result door",
          slotIcon: "door",
          title: "Change one digit",
          prompt:
            "After logging in, a student notices their own ID in the web address. They change the last digit and see a classmate’s grades.",
          options: [
            { key: "A", verdict: "trap", icon: "shuffle", name: "Scramble the address",
              text: "Scramble the ID in the web address so nobody can guess someone else’s.",
              why: "The server still never checks who is asking. Scrambled links get shared in group chats and still work.",
              sim: { authz: "encrypt" } },
            { key: "B", verdict: "wrong", icon: "eyeOff", name: "Hide the ID",
              text: "Send the ID in a hidden way so it doesn’t appear in the address bar.",
              why: "It is one click away in the browser’s developer tools.", sim: { authz: "post" } },
            { key: "C", verdict: "correct", icon: "userCheck", name: "Check every request",
              text: "Every time a result is asked for, check that it belongs to the logged-in student, or to staff. Otherwise, say no.",
              why: "Every request is checked, and the answer is no unless it is clearly yes.", sim: { authz: "check" } },
            { key: "D", verdict: "wrong", icon: "idCard", name: "Stricter login",
              text: "Check more carefully at login that the student is real and enrolled.",
              why: "Login was never the problem. The problem is trusting everything after it.", sim: { authz: "login" } }
          ],
          reveal: {
            headline: "Hiding the door is not the same as locking it.",
            why:
              "The real bug is that nobody checks whether this student may see that result. Security has to check every request, " +
              "not only the first one, and say no unless access is clearly allowed.",
            picture: "An exam hall that checks ID cards at the gate but lets anyone open any locker inside isn’t secure.",
            rule: "Check every request. Say no by default.",
            slide: "Slide 19"
          }
        }
      ]
    }
  }
};
