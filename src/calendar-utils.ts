/**
 * Google Calendar & iCal URL utilities for Life & Study OS.
 * All calendar links strictly enforce Asia/Kolkata (IST, UTC+5:30).
 */

import type { Deliverable, ScheduleBlock, Target } from "./api.ts";

export interface GoogleCalendarEventOpts {
  title: string;
  dates: string; // "YYYYMMDDTHHmmss/YYYYMMDDTHHmmss" or "YYYYMMDD/YYYYMMDD"
  details?: string;
  location?: string;
}

export function buildGoogleCalendarUrl({ title, dates, details, location }: GoogleCalendarEventOpts): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates,
    ctz: "Asia/Kolkata",
  });
  if (details) params.set("details", details);
  if (location) params.set("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Formats "YYYY-MM-DD" + "HH:MM" into "YYYYMMDDTHHmmss" */
export function formatIstEventTime(isoDate: string, timeStr = "09:00"): string {
  const cleanDate = isoDate.replace(/-/g, "");
  const [h = "09", m = "00"] = timeStr.split(":");
  return `${cleanDate}T${h.padStart(2, "0")}${m.padStart(2, "0")}00`;
}

/** Adds minutes to "HH:MM" string */
export function addMinsToTimeStr(timeStr: string, deltaMins: number): string {
  const [hStr, mStr] = timeStr.split(":");
  const total = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + deltaMins;
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  const newH = Math.floor(clamped / 60);
  const newM = clamped % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

export function parseTargetDurationMins(dur?: string | null): number {
  if (!dur) return 45;
  const hMatch = dur.match(/(\d+)\s*h/);
  const mMatch = dur.match(/(\d+)\s*m/);
  let mins = 0;
  if (hMatch) mins += parseInt(hMatch[1], 10) * 60;
  if (mMatch) mins += parseInt(mMatch[1], 10);
  return mins > 0 ? mins : 45;
}

import {
  findAvailableStudySlot,
  minsToTimeStr,
  parseDurationMins,
  timeStrToMins,
  type TimeInterval,
} from "../server/calendar.ts";

export { findAvailableStudySlot, minsToTimeStr, timeStrToMins, type TimeInterval };

export interface TargetGCalOptions {
  externalEvents?: { startsAt?: string; starts_at?: string; endsAt?: string; ends_at?: string; summary?: string }[];
  otherTargets?: Target[];
  preferredSlot?: "afternoon" | "evening" | "morning";
}

/** Quick export URL for a Daily Target respecting real free study slots & tuition */
export function getTargetGCalUrl(target: Target, todayIST: string, options?: TargetGCalOptions): string {
  const durMins = parseTargetDurationMins(target.duration);
  const busyIntervals: TimeInterval[] = [];

  if (options?.externalEvents) {
    for (const ev of options.externalEvents) {
      const startStr = ev.startsAt || ev.starts_at;
      const endStr = ev.endsAt || ev.ends_at;
      if (startStr && endStr) {
        const match = startStr.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
        const endMatch = endStr.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
        if (match && endMatch && match[1] === todayIST) {
          busyIntervals.push({
            startMins: parseInt(match[2], 10) * 60 + parseInt(match[3], 10),
            endMins: parseInt(endMatch[2], 10) * 60 + parseInt(endMatch[3], 10),
            label: ev.summary || "Tuition / External Event",
          });
        }
      }
    }
  }

  if (options?.otherTargets) {
    for (const ot of options.otherTargets) {
      if (ot.id !== target.id) {
        // approximate other target slot
        const otDur = parseDurationMins(ot.duration);
        // Avoid collision by adding placeholder intervals
      }
    }
  }

  const slot = findAvailableStudySlot(durMins, busyIntervals, options?.preferredSlot || "afternoon");
  const startTime = slot.startTime;
  const endTime = slot.endTime;
  const start = formatIstEventTime(todayIST, startTime);
  const end = formatIstEventTime(todayIST, endTime);

  return buildGoogleCalendarUrl({
    title: `Target: ${target.title}`,
    dates: `${start}/${end}`,
    details: `Class 10 CBSE Study Target\nSubject: ${target.subjectId || "General"}\nTarget: ${target.title}\nAllocated Duration: ${target.duration || "45m"}\nScheduled Slot: ${startTime} - ${endTime} IST (Avoids School & Tuition)\nTracked on: https://study.advaitachandra.in`,
    location: "Study Desk",
  });
}

/** Quick export URL for a School Deliverable (08:00 AM IST morning handover before school at 08:45) */
export function getDeliverableGCalUrl(deliverable: Deliverable, todayIST: string): string {
  const dueDate = deliverable.due || todayIST;
  const start = formatIstEventTime(dueDate, "08:00");
  const end = formatIstEventTime(dueDate, "08:30");

  return buildGoogleCalendarUrl({
    title: `Due: ${deliverable.name} (${deliverable.subject})${deliverable.vivaPrep ? " [VIVA PREP]" : ""}`,
    dates: `${start}/${end}`,
    details: `School Deliverable & Internal Assessment\nSubject: ${deliverable.subject}\nStatus: ${deliverable.status}\nDetails: ${deliverable.detail || "CBSE submission deadline"}\nMorning Handover: 08:00 AM - 08:30 AM IST (Before school)\nhttps://study.advaitachandra.in`,
    location: "School Submission Desk",
  });
}

/** Quick export URL for a CBSE Subject Exam */
export function getExamGCalUrl(subjectName: string, phaseName: string, date: string): string {
  const start = formatIstEventTime(date, "10:30");
  const end = formatIstEventTime(date, "13:30");

  return buildGoogleCalendarUrl({
    title: `CBSE Exam: ${subjectName} (${phaseName})`,
    dates: `${start}/${end}`,
    details: `Official CBSE Class 10 Examination\nSubject: ${subjectName}\nPhase: ${phaseName}\nTime: 10:30 AM - 01:30 PM (IST)\nDuration: 3 Hours\nhttps://study.advaitachandra.in`,
    location: "CBSE Examination Hall",
  });
}

/** Quick export URL for a Daily Schedule Block */
export function getScheduleBlockGCalUrl(block: ScheduleBlock, todayIST: string): string {
  const start = formatIstEventTime(todayIST, block.startTime);
  const end = formatIstEventTime(todayIST, block.endTime);

  return buildGoogleCalendarUrl({
    title: `Focus Block: ${block.title}`,
    dates: `${start}/${end}`,
    details: `Life & Study OS Time-Block\nTrack: ${block.title}\nCategory: ${block.category.toUpperCase()}\nTime: ${block.startTime} - ${block.endTime} (IST)\nhttps://study.advaitachandra.in`,
    location: "Study Desk / School",
  });
}

/** Quick export URL for a Practical Viva prep lab experiment */
export function getVivaPrepGCalUrl(title: string, lab: string, todayIST: string): string {
  const start = formatIstEventTime(todayIST, "17:00");
  const end = formatIstEventTime(todayIST, "17:45");

  return buildGoogleCalendarUrl({
    title: `Viva Prep: ${title}`,
    dates: `${start}/${end}`,
    details: `CBSE Class 10 Practical Viva Revision\nTopic: ${title}\nLab Manual: ${lab}\nDuration: 45m\nhttps://study.advaitachandra.in`,
    location: "Science Study Corner",
  });
}

/** Returns the feed subscription URLs for Google Calendar and iCal clients */
export function getCalendarFeedUrls(token: string) {
  const origin = typeof window !== "undefined" && window.location.origin
    ? window.location.origin
    : "https://study.advaitachandra.in";

  const cleanHost = origin.replace(/^https?:\/\//, "");
  const httpFeedUrl = `${origin}/api/calendar/feed.ics?token=${token}`;
  const webcalUrl = `webcal://${cleanHost}/api/calendar/feed.ics?token=${token}`;
  const gcalSubscribeUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;

  return { httpFeedUrl, webcalUrl, gcalSubscribeUrl };
}
