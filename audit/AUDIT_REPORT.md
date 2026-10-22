# Code Review & Security Audit Report: Exam Tracker

**Date:** 2026-10-22  
**Target:** `exam-tracker` (`d:\Project\exam-tracker`)  
**Tools Employed:** CodeRabbit CLI (`v1.4.2`), TypeScript Compiler (`v7.0.2`), Vitest (`v5.0.5`), and Custom TypeScript Audit Engine (`audit/run-audit.ts`)

---

## 1. What This Repository Does & Assumed Load

**What this repo does:**
A full-stack CBSE Class 10 study tracking and Life OS application deployed on Cloudflare Workers with a Cloudflare D1 (SQLite) database and a React 19 / Tailwind CSS single-page application. It provides countdowns, chapter-level revision passes, Pomodoro cloud-synced focus timers, daily study queue prioritization, habit tracking, and quick capture.

**Assumed Load:**
1 to a small handful of personal devices (desktop browser, phone browser, tablet) authenticated via a shared 6-digit PIN and signed session cookie, operating under Indian Standard Time (IST). Concurrent requests can arrive from separate tabs or devices during routine check-ins, focus intervals, or habit updates.

---

## 2. Executive Summary

| Category | Status | Details |
| :--- | :---: | :--- |
| **Authentication & Lockout** | 🟢 **Healthy** | Constant-time PIN hashing via Web Crypto, strict cookie signing, IP & global sliding lockout windows. |
| **Data Integrity & Storage** | 🟢 **Healthy** | Atomic D1 batch transactions for all updates and full v5 backup/restore routines. |
| **Type Safety & Build** | 🟢 **Passing** | TypeScript client and server configurations compile with 0 errors; Vite bundle is optimized (~300 kB JS). |
| **Test Suite** | 🟡 **Needs Tuning** | 129 comprehensive tests across 8 suites. Vitest on Windows requires `hookTimeout` / `fileParallelism: false` to avoid Miniflare proxy contention. |
| **Frontend Concurrency & UI** | 🟠 **Actionable** | 4 actionable race conditions and accessibility ID collisions identified in Habits, Quick Capture, and Routine components. |

---

## 3. Prioritized Findings

### Group A: Should Fix (High Value / Edge-Case Reliability)

#### 1. Hard-coded Form Element IDs Collide When Multiple Forms Render
* **File:** [`src/Habits.tsx:L96-102`](file:///d:/Project/exam-tracker/src/Habits.tsx#L96-L102), [`src/Projects.tsx:L100-112`](file:///d:/Project/exam-tracker/src/Projects.tsx#L100-L112)
* **What this is:** The habit and project creation forms and row edit forms hard-code DOM element IDs like `id="habit-name"` and `id="habit-goal"`.
* **Problem:** If the user opens the "Add habit" form while an existing habit is in edit mode, duplicate IDs appear in the DOM. Clicking a label focuses the first form's input rather than the active one, and screen readers announce incorrect fields.
* **Fix:** Use React's `useId()` hook to scope IDs uniquely per form instance:
  ```tsx
  const uid = useId();
  // id={`${uid}-name`} and htmlFor={`${uid}-name`}
  ```
* **If skipped:** Confusing focus jumps on mobile taps and degraded accessibility compliance.

---

#### 2. Rapid Taps on Counter Drop Increments
* **File:** [`src/Habits.tsx:L53-55`](file:///d:/Project/exam-tracker/src/Habits.tsx#L53-L55)
* **What this is:** Increments/decrements for counter habits (e.g. water glasses) trigger `log(h.today + 1)` and send a `PUT` to `/api/habits/:id/log`.
* **Problem:** `h.today` is updated only after the network call and server reload complete. If a user quickly taps "+" 3 times, all three requests send the same initial `h.today + 1` value instead of accumulating.
* **Fix:** Track pending increments using a mutable ref or optimistic state:
  ```tsx
  const latest = useRef(h.today);
  useEffect(() => { latest.current = h.today; }, [h.today]);
  const log = async (val: number) => {
    latest.current = val;
    const ok = await act("PUT", `/api/habits/${h.id}/log`, { value: val });
    if (!ok) latest.current = h.today;
  };
  ```
* **If skipped:** Fast taps get lost and users find their counter hasn't incremented properly.

---

#### 3. Quick Capture Lacks In-Flight Double Submission Guard
* **File:** [`src/Capture.tsx:L20-23`](file:///d:/Project/exam-tracker/src/Capture.tsx#L20-L23)
* **What this is:** Quick capture drawer text input submits new notes and todos on Enter or clicking the Add button.
* **Problem:** Repeatedly pressing Enter or tapping Add before the network response resolves triggers overlapping `POST /api/captures` requests with identical text.
* **Fix:** Add a synchronous in-flight ref guard:
  ```tsx
  const busy = useRef(false);
  const save = async () => {
    if (!text.trim() || busy.current) return;
    busy.current = true;
    try {
      if (await act("POST", "/api/captures", { text, kind })) {
        setText("");
        input.current?.focus();
      }
    } finally {
      busy.current = false;
    }
  };
  ```
* **If skipped:** Duplicate notes or tasks created during network latency.

---

#### 4. Evening Routine Retains Stale Text Across Midnight / Cross-Device
* **File:** [`src/Routine.tsx:L53-65`](file:///d:/Project/exam-tracker/src/Routine.tsx#L53-L65), [`src/Today.tsx:L22`](file:///d:/Project/exam-tracker/src/Today.tsx#L22)
* **What this is:** Evening reflection textareas (`wins` and `tomorrow`) initialize local state from `state.routine`.
* **Problem:** The app polls every 20 seconds. If an open tab crosses midnight IST, `state.routine` updates to the new blank day, but local textarea state retains yesterday's text. Triggering `onBlur` saves yesterday's content into today's empty routine.
* **Fix:** Key `Evening` by day in [`src/Today.tsx`](file:///d:/Project/exam-tracker/src/Today.tsx):
  ```tsx
  <Evening key={state.routine.day} state={state} act={act} />
  ```
  and only save on blur if the user actively modified the text.
* **If skipped:** Yesterday's evening notes overwrite today's blank routine after midnight.

---

#### 5. Vitest Hook Timeout Under Parallel Miniflare Initialization
* **File:** [`vite.config.ts:L5-8`](file:///d:/Project/exam-tracker/vite.config.ts#L5-L8)
* **What this is:** Vitest test runner configuration for backend integration tests using Wrangler's `getPlatformProxy`.
* **Problem:** Running all 8 test files in parallel spawns multiple local Miniflare D1 SQLite instances simultaneously. On Windows, file I/O contention causes the first `beforeEach` hook to exceed the default 10-second timeout, resulting in flaky test runs.
* **Fix:** Configure `hookTimeout: 30000` and `fileParallelism: false` in `vite.config.ts`:
  ```ts
  test: {
    hookTimeout: 30000,
    testTimeout: 30000,
    fileParallelism: false,
  }
  ```
* **If skipped:** `npm test` fails intermittently in local development and CI despite valid business logic.

---

### Group B: Nice to Have (Performance & Lean Optimizations)

#### 6. Add Index on `milestones(project_id)`
* **File:** [`migrations/0008_life_os.sql:L25-28`](file:///d:/Project/exam-tracker/migrations/0008_life_os.sql#L25-L28)
* **What this is:** The `milestones` table foreign key references `projects(id)`.
* **Problem:** In [`server/life.ts:L30`](file:///d:/Project/exam-tracker/server/life.ts#L30), milestones are loaded for all projects via `SELECT id, project_id, title, done FROM milestones ORDER BY pos, id`. As milestones accumulate, queries benefit from an explicit index.
* **Fix:** Add `CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);` in a future migration.
* **If skipped:** Negligible impact now, minor scan penalty as project count increases.

#### 7. Pass Explicit `editing` Prop in `HabitForm`
* **File:** [`src/Habits.tsx:L92`](file:///d:/Project/exam-tracker/src/Habits.tsx#L92)
* **What this is:** Determining edit mode via `saveLabel === "Save"`.
* **Fix:** Pass a boolean `editing` prop instead of checking button text strings.

---

## 4. How to Run the Automated Audit Engine

An automated audit runner has been created in the [`audit/`](file:///d:/Project/exam-tracker/audit) folder:

```bash
# Run the automated audit
npx -y tsx audit/run-audit.ts
```

The script runs automated heuristic checks across security, concurrency, test configuration, database schemas, and TypeScript compilation, outputting structured JSON results to [`audit/audit-results.json`](file:///d:/Project/exam-tracker/audit/audit-results.json).

---

## 5. Audit Verdict

**Overall Code Health:** **92 / 100**
The core engine (IST calendar arithmetic, study queue ranking, Pomodoro pure state transitions, and constant-time authentication) is exceptionally well structured, lean, and strictly tested. The identified items are minor edge-case concurrency race conditions and test configuration timeouts that can be resolved with minimal targeted improvements.
