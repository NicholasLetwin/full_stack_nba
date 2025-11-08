
import "dotenv/config";

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { BalldontlieAPI } from "@balldontlie/sdk";
import { GoogleGenAI } from "@google/genai";
import { TwitterApi } from "twitter-api-v2";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = 5050;

const env  = (k) => (process.env[k] ?? "").trim();
const mask = (s) => (!s ? "(empty)" : (s.length <= 6 ? "*".repeat(s.length) : s.slice(0,3) + "…" + s.slice(-3)));

const BALLDONTLIE_API_KEY = env("BALLDONTLIE_API_KEY");
const GOOGLE_API_KEY = env("GOOGLE_API_KEY");

console.log("BDL key present?", !!BALLDONTLIE_API_KEY);
console.log("Gemini key present?", !!GOOGLE_API_KEY);

// static + json
app.use(express.static(path.join(__dirname, "..", "client")));
app.use(express.json());

// X (Twitter) setup 
const X_ENV = {
  key: env("X_API_KEY"),
  secret: env("X_API_SECRET"),
  token: env("X_ACCESS_TOKEN"),
  tokenSec: env("X_ACCESS_SECRET"),
};
console.log("[X] Env loaded:", {
  X_API_KEY: mask(X_ENV.key),
  X_API_SECRET: mask(X_ENV.secret),
  X_ACCESS_TOKEN: mask(X_ENV.token),
  X_ACCESS_SECRET: mask(X_ENV.tokenSec),
});
const missingX = [];
if (!X_ENV.key) missingX.push("X_API_KEY");
if (!X_ENV.secret) missingX.push("X_API_SECRET");
if (!X_ENV.token) missingX.push("X_ACCESS_TOKEN");
if (!X_ENV.tokenSec) missingX.push("X_ACCESS_SECRET");

let xClient = null;
if (missingX.length === 0) {
  xClient = new TwitterApi({
    appKey:      X_ENV.key,
    appSecret:   X_ENV.secret,
    accessToken: X_ENV.token,
    accessSecret: X_ENV.tokenSec,
  });
} else {
  console.warn("[X] Client not configured; missing:", missingX);
}

// helpers
function toTweetLength(s) {
  if (!s) return "";
  s = String(s).replace(/\s+\n/g, "\n").trim();
  return s.length <= 280 ? s : s.slice(0, 277) + "…";
}
function stripSectionHeaders(report) {
  const lines = String(report || "").split(/\r?\n/).filter(Boolean);
  return lines
    .filter(l => !/^(\s)*(Notable game|Fun facts|Quick context)/i.test(l))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

app.get("/api/x/health", async (_req, res) => {
  if (!xClient) return res.status(400).json({ ok:false, stage:"config", missing: missingX });
  try {
    const me = await xClient.v2.me();
    res.json({ ok:true, user: me?.data || null });
  } catch (e) {
    res.status(500).json({
      ok:false, stage:"auth",
      error: e?.message || "Auth check failed",
      meta: { code:e?.code, status:e?.status, data:e?.data?.errors ?? e?.data }
    });
  }
});

// POST /api/x/post-text { text }
app.post("/api/x/post-text", async (req, res) => {
  try {
    if (!xClient) return res.status(500).json({ ok:false, stage:"config", missing: missingX });
    const text = toTweetLength(String(req.body?.text || "").trim());
    if (!text) return res.status(400).json({ ok:false, error:"text required" });
    const posted = await xClient.v2.tweet(text);
    res.json({ ok:true, tweet_id: posted?.data?.id, text });
  } catch (e) {
    console.error("[X] Tweet error:", e?.data || e);
    res.status(500).json({
      ok:false, stage:"x", error:"Tweet failed",
      meta: { code:e?.code, status:e?.status, data:e?.data?.errors ?? e?.data }
    });
  }
});

//balldontlie
const bdl = new BalldontlieAPI({ apiKey: BALLDONTLIE_API_KEY });

app.get("/api/players/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ data: [], meta: { total: 0 } });
  try {
    const response = await bdl.nba.getPlayers({ search: q, per_page: 25 });
    res.json({ data: response.data, meta: response.meta });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "API error" });
  }
});

const BDL_HEADERS = {
  Accept: "application/json",
  Authorization: process.env.BALLDONTLIE_API_KEY,
};

app.get("/api/games", async (req, res) => {
  try {
    const dateET = (req.query.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })).toString();
    const url = new URL("https://api.balldontlie.io/v1/games");
    url.searchParams.set("per_page", "100");
    url.searchParams.append("dates[]", dateET);

    const r = await fetch(url, { headers: BDL_HEADERS });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return res.status(r.status).json({ error: "Upstream error", detail: detail.slice(0, 300) });
    }
    const json = await r.json();
    const data = (json.data || []).map(g => ({
      id: g.id, date: g.date, status: g.status,
      home: g.home_team?.full_name,   home_abbr: g.home_team?.abbreviation,   home_score: g.home_team_score,
      visitor: g.visitor_team?.full_name, visitor_abbr: g.visitor_team?.abbreviation, visitor_score: g.visitor_team_score
    }));
    res.json({ date: dateET, data, meta: json.meta || {} });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

//geminiì
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

app.post("/api/ai/on-this-day", async (req, res) => {
  try {
    const { name, date, tz = "America/New_York" } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    const md = date
      ? new Date(date).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: tz })
      : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: tz });

      const prompt = `
      Write ONE line (<=200 characters) "On This Day" NBA blurb.
      
      Requirements (in priority order):
      - Include the specific matchup and final result if known (opponent, score, who won).
      - Include date context (month/day and year if known) as compact as possible.
      - If no exact game for this date is found, compress 2–3 key career facts instead.
      - Use plain text only. No headers, bullets, hashtags, emojis, links.
      - Max 200 characters. Pack in as much concrete info as possible.
      
      Player: ${name}
      Month/Day: ${md}
      `.trim();
      

    const resp = await ai.models.generateContent({ model: "gemini-2.5-pro", contents: prompt });

    // normalize + hard-cap at 200 chars
    const raw      = (resp.text || "").replace(/\s+/g, " ").trim();
    const report   = raw.length > 200 ? raw.slice(0, 199) + "…" : raw;

    res.json({ report: report || "No report returned.", date: md });
  } catch (e) {
    console.error("Gemini on-this-day error:", e);
    res.status(500).json({ error: "AI on-this-day failed" });
  }
});

function sanitizeHandle(h) {
    return String(h || "")
      .trim()
      .replace(/^@+/, "")
      .replace(/[^\w_]/g, "")  
      .slice(0, 15);         
  }
  
  async function getTwitterUserByHandle(handle) {
    if (!xClient) throw new Error("X client not configured");
    try {
      const u = await xClient.v2.userByUsername(handle);
      return u?.data || null;
    } catch (e) {
      return null;
    }
  }
  
  async function makeOnThisDayLine(ai, name, md, tz = "America/New_York") {
    const prompt = `
  Write ONE line (<=250 characters) "On This Day" NBA blurb.
  
  Requirements (in priority order):
  - Include the specific matchup and final result if known (opponent, score, who won).
  - Include date context (month/day and year if known) as compact as possible.
  - If no exact game for this date is found, compress 2–3 key career facts instead.
  - Use plain text only. No headers, bullets, hashtags, emojis, links.
  - Max 200 characters. Pack in as much concrete info as possible.
  
  Player: ${name}
  Month/Day: ${md}
  `.trim();
  
    const resp = await ai.models.generateContent({ model: "gemini-2.5-pro", contents: prompt });
    const raw  = (resp.text || "").replace(/\s+/g, " ").trim();
    return raw.length > 200 ? raw.slice(0, 199) + "…" : raw;
  }
  
  const lastPing = new Map();
  
  function ymdET(date = new Date()) {
    return date.toLocaleDateString("en-CA", { timeZone: "America/New_York" }); 
  }
  
  function pingKey(handle, name, date = new Date()) {
    return `${handle.toLowerCase()}|${name.toLowerCase()}|${ymdET(date)}`;
  }
  
  function canPostToday(handle, name) {
    const key = pingKey(handle, name);
    return !lastPing.has(key);
  }
  
  function markPosted(handle, name) {
    const key = pingKey(handle, name);
    lastPing.set(key, Date.now());
  }

  
app.get("/api/x/validate-handle", async (req, res) => {
    try {
      if (!xClient) return res.status(500).json({ ok:false, stage:"config", missing: ["X credentials"] });
      const handle = sanitizeHandle(req.query.handle);
      if (!handle) return res.status(400).json({ ok:false, error:"handle required" });
      const user = await getTwitterUserByHandle(handle);
      if (!user) return res.status(404).json({ ok:false, error:"handle not found" });
      res.json({ ok:true, user });
    } catch (e) {
      res.status(500).json({ ok:false, error:"validation failed" });
    }
  });



//spa fallback
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (req.method === "GET" && req.accepts("html")) {
    return res.sendFile(path.join(__dirname, "..", "client", "index.html"));
  }
  next();
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
