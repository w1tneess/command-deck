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
    npx wrangler secret put APP_TOKEN        # the access token you type on each device
    npm run deploy                           # builds, then publishes

The domain is set in `wrangler.jsonc` (`routes`); its DNS record and certificate are created on deploy.
The API refuses every request when `APP_TOKEN` is not set, so a deploy without it is closed, not open.

## Backup

The Backup tab downloads and restores a JSON copy (`GET /api/export`, `POST /api/import`). Restore is atomic.
