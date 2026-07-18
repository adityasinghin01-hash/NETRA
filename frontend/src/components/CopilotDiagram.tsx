// Copilot diagram renderer — draws police diagrams as clean SVG straight from NETRA's real
// data (deterministic → never broken). GLM decides WHICH diagram to draw (via the make_diagram
// tool); this renders it. Kinds: link-analysis, gang org-chart, case timeline, money-trail, MO flow.
import { useEffect, useState } from "react";
import type { UiAction } from "@/lib/copilotTools";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Dna { clusterId: string; label: string; crimeType: string; districts: string[]; offender?: string | null;
  signature: { dim: string; value: string }[]; members: { caseNo: string; district: string; date: string; solved?: boolean }[] }

const AC = "#22d3ee", TX = "#cbd5e1", MU = "#64748b", BG = "#0b1220", LINE = "#2b3a55";

function Box({ x, y, w, h, label, sub, fill }: { x: number; y: number; w: number; h: number; label: string; sub?: string; fill?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={7} fill={fill ?? "#111a2e"} stroke={LINE} />
      <text x={x + w / 2} y={y + (sub ? 15 : h / 2 + 3)} textAnchor="middle" fontSize="10" fill={TX} fontWeight="600">
        {label.length > 22 ? label.slice(0, 21) + "…" : label}
      </text>
      {sub && <text x={x + w / 2} y={y + 28} textAnchor="middle" fontSize="8" fill={MU}>{sub.length > 26 ? sub.slice(0, 25) + "…" : sub}</text>}
    </g>
  );
}
const Arrow = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) =>
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={LINE} strokeWidth={1.5} markerEnd="url(#ah)" />;

export default function CopilotDiagram({ action }: { action: Extract<UiAction, { kind: "diagram" }> }) {
  const [dna, setDna] = useState<Record<string, Dna> | null>(null);
  const [net, setNet] = useState<any>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}crime-dna.json`).then((r) => r.json()).then(setDna).catch(() => {});
    fetch(`${import.meta.env.BASE_URL}network-graph.json`).then((r) => r.json()).then(setNet).catch(() => {});
  }, []);
  if (!dna) return null;

  const cluster: Dna | undefined = action.clusterId ? dna[action.clusterId]
    : Object.values(dna).find((c) => action.subject && c.label.toLowerCase().includes(action.subject.toLowerCase().split(" ")[0]))
    ?? Object.values(dna)[0];

  const W = 372;
  let body: React.ReactNode = null;
  let title = "";
  const defs = (
    <defs>
      <marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 z" fill={LINE} />
      </marker>
    </defs>
  );

  if (action.diagram === "timeline" && cluster) {
    title = `Case timeline — ${cluster.label}`;
    const ms = [...cluster.members].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
    const step = ms.length > 1 ? (W - 60) / (ms.length - 1) : 0;
    body = (
      <svg viewBox={`0 0 ${W} 120`} width="100%">
        {defs}
        <line x1={30} y1={40} x2={W - 30} y2={40} stroke={LINE} strokeWidth={2} />
        {ms.map((m, i) => {
          const x = 30 + i * step;
          return (
            <g key={m.caseNo}>
              <circle cx={x} cy={40} r={5} fill={m.solved ? "#4ade80" : AC} />
              <text x={x} y={26} textAnchor="middle" fontSize="7.5" fill={MU}>{m.date.slice(2)}</text>
              <text x={x} y={58} textAnchor="middle" fontSize="7" fill={TX}>{m.district.slice(0, 8)}</text>
              <text x={x} y={68} textAnchor="middle" fontSize="6.5" fill={MU}>{m.caseNo.slice(-6)}</text>
            </g>
          );
        })}
      </svg>
    );
  } else if (action.diagram === "mo" && cluster) {
    title = `MO flow — ${cluster.label}`;
    const sig = cluster.signature.slice(0, 4);
    body = (
      <svg viewBox={`0 0 ${W} ${sig.length * 46 + 10}`} width="100%">
        {defs}
        {sig.map((s, i) => (
          <g key={i}>
            <Box x={60} y={10 + i * 46} w={W - 120} h={34} label={s.dim} sub={s.value} />
            {i < sig.length - 1 && <Arrow x1={W / 2} y1={44 + i * 46} x2={W / 2} y2={56 + i * 46} />}
          </g>
        ))}
      </svg>
    );
  } else if (action.diagram === "org" && net) {
    const ring = (net.communities ?? [])[0];
    const members = (net.nodes ?? []).filter((n: any) => n.community === ring?.id).slice(0, 6);
    title = `Gang org-chart — ${ring?.label ?? "ring"}`;
    body = (
      <svg viewBox={`0 0 ${W} 150`} width="100%">
        {defs}
        <Box x={W / 2 - 60} y={8} w={120} h={30} label={ring?.kingpin ?? "Kingpin"} sub="Kingpin" fill="#1f2b45" />
        {members.map((m: any, i: number) => {
          const cols = Math.min(members.length, 3);
          const cw = W / cols;
          const x = (i % cols) * cw + cw / 2 - 45;
          const y = 80 + Math.floor(i / cols) * 40;
          return (
            <g key={m.id}>
              <Arrow x1={W / 2} y1={38} x2={x + 45} y2={y} />
              <Box x={x} y={y} w={90} h={26} label={String(m.name).split(" ")[0]} />
            </g>
          );
        })}
      </svg>
    );
  } else if (action.diagram === "money") {
    title = `Money-trail — ${cluster?.label ?? "financial fraud"}`;
    const steps = ["Victim account", "Fraudster (OTP/UPI)", "Mule accounts ×3", "Cash-out / ATM"];
    body = (
      <svg viewBox={`0 0 ${W} 60`} width="100%">
        {defs}
        {steps.map((s, i) => {
          const bw = 84; const gap = (W - bw * steps.length) / (steps.length - 1);
          const x = i * (bw + gap);
          return (
            <g key={i}>
              <Box x={x} y={15} w={bw} h={30} label={s} />
              {i < steps.length - 1 && <Arrow x1={x + bw} y1={30} x2={x + bw + gap} y2={30} />}
            </g>
          );
        })}
      </svg>
    );
  } else if (cluster) {
    // link-analysis (default): offender ↔ cases ↔ districts
    title = `Link chart — ${cluster.label}`;
    const cx = W / 2, cy = 22;
    const cases = cluster.members.slice(0, 5);
    body = (
      <svg viewBox={`0 0 ${W} 150`} width="100%">
        {defs}
        {cases.map((m, i) => {
          const x = 30 + i * ((W - 60) / Math.max(1, cases.length - 1)); const y = 90;
          return <line key={i} x1={cx} y1={cy + 12} x2={x} y2={y} stroke={LINE} strokeWidth={1} />;
        })}
        <Box x={cx - 60} y={cy} w={120} h={26} label={cluster.offender ?? "Offender"} fill="#1f2b45" />
        {cases.map((m, i) => {
          const x = 30 + i * ((W - 60) / Math.max(1, cases.length - 1));
          return (
            <g key={m.caseNo}>
              <circle cx={x} cy={90} r={6} fill={m.solved ? "#4ade80" : AC} />
              <text x={x} y={108} textAnchor="middle" fontSize="7" fill={TX}>{m.caseNo.slice(-6)}</text>
              <text x={x} y={118} textAnchor="middle" fontSize="6.5" fill={MU}>{m.district.slice(0, 8)}</text>
            </g>
          );
        })}
      </svg>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] p-2.5" style={{ background: BG }}>
      <div className="mb-1 text-[10px] font-medium text-[var(--color-text)]">📊 {title}</div>
      {body}
      <div className="mt-1 text-[8px] text-[var(--color-text-mute)]">Generated from case data · synthetic prototype</div>
    </div>
  );
}
