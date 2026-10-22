# Exam Tracker

Study and exam tracker with a Node + SQLite backend and a React front end.

    npm install
    npm run build
    npm start          # http://localhost:3000, data in data/tracker.db

Development: `npm run dev:api` and `npm run dev:web` in two terminals. Tests: `npm test`.

Set `APP_TOKEN` to require a bearer token, and `HOST=0.0.0.0` to reach it from your phone on the same Wi-Fi.
Back up with `GET /api/export`.
