# Study Dashboard

Exam and syllabus tracker for Class 10: countdown to the next exam, a ranked study queue, chapter progress, projects, a focus timer and weekly study time. Live at https://study.advaitachandra.in (private, access token required).

One Cloudflare Worker (Hono) serves the React app and the `/api/*` routes; data lives in Cloudflare D1.

## Develop locally

    npm install
    cp .dev.vars.example .dev.vars   # local APP_TOKEN
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

## Phases, scope and revision passes

Four exam phases: Pre-Boards 1, Pre-Boards 2, Practicals and Viva, Board Exams. The app follows the calendar (the first phase that hasn't ended) unless you pick one in the Phase menu on Today. Only Pre-Boards 1 has confirmed dates; edit the others under Subjects when the datesheets are out.
Each chapter has a scope (Unit 1/2, PB1, PB2, Boards). A phase covers its own level and everything below it, so Pre-Boards 1 skips PB2-only and Boards-only chapters.
Each chapter has three revision passes: Concept, PYQs and Exemplar, Sample papers. Ticking a pass also stamps the chapter as revised today.
Exam dates are kept per subject per phase, and the study queue ranks against the active phase.
Backups are version 2; version 1 files are upgraded on restore.

## Mission Control and Focus Hub

- **Daily targets:** on the first load of each day, three chapters from the study queue are suggested. Tick, swap, remove, or add your own (up to eight a day). Deleting them all keeps them deleted for the day.
- **Energy check-in:** Low, OK or High, once a day. Low puts lighter chapters first, High puts the hardest first. Open targets are re-suggested; finished and custom ones stay.
- **Focus timer:** 25-minute focus, 5-minute break, a 15-minute break after every fourth round. The timer lives in D1, so you can start it on one device and stop it on another. A finished focus is logged to its subject automatically, even if no tab was open (the server settles it on the next request, using the day the focus ended). Stopping early logs whole minutes so far. A soft chime and vibration play when a round ends, and the tab title shows the countdown.
- The app refreshes every 20 seconds while visible, and when you switch back to the tab.
- The Week tab also lists energy and study minutes for each of the last 7 days.

## Sign-in

The app opens on a 6-digit PIN keypad. A correct PIN sets a signed, `HttpOnly`, `SameSite=Strict` cookie (90 days with "Remember this device", otherwise 24 hours).
Five wrong tries lock that device for 15 minutes, and 20 wrong tries across all devices lock everyone out for up to an hour.
Backup tab: "Sign out" and "Sign out of all devices".

Worker secrets (set once with `npx wrangler secret put <NAME>`):

| Secret | Purpose |
|---|---|
| `STUDY_PASSCODE` | your 6-digit PIN |
| `SESSION_SECRET` | long random string that signs session cookies |
| `APP_TOKEN` | recovery and automation bearer token (`Authorization: Bearer ...`) |

Locally, `.dev.vars` holds test values (see `.dev.vars.example`).

## Backup

The Backup tab downloads and restores a JSON copy (`GET /api/export`, `POST /api/import`). Restore is atomic.
