# Trade-off Arena

A classroom team game for **CSE 444 · Lecture 2 · Quality Attributes**. Teams take turns making design decisions on a projected screen. No answers are shown until every decision is locked in. Then the class gets the full reveal (Round 1) or watches a live simulation of its own design (Round 2).

Plain HTML, CSS and JavaScript. No build step and no server.

## Run it

Open `index.html` in a browser (double-click works). Use full screen on the projector (F11).

- Fonts load from Google Fonts. Offline, the app falls back to system fonts and still works.
- Progress is saved in the browser, so a refresh does not lose picks. Use **Reset everything** on the home screen to start over.

## How a class session goes

1. **Teams.** Set up 2 to 4 teams on the home screen. Decisions rotate between teams, and one student from the team comes up to choose. Click a team's chip in the top bar to hand the current decision to a different team.
2. **Round 1, before the lecture: Eid Ticket Rush.** Six decisions where the gut-feeling answer is a trap (more threads, averages, more services, retrying straight away, one more `else-if`, permanent lockout). Once all six are locked, reveal them one at a time. Each answer explains the trap, shows the number that proves it, and names the lecture slide that covers it.
3. **Teach Lecture 2.**
4. **Round 2, after the lecture: Result Day.** Eight harder decisions for a university result portal. Several are the lecture's own fixes applied where they no longer work: cache-aside with a cold cache, a per-account rate limit against password spraying. When all are locked, **Run Result Day** animates 09:55 to 11:00 against the class's design: a traffic spike, a slow SMS provider, a database failure, a student editing the URL, a botnet and the academic council. The report shows the result as a mark sheet with a CGPA, then the answers are revealed.

## Controls

| Where | Keys / buttons |
|---|---|
| Choosing | `A`–`D` or `1`–`4` to select, `Enter` to lock in, **Undo last pick** if someone mis-clicks |
| Turn banner | 60-second discussion timer (click to start or stop) |
| Reveal | `Space` or `→` to reveal, then go to the next answer; `←` goes back |
| Simulation | `Space` play/pause, speed 1× 2× 4×, **Pause at each event**, **Skip to the end** |

## Scoring

- Round 1: 10 points for the best choice, 5 for a half-right choice, 0 otherwise.
- Round 2: 20 points for the best choice, 10 for a half-right choice, 0 otherwise.

Scores stay hidden until each answer is revealed.

## Files

- `js/content.js`: all questions, options, explanations and slide references. Edit this file to change the content.
- `js/sim.js`: the Result Day model (Little's Law, utilization, series and parallel availability) and the animation.
- `js/app.js`: teams, turns, hidden picks, reveal and scoreboards.
- `css/styles.css`: the visual design. The quality colours match the lecture deck.
