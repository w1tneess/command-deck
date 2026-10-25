import { todayIST } from "./logic.ts";

// Pomodoro 25/5 with a longer break after every 4th focus round.
export const FOCUS_S = 25 * 60;
export const BREAK_S = 5 * 60;
export const LONG_BREAK_S = 15 * 60;
export const ROUNDS = 4;

export type TimerMode = "idle" | "focus" | "break" | "long_break";
export type Timer = {
  mode: TimerMode;
  subjectId: string | null;
  /** Epoch ms when the current mode began; null while idle. */
  startedAt: number | null;
  durationS: number;
  /** Focus rounds finished in the current cycle (0 to 3). An early stop does not count as a round. */
  round: number;
  /** IST day the round count belongs to; a new day starts again from round 0. */
  cycleDay: string | null;
};
export type SessionLog = { subjectId: string; day: string; minutes: number };

export const IDLE: Timer = { mode: "idle", subjectId: null, startedAt: null, durationS: 0, round: 0, cycleDay: null };

const endOf = (t: Timer) => (t.startedAt ?? 0) + t.durationS * 1000;

/**
 * Applies everything that should have happened by `nowMs`: a finished focus is logged in full (against
 * the day it ended) and rolls into a break that counts from that moment; a finished break goes idle.
 * Pure, so the server can run it on any request and a closed tab never loses a session.
 */
export function settleTimer(t: Timer, nowMs: number): { timer: Timer; logs: SessionLog[] } {
  const logs: SessionLog[] = [];
  let cur = t;
  while (cur.mode !== "idle" && cur.startedAt !== null && endOf(cur) <= nowMs) {
    const end = endOf(cur);
    if (cur.mode === "focus") {
      logs.push({ subjectId: cur.subjectId!, day: todayIST(end), minutes: cur.durationS / 60 });
      const done = cur.round + 1;
      const long = done >= ROUNDS;
      cur = { ...cur, mode: long ? "long_break" : "break", startedAt: end, durationS: long ? LONG_BREAK_S : BREAK_S, round: long ? 0 : done };
    } else {
      cur = { ...cur, mode: "idle", startedAt: null, durationS: 0 };
    }
  }
  return { timer: cur, logs };
}

/** Stops a settled timer. A focus stopped early logs whole minutes so far (under a minute logs nothing). */
export function stopTimer(t: Timer, nowMs: number): { timer: Timer; logs: SessionLog[] } {
  const logs: SessionLog[] = [];
  if (t.mode === "focus" && t.startedAt !== null) {
    const minutes = Math.floor(Math.min(nowMs - t.startedAt, t.durationS * 1000) / 60_000);
    if (minutes >= 1) logs.push({ subjectId: t.subjectId!, day: todayIST(nowMs), minutes });
  }
  return { timer: { ...t, mode: "idle", startedAt: null, durationS: 0 }, logs };
}

/** Starts a focus round on a settled timer, or returns null if one is already running. A break is replaced. */
export function startFocus(t: Timer, subjectId: string, nowMs: number, customFocusS = FOCUS_S): Timer | null {
  if (t.mode === "focus") return null;
  const day = todayIST(nowMs);
  return { mode: "focus", subjectId, startedAt: nowMs, durationS: customFocusS, round: t.cycleDay === day ? t.round : 0, cycleDay: day };
}
