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

const SYS = `You are NETRA, a crime-intelligence assistant for the Karnataka State Police. You are briefing an officer who is short on time.

GROUNDING & HONESTY (non-negotiable):
- Answer ONLY from the CONTEXT provided. If it is not there, say "I don't hold that in the records" — never invent facts, FIR numbers, names or statistics.
- Cite sources inline with their [label]. Separate what the records SHOW (cite it) from what you INFER ("this suggests…", "likely…") and what you SUGGEST as a next step. Never present a guess as a record.
- Predict places and patterns, never a person's guilt. Never profile by caste, religion or occupation.

HOW TO ANSWER — match the shape to the question:
- Factual / lookup → lead with the answer, then brief support + citation. No preamble, no restating the question.
- "How do I / steps" → concise numbered steps.
- Advice / open ("what should I do", "where to focus") → your recommendation first, then the 2-3 real options with their trade-offs.
- Yes/no → open with the yes or no, then the reason.
- Be as short as the question allows; expand only when asked or genuinely needed.

TONE:
- Warm, plain, professional. Reply in the user's language (English or Kannada).
- Never flatter or pad ("great question", "certainly"). Do NOT use emojis.
- Be firm when it matters: if asked to fabricate data, skip human verification, or treat a low-confidence result as fact, decline plainly and say why. Flag risk directly.

- When the user asks to DRAW/SHOW a diagram, MAP something, or DRAFT a document, call the matching tool — do not describe it in prose.`;

// Lightweight intent-steer: GLM-4.7 is too small to reliably self-select register, so we classify
// the turn and hand it one line telling it the response shape. Cheap (regex), no extra latency.
function styleSteer(q: string): string {
  const s = q.toLowerCase().trim();
  if (/\b(how (do|can|should) i|how to|steps|step by step|walk me|procedure|process)\b/.test(s))
    return "Answer as concise numbered steps.";
  if (/\b(should i|which|what should|where (should|to)|recommend|best|worth|better|prioriti|advice|help me decide|what do you think)\b/.test(s))
    return "Give your recommendation first, then 2-3 real options with their trade-offs.";
  if (/^(is|are|can|does|do|should|will|did|was|were|has|have|any)\b/.test(s))
    return "Open with a direct yes or no, then the reason.";
  return "Answer directly — lead with the fact and its citation, no preamble.";
}

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
- If the user asks you to draft/write/generate a police document (FIR, charge-sheet, notice, etc.), do NOT write the document text here. Say briefly you'll prepare it and ask them to name the document + series/case (e.g. "draft an FIR for the shutter-cutting series") so it renders as an editable draft.
- Never invent crime facts, names, FIR numbers or statistics. Never flatter or pad. Do NOT use emojis.
For your reference (do NOT recite as a list): you answer grounded questions on hotspots, serial clusters, rings & kingpins, cold cases and districts with citations; draw diagrams; draft police documents for sign-off; read scanned documents. Everything runs in the police cloud.`;

// When the user explicitly asks to EXPAND ("in detail", "one by one", "more"), a fuller, organised
// answer is wanted — the brevity rule above would otherwise clip it to one unhelpful sentence.
const CONV_SYS_DETAIL = `You are NETRA, an AI crime-intelligence assistant for the Karnataka State Police. The user is explicitly asking you to explain — in detail — what you can do (or to expand a point you made). Give a clear, well-organised answer: a short lead-in, then a tidy numbered/bulleted breakdown is welcome here. Be specific and concrete. Do NOT invent crime facts, names, FIR numbers or statistics. Do NOT use emojis. Reply in the user's language.`;
const ELABORATE = /\b(in detail|detailed|in depth|elaborate|expand|one by one|point by point|more detail|tell me more|explain|breakdown|break it down|list (them|out)|full list|everything)\b/i;

// Document drafting intent — routed to the TOOL path so the draft renders as a document card,
// never as raw text in a chat bubble.
const DOC_NOUN = /(f\.?i\.?r\b|first information report|charge ?sheet|look-?out notice|summons|seizure memo|panchnama|case diary|court brief|daily summary|\bmemo\b|\bnotice\b|\bdocument\b|\breport\b)/i;
const DOC_VERB = /\b(draft|generate|create|make|prepare|write|issue|produce|give me)\b/i;
// A short affirmation/deferral continuing a task the assistant just offered ("you decide", "yes",
// "go ahead", "all of them") — context matters, so it's evaluated against the previous reply.
const DEFER = /^(you (decide|choose|pick|fill|do)|yes|yep|yeah|ok(ay)?|sure|go ahead|please do|do it|proceed|whatever|any(thing)?|all of (them|it))\b/i;
// True if the previous assistant turn asked the user for details to draft a document.
function pendingDocDraft(prevNetra: string): boolean {
  return DOC_NOUN.test(prevNetra) && /(provide|share|detail|following|need|so i can)/i.test(prevNetra);
}

// True for greetings / small-talk / questions about the assistant — NOT data questions.
const DATA_HINT = /(hotspot|forecast|next week|predict|patrol|serial|cluster|link|kingpin|ring|gang|network|cold|undetected|unsolved|worklist|district|clock|peak|rossmo|strike|arrest|clear|burglar|theft|fraud|snatch|murder|robber|chargesheet|\bfir\b|\bcase|draft|diagram|chart|\bmap\b|offender|detection|heinous|\bstat|\bsc\d{2}\b|\d{6,})/i;
function isConversational(q: string, prevNetra = ""): boolean {
  const s = q.toLowerCase().trim();
  // A short "you decide / yes / go ahead" that continues a document the assistant just offered to
  // draft is NOT small-talk — it belongs on the tool path so a document card renders (issue #3/#4).
  if (DEFER.test(s) && pendingDocDraft(prevNetra)) return false;
  if (DATA_HINT.test(s)) return false; // a real data question always wins
  // Capability / "what can you do" questions — robust to typos & length. These must never reach
  // data retrieval (which slaps a ⚠️ warning and irrelevant citations on a "what can you do" turn).
  if (/(what|which|how|list|tell|show|give).{0,25}(you|u|netra).{0,10}(do|can|help|offer|handle|able|assist|capab)/i.test(s)
    || /\bcapabilit|\babilities\b|\bfeatures?\b/i.test(s)) return true;
  const words = s.split(/\s+/).filter(Boolean);
  // Robust catch-all: a SHORT turn with no data-domain term is almost always a greeting,
  // small-talk, or a meta follow-up ("you sure?", "how can you hep me", "and then?").
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
  const prevNetra = [...(opts.history ?? [])].reverse().find((t) => t.role === "netra")?.text ?? "";

  // Conversational turn → natural GLM reply, no retrieval, no confidence gate. Elaboration
  // requests ("in detail", "one by one") get a fuller, organised answer instead of one clipped line.
  if (isConversational(query, prevNetra)) {
    const detail = ELABORATE.test(query);
    try {
      const r = await glmChat(
        [{ role: "system", content: detail ? CONV_SYS_DETAIL : CONV_SYS }, ...hist, { role: "user", content: query }],
        { max_tokens: detail ? 550 : 160, temperature: 0.6 }
      );
      if (r.text.trim())
        return { text: r.text, cites: [], cardIds: [], confidence: 1, grounded: true, actions: [], trace: [detail ? "conversational · detailed" : "conversational"], follow: followDefault };
    } catch { /* fall through to a simple non-LLM reply */ }
    return { text: "Hi — I'm NETRA. Ask me about hotspots, serial series, rings & kingpins, cold cases or any district; I can also draw diagrams and draft documents.", cites: [], cardIds: [], confidence: 1, grounded: false, actions: [], trace: [], follow: followDefault };
  }

  // Document intent (explicit, or a "you decide" continuation of a draft the assistant offered) →
  // force the make_document tool so the draft renders as a card, never as raw text in the bubble.
  const isDocIntent = (DOC_VERB.test(query) && DOC_NOUN.test(query))
    || (DEFER.test(query.toLowerCase().trim()) && pendingDocDraft(prevNetra));

  // Scope-aware retrieval: fold the user's district into the query when unstated.
  const rq = scope && !query.toLowerCase().includes(scope.toLowerCase()) ? `${query} ${scope}` : query;
  // Retrieval/embedding can throw (model or index load failure). It must degrade, not propagate:
  // on failure we continue with an empty set so sovereignAnswer still returns a reply — honouring
  // the "never fails" contract instead of letting askNetra throw.
  let hits: Retrieved[] = [];
  let graph: Awaited<ReturnType<typeof graphContext>> = null;
  try {
    [hits, graph] = await Promise.all([retrieve(rq, 8), graphContext(rq)]);
  } catch { /* degrade to empty-context sovereign answer below */ }
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
    const docHint = isDocIntent
      ? `\n\n(The user wants a police document drafted. Call the make_document tool with the right document type — do NOT write the document text in your reply; the tool renders it. Use [officer to verify] for anything not in the records; never invent facts.)`
      : `\n\n(Style: ${styleSteer(query)})`;
    const msgs: LlmMsg[] = [
      { role: "system", content: SYS },
      ...hist,
      { role: "user", content: `${context}\n\nQUESTION: ${query}${docHint}` },
    ];
    const first = await glmChat(msgs, { tools: TOOLS as ToolDef[], thinking: opts.thinking, max_tokens: 700 });
    grounded = true;
    for (const tc of (first.toolCalls ?? []) as ToolCall[]) {
      const { ui } = runTool(tc.function.name, safeArgs(tc.function.arguments), hits);
      trace.push(`${tc.function.name}(${tc.function.arguments})`);
      if (ui) actions.push(ui);
    }
    text = first.text.trim() || actionLead(actions);
    if (!text.trim()) throw new Error("empty");
  } catch {
    grounded = false;
    text = sovereignAnswer(hits, graph?.facts ?? null);
    trace.push("Sovereign fallback (LLM unavailable) — answered from cards directly");
  }

  // Confidence gate → honest escalation, but ONLY on a genuine data lookup with no action. A meta
  // question or a document/diagram action should never carry a "not confident" warning or
  // irrelevant citations (issue #2 — the ⚠️ that appeared on "what can you do").
  const isDataQ = DATA_HINT.test(query);
  if (isDataQ && !actions.length && confidence < 0.12 && hits.length) {
    text = `⚠️ I'm not fully confident on this — here's the closest I found; please verify with a human.\n\n${text}`;
    trace.push(`Low confidence (${confidence.toFixed(2)}) → flagged for human review`);
  }

  const prior = recallMemory(query);
  if (prior) trace.push("Recognised from a prior confirmed answer (memory) — ranking reinforced");

  const cites = isDataQ ? [...new Set(hits.slice(0, 5).map((h) => h.cite))] : [];
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
