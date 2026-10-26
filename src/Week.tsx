import { useId, useRef, useState } from "react";
import type { Act, State } from "./api.ts";
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
    if (energy === "high") return "border-accent/30 bg-accent/15 text-accent";
    if (energy === "ok") return "border-warn/30 bg-warn/15 text-warn";
    if (energy === "low") return "border-danger/30 bg-danger/10 text-danger";
    return "border-line bg-surface2 text-muted";
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 md:max-w-3xl md:gap-6">
      <PageHeader title="Review" sub="The last seven days, and a note for the week." />
      {/* cards below sit directly in the column */}
      <div className="flex flex-col gap-4 md:gap-6">
          <Card labelledBy="bars-h">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <H2 id="bars-h">Study Time & Energy</H2>
              <span className="text-[13px] font-mono text-muted">{Math.floor(total / 60)}h {total % 60}m logged this week</span>
            </div>
            <div role="img" aria-label={`Study time per day: ${week.map((w) => `${weekday(w.day)} ${hm(w.min)}`).join(", ")}`} className="mt-6 flex h-[232px] items-end justify-between gap-3 border-b border-line pb-2">
              {week.map((w) => (
                <div key={w.day} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <span className="font-mono text-xs text-muted group-hover:text-fg transition-colors">{hm(w.min)}</span>
                  <div
                    className={`w-full max-w-10 rounded-t-lg transition-all duration-300 ease-out ${
                      w.min === 0
                        ? "bg-surface2"
                        : "bg-good"
                    }`}
                    style={{ height: Math.max(6, Math.round((w.min / 180) * 150)) }}
                  />
                  <span className="font-mono text-xs   text-fg/80">{weekday(w.day)}</span>
                  <span className={`rounded-full border px-2 py-0.5 font-mono text-[11px]   ${energyStyle(w.energy)}`}>
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
              <span className="font-mono text-xs text-muted"><span className="text-fg font-semibold">{habitPct}%</span> of habits done this week</span>
            </div>
            <table className="mt-3.5 w-full border-separate border-spacing-y-2 text-left text-sm">
              <caption className="sr-only">Study time, habits done and sleep rating for each of the last 7 days</caption>
              <thead>
                <tr className="font-mono text-[11px] text-muted">
                  <th scope="col" className="pb-2.5 font-medium">Day</th>
                  <th scope="col" className="pb-2.5 font-medium">Study Hours</th>
                  <th scope="col" className="pb-2.5 font-medium">Habits</th>
                  <th scope="col" className="pb-2.5 text-right font-medium">Sleep (score 1–5)</th>
                </tr>
              </thead>
              <tbody>
                {week.map((w) => (
                  <tr key={w.day}>
                    <th scope="row" className="rounded-l-xl bg-surface py-3 pl-3 pr-3 font-mono text-xs font-semibold text-fg ">{weekday(w.day)}</th>
                    <td className="bg-surface py-3 pr-3">
                      <div className="flex items-center gap-3">
                        <span className="h-1.5 w-full max-w-[160px] min-w-12 overflow-hidden rounded-full bg-surface3">
                          <span className="block h-full rounded-full transition-all duration-300 ease-out bg-good" style={{ width: `${Math.min(100, (w.min / 180) * 100)}%` }} />
                        </span>
                        <span className="font-mono text-xs text-muted">{hm(w.min)}</span>
                      </div>
                    </td>
                    <td className="bg-surface py-3 pr-3 font-mono text-xs">
                      <span className={habitCount && w.habits === habitCount ? "text-accent font-semibold" : "text-fg/80"}>
                        {w.habits}/{habitCount}
                      </span>
                    </td>
                    <td className="rounded-r-xl bg-surface py-3 pr-3 text-right font-mono text-xs text-muted">{w.sleep ? `${w.sleep}/5` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Reflection key={state.review.weekStart} state={state} act={act} />
          <Heatmap id="heat-study" title="Study, last 12 weeks" today={state.today} values={minutes} levelOf={studyLevel} text={(m) => (m ? hm(m) : "no study")} />
          <Heatmap id="heat-habits" title="Habits, last 12 weeks" today={state.today} values={habitsDone} levelOf={habitLevel} text={(n) => (n ? `${n} of ${habitCount} habits` : "no habits")} />
      </div>
    </div>
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
      <label htmlFor={inputId} className="mt-3.5 mb-2 block font-mono text-xs   text-muted">Weekly Qualitative Synthesis & Retrospective</label>
      <textarea
        id={inputId}
        rows={4}
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => void save()}
        placeholder="Document key insights, obstacles encountered, and strategic adjustments for next week..."
        className="w-full resize-y rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg placeholder:text-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus transition-colors"
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
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted  ">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((l) => <span key={l} className="size-3.5 rounded-[3px] border border-line" style={{ background: `var(--heat-${l})` }} />)}
          <span>More</span>
        </div>
      </div>
      <div className="mt-4 flex gap-2.5 overflow-x-auto pb-1">
        <div className="grid grid-rows-[repeat(7,28px)] items-center gap-1 font-mono text-[11px]  text-muted" aria-hidden="true">
          <span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span>Sun</span>
        </div>
        <div role="img" aria-label={`${title}, darker is more`} className="grid grid-flow-col grid-rows-[repeat(7,28px)] auto-cols-[28px] gap-1">
          {cells.map((c) => (
            <span
              key={c.day}
              title={c.future ? undefined : `${c.day}: ${text(c.v)}`}
              className={`size-7 rounded-[4px] transition-transform hover:scale-110 ${c.future ? "box-border border border-dashed border-line bg-transparent" : "border border-line"} ${c.today ? "ring-2 ring-focus ring-offset-1 ring-offset-bg" : ""}`}
              style={c.future ? undefined : { background: `var(--heat-${levelOf(c.v)})` }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
