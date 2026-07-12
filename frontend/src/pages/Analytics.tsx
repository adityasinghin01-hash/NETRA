import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import ForceGraph2D from "react-force-graph-2d";
import { useApi, Card, PageHeader, State } from "@/components/ui";

interface Outcome {
  districtId: number; name: string;
  chargesheeted: number; false: number; undetected: number; undetectedPct: number;
}
interface TrendSeries { districtId: number; name: string; points: { month: string; count: number }[] }
interface NetNode { id: number; name: string; cases: number; cluster?: string | null }
interface NetEdge { source: number; target: number; weight: number }

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

function TrendsTab() {
  const { data, loading, error } = useApi<TrendSeries[]>("/stats/trends");
  const series = data ?? [];
  const chartData = useMemo(() => {
    if (!series.length) return [];
    return series[0].points.map((p, i) => {
      const row: Record<string, string | number> = { month: p.month };
      series.forEach((s) => (row[s.name] = s.points[i]?.count ?? 0));
      return row;
    });
  }, [series]);

  return (
    <State loading={loading} error={error} empty={!series.length}>
      <Card className="p-4">
        <div className="mb-3 text-sm font-medium">Monthly FIRs — top districts</div>
        <div style={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} minTickGap={28} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#111a2e", border: "1px solid #2b3a55", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {series.map((s, i) => (
                <Line key={s.districtId} type="monotone" dataKey={s.name}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </State>
  );
}

function OutcomesTab() {
  const { data, loading, error } = useApi<Outcome[]>("/stats/outcomes");
  const rows = (data ?? []).slice().sort((a, b) => b.undetectedPct - a.undetectedPct);
  return (
    <State loading={loading} error={error} empty={!rows.length}>
      <div className="mb-3 flex gap-4 text-xs text-[var(--color-text-dim)]">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[var(--color-ok)]" /> Chargesheeted</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[var(--color-text-mute)]" /> False</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[var(--color-danger)]" /> Undetected</span>
      </div>
      <Card className="p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-text-mute)]">
              <th className="pb-2 font-normal">District</th>
              <th className="pb-2 font-normal">Outcome mix</th>
              <th className="pb-2 text-right font-normal">Undetected %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.districtId} className="border-t border-[var(--color-border)]">
                <td className="py-2.5 text-[var(--color-text-dim)]">{r.name}</td>
                <td className="w-1/2 py-2.5 pr-6"><OutcomeBar a={r.chargesheeted} b={r.false} c={r.undetected} /></td>
                <td className="tnum py-2.5 text-right text-[var(--color-text)]">{r.undetectedPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </State>
  );
}

function NetworkTab() {
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fg = useRef<any>(null);
  const [w, setW] = useState(700);
  const [net, setNet] = useState<{ nodes: NetNode[]; links: NetEdge[] } | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}network-graph.json`)
      .then((r) => r.json())
      .then((d) => setNet({ nodes: d.nodes, links: d.edges }))
      .catch(() => setNet(null));
  }, []);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return (
    <Card className="p-4">
      <div className="mb-1 text-sm font-medium">Offender network</div>
      <div className="mb-3 text-xs text-[var(--color-text-dim)]">
        Node size = cases · <span className="text-[var(--color-accent)]">cyan</span> = serial-cluster offender · links = co-offending
      </div>
      <div ref={ref} className="overflow-hidden rounded-lg bg-[var(--color-bg)]" style={{ height: 380 }}>
        {net && (
          <ForceGraph2D
            ref={fg}
            graphData={net}
            width={w}
            height={380}
            backgroundColor="#0b1220"
            nodeRelSize={4}
            nodeVal={(n) => Math.max(1.5, (n as NetNode).cases / 5)}
            nodeColor={(n) => ((n as NetNode).cluster ? "#22d3ee" : "#64748b")}
            nodeLabel={(n) => {
              const x = n as NetNode;
              return `${x.name} — ${x.cases} cases${x.cluster ? " · " + x.cluster : ""}`;
            }}
            nodeCanvasObjectMode={() => "after"}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            nodeCanvasObject={(node: any, ctx, scale) => {
              if (!node.cluster) return;
              const label = String(node.name).split(" ")[0];
              const fs = 11 / scale;
              ctx.font = `${fs}px Inter, sans-serif`;
              ctx.fillStyle = "#e2e8f0";
              ctx.textAlign = "center";
              ctx.fillText(label, node.x, node.y - 9 / scale);
            }}
            linkColor={(l) => ((l as NetEdge).weight > 3 ? "rgba(34,211,238,0.55)" : "rgba(148,163,184,0.3)")}
            linkWidth={(l) => Math.max(1, Math.min(5, (l as NetEdge).weight / 1.5))}
            cooldownTicks={100}
            onEngineStop={() => fg.current?.zoomToFit(400, 40)}
          />
        )}
      </div>
    </Card>
  );
}

export default function Analytics() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Trends");
  return (
    <div>
      <PageHeader title="District Analytics" desc="Trends, case outcomes and the offender network" />
      <div className="mb-4 flex gap-1 border-b border-[var(--color-border)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm transition-colors ${
              tab === t
                ? "border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"
                : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Trends" && <TrendsTab />}
      {tab === "Outcomes" && <OutcomesTab />}
      {tab === "Network" && <NetworkTab />}
    </div>
  );
}
