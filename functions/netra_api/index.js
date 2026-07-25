"use strict";

// NETRA API — Catalyst Advanced I/O function (Express).
//   GET  /server/netra_api/data/<rkey>  → dashboard payload from Data Store Store table
//   POST /server/netra_api/match {text} → live case-linkage match (TF-IDF cosine)
const express = require("express");
const catalyst = require("zcatalyst-sdk-node");
const INDEX = require("./clusters_index.json");

const app = express();
app.use(express.json({ limit: "6mb" })); // larger for Copilot context + VLM images

const VALID_KEY = /^[a-z0-9/_-]+$/;

// Never leak internal error detail to the client (info disclosure). Log server-side, return generic.
function fail(res, where, err) {
  console.error(`netra_api ${where}:`, err && err.stack ? err.stack : err);
  return res.status(500).json({ error: "internal error" });
}

// Best-effort per-IP rate limit for the sovereign LLM proxy so a public caller can't burn the
// GLM/VLM quota. In-memory → per function instance (not global), which is acceptable for a
// prototype; a production deploy would use a shared store (Catalyst Cache/Data Store).
const RL_WINDOW_MS = 60000, RL_MAX = 80; // LLM calls / IP / minute — one active officer's Copilot
// turn fires several calls (retrieval ping + tool round-trip + any auto-repair), so 20 throttled a
// single live user into the sovereign fallback. The Origin gate is the real anti-abuse control; this
// is a generous secondary cap sized for a real session / demo.
const rlHits = new Map();
function rateLimited(req) {
  // Key on the trusted-proxy-appended IP, NOT the client-controllable LEFTMOST X-Forwarded-For
  // token — a caller can set that header to a random value per request to get a fresh bucket every
  // time and never hit RL_MAX. The RIGHTMOST XFF hop is the address the platform's edge proxy
  // actually saw the connection from (attacker-injected entries land on the left); req.ip is the
  // fallback when no XFF is present.
  const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ip = xff[xff.length - 1] || req.ip || "unknown";
  const now = Date.now();
  const arr = (rlHits.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS);
  arr.push(now);
  rlHits.set(ip, arr);
  if (rlHits.size > 5000) { // opportunistic cleanup of idle IPs
    for (const [k, v] of rlHits) if (!v.some((t) => now - t < RL_WINDOW_MS)) rlHits.delete(k);
  }
  return arr.length > RL_MAX;
}

// The LLM proxy (/glm, /vlm) is anonymous by design — the client is a public browser app served
// same-origin under the Catalyst domain, and any header baked into that public bundle would not be
// a real secret. So instead of a shared secret we gate on the browser-set Origin/Referer: only the
// hosted client (a *.catalystserverless.in origin, or an ALLOWED_ORIGINS host) may call it. This is
// a SOFT control — a non-browser client (curl) can forge these headers — but it stops the two things
// that actually happen in the wild: cross-origin browser abuse (another site scripting our endpoint)
// and header-less drive-by scanners. It needs no frontend change because the app's same-origin POSTs
// already carry these headers (no referrer policy strips them). A hard control would require real
// authenticated function scope + a frontend rebuild; documented in docs/SECURITY-NOTES.md.
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
function sameSiteOrigin(req) {
  const src = req.headers.origin || req.headers.referer || "";
  let host;
  try { host = new URL(src).hostname; } catch { return false; } // no/garbage Origin+Referer → deny
  return host.endsWith(".catalystserverless.in") || ALLOWED_ORIGINS.includes(host);
}

// ---- Sovereign LLM (Catalyst QuickML: GLM-4.7 + Qwen VLM) ----
// Creds (refresh token) live in the Data Store Store table under a private '_llm_creds'
// key — never in the repo. They are seeded once out-of-band (Catalyst Data Store console),
// NOT via any HTTP route: an open seed endpoint would let an unauthenticated caller inject
// their own OAuth creds on a fresh/unseeded environment and hijack the LLM proxy. Rotation is
// likewise a console operation. The function mints short-lived access tokens and proxies to QuickML.
const QML_BASE = "https://api.catalyst.zoho.in/quickml/v1/project/55012000000013048";
const QML_ORG = "60077866273";
let _creds = null, _tok = null, _tokExp = 0;

async function loadCreds(req) {
  if (_creds) return _creds;
  const app_ = catalyst.initialize(req);
  const rows = await app_.zcql().executeZCQLQuery("SELECT Store.rvalue FROM Store WHERE Store.rkey = '_llm_creds'");
  if (!rows || !rows.length) return null;
  _creds = JSON.parse((rows[0].Store || rows[0]).rvalue);
  return _creds;
}
async function accessToken(req) {
  if (_tok && Date.now() < _tokExp - 60000) return _tok;
  const c = await loadCreds(req);
  if (!c) throw new Error("LLM not configured");
  const body = new URLSearchParams({ grant_type: "refresh_token", client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token });
  const r = await fetch("https://accounts.zoho.in/oauth/v2/token", { method: "POST", body });
  const j = await r.json();
  if (!j.access_token) throw new Error("token refresh failed");
  _tok = j.access_token; _tokExp = Date.now() + (j.expires_in || 3600) * 1000;
  return _tok;
}
async function callQml(req, pathSuffix, payload) {
  const t = await accessToken(req);
  const r = await fetch(`${QML_BASE}/${pathSuffix}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Zoho-oauthtoken ${t}`, "CATALYST-ORG": QML_ORG },
    body: JSON.stringify(payload),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

app.post(/\/glm$/, async (req, res) => {
  if (!sameSiteOrigin(req)) return res.status(403).json({ error: "forbidden" });
  if (rateLimited(req)) return res.status(429).json({ error: "rate limit exceeded — try again shortly" });
  try {
    const b = req.body || {};
    const payload = {
      model: "crm-di-glm47b_30b_it", messages: b.messages,
      max_tokens: b.max_tokens ?? 700, temperature: b.temperature ?? 0.2, stream: false,
      chat_template_kwargs: { enable_thinking: !!b.thinking },
      ...(b.tools ? { tools: b.tools, tool_choice: b.tool_choice ?? "auto" } : {}),
    };
    const { status, json } = await callQml(req, "glm/chat", payload);
    return res.status(status).json(json);
  } catch (err) { return fail(res, "/glm", err); }
});

app.post(/\/vlm$/, async (req, res) => {
  if (!sameSiteOrigin(req)) return res.status(403).json({ error: "forbidden" });
  if (rateLimited(req)) return res.status(429).json({ error: "rate limit exceeded — try again shortly" });
  try {
    const b = req.body || {};
    const payload = { model: "VL-Qwen3.6-35B-A3B", prompt: b.prompt, images: b.images,
      system_prompt: b.system_prompt ?? "You are an OCR + extraction engine. Output only what is asked.",
      temperature: 0.2, top_k: 50, top_p: 0.9, max_tokens: b.max_tokens ?? 800 };
    const { status, json } = await callQml(req, "vlm/chat", payload);
    return res.status(status).json(json);
  } catch (err) { return fail(res, "/vlm", err); }
});

// ---- linkage matcher (v1, keyword TF-IDF) ----
const STOP = new Set(("the a an and or of to in on at for with by from is was were are be been " +
  "that this it as his her their they he she who whom which had has have reported stated " +
  "alleged complainant accused victim person persons unknown case registered near left found " +
  "taken away made off over about into out com ka").split(" "));
const TOKEN_RE = /[a-zಀ-೿]{2,}/g;

function tokenize(text) {
  return (String(text).toLowerCase().match(TOKEN_RE) || []).filter((t) => !STOP.has(t));
}

// Precompute each cluster's TF-IDF vector norm once.
const CLUSTER_NORMS = INDEX.clusters.map((c) => {
  let s = 0;
  for (const t in c.tf) {
    const w = c.tf[t] * (INDEX.idf[t] || 1);
    s += w * w;
  }
  return Math.sqrt(s) || 1;
});

function match(text) {
  const toks = tokenize(text).filter((t) => t in INDEX.idf);
  const qtf = {};
  for (const t of toks) qtf[t] = (qtf[t] || 0) + 1;
  let qnorm = 0;
  for (const t in qtf) {
    const w = qtf[t] * INDEX.idf[t];
    qnorm += w * w;
  }
  qnorm = Math.sqrt(qnorm);

  const results = INDEX.clusters.map((c, i) => {
    let dot = 0;
    for (const t in qtf) {
      if (c.tf[t]) dot += qtf[t] * INDEX.idf[t] * c.tf[t] * INDEX.idf[t];
    }
    const score = qnorm && CLUSTER_NORMS[i] ? dot / (qnorm * CLUSTER_NORMS[i]) : 0;
    return {
      clusterId: c.clusterId, label: c.label, crimeType: c.crimeType,
      districts: c.districts, memberCount: c.memberCount, confidence: c.confidence,
      score: Math.round(score * 100),
    };
  });
  results.sort((a, b) => b.score - a.score);
  return results;
}

app.post(/.*/, (req, res) => {
  const text = (req.body && req.body.text) || "";
  if (String(text).trim().length < 15) {
    return res.status(400).json({ error: "paste a longer FIR narrative" });
  }
  const ranked = match(text);
  return res.json({
    method: "keyword", best: ranked[0], matches: ranked.slice(0, 5),
  });
});

// ---- case search over the 50k Cases table (ZCQL) ----
// NOTE: ZCQL has no parameterized-query API here, so filters are string-interpolated. Injection is
// contained by clean() (strips quotes/semicolons/backslash/percent + caps length) and the numeric
// regex on crimeNo. If a parameterized ZCQL binding becomes available, switch to it.
app.get(/\/cases$/, async (req, res) => {
  const clean = (v) => String(v || "").replace(/['";\\%]/g, "").slice(0, 60);
  const district = clean(req.query.district);
  const gravity = clean(req.query.gravity);
  const type = clean(req.query.type);
  const status = clean(req.query.status);
  const q = clean(req.query.q); // FIR number lookup
  const page = Math.max(0, parseInt(req.query.page, 10) || 0);
  const size = 20;
  const where = [];
  if (district) where.push(`Cases.districtName = '${district}'`);
  if (gravity) where.push(`Cases.gravity = '${gravity}'`);
  if (type) where.push(`Cases.crimeSubHead = '${type}'`);
  if (status) where.push(`Cases.status = '${status}'`);
  // crimeNo is a numeric (bigint) column, so ZCQL LIKE never matches it — a full FIR number must be
  // matched by equality. (This is why deep-links from the map/linkage returned nothing before.)
  if (q && /^\d{6,}$/.test(q)) where.push(`Cases.crimeNo = ${q}`);
  const clause = where.length ? "WHERE " + where.join(" AND ") : "";
  try {
    const app_ = catalyst.initialize(req);
    const sql =
      "SELECT Cases.crimeNo, Cases.registeredDate, Cases.districtName, Cases.crimeSubHead, " +
      "Cases.gravity, Cases.status, Cases.language, Cases.briefFacts FROM Cases " +
      `${clause} LIMIT ${page * size}, ${size}`;
    const rows = await app_.zcql().executeZCQLQuery(sql);
    const items = (rows || []).map((r) => r.Cases || r);
    return res.json({ page, size, items, hasMore: items.length === size });
  } catch (err) {
    return fail(res, "/cases", err);
  }
});

// ---- dashboard payloads from Data Store ----
app.get(/.*/, async (req, res) => {
  const m = req.path.match(/\/data\/(.+)$/);
  if (!m) return res.json({ ok: true, service: "netra_api" });
  const rkey = decodeURIComponent(m[1]).replace(/\/+$/, "");
  if (!VALID_KEY.test(rkey)) return res.status(400).json({ error: "invalid key" });
  if (rkey.startsWith("_")) return res.status(404).json({ error: "not found" }); // private keys (e.g. _llm_creds)
  try {
    const app_ = catalyst.initialize(req);
    const rows = await app_.zcql().executeZCQLQuery(
      `SELECT Store.rvalue FROM Store WHERE Store.rkey = '${rkey}'`
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: "not found", rkey });
    const row = rows[0].Store || rows[0];
    res.set("Cache-Control", "public, max-age=60");
    return res.json(JSON.parse(row.rvalue));
  } catch (err) {
    return fail(res, "/data", err);
  }
});

module.exports = app;
