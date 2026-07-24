// NETRA Copilot engine v2 — the "ask anything" brain. Retrieves grounded knowledge cards
// (hybrid dense+BM25) + a knowledge-graph subgraph, then GLM-4.7 composes a cited answer
// constrained to that evidence. If the sovereign LLM is unavailable, a deterministic
// template composer answers from the same cards — so it never hallucinates and never fails.
import { retrieve, confidenceFrom, preloadRetrieval, type Retrieved } from "@/lib/retrieval";
import { graphContext, preloadGraph } from "@/lib/graph";
import { glmChat, type ToolDef, type ToolCall, type LlmMsg } from "@/lib/llm";
import { TOOLS, runTool, type UiAction } from "@/lib/copilotTools";
import { preloadEmbedder } from "@/lib/embedMatch";
import { recallMemory } from "@/lib/feedback";

export interface NetraAnswer {
  text: string;
  cites: string[];
  cardIds: string[];     // retrieved card ids → feedback learning-to-rank
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

// Persona for conversational turns. The hard rule here is anti-repetition: without it, GLM
// re-lists its whole capability menu on every "you sure?" / "how can you help" turn (it mimics
// its own earlier long answers in the history). Answer the ACTUAL message, briefly.
const CONV_SYS = `You are NETRA, an AI crime-intelligence assistant for the Karnataka State Police — warm, concise, human. This turn is conversational (a greeting, small-talk, or a question about you).
RULES — follow strictly:
- Answer the user's ACTUAL message directly, in 1–3 short sentences. Reply in their language (English or Kannada).
- If the conversation history shows you have ALREADY described your abilities, do NOT list them again. Just answer the point ("Yes, I'm sure." / "Happy to help — which case are you on?") and, at most, suggest ONE concrete next step.
- Give a short capability overview ONLY if the user explicitly asks what you can do AND you have not already given one this conversation. Even then: 2–3 sentences of prose, never a numbered feature menu.
- Never invent crime facts, names, FIR numbers or statistics.
For your reference (do NOT recite as a list): you answer grounded questions on hotspots, serial clusters, rings & kingpins, cold cases and districts with citations; draw diagrams; draft police documents for sign-off; read scanned documents. Everything runs in the police cloud.`;

// True for greetings / small-talk / questions about the assistant — NOT data questions.
const DATA_HINT = /(hotspot|forecast|next week|predict|patrol|serial|cluster|link|kingpin|ring|gang|network|cold|undetected|unsolved|worklist|district|clock|peak|rossmo|strike|arrest|clear|burglar|theft|fraud|snatch|murder|robber|chargesheet|\bfir\b|\bcase|draft|diagram|chart|\bmap\b|offender|detection|heinous|\bstat|\bsc\d{2}\b|\d{6,})/i;
function isConversational(q: string): boolean {
  const s = q.toLowerCase().trim();
  if (DATA_HINT.test(s)) return false; // a real data question always wins
  const words = s.split(/\s+/).filter(Boolean);
  // Robust catch-all: a SHORT turn with no data-domain term is almost always a greeting,
  // small-talk, or a meta follow-up ("you sure?", "how can you hep me", "and then?"). Chatting
  // beats retrieving here — the old brittle keyword list mis-routed these into data search,
  // which returned irrelevant cards and made GLM dump a capabilities menu with a ⚠️ warning.
  if (words.length <= 6) return true;
  return /^(hi|hello|hey|yo|hola|namaste|namaskara|sup|good (morning|evening|afternoon))\b/.test(s)
    || /(what can you|what do you do|what are you|who are you|who (made|built)|can you (help|hep)|\b(help|hep) me|how are you|how'?s it going|are you (there|real|sure|an ai)|introduce|your name|thank|thanks|thx|goodbye|see you|nice|cool|great job|well done|good job|awesome|hmm|okay\b|test\b|you sure|really|promise|certain|confident|useful)/.test(s)
    || /^(ok|k|bye|hm+)\b/.test(s) || s.length < 3;
}

type Turn = { role: "user" | "netra"; text: string };
const toMsgs = (h: Turn[]): LlmMsg[] => h.slice(-6).map((t) => ({ role: t.role === "netra" ? "assistant" : "user", content: t.text }));

export async function askNetra(query: string, scope: string | null, opts: { thinking?: boolean; history?: Turn[] } = {}): Promise<NetraAnswer> {
  const hist = toMsgs(opts.history ?? []);
  const followDefault = ["Which hotspots next week?", "Who are the crime kingpins?", "Cases at risk of going cold?"];

  // Conversational turn → natural GLM reply, no retrieval, no confidence gate.
  if (isConversational(query)) {
    try {
      const r = await glmChat([{ role: "system", content: CONV_SYS }, ...hist, { role: "user", content: query }], { max_tokens: 160, temperature: 0.6 });
      if (r.text.trim())
        return { text: r.text, cites: [], cardIds: [], confidence: 1, grounded: true, actions: [], trace: ["conversational"], follow: followDefault };
    } catch { /* fall through to a simple non-LLM reply */ }
    return { text: "Hi — I'm NETRA. Ask me about hotspots, serial series, rings & kingpins, cold cases or any district; I can also draw diagrams and draft documents.", cites: [], cardIds: [], confidence: 1, grounded: false, actions: [], trace: [], follow: followDefault };
  }

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
    const msgs: LlmMsg[] = [
      { role: "system", content: SYS },
      ...hist,
      { role: "user", content: `${context}\n\nQUESTION: ${query}` },
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

  const prior = recallMemory(query);
  if (prior) trace.push("🧠 Recognised from a prior confirmed answer (memory) — ranking reinforced");

  const cites = [...new Set(hits.slice(0, 5).map((h) => h.cite))];
  return { text, cites, cardIds: hits.map((h) => h.id), confidence, follow: suggestFollow(hits), trace, actions, grounded };
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
