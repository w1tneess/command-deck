import type { Act, State } from "./api.ts";
import { Deliverables } from "./Deliverables.tsx";
import { Card, H2 } from "./ui.tsx";

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const at = (day: string) => Date.parse(day + "T00:00:00Z");
const hm = (m: number) => (m === 0 ? "0" : `${m >= 60 ? `${Math.floor(m / 60)}h ` : ""}${m % 60 ? `${m % 60}m` : ""}`.trim());
const weekday = (d: string) => new Date(at(d)).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
const ENERGY = { low: "Low", ok: "OK", high: "High" } as const;
const WEEKS = 12;
/** Level 0 to 4, using the design's thresholds. */
const level = (m: number) => (m === 0 ? 0 : m < 60 ? 1 : m < 120 ? 2 : m < 180 ? 3 : 4);

export function Week({ state, act }: { state: State; act: Act }) {
  const minutes = new Map(state.heat.map((h) => [h.day, h.minutes]));
  const days = Array.from({ length: 7 }, (_, i) => iso(at(state.today) - (6 - i) * DAY));
  const week = days.map((d) => ({ day: d, min: minutes.get(d) ?? 0, energy: state.checkins.find((c) => c.day === d)?.energy }));
  const total = week.reduce((a, w) => a + w.min, 0);

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
          <Heatmap today={state.today} minutes={minutes} />
        </div>
        <div className="min-w-0 flex-[2_1_380px]"><Deliverables state={state} act={act} embedded /></div>
      </div>
    </>
  );
}

function Heatmap({ today, minutes }: { today: string; minutes: Map<string, number> }) {
  // Columns are weeks starting Monday, the last one being this week; days still to come are dashed.
  const dow = (new Date(at(today)).getUTCDay() + 6) % 7;
  const firstDay = at(today) - dow * DAY - (WEEKS - 1) * 7 * DAY;
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const day = iso(firstDay + Math.floor(i / 7) * 7 * DAY + (i % 7) * DAY);
    return { day, min: minutes.get(day) ?? 0, future: day > today, today: day === today };
  });
  return (
    <Card labelledBy="heat-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2 id="heat-h">Last 12 weeks</H2>
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
        <div role="img" aria-label="Study minutes per day for the last 12 weeks, darker is more" className="grid grid-flow-col grid-rows-[repeat(7,28px)] auto-cols-[28px] gap-1">
          {cells.map((c) => (
            <span
              key={c.day}
              title={c.future ? undefined : `${c.day}: ${c.min ? hm(c.min) : "no study"}`}
              className={`size-7 rounded-md ${c.future ? "box-border border border-dashed border-line" : ""} ${c.today ? "outline-2 outline-offset-1 outline-accent-text" : ""}`}
              style={c.future ? undefined : { background: `var(--heat-${level(c.min)})` }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
