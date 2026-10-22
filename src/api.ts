import type { Status } from "../server/logic.ts";

export type Chapter = {
  id: string; subjectId: string; name: string; introducedIn: "earlier" | "pb1" | "pb2";
  confirmed: boolean; source: string | null; status: Status; confidence: number;
  lastRevised: string | null; practiceDone: number;
};
export type Subject = {
  id: string; name: string; grp: string; priority: number; examDate: string | null;
  chapters: Chapter[]; progressPct: number;
};
export type Task = { id: number; title: string; subjectId: string | null; kind: string; due: string | null; done: boolean };
export type Exam = { id: string; name: string; start: string; end: string; daysLeft: number; studyDaysLeft: number };
export type State = {
  today: string; exams: Exam[]; subjects: Subject[]; tasks: Task[];
  sessions: { day: string; subjectId: string; minutes: number }[];
};

export class AuthError extends Error {}
const KEY = "tracker-token";
export const getToken = () => { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } };
export const setToken = (t: string) => { try { localStorage.setItem(KEY, t); } catch { /* private mode: token lasts until reload */ } };

export async function call<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw new Error("Can't reach the server, so that change wasn't saved.");
  });
  if (res.status === 401) throw new AuthError();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong.");
  return data as T;
}
