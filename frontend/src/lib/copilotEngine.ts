// NETRA Copilot engine v2 — the "ask anything" brain. Retrieves grounded knowledge cards
// (hybrid dense+BM25) + a knowledge-graph subgraph, then GLM-4.7 composes a cited answer
// constrained to that evidence. If the sovereign LLM is unavailable, a deterministic
// template composer answers from the same cards — so it never hallucinates and never fails.
import { retrieve, confidenceFrom, preloadRetrieval, type Retrieved } from "@/lib/retrieval";
import { graphContext, preloadGraph } from "@/lib/graph";
import { glmChat, type ToolDef, type ToolCall } from "@/lib/llm";
import { TOOLS, runTool, type UiAction } from "@/lib/copilotTools";
import { preloadEmbedder } from "@/lib/embedMatch";

export interface NetraAnswer {
  text: string;
  cites: string[];
  confidence: number;
  follow: string[];
  trace: string[];       // reasoning / tool-call trace shown in the UI
  actions: UiAction[];   // diagram / map / document directives for the component
  grounded: boolean;     // true = GLM, false = sovereign fallback
}

export function preloadCopilot() { preloadRetrieval(); preloadGraph(); preloadEmbedder(); }

const SYS = `You are NETRA, a crime-intelligence assistant for the Karnataka State Police.
Rules:
- Answer ONLY from the CONTEXT provided. If the answer is not in the context, say "I don't hold that in the records" — never invent facts, FIR numbers, names or statistics.
- Cite the sources you use with their [label] in square brackets, inline.
- Be concise and operational, like briefing an officer. Reply in the user's language (English or Kannada).
- Never profile by caste, religion or occupation. Predict places and patterns, not a person's guilt.
- When the user asks to DRAW/SHOW a diagram, MAP something, or DRAFT a document, call the matching tool.`;

function buildContext(hits: Retrieved[], facts: string[] | null): string {
  const cards = hits.map((h) => `[${h.cite}] ${h.title}: ${h.text}`).join("\n");
  const graph = facts && facts.length ? `\n\nRELATIONSHIPS (knowledge graph):\n- ${facts.join("\n- ")}` : "";
  return `CONTEXT:\n${cards}${graph}`;
}

// Sovereign fallback: compose a readable, cited answer straight from the top cards.
function sovereignAnswer(hits: Retrieved[], facts: string[] | null): string {
  if (!hits.length) return "I don't hold anything on that in the records. Try asking about hotspots, a serial series, a district, crime rings, or cases at risk of going cold.";
  const lead = hits[0];
  let out = `${lead.text} [${lead.cite}]`;
  const extra = hits.slice(1, 3).filter((h) => h.type !== lead.type);
  for (const h of extra) out += `\n\n${h.title}: ${h.text} [${h.cite}]`;
  if (facts && facts.length) out += `\n\nConnections: ${facts.slice(0, 3).join(" ")}`;
  return out;
}

function suggestFollow(hits: Retrieved[]): string[] {
  const s = new Set<string>();
  for (const h of hits.slice(0, 4)) {
    if (h.type === "cluster") { s.add("Draw the link chart for this series"); s.add("Where will they strike next?"); }
    else if (h.type === "ring") s.add("Who are the crime kingpins?");
    else if (h.type === "district" || h.type === "hotspot") s.add(`Cases at risk of going cold in ${(h.meta.district as string) ?? "this district"}?`);
    else if (h.type === "coldcase") s.add("Which hotspots next week?");
  }
  return [...s].slice(0, 3);
}

export async function askNetra(query: string, scope: string | null, opts: { thinking?: boolean } = {}): Promise<NetraAnswer> {
  // Scope-aware retrieval: fold the user's district into the query when unstated.
  const rq = scope && !query.toLowerCase().includes(scope.toLowerCase()) ? `${query} ${scope}` : query;
  const [hits, graph] = await Promise.all([retrieve(rq, 8), graphContext(rq)]);
  const confidence = confidenceFrom(hits);
  const trace: string[] = [`Retrieved ${hits.length} grounded cards (hybrid dense+BM25)`];
  if (graph) trace.push(`Traversed knowledge graph: ${graph.entities.length} entities, ${graph.facts.length} relations`);
  const context = buildContext(hits, graph?.facts ?? null);
  const actions: UiAction[] = [];

  let text = "";
  let grounded = false;
  try {
    // GLM answers from context and may call action tools (map/diagram/document/search).
    // Tools are ACTIONS, not data the model needs back — so one call, execute, done.
    const msgs = [
      { role: "system" as const, content: SYS },
      { role: "user" as const, content: `${context}\n\nQUESTION: ${query}` },
    ];
    const first = await glmChat(msgs, { tools: TOOLS as ToolDef[], thinking: opts.thinking, max_tokens: 700 });
    grounded = true;
    for (const tc of (first.toolCalls ?? []) as ToolCall[]) {
      const { ui } = runTool(tc.function.name, safeArgs(tc.function.arguments), hits);
      trace.push(`🔧 ${tc.function.name}(${tc.function.arguments})`);
      if (ui) actions.push(ui);
    }
    text = first.text.trim() || actionLead(actions);
    if (!text.trim()) throw new Error("empty");
  } catch {
    grounded = false;
    text = sovereignAnswer(hits, graph?.facts ?? null);
    trace.push("⚠️ sovereign fallback (LLM unavailable) — answered from cards directly");
  }

  // Confidence gate → honest escalation.
  if (confidence < 0.12 && hits.length) {
    text = `⚠️ I'm not fully confident on this — here's the closest I found; please verify with a human.\n\n${text}`;
    trace.push(`Low confidence (${confidence.toFixed(2)}) → flagged for human review`);
  }

  const cites = [...new Set(hits.slice(0, 5).map((h) => h.cite))];
  return { text, cites, confidence, follow: suggestFollow(hits), trace, actions, grounded };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeArgs(s: string): any { try { return JSON.parse(s); } catch { return {}; } }

// If GLM only returned tool calls with no prose, write a short lead-in.
function actionLead(actions: UiAction[]): string {
  const a = actions[0];
  if (!a) return "";
  if (a.kind === "diagram") return `Here's the ${a.diagram === "link" ? "link chart" : a.diagram + " diagram"} — generated from the case data.`;
  if (a.kind === "document") return `I've drafted the ${a.docType.replace(/_/g, " ")} below — review before use.`;
  if (a.kind === "map") return "Showing it on the Command Map.";
  if (a.kind === "navigate") return `Opening ${a.label}.`;
  return "";
}
