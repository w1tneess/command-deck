/**
 * Pure Calendar & iCal (RFC 5545) Engine for Command Deck.
 * Strictly adheres to Indian Standard Time (IST, UTC+5:30) via Asia/Kolkata.
 */

export type ScheduleBlock = {
  id: number;
  title: string;
  category: "morning" | "school" | "revision" | "practice" | "winddown" | "custom";
  startTime: string; // "HH:MM" e.g. "07:00"
  endTime: string;   // "HH:MM" e.g. "08:30"
  color: string;
  pos: number;
};

export interface CalendarFeedData {
  phases: { id: string; name: string; scope: string; startsOn: string; endsOn: string; confirmed: boolean }[];
  subjectExams: { subjectId: string; phaseId: string; date: string; subjectName: string; phaseName: string }[];
  scheduleBlocks: ScheduleBlock[];
  deliverables: { id: number; name: string; subject: string; detail: string; due: string | null; status: string; vivaPrep: boolean }[];
  dailyTargets: { id: number; day: string; title: string; done: boolean; duration?: string | null }[];
  externalEvents?: { startsAt?: string; starts_at?: string; endsAt?: string; ends_at?: string; summary?: string }[];
  today: string;
  nowMs: number;
}

const CRLF = "\r\n";

export function escapeIcsText(str: string): string {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Formats "YYYY-MM-DD" + "HH:MM" into "YYYYMMDDTHHMMSS" */
export function formatIcsTime(isoDate: string, timeStr = "09:00"): string {
  const cleanDate = isoDate.replace(/-/g, "");
  const [h = "00", m = "00"] = timeStr.split(":");
  return `${cleanDate}T${h.padStart(2, "0")}${m.padStart(2, "0")}00`;
}

/** Formats UTC epoch ms into "YYYYMMDDTHHMMSSZ" for DTSTAMP */
export function formatIcsUtc(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Adds minutes to "HH:MM" format, clamping within a single day */
export function shiftTimeStr(timeStr: string, deltaMins: number): string {
  const [hStr, mStr] = timeStr.split(":");
  const total = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + deltaMins;
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  const newH = Math.floor(clamped / 60);
  const newM = clamped % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

export function parseDurationMins(duration?: string | null): number {
  if (!duration) return 45;
  const hMatch = duration.match(/(\d+)\s*h/);
  const mMatch = duration.match(/(\d+)\s*m/);
  let mins = 0;
  if (hMatch) mins += parseInt(hMatch[1], 10) * 60;
  if (mMatch) mins += parseInt(mMatch[1], 10);
  return mins > 0 ? mins : 45;
}

export type TimeInterval = { startMins: number; endMins: number; label?: string };

export function timeStrToMins(timeStr: string): number {
  const [hStr = "0", mStr = "0"] = timeStr.split(":");
  return parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
}

export function minsToTimeStr(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, mins));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Calculates a real non-overlapping study slot respecting:
 * - School hours (08:45 - 14:30)
 * - Sleep hours (22:00 - 06:30)
 * - Existing tuition or coaching classes (from externalEvents or schedule tracks)
 * - Other daily targets already booked
 */
export function findAvailableStudySlot(
  durationMins: number,
  busyIntervals: TimeInterval[] = [],
  preferredSlot: "afternoon" | "evening" | "morning" = "afternoon"
): { startTime: string; endTime: string } {
  const candidateStarts: number[] = [];

  const addWindows = (startMins: number, endMins: number, step = 15) => {
    for (let m = startMins; m + durationMins <= endMins; m += step) {
      if (!candidateStarts.includes(m)) candidateStarts.push(m);
    }
  };

  if (preferredSlot === "morning") {
    addWindows(timeStrToMins("07:00"), timeStrToMins("08:30"));
    addWindows(timeStrToMins("15:30"), timeStrToMins("17:00"));
    addWindows(timeStrToMins("17:30"), timeStrToMins("21:30"));
  } else if (preferredSlot === "evening") {
    addWindows(timeStrToMins("17:30"), timeStrToMins("21:30"));
    addWindows(timeStrToMins("15:30"), timeStrToMins("17:00"));
    addWindows(timeStrToMins("07:00"), timeStrToMins("08:30"));
  } else {
    // Afternoon first (default for post-school study session)
    addWindows(timeStrToMins("15:30"), timeStrToMins("17:00"));
    addWindows(timeStrToMins("17:30"), timeStrToMins("21:30"));
    addWindows(timeStrToMins("07:00"), timeStrToMins("08:30"));
  }

  // School is always busy
  const allBusy: TimeInterval[] = [
    { startMins: timeStrToMins("08:45"), endMins: timeStrToMins("14:30"), label: "School" },
    ...busyIntervals,
  ];

  for (const start of candidateStarts) {
    const end = start + durationMins;
    const hasOverlap = allBusy.some((b) => Math.max(start, b.startMins) < Math.min(end, b.endMins));
    if (!hasOverlap) {
      return { startTime: minsToTimeStr(start), endTime: minsToTimeStr(end) };
    }
  }

  const fallbackStart = timeStrToMins("19:30");
  return { startTime: minsToTimeStr(fallbackStart), endTime: minsToTimeStr(fallbackStart + durationMins) };
}

const CATEGORY_EMOJI: Record<string, string> = {
  morning: "🌅",
  school: "🏫",
  revision: "⚡",
  practice: "🧠",
  winddown: "🌙",
  custom: "🎯",
};

/** Generates a complete RFC 5545 iCalendar stream */
export function generateIcsFeed(data: CalendarFeedData): string {
  const dtstamp = formatIcsUtc(data.nowMs);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Advaita Chandra//Command Deck//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Command Deck (CBSE Class 10)",
    "X-WR-CALDESC:Real-time CBSE Class 10 preparation timetable, daily routine time-blocking, and school deliverables.",
    "X-WR-TIMEZONE:Asia/Kolkata",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Kolkata",
    "X-LIC-LOCATION:Asia/Kolkata",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0530",
    "TZOFFSETTO:+0530",
    "TZNAME:IST",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  // 1. CBSE Examination Timetable Slots (10:30 AM - 01:30 PM IST)
  for (const exam of data.subjectExams) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:exam-${exam.subjectId}-${exam.phaseId}-${exam.date}@study.advaitachandra.in`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Asia/Kolkata:${formatIcsTime(exam.date, "10:30")}`,
      `DTEND;TZID=Asia/Kolkata:${formatIcsTime(exam.date, "13:30")}`,
      `SUMMARY:📝 CBSE Exam: ${escapeIcsText(exam.subjectName)} (${escapeIcsText(exam.phaseName)})`,
      `DESCRIPTION:Official CBSE Class 10 ${escapeIcsText(exam.subjectName)} Examination.\\nPhase: ${escapeIcsText(exam.phaseName)}.\\nTime: 10:30 AM - 01:30 PM (IST). Duration: 3 Hours.`,
      "LOCATION:CBSE Examination Centre",
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }

  // 2. CBSE Exam Phase Milestones
  for (const phase of data.phases) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:phase-${phase.id}-start@study.advaitachandra.in`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Asia/Kolkata:${formatIcsTime(phase.startsOn, "09:00")}`,
      `DTEND;TZID=Asia/Kolkata:${formatIcsTime(phase.startsOn, "12:00")}`,
      `SUMMARY:📌 CBSE Phase Milestone: ${escapeIcsText(phase.name)} Begins`,
      `DESCRIPTION:${escapeIcsText(phase.name)} examination phase commences.\\nScope: ${phase.scope.toUpperCase()}. Status: ${phase.confirmed ? "Official Datesheet Confirmed" : "Tentative Academic Calendar"}.`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );

    if (phase.endsOn !== phase.startsOn) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:phase-${phase.id}-end@study.advaitachandra.in`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;TZID=Asia/Kolkata:${formatIcsTime(phase.endsOn, "14:00")}`,
        `DTEND;TZID=Asia/Kolkata:${formatIcsTime(phase.endsOn, "17:00")}`,
        `SUMMARY:🏁 CBSE Phase Milestone: ${escapeIcsText(phase.name)} Concludes`,
        `DESCRIPTION:${escapeIcsText(phase.name)} examination phase finishes today.`,
        "STATUS:CONFIRMED",
        "END:VEVENT",
      );
    }
  }

  // 3. Daily Routine Blocks (Recurring Daily / Weekly Tracks)
  for (const block of data.scheduleBlocks) {
    const emoji = CATEGORY_EMOJI[block.category] || "🎯";
    const isSchool = block.category === "school";
    const rrule = isSchool
      ? "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA;UNTIL=20270401T000000Z"
      : "RRULE:FREQ=DAILY;UNTIL=20270401T000000Z";

    lines.push(
      "BEGIN:VEVENT",
      `UID:routine-block-${block.id}@study.advaitachandra.in`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Asia/Kolkata:${formatIcsTime(data.today, block.startTime)}`,
      `DTEND;TZID=Asia/Kolkata:${formatIcsTime(data.today, block.endTime)}`,
      rrule,
      `SUMMARY:${emoji} ${escapeIcsText(block.title)}`,
      `DESCRIPTION:Class 10 CBSE Routine & Time-Blocking Track.\\nBlock: ${escapeIcsText(block.title)}.\\nTime: ${block.startTime} - ${block.endTime} (IST).`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }

  // 4. School Deliverables & Lab Manual Deadlines (Morning handover before school)
  for (const d of data.deliverables) {
    if (!d.due) continue;
    const isViva = d.vivaPrep;
    const startStr = "08:00";
    const endStr = "08:30";
    lines.push(
      "BEGIN:VEVENT",
      `UID:deliverable-${d.id}-${d.due}@study.advaitachandra.in`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Asia/Kolkata:${formatIcsTime(d.due, startStr)}`,
      `DTEND;TZID=Asia/Kolkata:${formatIcsTime(d.due, endStr)}`,
      `SUMMARY:${isViva ? "⚡ [VIVA PREP] " : "📋 "}Due: ${escapeIcsText(d.name)} (${escapeIcsText(d.subject)})`,
      `DESCRIPTION:School Deliverable & Internal Assessment Submission.\\nSubject: ${escapeIcsText(d.subject)}.\\nStatus: ${escapeIcsText(d.status)}.\\n${escapeIcsText(d.detail || "")}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }

  // 5. Daily Targets (Today and Upcoming)
  // Track booked intervals per day to prevent targets from overlapping each other,
  // and respect real free slots, school hours, and existing tuition.
  const bookedPerDay: Record<string, TimeInterval[]> = {};

  // Seed external events (e.g. tuition, appointments) into booked intervals
  if (data.externalEvents) {
    for (const ev of data.externalEvents) {
      const startStr = ev.startsAt || ev.starts_at || "";
      const endStr = ev.endsAt || ev.ends_at || "";
      const match = startStr.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
      const endMatch = endStr.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
      if (match && endMatch) {
        const evDay = match[1];
        const startMins = parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
        const endMins = parseInt(endMatch[2], 10) * 60 + parseInt(endMatch[3], 10);
        bookedPerDay[evDay] = bookedPerDay[evDay] || [];
        bookedPerDay[evDay].push({ startMins, endMins, label: ev.summary || "Tuition / External Event" });
      }
    }
  }

  for (const target of data.dailyTargets) {
    const durMins = parseDurationMins(target.duration);
    const day = target.day;
    bookedPerDay[day] = bookedPerDay[day] || [];

    const slot = findAvailableStudySlot(durMins, bookedPerDay[day]);
    const startStr = slot.startTime;
    const endStr = slot.endTime;
    // Mark this slot as booked for subsequent targets on the same day
    bookedPerDay[day].push({ startMins: timeStrToMins(startStr), endMins: timeStrToMins(endStr), label: target.title });

    lines.push(
      "BEGIN:VEVENT",
      `UID:target-${target.id}-${target.day}@study.advaitachandra.in`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Asia/Kolkata:${formatIcsTime(target.day, startStr)}`,
      `DTEND;TZID=Asia/Kolkata:${formatIcsTime(target.day, endStr)}`,
      `SUMMARY:${target.done ? "✅ " : "🎯 "}Target: ${escapeIcsText(target.title)}`,
      `DESCRIPTION:Daily Study Target.\\nTarget: ${escapeIcsText(target.title)}.\\nDuration: ${target.duration || "45m"}.\\nScheduled Time: ${startStr} - ${endStr} (IST).\\nStatus: ${target.done ? "Completed" : "In Progress"}.`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join(CRLF) + CRLF;
}
