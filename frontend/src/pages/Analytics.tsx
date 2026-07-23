import { useEffect, useMemo, useRef, useState } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import ForceGraph2D from "react-force-graph-2d";
import { useApi, Card, PageHeader, State } from "@/components/ui";
import { getSession } from "@/lib/auth";

interface Outcome {
  districtId: number; name: string;
  chargesheeted: number; false: number; undetected: number; undetectedPct: number;
}
interface TrendSeries { districtId: number; name: string; points: { month: string; count: number }[] }
interface Fc { future: string[]; mean: number[]; lo: number[]; hi: number[]; sigma: number; bridge: { month: string; count: number } }
interface TrendForecast { horizon: number; state: Fc; districts: Record<string, Fc> }
interface NetNode { id: number; name: string; cases: number; cluster?: string | null; community?: number; centrality?: number; kingpin?: boolean; bridge?: number }
interface NetEdge { source: number; target: number; weight: number; predicted?: boolean }
interface Ring { id: number; label: string; size: number; kingpinId: number; kingpin: string }
interface Pred { source: number; target: number; score: number; community: number; via: string[]; sourceName: string; targetName: string; reason: string }
interface DistrictStat {
  total: number; heinous: number; counts: number[];
  outcome: { chargesheeted: number; false: number; undetected: number; undetectedPct: number; detectionPct: number };
  topCrimes: { type: string; count: number; pct: number }[];
}
interface DA { months: string[]; districts: Record<string, DistrictStat> }
interface RiskData {
  metrics: { accuracy: number; auc: number };
  drivers: { factor: string; importance: number }[];
  districts: { district: string; riskScore: number }[];
}

const LINE_COLORS = ["#22d3ee", "#f59e0b", "#ec4899", "#a3e635", "#3b82f6"];
const TABS = ["Trends", "Outcomes", "Network"] as const;

function OutcomeBar({ a, b, c }: { a: number; b: number; c: number }) {
  const tot = a + b + c || 1;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
      <div style={{ width: `${(a / tot) * 100}%` }} className="bg-[var(--color-ok)]" />
      <div style={{ width: `${(b / tot) * 100}%` }} className="bg-[var(--color-text-mute)]" />
      <div style={{ width: `${(c / tot) * 100}%` }} className="bg-[var(--color-danger)]" />
    </div>
  );
}
const OUTCOME_LEGEND = (
  <div className="mb-3 flex gap-4 text-xs text-[var(--color-text-dim)]">
    <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[var(--color-ok)]" /> Chargesheeted</span>
    <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[var(--color-text-mute)]" /> False</span>
    <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[var(--color-danger)]" /> Undetected</span>
  </div>
);

const CLOCK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function clockColor(t: number) {
  const stops = [[13, 20, 40], [30, 100, 150], [56, 178, 178], [246, 180, 64], [206, 32, 52]];
  const p = t * (stops.length - 1); const i = Math.floor(p); const f = p - i;
  const a = stops[i]; const b = stops[Math.min(i + 1, stops.length - 1)];
  return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * f)).join(",")})`;
}
function CrimeClock({ matrix }: { matrix: number[][] }) {
  const max = Math.max(1, ...matrix.flat());
  return (
    <div className="overflow-x-auto">
      <div className="flex pl-9 text-[9px] text-[var(--color-text-mute)]">
        {[0, 4, 8, 12, 16, 20].map((h) => (
          <span key={h} style={{ width: 4 * 13 }}>{String(h).padStart(2, "0")}</span>
        ))}
      </div>
      {CLOCK_DAYS.map((d, wd) => (
        <div key={d} className="flex items-center gap-0.5 py-px">
          <span className="w-8 text-[10px] text-[var(--color-text-dim)]">{d}</span>
          {matrix[wd].map((v, h) => (
            <span key={h} title={`${d} ${String(h).padStart(2, "0")}:00 — ${v} FIRs`}
              style={{ width: 12, height: 12, background: clockColor(v / max), borderRadius: 2, display: "inline-block" }} />
          ))}
        </div>
      ))}
    </div>
  );
}
function TrendsTab({ scope, da }: { scope: string | null; da: DA | null }) {
  const state = useApi<TrendSeries[]>(scope ? null : "/stats/trends");
  const [clock, setClock] = useState<{ state: number[][]; districts: Record<string, number[][]> } | null>(null);
  const [fc, setFc] = useState<TrendForecast | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}crime-clock.json`).then((r) => r.json()).then(setClock).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}trend-forecast.json`).then((r) => r.json()).then(setFc).catch(() => {});
  }, []);
  const clockMatrix = scope ? clock?.districts[scope] : clock?.state;
  const seriesNames = scope ? [scope] : (state.data ?? []).map((s) => s.name);

  // History rows + a forecast continuation (dashed line + confidence band for the scoped view).
  const { chartData, firstFcMonth } = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows: Record<string, any>[] = [];
    if (scope && da?.districts[scope]) {
      const s = da.districts[scope];
      rows = da.months.map((m, i) => ({ month: m, [scope]: s.counts[i] ?? 0 }));
    } else {
      const series = state.data ?? [];
      if (series.length)
        rows = series[0].points.map((p, i) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row: Record<string, any> = { month: p.month };
          series.forEach((s) => (row[s.name] = s.points[i]?.count ?? 0));
          return row;
        });
    }
    if (!rows.length || !fc) return { chartData: rows, firstFcMonth: null as string | null };

    // Bridge: connect the dashed forecast to the last real point.
    const last = rows[rows.length - 1];
    for (const name of seriesNames) {
      const f = scope ? fc.districts[name] ?? fc.state : fc.districts[name];
      if (!f) continue;
      last[`${name}__fc`] = last[name];
      if (scope) last[`${name}__band`] = [last[name], last[name]];
    }
    const futMonths = fc.state.future;
    for (let j = 0; j < futMonths.length; j++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: Record<string, any> = { month: futMonths[j] };
      for (const name of seriesNames) {
        const f = scope ? fc.districts[name] ?? fc.state : fc.districts[name];
        if (!f) continue;
        row[`${name}__fc`] = f.mean[j];
        if (scope) row[`${name}__band`] = [f.lo[j], f.hi[j]];
      }
      rows.push(row);
    }
    return { chartData: rows, firstFcMonth: futMonths[0] };
  }, [scope, da, state.data, fc, seriesNames]);

  const loading = scope ? !da : state.loading;

  return (
    <State loading={loading} error={state.error} empty={!chartData.length}>
      <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-medium">Monthly FIRs — {scope ?? "top districts"}</div>
          {firstFcMonth && (
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-mute)]">
              <span className="inline-block h-0 w-4 border-t-2 border-dashed border-[var(--color-accent)]" /> forecast (±80%)
            </span>
          )}
        </div>
        <div style={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} minTickGap={28} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#111a2e", border: "1px solid #2b3a55", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {firstFcMonth && (
                <ReferenceLine x={firstFcMonth} stroke="#334155" strokeDasharray="3 3"
                  label={{ value: "today", fill: "#64748b", fontSize: 10, position: "insideTopRight" }} />
              )}
              {scope && (
                <Area type="monotone" dataKey={`${scope}__band`} legendType="none" isAnimationActive={false}
                  stroke="none" fill={LINE_COLORS[0]} fillOpacity={0.12} connectNulls activeDot={false} />
              )}
              {seriesNames.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={false} connectNulls={false} />
              ))}
              {seriesNames.map((name, i) => (
                <Line key={name + "__fc"} type="monotone" dataKey={`${name}__fc`} legendType="none"
                  stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} strokeDasharray="5 4"
                  dot={false} connectNulls activeDot={{ r: 3 }} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {firstFcMonth && (
          <div className="mt-2 text-[11px] text-[var(--color-text-mute)]">
            Dashed = projected next {fc?.horizon} months (linear trend + monthly seasonal index); shaded band = ~80% interval. Predictive, not just retrospective.
          </div>
        )}
      </Card>
      {clockMatrix && (
        <Card className="p-4">
          <div className="text-sm font-medium">Crime Clock — when crime happens {scope ? `· ${scope}` : "· state-wide"}</div>
          <div className="mb-3 text-xs text-[var(--color-text-dim)]">Darker = more crime. Reveals the exact hours to deploy patrols.</div>
          <CrimeClock matrix={clockMatrix} />
        </Card>
      )}
      </div>
    </State>
  );
}

function RiskPanel({ risk }: { risk: RiskData | null }) {
  if (!risk) return null;
  const maxImp = Math.max(0.001, ...risk.drivers.map((d) => Math.max(0, d.importance)));
  return (
    <Card className="mb-3 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">Detection-risk model — what drives undetected crime</div>
        <span className="text-xs text-[var(--color-text-mute)]">gradient boosting · ROC-AUC {risk.metrics.auc}</span>
      </div>
      <div className="space-y-1.5">
        {risk.drivers.filter((d) => d.importance > 0).slice(0, 4).map((d) => (
          <div key={d.factor} className="flex items-center gap-2 text-xs">
            <span className="w-36 shrink-0 text-[var(--color-text-dim)] capitalize">{d.factor}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-bg)]">
              <div className="h-full bg-[var(--color-accent)]" style={{ width: `${(Math.max(0, d.importance) / maxImp) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

interface ColdCase { crimeNo: string; district: string; type: string; registered: string; daysOpen: number; risk: number; reason: string }
function ColdCaseWorklist({ rows }: { rows: ColdCase[] }) {
  if (!rows?.length) return null;
  return (
    <Card className="mb-4 p-4">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm font-medium">⏳ Cases at risk of going cold</div>
        <span className="text-xs text-[var(--color-text-mute)]">predicted to go undetected · intervene now</span>
      </div>
      <div className="mb-3 text-xs text-[var(--color-text-dim)]">A ranked worklist of open cases the model flags as most likely to end undetected — prescriptive, not just a statistic.</div>
      <ul className="space-y-1.5">
        {rows.slice(0, 8).map((c) => (
          <li key={c.crimeNo} className="flex items-center gap-3 rounded-lg bg-[var(--color-bg)] p-2 text-xs">
            <span className="tnum w-40 shrink-0 text-[var(--color-text-dim)]">{c.crimeNo}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[var(--color-text)]">{c.type} · {c.district}</div>
              <div className="text-[10px] text-[var(--color-text-mute)]">{c.reason}</div>
            </div>
            <div className="w-16 shrink-0">
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]"><div className="h-full bg-[var(--color-danger)]" style={{ width: `${Math.round(c.risk * 100)}%` }} /></div>
              <div className="tnum mt-0.5 text-right text-[10px] text-[var(--color-danger)]">{Math.round(c.risk * 100)}%</div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function OutcomesTab({ scope, da, risk }: { scope: string | null; da: DA | null; risk: RiskData | null }) {
  const state = useApi<Outcome[]>(scope ? null : "/stats/outcomes");
  const rows = (state.data ?? []).slice().sort((a, b) => b.undetectedPct - a.undetectedPct);
  const riskByName = useMemo(() => new Map((risk?.districts ?? []).map((d) => [d.district, d.riskScore])), [risk]);
  const [coldData, setColdData] = useState<{ state: ColdCase[]; districts: Record<string, ColdCase[]> } | null>(null);
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}cold-cases.json`).then((r) => r.json()).then(setColdData).catch(() => {}); }, []);
  const cold = scope ? (coldData?.districts[scope] ?? []) : (coldData?.state ?? []);

  // scoped: single district
  if (scope) {
    const s = da?.districts[scope];
    const rs = riskByName.get(scope);
    return (
      <State loading={!da} error={null} empty={!s}>
        {s && (
          <>
            <ColdCaseWorklist rows={cold} />
            <RiskPanel risk={risk} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-4">
                <div className="mb-3 text-sm font-medium">{scope} — case outcomes</div>
                {OUTCOME_LEGEND}
                <OutcomeBar a={s.outcome.chargesheeted} b={s.outcome.false} c={s.outcome.undetected} />
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-[var(--color-bg)] p-3">
                    <div className="text-[10px] uppercase text-[var(--color-text-mute)]">Detection</div>
                    <div className="tnum text-lg font-semibold text-[var(--color-ok)]">{s.outcome.detectionPct}%</div>
                  </div>
                  <div className="rounded-lg bg-[var(--color-bg)] p-3">
                    <div className="text-[10px] uppercase text-[var(--color-text-mute)]">Undetected</div>
                    <div className="tnum text-lg font-semibold text-[var(--color-danger)]">{s.outcome.undetectedPct}%</div>
                  </div>
                  <div className="rounded-lg bg-[var(--color-bg)] p-3">
                    <div className="text-[10px] uppercase text-[var(--color-text-mute)]">Risk score</div>
                    <div className={`tnum text-lg font-semibold ${rs != null && rs > 66 ? "text-[var(--color-danger)]" : rs != null && rs > 33 ? "text-[var(--color-warn)]" : "text-[var(--color-ok)]"}`}>{rs ?? "—"}</div>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="mb-3 text-sm font-medium">Leading crime types</div>
                <div className="space-y-2">
                  {s.topCrimes.map((t) => (
                    <div key={t.type} className="flex items-center gap-2 text-xs">
                      <span className="w-40 shrink-0 truncate text-[var(--color-text-dim)]">{t.type}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-bg)]">
                        <div className="h-full bg-[var(--color-accent)]" style={{ width: `${t.pct * 4}%` }} />
                      </div>
                      <span className="tnum w-10 text-right text-[var(--color-text-mute)]">{t.pct}%</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}
      </State>
    );
  }

  // HQ: state table
  return (
    <State loading={state.loading} error={state.error} empty={!rows.length}>
      <ColdCaseWorklist rows={cold} />
      <RiskPanel risk={risk} />
      {OUTCOME_LEGEND}
      <Card className="p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-text-mute)]">
              <th className="pb-2 font-normal">District</th>
              <th className="pb-2 font-normal">Outcome mix</th>
              <th className="pb-2 text-right font-normal">Undetected %</th>
              <th className="pb-2 text-right font-normal">Risk*</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rs = riskByName.get(r.name);
              return (
                <tr key={r.districtId} className="border-t border-[var(--color-border)]">
                  <td className="py-2.5 text-[var(--color-text-dim)]">{r.name}</td>
                  <td className="w-2/5 py-2.5 pr-6"><OutcomeBar a={r.chargesheeted} b={r.false} c={r.undetected} /></td>
                  <td className="tnum py-2.5 text-right text-[var(--color-text)]">{r.undetectedPct}%</td>
                  <td className="tnum py-2.5 text-right">
                    {rs != null && <span className={rs > 66 ? "text-[var(--color-danger)]" : rs > 33 ? "text-[var(--color-warn)]" : "text-[var(--color-ok)]"}>{rs}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-2 text-[10px] leading-relaxed text-[var(--color-text-mute)]">
          * Risk = relative detection-risk index (0 = lowest, 100 = highest across Karnataka) — a ranking, not a probability.
        </div>
      </Card>
    </State>
  );
}

const RING_COLORS = ["#22d3ee", "#f59e0b", "#ec4899", "#a3e635", "#a855f7", "#38bdf8", "#fb7185", "#2dd4bf"];

function NetworkTab() {
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fg = useRef<any>(null);
  const [w, setW] = useState(700);
  const [net, setNet] = useState<{ nodes: NetNode[]; links: NetEdge[] } | null>(null);
  const [rings, setRings] = useState<Ring[]>([]);
  const [preds, setPreds] = useState<Pred[]>([]);
  const [query, setQuery] = useState("");
  // FIR → offender/ring map: nodes carry no FIR list, so we join through the Crime-DNA member roster
  // (caseNo → cluster → offender), letting an officer type a raw FIR number and land on its ring.
  const [dna, setDna] = useState<Record<string, { offender: string; label: string; members: { caseNo: string }[] }> | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}network-graph.json`).then((r) => r.json())
      .then((d) => {
        const predicted: NetEdge[] = (d.predictedLinks ?? []).map((p: Pred) => ({ source: p.source, target: p.target, weight: 1, predicted: true }));
        setNet({ nodes: d.nodes, links: [...d.edges, ...predicted] });
        setRings(d.communities ?? []);
        setPreds(d.predictedLinks ?? []);
      })
      .catch(() => setNet(null));
    fetch(`${import.meta.env.BASE_URL}crime-dna.json`).then((r) => r.json()).then(setDna).catch(() => {});
  }, []);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const colorOf = useMemo(() => {
    const m = new Map<number, string>();
    rings.forEach((r, i) => m.set(r.id, RING_COLORS[i % RING_COLORS.length]));
    return m;
  }, [rings]);
  const kingpinIds = useMemo(() => new Set(rings.map((r) => r.kingpinId)), [rings]);

  // FIR/keyword linkage search: resolve a raw FIR number (via Crime-DNA) or a keyword (offender /
  // crime-type / ring name) to the matching offender node(s), and spell out the case→offender→ring
  // chain so the graph becomes something you can interrogate, not just look at.
  const firIndex = useMemo(() => {
    const m = new Map<string, { offender: string; label: string }>();
    if (dna) for (const c of Object.values(dna)) for (const mem of c.members ?? []) m.set(mem.caseNo, { offender: c.offender, label: c.label });
    return m;
  }, [dna]);
  const search = useMemo(() => {
    const raw = query.trim();
    if (!raw || !net) return { ids: new Set<number>(), msg: "", tone: "dim" as "dim" | "warn" };
    const q = raw.toLowerCase();
    const ids = new Set<number>();
    if (/^\d{6,}$/.test(raw)) {
      const hit = firIndex.get(raw);
      if (!hit) return { ids, msg: `FIR ${raw} isn’t in a mapped serial ring — only the ${firIndex.size} serial-cluster FIRs are networked here.`, tone: "warn" as const };
      const matched = net.nodes.filter((n) => n.name === hit.offender || (n.cluster && n.cluster === hit.label));
      matched.forEach((n) => ids.add(n.id));
      const comm = matched[0]?.community;
      const co = net.nodes.filter((n) => n.community === comm && !ids.has(n.id)).map((n) => n.name);
      return { ids, msg: `FIR ${raw} → ${hit.offender} · ring “${hit.label}”${co.length ? ` · co-offenders: ${co.slice(0, 4).join(", ")}${co.length > 4 ? "…" : ""}` : ""}`, tone: "dim" as const };
    }
    net.nodes.forEach((n) => { if (n.name.toLowerCase().includes(q) || (n.cluster ?? "").toLowerCase().includes(q)) ids.add(n.id); });
    rings.forEach((r) => { if (r.label.toLowerCase().includes(q)) net.nodes.forEach((n) => { if (n.community === r.id) ids.add(n.id); }); });
    return { ids, msg: ids.size ? `${ids.size} offender${ids.size === 1 ? "" : "s"} matched “${raw}” — highlighted; the rest is dimmed.` : `No offender or ring matches “${raw}”.`, tone: ids.size ? "dim" as const : "warn" as const };
  }, [query, net, firIndex, rings]);
  const matchIds = search.ids;

  // Frame the matched nodes WITH their ring for context (fitting a lone node zooms in absurdly far),
  // then cap the zoom so a single match doesn't fill the whole canvas.
  useEffect(() => {
    if (!fg.current || !net) return;
    const t = setTimeout(() => {
      if (matchIds.size) {
        const comms = new Set(net.nodes.filter((n) => matchIds.has(n.id)).map((n) => n.community));
        fg.current.zoomToFit(600, 90, (n: NetNode) => matchIds.has(n.id) || comms.has(n.community));
        setTimeout(() => { if (fg.current && fg.current.zoom() > 5) fg.current.zoom(5, 400); }, 650);
      } else {
        fg.current.zoomToFit(400, 40);
      }
    }, 80);
    return () => clearTimeout(t);
  }, [matchIds, net]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-2">
        <div className="mb-1 text-sm font-medium">Organized-crime network</div>
        <div className="mb-2 text-xs text-[var(--color-text-dim)]">
          Colour = detected ring · size = influence (centrality) · ◎ ringed = kingpin · solid = co-offending · <span className="text-[var(--color-warn)]">dashed amber = predicted (emerging) tie</span>
        </div>
        <div className="mb-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find in network — FIR number, offender, crime type or ring…"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-mute)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          {search.msg && (
            <div className={`mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed ${search.tone === "warn" ? "text-[var(--color-warn)]" : "text-[var(--color-text-dim)]"}`}>
              <span>🔗</span><span>{search.msg}</span>
            </div>
          )}
        </div>
        <div ref={ref} className="overflow-hidden rounded-lg bg-[var(--color-bg)]" style={{ height: 380 }}>
          {net && (
            <ForceGraph2D
              ref={fg} graphData={net} width={w} height={380} backgroundColor="#0b1220" nodeRelSize={4}
              nodeVal={(n) => { const x = n as NetNode; return Math.max(1.2, (x.centrality ?? 0) * 14 + (x.kingpin ? 6 : 1.2)); }}
              nodeColor={(n) => { const x = n as NetNode; if (matchIds.size && !matchIds.has(x.id)) return "rgba(71,85,105,0.28)"; return colorOf.get(x.community ?? -1) ?? "#475569"; }}
              nodeLabel={(n) => { const x = n as NetNode; return `${x.name} — ${x.cases} cases${x.kingpin ? " · KINGPIN" : ""}${x.cluster ? " · " + x.cluster : ""}`; }}
              nodeCanvasObjectMode={() => "after"}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              nodeCanvasObject={(node: any, ctx, scale) => {
                const isMatch = matchIds.has(node.id);
                if (isMatch) {
                  ctx.beginPath(); ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI);
                  ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 2.2 / scale; ctx.stroke();
                  const label = String(node.name).split(" ")[0]; const fs = 11 / scale;
                  ctx.font = `700 ${fs}px Inter, sans-serif`; ctx.fillStyle = "#a5f3fc"; ctx.textAlign = "center";
                  ctx.fillText(label, node.x, node.y - 13 / scale);
                }
                if (!kingpinIds.has(node.id)) return;
                ctx.beginPath(); ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI);
                ctx.strokeStyle = "#fde68a"; ctx.lineWidth = 1.6 / scale; ctx.stroke();
                if (!isMatch) {
                  const label = String(node.name).split(" ")[0]; const fs = 11 / scale;
                  ctx.font = `700 ${fs}px Inter, sans-serif`; ctx.fillStyle = "#fde68a"; ctx.textAlign = "center";
                  ctx.fillText(label, node.x, node.y - 11 / scale);
                }
              }}
              linkColor={(l) => ((l as NetEdge).predicted ? "rgba(245,158,11,0.75)" : (l as NetEdge).weight > 3 ? "rgba(34,211,238,0.5)" : "rgba(148,163,184,0.25)")}
              linkWidth={(l) => ((l as NetEdge).predicted ? 1.4 : Math.max(1, Math.min(5, (l as NetEdge).weight / 1.5)))}
              linkLineDash={(l) => ((l as NetEdge).predicted ? [4, 3] : null)}
              cooldownTicks={100} onEngineStop={() => fg.current?.zoomToFit(400, 40)}
            />
          )}
        </div>
      </Card>
      <Card className="p-4">
        <div className="text-sm font-medium">Detected rings</div>
        <div className="mb-3 text-xs text-[var(--color-text-dim)]">{rings.length} organized rings · Louvain communities + centrality</div>
        <ul className="space-y-2">
          {rings.map((r, i) => (
            <li key={r.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: RING_COLORS[i % RING_COLORS.length] }} />
                <span className="truncate text-sm font-medium text-[var(--color-text)]">{r.label}</span>
                <span className="ml-auto shrink-0 text-xs text-[var(--color-text-mute)]">{r.size} members</span>
              </div>
              <div className="mt-1 text-xs text-[var(--color-text-dim)]">👑 Kingpin: <span className="font-medium text-[var(--color-text)]">{r.kingpin}</span></div>
            </li>
          ))}
        </ul>
        <div className="mt-3 text-[10px] leading-relaxed text-[var(--color-text-mute)]">
          Remove the kingpin and the ring fragments — target the coordinator, not just foot-soldiers.
        </div>

        {preds.length > 0 && (
          <div className="mt-4 border-t border-[var(--color-border)] pt-3">
            <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text)]">
              <span className="text-[var(--color-warn)]">⚡</span> Emerging ties <span className="text-xs font-normal text-[var(--color-text-mute)]">(predicted)</span>
            </div>
            <div className="mb-2 mt-0.5 text-[11px] text-[var(--color-text-dim)]">Graph-ML (Adamic-Adar) — co-offending links likely to form, not yet in any FIR.</div>
            <ul className="space-y-1.5">
              {preds.slice(0, 5).map((p) => (
                <li key={`${p.source}-${p.target}`} className="rounded-lg border border-[var(--color-warn)]/30 bg-[var(--color-warn)]/[0.05] p-2">
                  <div className="text-xs text-[var(--color-text)]">
                    {p.sourceName} <span className="text-[var(--color-warn)]">⇢</span> {p.targetName}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--color-text-mute)]">via {p.via.join(", ")} · same ring · no direct co-offending on record yet</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function Analytics() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Trends");
  const scope = getSession().district;
  const [da, setDa] = useState<DA | null>(null);
  const [risk, setRisk] = useState<RiskData | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}district-analytics.json`).then((r) => r.json()).then(setDa).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}risk-scores.json`).then((r) => r.json()).then(setRisk).catch(() => {});
  }, []);
  return (
    <div>
      <PageHeader title="District Analytics" desc={scope ? `${scope} — trends, outcomes and offender network` : "Trends, case outcomes and the offender network"} />
      <div className="mb-4 flex gap-1 border-b border-[var(--color-border)]">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm transition-colors ${tab === t ? "border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]" : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Trends" && <TrendsTab scope={scope} da={da} />}
      {tab === "Outcomes" && <OutcomesTab scope={scope} da={da} risk={risk} />}
      {tab === "Network" && <NetworkTab />}
    </div>
  );
}
