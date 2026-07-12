"use strict";

// NETRA API — Catalyst Advanced I/O function (Express).
// Reads dashboard/API payloads from the Data Store `Store` table (rkey -> rvalue)
// and returns them as JSON. Reachable at: /server/netra_api/data/<rkey>
// e.g. /server/netra_api/data/geo/districts
const express = require("express");
const catalyst = require("zcatalyst-sdk-node");

const app = express();

// Only our known keys — also blocks any ZCQL injection via the URL.
const VALID_KEY = /^[a-z0-9/_-]+$/;

app.get(/.*/, async (req, res) => {
  const match = req.path.match(/\/data\/(.+)$/);
  if (!match) {
    return res.json({ ok: true, service: "netra_api" });
  }
  const rkey = decodeURIComponent(match[1]).replace(/\/+$/, "");
  if (!VALID_KEY.test(rkey)) {
    return res.status(400).json({ error: "invalid key" });
  }
  try {
    const app_ = catalyst.initialize(req);
    const zcql = app_.zcql();
    const rows = await zcql.executeZCQLQuery(
      `SELECT Store.rvalue FROM Store WHERE Store.rkey = '${rkey}'`
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "not found", rkey });
    }
    const row = rows[0].Store || rows[0];
    res.set("Cache-Control", "public, max-age=60");
    return res.json(JSON.parse(row.rvalue));
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

module.exports = app;
