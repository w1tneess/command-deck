/**
 * Google Calendar & iCal URL utilities for Command Deck.
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
  conflictFixes,
  findAvailableStudySlot,
  minsToTimeStr,
  timeStrToMins,
  type TimeInterval,
} from "../server/calendar.ts";

export { conflictFixes, findAvailableStudySlot, minsToTimeStr, timeStrToMins, type TimeInterval };

export interface TargetGCalOptions {
  externalEvents?: { startsAt?: string; starts_at?: string; endsAt?: string; ends_at?: string; summary?: string }[];
  otherTargets?: Target[];
  preferredSlot?: "afternoon" | "evening" | "morning";
}

/** Quick export URL for a School Deliverable (08:00 AM IST morning handover before school at 08:45) */
export function getDeliverableGCalUrl(deliverable: Deliverable, todayIST: string): string {
  const dueDate = deliverable.due || todayIST;
  const start = formatIstEventTime(dueDate, "08:00");
  const end = formatIstEventTime(dueDate, "08:30");

  return buildGoogleCalendarUrl({
    title: `Due: ${deliverable.name} (${deliverable.subject})${deliverable.vivaPrep ? " [VIVA PREP]" : ""}`,
    dates: `${start}/${end}`,
    details: `School Deliverable & Internal Assessment\nSubject: ${deliverable.subject}\nStatus: ${deliverable.status}\nDetails: ${deliverable.detail || "CBSE submission deadline"}\nMorning Handover: 08:00 AM - 08:30 AM IST (Before school)\nhttps://deck.advaitachandra.in`,
    location: "School Submission Desk",
  });
}

/** Quick export URL for a Daily Schedule Block */
export function getScheduleBlockGCalUrl(block: ScheduleBlock, todayIST: string): string {
  const start = formatIstEventTime(todayIST, block.startTime);
  const end = formatIstEventTime(todayIST, block.endTime);

  return buildGoogleCalendarUrl({
    title: `Focus Block: ${block.title}`,
    dates: `${start}/${end}`,
    details: `Command Deck Time-Block\nTrack: ${block.title}\nCategory: ${block.category.toUpperCase()}\nTime: ${block.startTime} - ${block.endTime} (IST)\nhttps://deck.advaitachandra.in`,
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
    details: `CBSE Class 10 Practical Viva Revision\nTopic: ${title}\nLab Manual: ${lab}\nDuration: 45m\nhttps://deck.advaitachandra.in`,
    location: "Science Study Corner",
  });
}

/** Returns the feed subscription URLs for Google Calendar and iCal clients */
export function getCalendarFeedUrls(token: string) {
  const origin = typeof window !== "undefined" && window.location.origin
    ? window.location.origin
    : "https://deck.advaitachandra.in";

  const cleanHost = origin.replace(/^https?:\/\//, "");
  const httpFeedUrl = `${origin}/api/calendar/feed.ics?token=${token}`;
  const webcalUrl = `webcal://${cleanHost}/api/calendar/feed.ics?token=${token}`;
  const gcalSubscribeUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;

  return { httpFeedUrl, webcalUrl, gcalSubscribeUrl };
}
