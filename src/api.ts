import type { Scope, Status } from "../server/logic.ts";
import type { Energy } from "../server/planner.ts";
import type { TimerMode } from "../server/timer.ts";

export type Chapter = {
  id: string; subjectId: string; name: string; scope: Scope;
  confirmed: boolean; source: string | null; status: Status; confidence: number;
  lastRevised: string | null; practiceDone: number;
  /** Date each revision pass was finished, or null: [Concept, PYQs and Exemplar, Sample papers]. */
  passes: (string | null)[];
};
export type Subject = {
  id: string; name: string; grp: string; priority: number;
  /** Exam date per phase id. */
  examDates: Record<string, string>;
  chapters: Chapter[]; progressPct: number;
};
export type Task = { id: number; title: string; subjectId: string | null; kind: string; due: string | null; done: boolean };
export type Phase = {
  id: string; name: string; scope: Scope; startsOn: string; endsOn: string;
  confirmed: boolean; daysLeft: number; studyDaysLeft: number;
};
export type Target = { id: number; title: string; chapterId: string | null; subjectId: string | null; done: boolean };
export type TimerView = {
  mode: TimerMode; subjectId: string | null; startedAt: number | null; durationS: number; round: number; cycleDay: string | null;
  /** When the current mode ends (epoch ms), and the server clock when this was sent, to cancel out clock drift. */
  endsAt: number | null; serverNow: number;
};
export type State = {
  today: string; phases: Phase[]; activePhaseId: string | null; autoPhase: boolean;
  subjects: Subject[]; tasks: Task[];
  sessions: { day: string; subjectId: string; minutes: number }[];
  targets: Target[]; checkin: Energy | null; checkins: { day: string; energy: Energy }[]; timer: TimerView;
};

export class AuthError extends Error {}
export async function call<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw new Error("Can't reach the server, so that change wasn't saved.");
  });
  if (res.status === 401) throw new AuthError();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong.");
  return data as T;
}
