# Study Dashboard

Class 10 study dashboard: countdown to the next exam, a daily target list and ranked study queue, a syllabus you can edit, revision passes, a focus timer, study heatmap and the school deliverables. Live at https://study.advaitachandra.in (private, PIN required).

One Cloudflare Worker (Hono) serves the React app and the `/api/*` routes; data lives in Cloudflare D1. The interface follows `Study Dashboard Design.html`: Tailwind v4 with the design's tokens, Geist and Geist Mono, a sidebar on wide screens and a bottom dock on phones.

## Develop locally

    npm install
    cp .dev.vars.example .dev.vars   # local test secrets
    npm run db:local                 # create and seed the local D1 database
    npm run build
    npm run dev                      # http://localhost:8787 (Worker + app + local D1)

`npm run dev:web` runs the Vite dev server on its own and proxies `/api` to port 8787.
`npm test` runs the tests against a real local D1 with the same migrations as production.

## Deploy

Pushing to `main` runs `.github/workflows/ci.yml`: build and tests, then (only if they pass) cloud migrations and `wrangler deploy`.
It needs one repository secret, `CLOUDFLARE_API_TOKEN` (Cloudflare "Edit Cloudflare Workers" token, plus D1 edit).

Manual deploy:

    npx wrangler login
    npm run db:remote                        # apply migrations to the cloud database
    npx wrangler secret put STUDY_PASSCODE   # your 6-digit PIN (see Sign-in)
    npm run deploy                           # builds, then publishes

The domain is set in `wrangler.jsonc` (`routes`); its DNS record and certificate are created on deploy.
The API refuses every request when neither `APP_TOKEN` nor `SESSION_SECRET` is set, so a deploy without secrets is closed, not open.

## Screens

- **Today:** countdown to the active phase (with all four phases listed), daily targets, study queue, focus timer, energy check-in. On a phone the focus timer is a bar above the dock.
- **Syllabus:** a scope filter (Unit 1, Unit 2, PB1, PB2, Boards; a phase covers its own level and everything below), subjects on the left, chapters on the right. Add, edit (name, scope, confidence), delete (with its targets and passes), drag or use the arrow keys to reorder, and tick the Concept, PYQs and Sample passes. "Mark as checked" confirms a subject's list against the school PDF. Exam phase dates and per-subject exam dates are edited here.
- **Week:** study time and energy for the last 7 days, a 12-week heatmap, and the deliverables list.
- **Deliverables:** the school submissions for the active phase, each with a status, an optional step count (the Maths portfolio has 12 activities), a due date with overdue alerts, and a viva-prep flag.
- **Backup:** download and restore a JSON copy, the theme (System, Dark or Light), and sign-out.

## Phases, scope and revision passes

Four exam phases: Pre-Boards 1, Pre-Boards 2, Practicals and Viva, Board Exams. The app follows the calendar (the first phase that hasn't ended) unless you pick one in the Phase menu on Today. Only Pre-Boards 1 has confirmed dates; the others show "Approx." until you edit them and tick Confirmed.
Each chapter has a scope and three revision passes (Concept, PYQs and Exemplar, Sample papers). Progress is the share of chapters with at least one pass done. A chapter with all three passes leaves the study queue. Ticking a pass stamps the chapter as revised today.
Exam dates are kept per subject per phase, and the study queue ranks against the active phase.

## Mission Control and Focus Hub

- **Daily targets:** on the first load of each day, three chapters from the study queue are suggested. Tick, swap, remove, or add your own (up to eight a day). Deleting them all keeps them deleted for the day.
- **Energy check-in:** Low, OK or High, once a day. Low puts lighter chapters first, High puts the hardest first. Open targets are re-suggested; finished and custom ones stay.
- **Focus timer:** 25-minute focus, 5-minute break, a 15-minute break after every fourth round. The timer lives in D1, so you can start it on one device and stop it on another. A finished focus is logged to its subject automatically, even if no tab was open (the server settles it on the next request, using the day the focus ended). Stopping early logs whole minutes so far. A soft chime and vibration play when a round ends, and the tab title shows the countdown.
- The app refreshes every 20 seconds while visible, and when you switch back to the tab.

## Sign-in

The app opens on a 6-digit PIN keypad. A correct PIN sets a signed, `HttpOnly`, `SameSite=Strict` cookie (90 days with "Remember this device", otherwise 24 hours).
Five wrong tries lock that device for 15 minutes, and 20 wrong tries across all devices lock everyone out for up to an hour.
Backup page: "Sign out" and "Sign out of all devices".

Worker secrets (set once with `npx wrangler secret put <NAME>`):

| Secret | Purpose |
|---|---|
| `STUDY_PASSCODE` | your 6-digit PIN |
| `SESSION_SECRET` | long random string that signs session cookies |
| `APP_TOKEN` | recovery and automation bearer token (`Authorization: Bearer ...`) |

Locally, `.dev.vars` holds test values (see `.dev.vars.example`).

## Backup

The Backup page downloads and restores a JSON copy (`GET /api/export`, `POST /api/import`). Restore is atomic. Backups are version 4; versions 1 to 3 are upgraded on restore (term1 becomes Unit 1, old tasks become deliverables).
