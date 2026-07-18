// Copilot tools — the agentic layer. GLM-4.7 function-calls these to ACT (not just answer):
// show something on the map, draw a diagram, draft a document, search cases. Executors return
// a short result string (fed back to the model) plus an optional UI directive the panel renders.
import type { ToolDef } from "@/lib/llm";
import type { Retrieved } from "@/lib/retrieval";

export type UiAction =
  | { kind: "map"; district?: string; clusterId?: string }
  | { kind: "diagram"; diagram: "link" | "org" | "timeline" | "money" | "mo"; subject?: string; clusterId?: string }
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
      description: "Draw a police diagram from case data: link-analysis chart, gang org-chart, case timeline, money-trail, or MO flow.",
      parameters: { type: "object", properties: {
        kind: { type: "string", enum: ["link", "org", "timeline", "money", "mo"] },
        clusterId: { type: "string", description: "serial cluster id if about a series" },
        subject: { type: "string", description: "what the diagram is about" },
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
      return { result: `Generated a ${args.kind} diagram below.`,
        ui: { kind: "diagram", diagram: args.kind, subject: args.subject, clusterId } };
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
