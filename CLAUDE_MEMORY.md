# CLAUDE_MEMORY.md — Claude Memory & Context File

> 📌 **Note**: This file is co-located with [`CLAUDE.md`](CLAUDE.md), the official project memory and context document ingested by Claude Code, Claude Projects, and Claude AI.

See the complete, exhaustive single-file documentation in:
👉 **[`CLAUDE.md`](CLAUDE.md)**

---

## Quick Navigation:
- **Project Identity**: Exam Tracker & Life OS (`study.advaitachandra.in`) for Advaita Chandra (Class 10 CBSE Board Candidate).
- **Architecture**: Cloudflare Workers + Hono v4 + Cloudflare D1 SQLite + React 19 + Warm Porcelain Design System.
- **6 Invariants**:
  1. Indian Standard Time (IST, UTC+5:30) is invariant (`todayIST()`).
  2. Cloudflare D1 query parameterization (`db.prepare().bind()`) & batching (`db.batch()`).
  3. Fail-closed security & constant-time comparison (`same()`), single-user Google OAuth whitelist (`advaita974@gmail.com`).
  4. React 19 standards (`useId()` for form fields, `useRef` submission locks, optimistic counter refs).
  5. Lean architecture & zero-bloat code (Vanilla CSS, native Web APIs).
  6. Mandatory memory update on EVERY task in [`context/DECISIONS.md`](context/DECISIONS.md).
- **Core Modules**:
  - Academic Engine: CBSE Class 10 Syllabus, 3-Pass Revision Framework, Study Queue Ranking, Daily Targets, Deliverables & Viva Drawer.
  - Life OS: Atomic Habits with 30-day streak lookbacks, Quick Capture Inbox, Projects & Milestones, Daily Kickoff/Shutdown Routine, Weekly Reviews.
  - Focus & Timer: 25/5/15 Pomodoro settled purely on the edge (`server/timer.ts`), Zen Focus mode, Web Audio ambient synthesizer & completion bell chime.
  - Calendar & Sync: Daily schedule blocks, +15m delay shifting, tokenized private iCal (`/calendar/:token.ics`), Google Calendar API v3 live sync & conflict resolution.
- **Verification Pipeline**: `npm run build` -> `npm run audit` -> `npm test` (159 tests passing).
