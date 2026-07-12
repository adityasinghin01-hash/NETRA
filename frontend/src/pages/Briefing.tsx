import { useState } from "react";
import { useApi, Card, PageHeader, State } from "@/components/ui";

interface Brief {
  district: string;
  date: string;
  en: string;
  kn: string;
}

export default function Briefing() {
  const { data, loading, error } = useApi<Brief>("/briefings/today");
  const [lang, setLang] = useState<"en" | "kn">("en");

  return (
    <div>
      <PageHeader
        title="AI Daily Briefing"
        desc={data ? `${data.district} · ${data.date}` : undefined}
        right={
          <div className="flex overflow-hidden rounded-lg border border-[var(--color-border)]">
            {(["en", "kn"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-3 py-1 text-sm ${lang === l ? "bg-[var(--color-accent)] text-[var(--color-bg)]" : "text-[var(--color-text-dim)]"}`}
              >
                {l === "en" ? "EN" : "ಕನ್ನಡ"}
              </button>
            ))}
          </div>
        }
      />
      <State loading={loading} error={error}>
        {data && (
          <Card className="mx-auto max-w-2xl p-8">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-semibold">Morning Brief — {data.district}</div>
              <button className="rounded-lg border border-[var(--color-border-strong)] px-3 py-1 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-accent)]">
                Download PDF
              </button>
            </div>
            <p className="text-sm leading-relaxed text-[var(--color-text-dim)]">{lang === "en" ? data.en : data.kn}</p>
            <div className="mt-6 text-[10px] text-[var(--color-text-mute)]">
              AI-generated (Catalyst QuickML) · decision support, human-in-the-loop · Phase 2 wires live generation + PDF
            </div>
          </Card>
        )}
      </State>
    </div>
  );
}
