# Trade-off Arena

A classroom team game for **CSE 444 · Lecture 2 · Quality Attributes**. Teams take turns choosing the parts of a system on a projected screen. Each choice is a building part (an icon, a short name and a few words) that flies into a blueprint of the system, so the class watches its design come together. No answers are shown until the blueprint is finished. Then the class watches a live simulation of its own design (Sale Day in Round 1, Result Day in Round 2), reads the report card, and the blueprint is graded part by part.

- **Built to trick the unprepared.** Every option sounds sensible. The traps carry the most attractive promise ("Zero waste, always busy", "The proven FoodRush fix"); the best part shows its price ("Pay for a third sitting idle", "Some see 'payment pending'"). Students who know the lecture's ideas see through it; gut feeling does not.
- **Visual, not wordy.** Selecting a part plays a small animation below the options showing how that part works on a normal day. It never shows whether the part is right. At the reveal, the same animation runs under pressure (a rush, a crash, a slow partner, an attack), and the class can flip between all four options to see why one survives.

Plain HTML, CSS and JavaScript. No build step and no server.

## Run it

Open `index.html` in a browser (double-click works). Use full screen on the projector (F11).

- Fonts load from Google Fonts. Offline, the app falls back to system fonts and still works.
- Progress is saved in the browser, so a refresh does not lose picks. Use **Reset everything** on the home screen to start over.

## How a class session goes

1. **Teams.** Add as many teams as you like on the home screen (**Add a team**, **Add 5**); colours are assigned automatically and new teams can join mid-game. Decisions rotate between teams, and one student from the team comes up to choose. Click a team's chip in the top bar to hand the current decision to a different team. With more teams than parts, the teams without a turn in Round 1 go first in Round 2.
2. **Round 1, before the lecture: Eid Ticket Rush.** Teams build a bus-ticket system from six parts. Each slot has a tempting gut-feeling part (more workers, the average time, five small services, keep retrying, one more `if-else`, lock out forever). When the blueprint is finished, **Run Sale Day** animates 08:55 to 10:00 against the class's design: the ticket rush, a seat-map bug that slows 1 in 100 bookings, a server crash, a slow wallet company, a request for a third wallet and a password-guessing botnet. The report shows a GPA and which suffering the dashboard missed. Then grade the blueprint one part at a time. Each answer plays the under-pressure animation, gives a one-line rule to remember, and names the lecture slide that covers it.
3. **Teach Lecture 2.**
4. **Round 2, after the lecture: Result Day.** Teams build a university result portal from eight harder parts. Several reuse the lecture's own fixes where they no longer work: "remember after the first visit" when each student reads only their own result, and a per-account login limit against password spraying. When the blueprint is finished, **Run Result Day** animates 09:55 to 11:00 against the class's design: a traffic spike, a slow SMS provider, a database failure, a student editing the URL, a botnet and the academic council. The report shows the result as a mark sheet with a CGPA, then the blueprint is graded.

## Controls

| Where | Keys / buttons |
|---|---|
| Choosing | Click a part or press `A`–`D` / `1`–`4` to preview it, then **Lock in** (or `Enter`) to send it into the blueprint. Click an animation to replay it. **Undo last part** if someone mis-clicks |
| Turn banner | 60-second discussion timer (click to start or stop) |
| Reveal | `Space` or `→` to reveal, then go to the next answer; `←` goes back; `A`–`D` (or click a card) to watch that option under pressure |
| Simulation (both rounds) | `Space` play/pause, speed 1× 2× 4×, **Pause at each event**, **Skip to the end** |

## Scoring

- Round 1: 10 points for the best part, 5 for a half-right part, 0 otherwise.
- Round 2: 20 points for the best part, 10 for a half-right part, 0 otherwise.

Scores stay hidden until each answer is revealed.

## Files

- `js/content.js`: all questions, parts, explanations, slide references and the blueprint layouts. Edit this file to change the content.
- `js/icons.js`: the icons used on parts, in the blueprint and in the animations.
- `js/demos.js`: the small animations (request flows, the 100-customer grid, the promise timeline, code over many changes, the login gate, result doors).
- `js/sim.js`: the Sale Day and Result Day models (Little's Law, utilization, series and parallel availability, timeouts) and the shared live animation and report.
- `js/app.js`: teams, turns, hidden picks, reveal and scoreboards.
- `css/styles.css`: the visual design. The quality colours match the lecture deck.
