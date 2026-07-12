import { useApi, Card, PageHeader, State } from "@/components/ui";

interface Outcome {
  districtId: number;
  name: string;
  chargesheeted: number;
  false: number;
  undetected: number;
  undetectedPct: number;
}

function Bar({ a, b, c }: { a: number; b: number; c: number }) {
  const tot = a + b + c || 1;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
      <div style={{ width: `${(a / tot) * 100}%` }} className="bg-[var(--color-ok)]" title={`Chargesheeted ${a}`} />
      <div style={{ width: `${(b / tot) * 100}%` }} className="bg-[var(--color-text-mute)]" title={`False ${b}`} />
      <div style={{ width: `${(c / tot) * 100}%` }} className="bg-[var(--color-danger)]" title={`Undetected ${c}`} />
    </div>
  );
}

export default function Analytics() {
  const { data, loading, error } = useApi<Outcome[]>("/stats/outcomes");
  const rows = (data ?? []).slice().sort((a, b) => b.undetectedPct - a.undetectedPct);

  return (
    <div>
      <PageHeader title="District Analytics" desc="Case outcomes — chargesheeted (A) / false (B) / undetected (C)" />
      <div className="mb-3 flex gap-4 text-xs text-[var(--color-text-dim)]">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[var(--color-ok)]" /> Chargesheeted</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[var(--color-text-mute)]" /> False</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[var(--color-danger)]" /> Undetected</span>
      </div>
      <Card className="p-4">
        <State loading={loading} error={error} empty={rows.length === 0}>
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
                  <td className="w-1/2 py-2.5 pr-6"><Bar a={r.chargesheeted} b={r.false} c={r.undetected} /></td>
                  <td className="tnum py-2.5 text-right text-[var(--color-text)]">{r.undetectedPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </State>
      </Card>
      <p className="mt-3 text-xs text-[var(--color-text-mute)]">
        Trends (time series + anomalies) and the offender network graph are added as tabs here in Phase 2.
      </p>
    </div>
  );
}
