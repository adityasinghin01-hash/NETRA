"use strict";

// NETRA API — Catalyst Advanced I/O function (Express).
//   GET  /server/netra_api/data/<rkey>  → dashboard payload from Data Store Store table
//   POST /server/netra_api/match {text} → live case-linkage match (TF-IDF cosine)
const express = require("express");
const catalyst = require("zcatalyst-sdk-node");
const INDEX = require("./clusters_index.json");

const app = express();
app.use(express.json({ limit: "64kb" }));

const VALID_KEY = /^[a-z0-9/_-]+$/;

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
app.get(/\/cases$/, async (req, res) => {
  const clean = (v) => String(v || "").replace(/['";\\%]/g, "").slice(0, 60);
  const district = clean(req.query.district);
  const gravity = clean(req.query.gravity);
  const type = clean(req.query.type);
  const status = clean(req.query.status);
  const q = clean(req.query.q); // FIR number lookup (LIKE works on VarChar, not Text)
  const page = Math.max(0, parseInt(req.query.page, 10) || 0);
  const size = 20;
  const where = [];
  if (district) where.push(`Cases.districtName = '${district}'`);
  if (gravity) where.push(`Cases.gravity = '${gravity}'`);
  if (type) where.push(`Cases.crimeSubHead = '${type}'`);
  if (status) where.push(`Cases.status = '${status}'`);
  if (q) where.push(`Cases.crimeNo like '%${q}%'`);
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
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

// ---- dashboard payloads from Data Store ----
app.get(/.*/, async (req, res) => {
  const m = req.path.match(/\/data\/(.+)$/);
  if (!m) return res.json({ ok: true, service: "netra_api" });
  const rkey = decodeURIComponent(m[1]).replace(/\/+$/, "");
  if (!VALID_KEY.test(rkey)) return res.status(400).json({ error: "invalid key" });
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
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

module.exports = app;
