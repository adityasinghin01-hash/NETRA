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
const RL_WINDOW_MS = 60000, RL_MAX = 20; // 20 LLM calls / IP / minute
const rlHits = new Map();
function rateLimited(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "unknown";
  const now = Date.now();
  const arr = (rlHits.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS);
  arr.push(now);
  rlHits.set(ip, arr);
  if (rlHits.size > 5000) { // opportunistic cleanup of idle IPs
    for (const [k, v] of rlHits) if (!v.some((t) => now - t < RL_WINDOW_MS)) rlHits.delete(k);
  }
  return arr.length > RL_MAX;
}

// ---- Sovereign LLM (Catalyst QuickML: GLM-4.7 + Qwen VLM) ----
// Creds (refresh token) live in the Data Store Store table under a private '_llm_creds'
// key — never in the repo. Seeded once over HTTPS via /llm-seed. The function mints
// short-lived access tokens from the refresh token and proxies to QuickML.
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

// One-time seed (trust-on-first-use): stores the refresh-token creds in Data Store if absent.
app.post(/\/llm-seed$/, async (req, res) => {
  try {
    if (await loadCreds(req)) return res.status(409).json({ error: "already seeded" });
    const { refresh_token, client_id, client_secret } = req.body || {};
    if (!refresh_token || !client_id || !client_secret) return res.status(400).json({ error: "missing creds" });
    const app_ = catalyst.initialize(req);
    await app_.datastore().table("Store").insertRow({ rkey: "_llm_creds", rvalue: JSON.stringify({ refresh_token, client_id, client_secret }) });
    _creds = null;
    return res.json({ ok: true });
  } catch (err) { return fail(res, "/llm-seed", err); }
});

app.post(/\/glm$/, async (req, res) => {
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
