import { useState } from "react";
import type { Act, State } from "./api.ts";
import { Deliverables } from "./Deliverables.tsx";
import { Card, H2, fmtShort } from "./ui.tsx";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const at = (day: string) => Date.parse(day + "T00:00:00Z");
const hm = (m: number) => (m === 0 ? "0" : `${m >= 60 ? `${Math.floor(m / 60)}h ` : ""}${m % 60 ? `${m % 60}m` : ""}`.trim());
const weekday = (d: string) => new Date(at(d)).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
const ENERGY = { low: "Low", ok: "OK", high: "High" } as const;
const WEEKS = 12;
/** Study heatmap level 0 to 4, using the design's thresholds. */
const studyLevel = (m: number) => (m === 0 ? 0 : m < 60 ? 1 : m < 120 ? 2 : m < 180 ? 3 : 4);

export function Week({ state, act }: { state: State; act: Act }) {
  const minutes = new Map(state.heat.map((h) => [h.day, h.minutes]));
  const habitsDone = new Map(state.habitDays.map((h) => [h.day, h.done]));
  const habitCount = state.habits.length;
  const sleep = new Map(state.routines.map((r) => [r.day, r.sleep]));
  const days = Array.from({ length: 7 }, (_, i) => iso(at(state.today) - (6 - i) * DAY));
  const week = days.map((d) => ({ day: d, min: minutes.get(d) ?? 0, habits: habitsDone.get(d) ?? 0, sleep: sleep.get(d) ?? null, energy: state.checkins.find((c) => c.day === d)?.energy }));
  const total = week.reduce((a, w) => a + w.min, 0);
  const habitPct = habitCount ? Math.round((week.reduce((a, w) => a + w.habits, 0) / (habitCount * 7)) * 100) : 0;
  // Habit heatmap: share of today's habits done, in quarters.
  const habitLevel = (done: number) => (done === 0 || !habitCount ? 0 : Math.min(4, Math.ceil((done / habitCount) * 4)));

  return (
    <>
      <header>
        <div className="text-xs uppercase tracking-[0.06em] text-muted lg:text-[13px]">Last 7 days</div>
        <h1 className="m-0 mt-0.5 text-[28px] font-semibold tracking-[-0.02em] lg:mt-1 lg:text-[30px]">Week</h1>
      </header>
      <div className="flex flex-wrap items-start gap-4 lg:gap-6">
        <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4 lg:gap-6">
          <Card labelledBy="bars-h">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <H2 id="bars-h">Study time and energy</H2>
              <span className="text-[14px] text-muted">{Math.floor(total / 60)} h {total % 60} m this week</span>
            </div>
            <div role="img" aria-label={`Study time per day: ${week.map((w) => `${weekday(w.day)} ${hm(w.min)}`).join(", ")}`} className="mt-5 flex h-[232px] items-end justify-between gap-2">
              {week.map((w) => (
                <div key={w.day} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="font-mono text-xs text-muted">{hm(w.min)}</span>
                  <div className={`w-full max-w-11 rounded-t-lg rounded-b ${w.min === 0 ? "bg-line" : "bg-accent"}`} style={{ height: Math.max(4, Math.round((w.min / 180) * 150)) }} />
                  <span className="text-[13px] font-medium">{weekday(w.day)}</span>
                  <span className="rounded-full border border-line bg-surface2 px-2 py-0.5 text-xs text-muted">{w.energy ? ENERGY[w.energy] : "–"}</span>
                </div>
              ))}
            </div>
            <div className="mt-3.5 text-[13px] text-muted">Energy is the check-in you logged that day: Low, OK or High.</div>
          </Card>

          <Card labelledBy="review-h">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <H2 id="review-h">Study hours vs habits</H2>
              <span className="text-[14px] text-muted"><span className="font-mono">{habitPct}%</span> of habits done this week</span>
            </div>
            <table className="mt-3 w-full border-collapse text-left text-[14px]">
              <caption className="sr-only">Study time, habits done and sleep rating for each of the last 7 days</caption>
              <thead>
                <tr className="text-[12px] text-muted"><th scope="col" className="pb-1.5 font-medium">Day</th><th scope="col" className="pb-1.5 font-medium">Study</th><th scope="col" className="pb-1.5 font-medium">Habits</th><th scope="col" className="pb-1.5 text-right font-medium">Sleep</th></tr>
              </thead>
              <tbody>
                {week.map((w) => (
                  <tr key={w.day} className="border-t border-line">
                    <th scope="row" className="py-2.5 pr-3 text-[13px] font-medium">{weekday(w.day)}</th>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <span className="h-1.5 w-full max-w-[160px] min-w-12 overflow-hidden rounded-[3px] bg-line"><span className="block h-full bg-accent" style={{ width: `${Math.min(100, (w.min / 180) * 100)}%` }} /></span>
                        <span className="font-mono text-xs text-muted">{hm(w.min)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[13px]"><span className={habitCount && w.habits === habitCount ? "text-good" : ""}>{w.habits}/{habitCount}</span></td>
                    <td className="py-2.5 text-right font-mono text-[13px] text-muted">{w.sleep ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Reflection key={state.review.weekStart} state={state} act={act} />
          <Heatmap id="heat-study" title="Study, last 12 weeks" today={state.today} values={minutes} levelOf={studyLevel} text={(m) => (m ? hm(m) : "no study")} />
          <Heatmap id="heat-habits" title="Habits, last 12 weeks" today={state.today} values={habitsDone} levelOf={habitLevel} text={(n) => (n ? `${n} of ${habitCount} habits` : "no habits")} />
        </div>
        <div className="min-w-0 flex-[2_1_380px]"><Deliverables state={state} act={act} embedded /></div>
      </div>
    </>
  );
}

/** One note per week, saved when you click away. */
function Reflection({ state, act }: { state: State; act: Act }) {
  const [note, setNote] = useState(state.review.note);
  return (
    <Card labelledBy="reflect-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2 id="reflect-h">Reflection</H2>
        <span className="text-[13px] text-muted">Week of {fmtShort(state.review.weekStart)}</span>
      </div>
      <label htmlFor="reflection" className="mt-3 mb-1.5 block text-[13px] text-muted">What went well, what to change next week?</label>
      <textarea id="reflection" rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => { if (note.trim() !== state.review.note) void act("PUT", "/api/review", { note }); }} className="w-full resize-y rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[15px] text-fg" />
    </Card>
  );
}

type HeatProps = { id: string; title: string; today: string; values: Map<string, number>; levelOf: (v: number) => number; text: (v: number) => string };

function Heatmap({ id, title, today, values, levelOf, text }: HeatProps) {
  // Columns are weeks starting Monday, the last one being this week; days still to come are dashed.
  const dow = (new Date(at(today)).getUTCDay() + 6) % 7;
  const firstDay = at(today) - dow * DAY - (WEEKS - 1) * 7 * DAY;
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const day = iso(firstDay + Math.floor(i / 7) * 7 * DAY + (i % 7) * DAY);
    return { day, v: values.get(day) ?? 0, future: day > today, today: day === today };
  });
  return (
    <Card labelledBy={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2 id={id}>{title}</H2>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((l) => <span key={l} className="size-3.5 rounded" style={{ background: `var(--heat-${l})` }} />)}
          <span>More</span>
        </div>
      </div>
      <div className="mt-4 flex gap-2.5 overflow-x-auto pb-1">
        <div className="grid grid-rows-[repeat(7,28px)] items-center gap-1 text-xs text-muted" aria-hidden="true">
          <span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span>Sun</span>
        </div>
        <div role="img" aria-label={`${title}, darker is more`} className="grid grid-flow-col grid-rows-[repeat(7,28px)] auto-cols-[28px] gap-1">
          {cells.map((c) => (
            <span
              key={c.day}
              title={c.future ? undefined : `${c.day}: ${text(c.v)}`}
              className={`size-7 rounded-md ${c.future ? "box-border border border-dashed border-line" : ""} ${c.today ? "outline-2 outline-offset-1 outline-accent-text" : ""}`}
              style={c.future ? undefined : { background: `var(--heat-${levelOf(c.v)})` }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
