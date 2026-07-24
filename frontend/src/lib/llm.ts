// Client for NETRA's sovereign LLM (Catalyst GLM-4.7 + Qwen VLM). In dev it talks to the
// local proxy (VITE_LLM_URL); in prod to the Catalyst function. Never handles tokens — the
// backend mints them from the refresh token. Callers fall back to the sovereign engine if unavailable.
const BASE = (import.meta.env.VITE_LLM_URL as string) || "/server/netra_api";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface LlmMsg { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; name?: string }
export interface ToolDef { type: "function"; function: { name: string; description: string; parameters: any } }
export interface ToolCall { id: string; function: { name: string; arguments: string } }
export interface GlmResult { text: string; toolCalls: ToolCall[] }

export async function glmChat(
  messages: LlmMsg[],
  opts: { tools?: ToolDef[]; thinking?: boolean; max_tokens?: number; temperature?: number } = {}
): Promise<GlmResult> {
  const res = await fetch(`${BASE}/glm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages, tools: opts.tools, thinking: !!opts.thinking,
      max_tokens: opts.max_tokens ?? 700, temperature: opts.temperature ?? 0.2,
    }),
  });
  if (!res.ok) throw new Error(`glm ${res.status}`);
  const j = await res.json();
  const text = (j.response && String(j.response).trim())
    || j.choices?.[0]?.message?.content || "";
  const toolCalls: ToolCall[] = j.tool_calls || j.choices?.[0]?.message?.tool_calls || [];
  return { text, toolCalls };
}

export async function vlmExtract(prompt: string, images: string[], systemPrompt?: string): Promise<string> {
  const res = await fetch(`${BASE}/vlm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, images, system_prompt: systemPrompt, max_tokens: 800 }),
  });
  if (!res.ok) throw new Error(`vlm ${res.status}`);
  const j = await res.json();
  return j.response || j.choices?.[0]?.message?.content || "";
}

// Quick availability probe (cached) so the UI can show a "sovereign fallback" state.
let availP: Promise<boolean> | null = null;
export function llmAvailable(): Promise<boolean> {
  if (!availP)
    availP = glmChat([{ role: "user", content: "ping" }], { max_tokens: 3 })
      .then(() => true)
      // Cache only "available". A transient failure clears the cache so the next call re-probes,
      // instead of locking the UI into "sovereign fallback" for the whole session.
      .catch(() => { availP = null; return false; });
  return availP;
}
