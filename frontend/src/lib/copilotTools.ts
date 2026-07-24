// Copilot tools — the agentic layer. GLM-4.7 function-calls these to ACT (not just answer):
// show something on the map, draw a diagram, draft a document, search cases. Executors return
// a short result string (fed back to the model) plus an optional UI directive the panel renders.
import type { ToolDef } from "@/lib/llm";
import type { Retrieved } from "@/lib/retrieval";

export type DiagramKind = "link" | "org" | "timeline" | "money" | "mo" | "other";
export type UiAction =
  | { kind: "map"; district?: string; clusterId?: string }
  | { kind: "diagram"; diagram: DiagramKind; mermaid?: string; title?: string; subject?: string; clusterId?: string }
  | { kind: "document"; docType: string; clusterId?: string; crimeNo?: string }
  | { kind: "navigate"; to: string; label: string };

export const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "show_on_map",
      description: "Highlight a district or a serial cluster's locations on the Command Map.",
      parameters: { type: "object", properties: {
        district: { type: "string", description: "district name" },
        clusterId: { type: "string", description: "serial cluster id like SC01" },
      } },
    },
  },
  {
    type: "function",
    function: {
      name: "make_diagram",
      description: "Draw a diagram and show it below. Use a core kind — link (relationship chart), org (gang org-chart), timeline (case timeline), money (money-trail), or mo (MO signature) — ONLY when the diagram is about ONE specific NETRA serial cluster or ring, and you MUST pass its clusterId; NETRA then builds it from the real case data (do not pass `mermaid` in this case). For EVERYTHING ELSE — a process/workflow flow, a concept, a comparison, or any custom diagram the user describes in their own terms (e.g. 'how an FIR moves through the courts') — set kind='other' and provide complete valid Mermaid code in `mermaid` (flowchart/sequence/timeline/mindmap/etc.), using ONLY facts present in the context (never invent FIR numbers, names or figures). When in doubt, prefer kind='other' with your own Mermaid.",
      parameters: { type: "object", properties: {
        kind: { type: "string", enum: ["link", "org", "timeline", "money", "mo", "other"] },
        title: { type: "string", description: "short title for the diagram" },
        clusterId: { type: "string", description: "serial cluster id like SC01 if about a series" },
        subject: { type: "string", description: "what the diagram is about" },
        mermaid: { type: "string", description: "complete Mermaid code, only for kind='other' or custom requests; no backtick fences" },
      }, required: ["kind"] },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_document",
      description: "Draft a police document (grounded, for human sign-off): fir, chargesheet, lookout_notice, summons, case_diary, seizure_memo, court_brief, daily_summary.",
      parameters: { type: "object", properties: {
        docType: { type: "string", enum: ["fir", "chargesheet", "lookout_notice", "summons", "case_diary", "seizure_memo", "court_brief", "daily_summary"] },
        clusterId: { type: "string" }, crimeNo: { type: "string" },
      }, required: ["docType"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_cases",
      description: "Search the FIR register by crime type, district, year or status.",
      parameters: { type: "object", properties: {
        crimeType: { type: "string" }, district: { type: "string" }, year: { type: "string" }, status: { type: "string" },
      } },
    },
  },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
export function runTool(name: string, args: any, hits: Retrieved[]): { result: string; ui?: UiAction } {
  const clusterId = args.clusterId || (hits.find((h) => h.meta.clusterId)?.meta.clusterId as string | undefined);
  switch (name) {
    case "show_on_map":
      return { result: `Highlighted ${args.district || clusterId || "the area"} on the Command Map.`,
        ui: { kind: "map", district: args.district, clusterId } };
    case "make_diagram":
      return { result: `Rendered the diagram below.`,
        ui: { kind: "diagram", diagram: args.kind || "other", mermaid: args.mermaid, title: args.title, subject: args.subject, clusterId } };
    case "draft_document":
      return { result: `Drafted a ${String(args.docType).replace(/_/g, " ")} below (review before use).`,
        ui: { kind: "document", docType: args.docType, clusterId, crimeNo: args.crimeNo } };
    case "search_cases": {
      const f = [args.crimeType, args.district, args.year, args.status].filter(Boolean).join(" · ");
      return { result: `Opening Case Search filtered by ${f || "your criteria"}.`,
        ui: { kind: "navigate", to: "/cases", label: `Search: ${f || "cases"}` } };
    }
    default:
      return { result: "Unknown tool." };
  }
}
