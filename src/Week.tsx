import { useId, useRef, useState } from "react";
import type { Act, State } from "./api.ts";
import { Deliverables } from "./Deliverables.tsx";
import { Card, H2, fmtShort, PageHeader } from "./ui.tsx";

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

  const energyStyle = (energy?: "low" | "ok" | "high") => {
    if (energy === "high") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    if (energy === "ok") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    if (energy === "low") return "border-rose-500/30 bg-rose-500/10 text-rose-300";
    return "border-white/10 bg-white/5 text-muted";
  };

  return (
    <>
      <PageHeader eyebrow="Weekly review" title="Performance" />

      <div className="flex flex-wrap items-start gap-4 lg:gap-6 mt-2">
        <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4 lg:gap-6">
          <Card labelledBy="bars-h">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <H2 id="bars-h">Study Time & Energy</H2>
              <span className="text-[13px] font-mono text-muted">{Math.floor(total / 60)}h {total % 60}m logged this week</span>
            </div>
            <div role="img" aria-label={`Study time per day: ${week.map((w) => `${weekday(w.day)} ${hm(w.min)}`).join(", ")}`} className="mt-6 flex h-[232px] items-end justify-between gap-3 border-b border-white/[0.06] pb-2">
              {week.map((w) => (
                <div key={w.day} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <span className="font-mono text-xs text-muted group-hover:text-white transition-colors">{hm(w.min)}</span>
                  <div
                    className={`w-full max-w-10 rounded-t-lg transition-all duration-300 ease-out ${
                      w.min === 0
                        ? "bg-white/[0.04]"
                        : "bg-gradient-to-t from-emerald-600 to-emerald-400 group-hover:shadow-[0_0_12px_rgba(52,211,153,0.3)]"
                    }`}
                    style={{ height: Math.max(6, Math.round((w.min / 180) * 150)) }}
                  />
                  <span className="font-mono text-xs uppercase tracking-wider text-zinc-300">{weekday(w.day)}</span>
                  <span className={`rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${energyStyle(w.energy)}`}>
                    {w.energy ? ENERGY[w.energy] : "–"}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3.5 font-mono text-xs text-muted">Checked-in subjective focus state (Low, OK, High) and daily pomodoro investment.</div>
          </Card>

          <Card labelledBy="review-h">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <H2 id="review-h">Study Hours vs Habits</H2>
              <span className="font-mono text-xs text-muted"><span className="text-white font-semibold">{habitPct}%</span> of habits done this week</span>
            </div>
            <table className="mt-3.5 w-full border-collapse text-left text-sm">
              <caption className="sr-only">Study time, habits done and sleep rating for each of the last 7 days</caption>
              <thead>
                <tr className="font-mono text-[11px] text-muted uppercase tracking-wider border-b border-white/[0.06]">
                  <th scope="col" className="pb-2.5 font-medium">Day</th>
                  <th scope="col" className="pb-2.5 font-medium">Study Hours</th>
                  <th scope="col" className="pb-2.5 font-medium">Habits</th>
                  <th scope="col" className="pb-2.5 text-right font-medium">Sleep</th>
                </tr>
              </thead>
              <tbody>
                {week.map((w) => (
                  <tr key={w.day} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <th scope="row" className="py-3 pr-3 font-mono text-xs font-semibold text-white uppercase">{weekday(w.day)}</th>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-3">
                        <span className="h-1.5 w-full max-w-[160px] min-w-12 overflow-hidden rounded-full bg-white/[0.08]">
                          <span className="block h-full rounded-full transition-all duration-300 ease-out bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${Math.min(100, (w.min / 180) * 100)}%` }} />
                        </span>
                        <span className="font-mono text-xs text-muted">{hm(w.min)}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-3 font-mono text-xs">
                      <span className={habitCount && w.habits === habitCount ? "text-emerald-400 font-semibold" : "text-zinc-300"}>
                        {w.habits}/{habitCount}
                      </span>
                    </td>
                    <td className="py-3 text-right font-mono text-xs text-muted">{w.sleep ?? "–"}</td>
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
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const uid = useId();
  const inputId = `${uid}-input`;
  const headId = `${uid}-h`;

  const save = async () => {
    if (note.trim() === state.review.note || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await act("PUT", "/api/review", { note });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <Card labelledBy={headId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2 id={headId}>Reflection</H2>
        <span className="font-mono text-xs text-muted">
          {saving ? "Saving…" : `Week of ${fmtShort(state.review.weekStart)}`}
        </span>
      </div>
      <label htmlFor={inputId} className="mt-3.5 mb-2 block font-mono text-xs uppercase tracking-wider text-muted">Weekly Qualitative Synthesis & Retrospective</label>
      <textarea
        id={inputId}
        rows={4}
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => void save()}
        placeholder="Document key insights, obstacles encountered, and strategic adjustments for next week..."
        className="w-full resize-y rounded-xl border border-white/10 bg-surface px-4 py-3 text-sm text-zinc-100 placeholder:text-muted/60 focus:border-emerald-500/50 focus:outline-none transition-colors"
      />
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
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted uppercase tracking-wider">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((l) => <span key={l} className="size-3.5 rounded-[3px] border border-white/5" style={{ background: `var(--heat-${l})` }} />)}
          <span>More</span>
        </div>
      </div>
      <div className="mt-4 flex gap-2.5 overflow-x-auto pb-1">
        <div className="grid grid-rows-[repeat(7,28px)] items-center gap-1 font-mono text-[11px] uppercase text-muted" aria-hidden="true">
          <span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span>Sun</span>
        </div>
        <div role="img" aria-label={`${title}, darker is more`} className="grid grid-flow-col grid-rows-[repeat(7,28px)] auto-cols-[28px] gap-1">
          {cells.map((c) => (
            <span
              key={c.day}
              title={c.future ? undefined : `${c.day}: ${text(c.v)}`}
              className={`size-7 rounded-[4px] transition-transform hover:scale-110 ${c.future ? "box-border border border-dashed border-white/10 bg-transparent" : "border border-white/5"} ${c.today ? "ring-2 ring-emerald-400 ring-offset-1 ring-offset-[#090b10]" : ""}`}
              style={c.future ? undefined : { background: `var(--heat-${levelOf(c.v)})` }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
