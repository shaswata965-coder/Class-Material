/* Trade-off Arena — question content for CSE 444 Lecture 2 (Quality Attributes).
 *
 * Verdicts: "correct" (full points), "partial" (half points),
 * "trap" (0 points, the tempting gut-feeling answer), "wrong" (0 points).
 * Each final-round option carries a `sim` object that feeds the Result Day simulation.
 */
window.ARENA_CONTENT = {
  qualities: {
    performance:   { label: "Performance" },
    availability:  { label: "Availability" },
    modifiability: { label: "Modifiability" },
    security:      { label: "Security" }
  },

  rounds: {
    /* ------------------------------------------------------------------ */
    warm: {
      id: "warm",
      kicker: "Round 1 · Warm-up",
      name: "Eid Ticket Rush",
      when: "Before the lecture",
      tagline: "Six decisions where gut feeling picks the wrong answer.",
      story:
        "Eid Express sells bus tickets for the Eid journey home. Sales open Friday at 9:00 am, " +
        "and last year the site crashed four minutes later. Your teams are the architects this year. " +
        "Each team sends one person up per decision. Nobody sees the answers until every decision is locked.",
      facts: [
        { k: "Sale opens", v: "Friday, 9:00 am" },
        { k: "First hour", v: "50,000 people" },
        { k: "Last year", v: "Crashed after 4 minutes" },
        { k: "Your job", v: "Six design decisions" }
      ],
      questions: [
        {
          id: "w1",
          quality: "performance",
          title: "Two builds, one sale day",
          prompt:
            "The team load-tested two builds with 1,000 bookings each. On sale day, 50,000 people book in the first hour. Which build do you ship?",
          table: {
            head: ["", "Build A", "Build B"],
            rows: [
              ["Average", "300 ms", "420 ms"],
              ["p50 (median)", "140 ms", "380 ms"],
              ["p99", "6.2 s", "0.7 s"]
            ],
            note: "p50: half of the bookings finish faster. p99: 99 of every 100 finish faster."
          },
          options: [
            { key: "A", verdict: "trap", text: "Ship Build A. Its average is 120 ms faster.",
              why: "The average hides the tail: 1 booking in 100 takes over 6 s." },
            { key: "B", verdict: "correct", text: "Ship Build B. Its slowest bookings are far faster.",
              why: "Slightly slower on average, but 99 of every 100 bookings finish within 0.7 s." },
            { key: "C", verdict: "wrong", text: "Either one. Nobody notices 120 ms.",
              why: "Nobody notices 120 ms, but people do notice 6 s, and 500 of them an hour will." },
            { key: "D", verdict: "wrong", text: "Ship Build A and add a loading spinner for the slow ones.",
              why: "The wait looks nicer but is still 6 s, and impatient people refresh, adding load." }
          ],
          reveal: {
            headline: "1 in 100 sounds rare, until 50,000 people show up.",
            why:
              "Build A’s slow 1% is 500 travellers an hour stuck for over 6 seconds. They refresh, which adds load and slows everyone down. " +
              "That is why performance requirements use percentiles, like “p99 ≤ 1 s”, instead of averages.",
            proof: "50,000 × 1% = 500",
            proofCaption: "people an hour waiting over 6 s with Build A",
            slide: "Slide 5"
          }
        },
        {
          id: "w2",
          quality: "performance",
          title: "9:00 am and the queue keeps growing",
          prompt:
            "At 9:00, 50 bookings arrive every second. Each booking takes 0.3 s, and 0.25 s of that is loading the route and fare list from the database. That list changes twice a year.",
          chips: ["50 bookings / s", "0.3 s per booking", "10 worker threads", "Database 95% busy"],
          options: [
            { key: "A", verdict: "trap", text: "Double the worker threads to 20, so twice as many bookings run at once.",
              why: "The extra threads wait on the same 95%-busy database and push it past its limit." },
            { key: "B", verdict: "wrong", text: "Move to a server with a faster CPU.",
              why: "The time goes on waiting for the database, not on the CPU." },
            { key: "C", verdict: "wrong", text: "Show a “please wait” page so people stop refreshing.",
              why: "Fewer refreshes help a little, but every real booking is still slow." },
            { key: "D", verdict: "correct", text: "Keep the route and fare list in memory (a cache) and refresh it every hour.",
              why: "Each booking skips the database and drops from 0.3 s to 0.05 s." }
          ],
          reveal: {
            headline: "You can’t slow the crowd down, so make each booking shorter.",
            why:
              "Little’s Law: bookings in progress = arrival rate × time per booking. 15 bookings in progress need more than 10 threads, " +
              "but extra threads only move the queue to the database. Removing the slow database call shrinks the time itself.",
            proof: "L = 50 × 0.3 = 15",
            proofCaption: "bookings in progress for 10 threads. With the cache: 50 × 0.05 = 2.5",
            slide: "Slides 6–9"
          }
        },
        {
          id: "w3",
          quality: "availability",
          title: "More pieces, more robust?",
          prompt:
            "Last Eid, the single server crashed and ticket sales stopped. Every server or service below is up 99.9% of the time, and a load balancer is up 99.99%. Which design keeps sales running the most?",
          options: [
            { key: "A", verdict: "correct", text: "Run two copies of the server behind a load balancer.",
              why: "Sales stop only if both copies fail together: about 99.99%, or 4 minutes down a month." },
            { key: "B", verdict: "trap", text: "Split the app into 5 services (Login, Search, Seats, Booking, Payment). Every booking passes through all 5.",
              why: "All 5 must work at once: 0.999⁵ = 99.5%, about 3.6 hours down a month." },
            { key: "C", verdict: "wrong", text: "Keep the single server, as today.",
              why: "99.9%: about 43 minutes down a month." },
            { key: "D", verdict: "wrong", text: "Replace it with one bigger, more powerful server.",
              why: "Faster, but still one machine. When it fails, everything stops: still 99.9%." }
          ],
          reveal: {
            headline: "Chains multiply downtime. Spare copies divide it.",
            why:
              "When every part must work, you multiply their availabilities, so each part you add to the chain lowers the total. " +
              "A spare copy fails only if both copies are down at the same moment, which is far rarer.",
            proof: "0.999⁵ = 99.5%",
            proofCaption: "for the 5-service chain, vs. 1 − 0.001² = 99.9999% for a redundant pair",
            slide: "Slide 11"
          }
        },
        {
          id: "w4",
          quality: "availability",
          title: "The wallet provider slows down",
          prompt:
            "At 9:20, the mobile-wallet provider starts taking 30 s per payment. Card and cash bookings share the same 10 worker threads. What should Eid Express do when it calls the wallet?",
          options: [
            { key: "A", verdict: "trap", text: "Wait as long as it takes. Never give up on a customer’s payment.",
              why: "Within seconds all 10 threads are stuck waiting, and card and cash bookings stop too." },
            { key: "B", verdict: "trap", text: "Retry immediately, again and again, until the wallet answers.",
              why: "A retry storm: it hammers a provider that is already struggling and can charge a customer twice." },
            { key: "C", verdict: "correct", text: "Give up after 2 s, retry up to 3 times with growing random pauses, then stop calling for a while and show “payment pending”.",
              why: "A timeout, backoff and a circuit breaker stop the slow provider from taking the rest of the site down." },
            { key: "D", verdict: "wrong", text: "Restart our server whenever the threads get stuck.",
              why: "Bookings in progress are lost, and the threads are stuck again a few seconds later." }
          ],
          reveal: {
            headline: "One slow dependency can stop everything, unless you contain it.",
            why:
              "A call with no timeout holds a thread for as long as the provider takes. Ten threads stuck for 30 s means the whole site serves " +
              "one booking every 3 s. Failing fast on purpose keeps the threads free for everyone else.",
            proof: "10 threads ÷ 30 s",
            proofCaption: "= 1 booking every 3 seconds, for the whole site",
            slide: "Slides 10–14"
          }
        },
        {
          id: "w5",
          quality: "modifiability",
          title: "Another wallet before Eid",
          prompt:
            "Marketing adds a new payment method every few months. Next week it’s a third mobile wallet. Right now BookingService has an if / else-if branch for every provider.",
          code:
            'if method == "CARD":\n    cardApi.charge(total)\nelif method == "WALLET1":\n    wallet1.pay(total)\nelif method == "WALLET2":\n    wallet2.send(total)',
          options: [
            { key: "A", verdict: "trap", text: "Add one more else-if to BookingService. Five lines, done today.",
              why: "Quick today, but every provider means editing core booking code, retesting every payment path and redeploying." },
            { key: "B", verdict: "correct", text: "Create a PaymentGateway interface. Each provider is its own class, picked from a table filled at start-up.",
              why: "A new wallet is one new class plus one table entry. BookingService never changes." },
            { key: "C", verdict: "wrong", text: "Copy BookingService into BookingServiceWallet3 and change the copy.",
              why: "Now every bug fix has to be made in two places, and soon in five." },
            { key: "D", verdict: "wrong", text: "Let the wallet company’s code write to our database directly, so BookingService doesn’t change.",
              why: "It ties us to one vendor and opens our database to outside code." }
          ],
          reveal: {
            headline: "The fastest change today can make every later change slower.",
            why:
              "Each else-if ties BookingService to one more vendor. Depending on an interface we own turns the arrows around: " +
              "providers depend on our contract, and new ones plug in without touching the core.",
            proof: "0 lines",
            proofCaption: "changed in BookingService for the next wallet",
            slide: "Slides 15–17"
          }
        },
        {
          id: "w6",
          quality: "security",
          title: "Bots at the login page",
          prompt:
            "Sunday night: 1,000 login attempts a minute, using email and password pairs leaked from other websites. The attackers are betting that people reuse passwords.",
          options: [
            { key: "A", verdict: "trap", text: "Lock an account forever after 3 wrong passwords.",
              why: "Now the attacker can lock out any customer on sale day: a denial of service they control." },
            { key: "B", verdict: "trap", text: "Require 16-character passwords with symbols.",
              why: "Leaked passwords are real passwords that already passed someone’s rules, and existing users keep theirs." },
            { key: "C", verdict: "correct", text: "Allow 5 attempts per account per minute, then make them wait, and alert the operators.",
              why: "Guessing slows to a crawl, real users wait at most a minute, and people know an attack is happening." },
            { key: "D", verdict: "wrong", text: "Move the login page to a secret URL.",
              why: "Security through obscurity: bots find the new URL within minutes." }
          ],
          reveal: {
            headline: "The strictest-looking rule can become the attacker’s weapon.",
            why:
              "Permanent lockout turns a guessing attack into a denial-of-service attack. Rate limiting slows the guesses without " +
              "punishing real users, and the alert brings people in to react.",
            proof: "1,000 → 5",
            proofCaption: "guesses per minute per account, with operators alerted",
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
      tagline: "Eight harder decisions, then a live simulation of your design.",
      story:
        "At 10:00 am the university publishes final results. Within minutes 40,000 students, and their parents, open ResultHub. " +
        "Last semester it was down for two hours. Your class redesigns it. When every decision is locked, we run result day " +
        "against your design: a traffic spike, a slow SMS provider, a database failure, a curious student, a botnet and the academic council.",
      facts: [
        { k: "Peak load", v: "800 requests / s", note: "for the first 10 minutes (normally 20 / s)" },
        { k: "Time per request", v: "250 ms", note: "200 ms of it is the database computing the CGPA" },
        { k: "Worker threads", v: "50 per app server" },
        { k: "Results", v: "Final at 10:00", note: "corrections are rare" },
        { k: "Guardian SMS", v: "Sent when a result is viewed", note: "the SMS provider is up 99.5%" },
        { k: "Student IDs", v: "Printed on ID cards", note: "and sequential, e.g. 221-15-4512" },
        { k: "Grading rules", v: "Change most semesters" },
        { k: "Goal", v: "Fast, up and safe all morning" }
      ],
      questions: [
        {
          id: "f1",
          quality: "performance",
          title: "Write the requirement",
          prompt:
            "The registrar wants a written performance requirement for result day before signing the budget. Which one goes into the contract?",
          options: [
            { key: "A", verdict: "wrong", text: "“ResultHub must be fast and responsive.”",
              why: "No number and no load: nobody can say whether it passed.", sim: { req: "fast" } },
            { key: "B", verdict: "trap", text: "“Average response time under 1 second.”",
              why: "The average can pass while thousands of students wait 5 s or more.", sim: { req: "avg" } },
            { key: "C", verdict: "trap", text: "“p50 under 200 ms, tested at 20 requests per second.”",
              why: "Precise, but measured on a normal day. Result day is 40 times busier.", sim: { req: "p50normal" } },
            { key: "D", verdict: "correct", text: "“p99 under 1 second while serving 800 requests per second.”",
              why: "A percentile, a limit and the real peak load: testable and meaningful.", sim: { req: "p99peak" } }
          ],
          reveal: {
            headline: "A requirement needs a percentile, a limit and the load.",
            why:
              "Averages hide the slow tail, and a test at normal load says nothing about 800 requests per second. " +
              "“p99 ≤ 1 s at 800 req/s” can be tested before result day and checked during it.",
            proof: "p99 ≤ 1 s @ 800 / s",
            proofCaption: "a requirement you can test",
            slide: "Slide 5"
          }
        },
        {
          id: "f2",
          quality: "performance",
          title: "How many app servers?",
          prompt:
            "Size the server pool for the first 10 minutes: 800 requests per second, 0.25 s per request, 50 threads per server. Aim for about 65% utilization at peak.",
          formula: "L = λ × W        utilization = L ÷ threads",
          chips: ["λ = 800 / s", "W = 0.25 s", "50 threads per server", "Target ≈ 65%"],
          options: [
            { key: "A", verdict: "trap", text: "2 servers, plus auto-scaling that adds servers when they get busy. A new server takes 8 minutes to start.",
              why: "100 threads for 200 requests in progress, and the new servers arrive when the 10-minute rush is nearly over.",
              sim: { servers: 2, autoscale: true } },
            { key: "B", verdict: "trap", text: "4 servers: 200 threads, exactly the 200 we need.",
              why: "That is 100% utilization: after any burst the queue never empties.", sim: { servers: 4 } },
            { key: "C", verdict: "correct", text: "6 servers: 300 threads.",
              why: "L = 800 × 0.25 = 200 busy threads, and 200 ÷ 300 = 67%.", sim: { servers: 6 } },
            { key: "D", verdict: "partial", text: "16 servers: 800 threads, just to be safe.",
              why: "It works at 25% utilization, but you pay for 16 servers that sit idle most of the year.", sim: { servers: 16 } }
          ],
          reveal: {
            headline: "“Exactly enough” means a queue that never empties.",
            why:
              "Little’s Law gives the busy threads at peak: 200. At 100% utilization the queue grows without limit, so size for about 65%: " +
              "200 ÷ 0.65 ≈ 308 threads, which is 6 servers. Auto-scaling handles slow growth, not a spike that is over in 10 minutes.",
            proof: "800 × 0.25 ÷ 0.65 ≈ 308",
            proofCaption: "threads needed, so 6 servers × 50 threads",
            slide: "Slides 6–7"
          }
        },
        {
          id: "f3",
          quality: "performance",
          title: "Speed up the CGPA query",
          prompt:
            "200 of the 250 ms is the database computing each student’s CGPA. Results are final at 10:00, and almost every student looks up only their own result. Which tactic?",
          options: [
            { key: "A", verdict: "trap", text: "Cache-aside, like FoodRush: load from the database on the first request, then keep the result for 10 minutes.",
              why: "Each result is read by about one student, so at 10:00 almost every request is a first request: a cache miss.",
              sim: { cache: "aside" } },
            { key: "B", verdict: "trap", text: "Raise each server’s threads from 50 to 200.",
              why: "The database is the bottleneck. Four times the connections make it thrash, and every request slows down.",
              sim: { cache: "threads" } },
            { key: "C", verdict: "correct", text: "Compute all 40,000 results before 10:00 and load them into the cache in advance.",
              why: "Every request is a cache hit from the first second: 250 ms becomes about 50 ms.",
              sim: { cache: "warm" } },
            { key: "D", verdict: "partial", text: "Buy a database server with twice the CPUs.",
              why: "It helps a little (about 210 ms) and costs a lot. The work is still done 40,000 times during the rush.",
              sim: { cache: "bigdb" } }
          ],
          reveal: {
            headline: "A cache only helps when the same data is read again.",
            why:
              "Cache-aside worked for FoodRush because thousands of customers read the same menu. Here each result is read by about one " +
              "student, so a cold cache misses on almost every request at 10:00. Results are known in advance, so warm the cache before the rush.",
            proof: "250 → 50 ms",
            proofCaption: "per request with a warm cache, so busy threads drop from 200 to 40",
            slide: "Slides 8–9"
          }
        },
        {
          id: "f4",
          quality: "availability",
          title: "The guardian SMS",
          prompt:
            "Today the result page waits until the guardian SMS has been sent, then shows the grades. On result day the SMS provider may slow down badly. What do you change?",
          options: [
            { key: "A", verdict: "correct", text: "Show the result at once. Put the SMS in a queue that a background worker sends, with a timeout, backoff retries and a circuit breaker.",
              why: "Students never wait for the SMS. If the provider is slow, messages go out late, but they all go out.",
              sim: { sms: "queue" } },
            { key: "B", verdict: "trap", text: "Nothing. Keep waiting, because guardians must be told.",
              why: "If the provider takes 20 s, every page holds a thread for 20 s and the whole portal stops.",
              sim: { sms: "sync" } },
            { key: "C", verdict: "trap", text: "Retry the SMS up to 5 times, straight away, inside the page request.",
              why: "Pages wait even longer, and the extra calls bury a provider that is already struggling.",
              sim: { sms: "retry" } },
            { key: "D", verdict: "wrong", text: "Stop sending the guardian SMS.",
              why: "Faster, but it removes a feature the university requires.",
              sim: { sms: "none" } }
          ],
          reveal: {
            headline: "Don’t make the page wait for something the student doesn’t need to see.",
            why:
              "A slow dependency inside the request takes threads with it. Moving the SMS to a queue contains the failure: the page stays fast, " +
              "and the worker uses a timeout, backoff and a circuit breaker, so the backlog drains once the provider recovers.",
            proof: "20 s × 400 / s = 8,000",
            proofCaption: "threads needed if pages wait for a 20 s SMS. We have 300.",
            slide: "Slides 12–14"
          }
        },
        {
          id: "f5",
          quality: "availability",
          title: "One spare copy",
          prompt:
            "Every request passes through the chain below. The app tier already has several servers. The budget allows one more redundant copy. Where does it go?",
          chain: [
            { name: "Load balancer", a: "99.99%" },
            { name: "App servers", a: "≈ 100%", note: "already several" },
            { name: "Cache", a: "99.9%" },
            { name: "Database", a: "99.5%" }
          ],
          chainTotal: "Whole chain today: 99.39% (about 4.4 h down a month)",
          options: [
            { key: "A", verdict: "trap", text: "Two more app servers.",
              why: "The app tier already has spares. The chain stays at 99.39%.", sim: { spare: "app" } },
            { key: "B", verdict: "wrong", text: "A second load balancer.",
              why: "It is already the strongest link: 99.39% → 99.40%.", sim: { spare: "lb" } },
            { key: "C", verdict: "partial", text: "A second cache node.",
              why: "A small gain: 99.39% → 99.49%.", sim: { spare: "cache" } },
            { key: "D", verdict: "correct", text: "A database replica with automatic failover.",
              why: "The weakest link: 99.39% → 99.89%, from about 4.4 hours to 49 minutes down a month.", sim: { spare: "db" } }
          ],
          reveal: {
            headline: "Put the spare where the chain is weakest.",
            why:
              "In a chain where every part must work, the weakest part dominates. A database pair fails only if both copies are down at once: " +
              "1 − 0.005² = 99.9975%. A spare for a part that is already strong buys almost nothing.",
            proof: "99.39% → 99.89%",
            proofCaption: "for the whole chain, with a database replica",
            slide: "Slide 11"
          }
        },
        {
          id: "f6",
          quality: "modifiability",
          title: "The grading rules",
          prompt:
            "Most semesters the academic council adds or changes a rule: the best grade of a retake counts, grace marks, improvement exams. Today every rule lives in one 300-line if-else inside ResultService.",
          options: [
            { key: "A", verdict: "trap", text: "Keep the if-else, but add clear comments and more tests.",
              why: "Comments help reading, not changing: every new rule still edits the core class and risks the others.",
              sim: { rules: "ifelse" } },
            { key: "B", verdict: "correct", text: "Create a GradingRule interface. Each rule is its own class, and each curriculum’s list of rules is set in config and injected at start-up.",
              why: "A new rule is one class with its own test, plus one config line. ResultService doesn’t change.",
              sim: { rules: "strategy" } },
            { key: "C", verdict: "wrong", text: "Copy ResultService for each curriculum: ResultService2022, ResultService2024, …",
              why: "Every fix must be made in every copy, and one will be missed.", sim: { rules: "copies" } },
            { key: "D", verdict: "partial", text: "Store the rules as formulas in a database table that admins edit live in a web form.",
              why: "Changes are very fast, but an untested formula goes live for 40,000 students the moment it is saved.",
              sim: { rules: "formula" } }
          ],
          reveal: {
            headline: "Make the thing that changes most the easiest thing to change.",
            why:
              "One class per rule behind an interface gives high cohesion and keeps ResultService loosely coupled to the rules. " +
              "Choosing rules in config defers binding to start-up. Live formulas defer it further but give up testing, too high a price for grades.",
            proof: "1 class + 1 line",
            proofCaption: "to add next semester’s rule",
            slide: "Slides 15–17"
          }
        },
        {
          id: "f7",
          quality: "security",
          title: "Password spraying",
          prompt:
            "Bots try the 20 most common passwords (123456, password, …) against thousands of sequential student IDs. Each ID gets only one or two tries, and the attempts come from hundreds of IP addresses.",
          options: [
            { key: "A", verdict: "trap", text: "Limit each account to 5 attempts per minute, like FoodRush.",
              why: "One or two tries per account never reaches the limit.", sim: { login: "peraccount" } },
            { key: "B", verdict: "trap", text: "Lock an account after 3 wrong passwords.",
              why: "It never triggers either, and it lets anyone lock a classmate out on result day.", sim: { login: "lockout" } },
            { key: "C", verdict: "partial", text: "Show a CAPTCHA on every page, including the result page.",
              why: "It slows the bots, but 40,000 students solve puzzles at peak, and CAPTCHA-solving services still get through.",
              sim: { login: "captcha" } },
            { key: "D", verdict: "correct", text: "Watch failed logins across all accounts, limit each network, alert on bursts, and ask for an OTP when a login looks unusual.",
              why: "It sees the pattern a per-account limit can’t, and a second factor stops the guesses that get through.",
              sim: { login: "layers" } }
          ],
          reveal: {
            headline: "The lecture’s fix fails when the attacker changes the shape of the attack.",
            why:
              "A per-account limit stops many guesses at one account. Spraying makes a few guesses at many accounts, so you only see it " +
              "by watching the whole system. Defense in depth layers detection, rate limits and a second factor, so no single control has to be perfect.",
            proof: "3,000 IDs × 1 try",
            proofCaption: "never trips a per-account limit of 5",
            slide: "Slides 18–20"
          }
        },
        {
          id: "f8",
          quality: "security",
          title: "Change one digit",
          prompt:
            "After logging in, a student sees /result?id=221-15-4512 in the address bar. They change the last digit to 4513 and see a classmate’s grades.",
          code: "GET /result?id=221-15-4512   →   GET /result?id=221-15-4513",
          options: [
            { key: "A", verdict: "trap", text: "Encrypt the ID in the URL so nobody can guess another one.",
              why: "The server still never checks who is asking. Encrypted links get forwarded in group chats and still work.",
              sim: { authz: "encrypt" } },
            { key: "B", verdict: "wrong", text: "Send the ID with POST instead of GET, so it isn’t in the address bar.",
              why: "It is one click away in the browser’s developer tools.", sim: { authz: "post" } },
            { key: "C", verdict: "correct", text: "On every request, check that the logged-in student owns that ID, or is staff. Otherwise, deny.",
              why: "Complete mediation with a fail-safe default: every request is checked, and the answer is no unless proven yes.",
              sim: { authz: "check" } },
            { key: "D", verdict: "wrong", text: "Check more carefully at login that the student is enrolled and active.",
              why: "Login was never the problem. The bug is trusting every request after it.", sim: { authz: "login" } }
          ],
          reveal: {
            headline: "Hiding the door is not the same as locking it.",
            why:
              "This is information disclosure through a missing authorization check. Complete mediation says to check every request, " +
              "not just the first, and fail-safe defaults say to deny unless access is explicitly allowed.",
            proof: "0 results leaked",
            proofCaption: "when every request is checked",
            slide: "Slide 19"
          }
        }
      ]
    }
  }
};
