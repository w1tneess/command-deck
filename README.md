# Exam Tracker

Study and exam tracker. One Cloudflare Worker (Hono) serves the React app and the `/api/*` routes; data lives in Cloudflare D1.

## Develop locally

    npm install
    cp .dev.vars.example .dev.vars   # local APP_TOKEN
    npm run db:local                 # create and seed the local D1 database
    npm run build
    npm run dev                      # http://localhost:8787 (Worker + app + local D1)

`npm run dev:web` runs the Vite dev server on its own and proxies `/api` to port 8787.
`npm test` runs the tests against a real local D1 with the same migrations as production.

## Deploy

    npx wrangler login
    npx wrangler d1 create exam-tracker      # paste the database_id into wrangler.jsonc
    npm run db:remote                        # apply migrations to the cloud database
    npx wrangler secret put APP_TOKEN        # the access token you will type on each device
    npm run deploy                           # builds, then publishes to *.workers.dev

The API refuses every request when `APP_TOKEN` is not set, so a deploy without it is closed, not open.

## Backup

The Backup tab downloads and restores a JSON copy (`GET /api/export`, `POST /api/import`). Restore is atomic.
