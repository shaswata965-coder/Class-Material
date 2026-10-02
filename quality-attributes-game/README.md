# Trade-off Arena

A classroom team game for **CSE 444 · Lecture 2 · Quality Attributes**. Teams take turns choosing the parts of a system on a projected screen. Each choice is a building part (an icon, a name and a plain description) that flies into a blueprint of the system, so the class watches its design come together. No answers are shown until the blueprint is finished. Then the blueprint is graded part by part (Round 1), or the class first watches a live simulation of its own design (Round 2).

The questions are conceptual: students reason about ideas such as "measure the slow end, not the average" or "a chain is as weak as its weakest link", with no arithmetic needed.

Plain HTML, CSS and JavaScript. No build step and no server.

## Run it

Open `index.html` in a browser (double-click works). Use full screen on the projector (F11).

- Fonts load from Google Fonts. Offline, the app falls back to system fonts and still works.
- Progress is saved in the browser, so a refresh does not lose picks. Use **Reset everything** on the home screen to start over.

## How a class session goes

1. **Teams.** Set up 2 to 4 teams on the home screen. Decisions rotate between teams, and one student from the team comes up to choose. Click a team's chip in the top bar to hand the current decision to a different team.
2. **Round 1, before the lecture: Eid Ticket Rush.** Teams build a bus-ticket system from six parts. Each slot has a tempting gut-feeling part (more workers, the average time, five small services, keep retrying, one more `if-else`, lock out forever). Once the blueprint is finished, grade it one part at a time. Each answer explains the trap, gives an everyday picture and a rule to remember, and names the lecture slide that covers it.
3. **Teach Lecture 2.**
4. **Round 2, after the lecture: Result Day.** Teams build a university result portal from eight harder parts. Several reuse the lecture's own fixes where they no longer work: "remember after the first visit" when each student reads only their own result, and a per-account login limit against password spraying. When the blueprint is finished, **Run Result Day** animates 09:55 to 11:00 against the class's design: a traffic spike, a slow SMS provider, a database failure, a student editing the URL, a botnet and the academic council. The report shows the result as a mark sheet with a CGPA, then the blueprint is graded.

## Controls

| Where | Keys / buttons |
|---|---|
| Choosing | Click a part or press `A`–`D` / `1`–`4`, then **Lock in** (or `Enter`) to send it into the blueprint. **Undo last part** if someone mis-clicks |
| Turn banner | 60-second discussion timer (click to start or stop) |
| Reveal | `Space` or `→` to reveal, then go to the next answer; `←` goes back |
| Simulation | `Space` play/pause, speed 1× 2× 4×, **Pause at each event**, **Skip to the end** |

## Scoring

- Round 1: 10 points for the best part, 5 for a half-right part, 0 otherwise.
- Round 2: 20 points for the best part, 10 for a half-right part, 0 otherwise.

Scores stay hidden until each answer is revealed.

## Files

- `js/content.js`: all questions, parts, explanations, slide references and the blueprint layouts. Edit this file to change the content.
- `js/icons.js`: the icons used on parts and in the blueprint.
- `js/sim.js`: the Result Day model (Little's Law, utilization, series and parallel availability) and the animation.
- `js/app.js`: teams, turns, hidden picks, reveal and scoreboards.
- `css/styles.css`: the visual design. The quality colours match the lecture deck.
