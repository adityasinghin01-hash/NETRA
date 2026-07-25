// NETRA Copilot engine v2 — the "ask anything" brain. Retrieves grounded knowledge cards
// (hybrid dense+BM25) + a knowledge-graph subgraph, then GLM-4.7 composes a cited answer
// constrained to that evidence. If the sovereign LLM is unavailable, a deterministic
// template composer answers from the same cards — so it never hallucinates and never fails.
import { retrieve, confidenceFrom, preloadRetrieval, allCards, type Retrieved, type Card } from "@/lib/retrieval";
import { graphContext, preloadGraph } from "@/lib/graph";
import { glmChat, type ToolDef, type ToolCall, type LlmMsg } from "@/lib/llm";
import { TOOLS, runTool, type UiAction } from "@/lib/copilotTools";
import { preloadEmbedder } from "@/lib/embedMatch";
import { recallMemory } from "@/lib/feedback";
import { lookupFir } from "@/api/client";
import { DISTRICTS } from "@/lib/auth";

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

DOMAIN NOTES (get these right):
- "High alert / most at-risk / where to focus enforcement" = the districts under the most crime PRESSURE — a rising trend, active alerts, or high forecast risk — NOT the district with the best detection rate. A high detection rate is good performance, not a reason to raise an alert.
- An offender named as a series' "shared hand" is the common thread the linked FIRs point to (an investigative LEAD from shared MO + co-accused analysis) — name the specific FIRs they connect. Their offender-network "case count" (total cases on record) can exceed the linked-series FIR count; distinguish the two, and never deny the link just because no single FIR is formally "filed on" them.
- For a specific FIR number: use the FIR RECORD in the context if one is present and answer from it. If it is not there, say it isn't in what you can pull in chat and point the officer to Case Search — do NOT imply the FIR does not exist.
- Evidence custody is PER-FIR: each FIR's seized property sits in its OWN police-station malkhana (district-specific), under its own register number. Linked FIRs in a series do NOT share one custody entry — if asked "why the same custody", correct the premise; never invent a shared custody date.

HOW TO ANSWER — match the shape to the question:
- Factual / lookup → lead with the answer, then brief support + citation. No preamble, no restating the question.
- "How do I / steps" → concise numbered steps.
- Advice / open ("what should I do", "where to focus") → your recommendation first, then the 2-3 real options with their trade-offs.
- Yes/no → open with the yes or no, then the reason.
- Be as short as the question allows; expand only when asked or genuinely needed.
- Answer THE CURRENT question using THIS turn's CONTEXT. NEVER repeat a previous turn's answer verbatim or near-verbatim: a different question demands a different answer with different specifics. E.g. "which district is on high alert" (crime pressure/active alerts) and "which district is best on detection" (highest detection rate) are DIFFERENT questions with DIFFERENT answers — do not reuse an earlier reply.

TONE:
- Warm, plain, professional. Reply in the user's language (English or Kannada).
- Never flatter or pad ("great question", "certainly"). Do NOT use emojis.
- Be firm when it matters: if asked to fabricate data, skip human verification, or treat a low-confidence result as fact, decline plainly and say why. Flag risk directly.

- When the user asks to DRAW/SHOW a diagram, MAP something, or DRAFT a document, call the matching tool — do not describe it in prose.
- You CAN draw AND re-draw/convert diagrams (link chart, timeline, org chart, MO, money-trail) with make_diagram — including "make it a timeline" or "show it as a chart" (call make_diagram again with the new kind, same clusterId). NEVER claim you cannot generate diagrams, timelines or visualizations.`;

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
const DOC_NOUN = /(f\.?i\.?r\b|first information report|charge ?sheet|look-?out notice|summons|seizure memo|panchnama|case diary|court brief|daily[ \w]*summary|crime summary|\bmemo\b|\bnotice\b|\bdocument\b|\breport\b)/i;
const DOC_VERB = /\b(draft|generate|create|make|prepare|write|issue|produce|give me)\b/i;

// Case-Search navigation intent + a crime-term → exact crimeSubHead map (the Cases table matches the
// subhead exactly, so "burglary" must become "House-Breaking & Burglary"). Handled deterministically
// because the model doesn't reliably call search_cases and free text wouldn't match the enum.
const SEARCH_INTENT = /(\b(search|find|look ?up|pull up|list|show me all|open|filter)\b[^]{0,40}\b(cases?|firs?|register)\b)|\bcase search\b/i;
const CRIME_ALIASES: [RegExp, string][] = [
  [/burglar|house-?break/i, "House-Breaking & Burglary"],
  [/\b(mv|motor[- ]?vehicle|vehicle|bike|two-?wheeler)\b[^]{0,10}theft/i, "Motor Vehicle Theft"],
  [/otp|online[^]{0,10}fraud|\bupi\b|cyber/i, "Online Financial Fraud"],
  [/cheat|\bfraud\b/i, "Cheating & Fraud"],
  [/snatch|chain|\brobber/i, "Robbery"],
  [/ndps|\bdrug|ganja/i, "NDPS (Drugs)"],
  [/\bmurder/i, "Murder"],
  [/theft|steal|\bstolen\b/i, "Theft (Ordinary)"],
];
// Diagram / re-draw intent — including CONVERT phrasings ("make it a timeline", "show as a chart")
// that don't say "draw", so the model reliably calls make_diagram instead of refusing in prose.
const DIAGRAM_INTENT = /\b(draw|chart|diagram|timeline|flow ?chart|org ?chart|link chart|mind ?map|visuali[sz]e|\bplot\b|make it (a|an|into)|convert (it )?(to|into)|turn it into|redraw|re-?draw|show (it |them )?as)\b/i;

// Map a request to a CORE diagram kind (built deterministically from real case data). Order matters:
// specific kinds before the generic "link"/"chart" fallback.
function coreDiagramKind(q: string): "link" | "org" | "timeline" | "money" | "mo" | null {
  const s = q.toLowerCase();
  if (/\btimeline\b/.test(s)) return "timeline";
  if (/\b(org|organi[sz]ation|gang|hierarchy|kingpin|command)\b/.test(s)) return "org";
  if (/\b(money|transaction|financial|cash|fund|trail)\b/.test(s)) return "money";
  if (/\b(modus|\bmo\b|signature|method)\b/.test(s)) return "mo";
  if (/\b(link|relationship|connection|network|chart)\b/.test(s)) return "link";
  return null;
}
// A short affirmation/deferral continuing a task the assistant just offered ("you decide", "yes",
// "go ahead", "all of them") — context matters, so it's evaluated against the previous reply.
const DEFER = /^(you (decide|choose|pick|fill|do)|yes|yep|yeah|ok(ay)?|sure|go ahead|please do|do it|proceed|whatever|any(thing)?|all of (them|it))\b/i;
// True if the previous assistant turn asked the user for details to draft a document.
function pendingDocDraft(prevNetra: string): boolean {
  return DOC_NOUN.test(prevNetra) && /(provide|share|detail|following|need|so i can)/i.test(prevNetra);
}

// True for greetings / small-talk / questions about the assistant — NOT data questions.
const DATA_HINT = /(hotspot|forecast|next week|predict|patrol|serial|cluster|link|kingpin|ring|gang|network|cold|undetected|unsolved|worklist|district|clock|peak|rossmo|strike|arrest|clear|burglar|theft|fraud|snatch|murder|robber|chargesheet|\bfir\b|\bcase|draft|diagram|chart|\bmap\b|offender|detection|heinous|\bstat|\bsc\d{2}\b|\d{6,})/i;
// A short follow-up that CONTINUES the prior topic ("tell me more", "aur batao", "why?", "go on",
// Hinglish included). On its own it looks like small-talk; after a data answer it must stay on the
// data path so the series/offender thread survives instead of collapsing to "I am here to help".
const CONTINUATION = /^(aur\s*(batao|bata|kya|dikhao|sunao)?|(tell me|show me|explain)( more| about (it|this|that|him|her|them))?|more|go on|continue|and (then|now|more)|iske|uske|why\b|how (come|so)|kyu+n?|kaise|elaborate|expand|in detail|detail|iska)\b/i;

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
// Feed history back for continuity, but CAP prior assistant turns: the model was echoing a previous
// verbose "recommendation + options" block verbatim for a differently-worded follow-up. Trimming the
// assistant text removes the block to copy while keeping enough (the lead + entities) for continuity;
// the active entity + retrieval re-supply full detail each turn anyway.
const toMsgs = (h: Turn[]): LlmMsg[] => h.slice(-6).map((t) => ({
  role: t.role === "netra" ? "assistant" : "user",
  content: t.role === "netra" && t.text.length > 220 ? t.text.slice(0, 220) + " […]" : t.text,
}));

// ── Active-entity resolution ──────────────────────────────────────────────────
// The single source of truth for "which series/offender is this turn about". Without it, every
// short follow-up ("this series", "which is it", "his cases", "draw it") re-retrieves from scratch
// and lands on a random cluster — the root cause of the wrong-series jumps. Resolution is explicit
// and deterministic: an SCxx id, a distinctive title token, or a known offender name in the CURRENT
// query wins; a referential/continuation turn inherits the entity from recent history.
const REFERENTIAL = /\b(this|that|these|those|the series|the ring|the above|it|its|same|which is it|his|her|their|them|him|he|she)\b/i;

function resolveEntity(query: string, history: Turn[], cards: Card[], isCont: boolean): { clusterId?: string; offender?: string } {
  const clusters = cards.filter((c) => c.type === "cluster" && c.meta?.clusterId);
  // Distinctive title tokens: a word that appears in exactly ONE cluster title (so "shutter" → SC01,
  // but generic words shared across titles never mis-resolve).
  const tokenIds = new Map<string, Set<string>>();
  for (const c of clusters) {
    for (const w of String(c.title).toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length < 5) continue;
      (tokenIds.get(w) ?? tokenIds.set(w, new Set()).get(w)!).add(c.meta.clusterId as string);
    }
  }
  const distinct = new Map([...tokenIds].filter(([, s]) => s.size === 1).map(([w, s]) => [w, [...s][0]]));

  // explicitOnly=true drops the distinctive-title-token match, leaving only UNAMBIGUOUS references —
  // an SCxx id or an offender's name. History inheritance uses it so an incidental narrative word
  // (a FIR whose facts mention "farmhouse") can never resolve to a cluster ("Farmhouse dacoity gang").
  const find = (text: string, explicitOnly = false): { clusterId?: string; offender?: string } => {
    const s = text.toLowerCase();
    const m = s.match(/\bsc\s*0*(\d{1,2})\b/);
    if (m) { const id = "SC" + m[1].padStart(2, "0"); if (clusters.some((c) => c.meta.clusterId === id)) return { clusterId: id }; }
    if (!explicitOnly) {
      const words = new Set(s.split(/[^a-z0-9]+/));
      for (const [w, id] of distinct) if (words.has(w)) return { clusterId: id };
    }
    for (const c of clusters) { const off = String(c.meta.offender ?? "").toLowerCase(); if (off && s.includes(off)) return { clusterId: c.meta.clusterId as string, offender: c.meta.offender as string }; }
    return {};
  };

  // The CURRENT query may name the series any way (SCxx, a distinctive title token like "shutter", or
  // the offender) — all deliberate, so use the full matcher.
  const inQuery = find(query);
  if (inQuery.clusterId) return inQuery;
  // No entity named this turn → inherit the active one from history for a referential/continuation
  // follow-up, but ONLY from explicit references (never incidental words), and allow longer phrasings
  // ("…but earlier no FIR is filed on him — which is it?" is 16 words yet clearly referential).
  if (isCont || (REFERENTIAL.test(query) && query.split(/\s+/).length < 25)) {
    for (const t of [...history].reverse()) { const r = find(t.text, true); if (r.clusterId) return r; }
  }
  return {};
}

// The Copilot loses alert cards to the (higher-frequency) district card in ranked retrieval, so an
// explicit alert question gets the best-matching alert card injected directly.
function pickAlertCard(query: string, cards: Card[]): string {
  if (!/\b(alert|spike|surge|anomal|flag|flagged|spotted|emerging)\b/i.test(query)) return "";
  const words = query.toLowerCase().match(/[a-z]{4,}/g) || [];
  let best: Card | null = null, bestScore = 0;
  for (const c of cards) {
    if (c.type !== "alert") continue;
    const hay = `${c.title} ${c.text}`.toLowerCase();
    let sc = 0; for (const w of words) if (hay.includes(w)) sc++;
    if (sc > bestScore) { bestScore = sc; best = c; }
  }
  return best && bestScore >= 2 ? `[${best.cite}] ${best.title}: ${best.text}` : "";
}

export async function askNetra(query: string, scope: string | null, opts: { thinking?: boolean; history?: Turn[] } = {}): Promise<NetraAnswer> {
  const hist = toMsgs(opts.history ?? []);
  const followDefault = ["Which hotspots next week?", "Who are the crime kingpins?", "Cases at risk of going cold?"];
  const prevNetra = [...(opts.history ?? [])].reverse().find((t) => t.role === "netra")?.text ?? "";

  // A "tell me more"/"aur batao"/"why?" that continues a DATA answer is not small-talk — keep it on
  // the retrieval path with the prior entity folded in (see rq below), so the thread doesn't reset.
  const lastUserData = [...(opts.history ?? [])].reverse().find((t) => t.role === "user" && DATA_HINT.test(t.text))?.text ?? "";
  const isContinuation = CONTINUATION.test(query.trim()) && !!lastUserData && (/\[[^\]]+\]/.test(prevNetra) || DATA_HINT.test(prevNetra));

  // Conversational turn → natural GLM reply, no retrieval, no confidence gate. Elaboration
  // requests ("in detail", "one by one") get a fuller, organised answer instead of one clipped line.
  // A short diagram/re-draw request ("make it a timeline") has no data keyword and would otherwise
  // be misread as small-talk and answered in prose — force it onto the grounded/diagram path.
  if (isConversational(query, prevNetra) && !isContinuation && !DIAGRAM_INTENT.test(query)) {
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

  // Resolve the ACTIVE entity (series/offender) so referential follow-ups and tool calls stay on the
  // subject in play instead of re-retrieving a random cluster each turn.
  const cards = await allCards().catch(() => [] as Card[]);
  const resolved = resolveEntity(query, opts.history ?? [], cards, isContinuation);
  const resolvedCard = resolved.clusterId
    ? cards.find((c) => c.type === "cluster" && c.meta?.clusterId === resolved.clusterId)
    : undefined;

  // Deterministic core-kind diagram: when the user asks to draw/convert to a core kind (timeline,
  // org, link, money, mo) about a known cluster, build the action ourselves — the model sometimes
  // "describes" a timeline in prose without calling make_diagram, leaving no card. This guarantees it
  // renders. Free-form diagrams (kind='other', no cluster) still go through the model below.
  if (!isDocIntent && DIAGRAM_INTENT.test(query) && resolved.clusterId) {
    const kind = coreDiagramKind(query);
    if (kind) {
      const ui: UiAction = { kind: "diagram", diagram: kind, clusterId: resolved.clusterId };
      return {
        text: actionLead([ui]), cites: [], cardIds: [], confidence: 1, grounded: true, actions: [ui],
        trace: [`Diagram (${kind}) for ${resolved.clusterId} — built deterministically from case data`],
        follow: followDefault,
      };
    }
  }

  // Case-Search navigation: "search burglary cases in Davanagere" → open Case Search filtered.
  // Deterministic so it always navigates (model wouldn't reliably call the tool) and the crime term
  // is mapped to the exact crimeSubHead the Cases table expects.
  if (!isDocIntent && SEARCH_INTENT.test(query)) {
    const q = query.toLowerCase();
    const district = DISTRICTS.find((dn) => q.includes(dn.toLowerCase()));
    const crime = CRIME_ALIASES.find(([re]) => re.test(query))?.[1];
    const status = /\b(unsolved|undetected|open|pending)\b/i.test(query) ? "Under Investigation"
      : /\b(solved|charge-?sheet)/i.test(query) ? "Charge Sheeted" : undefined;
    const qs = new URLSearchParams();
    const applied: string[] = [];
    if (crime) { qs.set("type", crime); applied.push(crime); }
    if (district) { qs.set("district", district); applied.push(district); }
    if (status) { qs.set("status", status); applied.push(status); }
    const to = qs.toString() ? `/cases?${qs.toString()}` : "/cases";
    return {
      text: `Opening Case Search${applied.length ? ` filtered by ${applied.join(" · ")}` : ""}.`,
      cites: [], cardIds: [], confidence: 1, grounded: true,
      actions: [{ kind: "navigate", to, label: `Search: ${applied.join(" · ") || "cases"}` }],
      trace: ["Case Search navigation (deterministic)"], follow: followDefault,
    };
  }

  // Scope-aware retrieval: fold the prior data question into a continuation ("aur batao" → same
  // series), the resolved entity's label/offender (so retrieval surfaces IT), and the district scope.
  let base = isContinuation ? `${lastUserData} ${query}` : query;
  if (resolvedCard) base = `${base} ${resolvedCard.title}${resolved.offender ? " " + resolved.offender : ""}`;
  const rq = scope && !base.toLowerCase().includes(scope.toLowerCase()) ? `${base} ${scope}` : base;

  // A specific FIR number in the query → pull the REAL record from the live Cases table (the cards
  // hold only aggregates). Runs alongside retrieval so it adds no serial latency.
  const firNo = (query.match(/\d[\d\s-]{8,}\d/)?.[0] ?? "").replace(/\D/g, "");

  // Retrieval/embedding can throw (model or index load failure). It must degrade, not propagate:
  // on failure we continue with an empty set so sovereignAnswer still returns a reply — honouring
  // the "never fails" contract instead of letting askNetra throw.
  let hits: Retrieved[] = [];
  let graph: Awaited<ReturnType<typeof graphContext>> = null;
  let firRow: Awaited<ReturnType<typeof lookupFir>> = null;
  try {
    [hits, graph, firRow] = await Promise.all([
      retrieve(rq, 8), graphContext(rq),
      firNo.length >= 10 ? lookupFir(firNo) : Promise.resolve(null),
    ]);
  } catch { /* degrade to empty-context sovereign answer below */ }
  const confidence = confidenceFrom(hits);
  const trace: string[] = [`Retrieved ${hits.length} grounded cards (hybrid dense+BM25)`];
  if (graph) trace.push(`Traversed knowledge graph: ${graph.entities.length} entities, ${graph.facts.length} relations`);
  const actions: UiAction[] = [];

  // Prepend the FIR record (or an explicit not-found note) when the officer asked about a specific
  // FIR number — so the answer is grounded on the actual case, and we never imply a real FIR is fake.
  let firCard = "";
  if (firNo.length >= 10) {
    if (firRow) {
      const acc = (firRow.accused ?? []).map((a) => a.name).filter(Boolean).join(", ");
      firCard = `[FIR ${firRow.crimeNo}] Case record — ${firRow.crimeSubHead} (${firRow.gravity}) in ${firRow.districtName}, registered ${firRow.registeredDate}, status ${firRow.status}. Brief facts: ${firRow.briefFacts}${acc ? ` Accused: ${acc}.` : ""}`;
      actions.push({ kind: "navigate", to: `/cases?q=${firNo}`, label: `FIR ${firNo}` });
      trace.push(`Fetched live FIR record ${firNo} from the Cases table`);
    } else {
      firCard = `[FIR lookup] FIR ${firNo} could not be pulled in chat. Do NOT say it does not exist — tell the officer to confirm it in Case Search.`;
      trace.push(`FIR ${firNo} not returned by the Cases lookup`);
    }
  }

  // Deterministically inject the resolved cluster card (it carries the member FIRs + shared hand, so
  // "show me his cases" / "which FIRs" can be answered) and the best-matching alert card. These beat
  // ranked retrieval, which was dropping both.
  const entityCard = resolvedCard ? `[${resolvedCard.cite}] ${resolvedCard.title}: ${resolvedCard.text}` : "";
  if (resolvedCard) trace.push(`Active entity: ${resolvedCard.title} (${resolved.clusterId})`);
  const alertCard = pickAlertCard(query, cards);
  if (alertCard) trace.push("Injected matching alert card");
  const inject = [firCard, entityCard, alertCard].filter(Boolean).join("\n\n");
  const context = (inject ? inject + "\n\n" : "") + buildContext(hits, graph?.facts ?? null);

  let text = "";
  let grounded = false;
  try {
    // GLM answers from context and may call action tools (map/diagram/document/search).
    // Tools are ACTIONS, not data the model needs back — so one call, execute, done.
    // Doc intent wins over diagram intent ("draft a lookout notice" is a document, not a chart).
    const isDiagramIntent = !isDocIntent && DIAGRAM_INTENT.test(query);
    const docHint = isDocIntent
      ? `\n\n(The user wants a police document drafted. Call the draft_document tool with the right document type — do NOT write the document text in your reply; the tool renders it. Use [officer to verify] for anything not in the records; never invent facts.)`
      : isDiagramIntent
      ? `\n\n(The user wants a diagram drawn or re-drawn. Call make_diagram — for a NETRA serial cluster use a core kind (link/org/timeline/money/mo) with its clusterId${resolved.clusterId ? ` (this conversation is about ${resolved.clusterId})` : ""}; otherwise kind='other' with your own Mermaid. Do NOT answer in prose and NEVER say you cannot draw or convert a diagram.)`
      : `\n\n(Style: ${styleSteer(query)})`;
    const msgs: LlmMsg[] = [
      { role: "system", content: SYS },
      ...hist,
      { role: "user", content: `${context}\n\nQUESTION: ${query}${docHint}` },
    ];
    const first = await glmChat(msgs, { tools: TOOLS as ToolDef[], thinking: opts.thinking, max_tokens: 700 });
    grounded = true;
    for (const tc of (first.toolCalls ?? []) as ToolCall[]) {
      // Fall back to the RESOLVED cluster (not a random top hit) when the model omits clusterId —
      // so "draw the link chart for this series" targets the series in play.
      const { ui } = runTool(tc.function.name, safeArgs(tc.function.arguments), hits, resolved.clusterId);
      trace.push(`${tc.function.name}(${tc.function.arguments})`);
      if (ui) {
        // A "show on map" for a serial cluster needs a place to focus — resolve the cluster's lead
        // district so the Command Map can zoom to it (was navigating to a blank state view).
        if (ui.kind === "map" && !ui.district && ui.clusterId) {
          const cc = cards.find((c) => c.type === "cluster" && c.meta?.clusterId === ui.clusterId);
          const dists = cc?.meta?.districts as string[] | undefined;
          if (dists?.length) ui.district = dists[0];
        }
        actions.push(ui);
      }
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
  const isDataQ = DATA_HINT.test(query) || isContinuation || !!firNo;
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
