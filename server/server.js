// --- load env FIRST ---
import 'dotenv/config';

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { BalldontlieAPI } from "@balldontlie/sdk";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5050;

const BALLDONTLIE_API_KEY = process.env.BALLDONTLIE_API_KEY || "";
const GOOGLE_API_KEY      = process.env.GOOGLE_API_KEY || "";

console.log("BDL key present?", !!BALLDONTLIE_API_KEY);
console.log("Gemini key present?", !!GOOGLE_API_KEY);

// static files
app.use(express.static(path.join(__dirname, "..", "client")));
app.use(express.json());

// --- NBA public JSON / Stats headers ---
const NBA_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
    // UA matters for stats.nba
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
  };
  
  // cache the public player list in memory for a few minutes
  let _playerListCache = { at: 0, data: null };
  async function getNbaPlayerList() {
    const now = Date.now();
    if (_playerListCache.data && now - _playerListCache.at < 5 * 60 * 1000) return _playerListCache.data;
  
    const url = "https://cdn.nba.com/static/json/staticData/leaguePlayerList.json";
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!r.ok) throw new Error(`playerList ${r.status}`);
    const json = await r.json();
    const list = json?.leaguePlayerList?.players || [];
    _playerListCache = { at: now, data: list };
    return list;
  }
  
  // loose name match → personId (best effort)
  async function findPlayerIdByName(q) {
    const list = await getNbaPlayerList();
    const norm = (s) => String(s || "").toLowerCase().trim();
    const [first, ...rest] = norm(q).split(/\s+/);
    const last = rest.join(" ");
  
    // exact first+last first
    let hit = list.find(p => norm(p.firstName) === first && norm(p.lastName) === last);
    if (hit) return hit.personId;
  
    // fallback contains
    hit = list.find(p => norm(`${p.firstName} ${p.lastName}`).includes(norm(q)));
    return hit ? hit.personId : null;
  }

  
  // GET /api/nba/player-id?q=lebron james  -> { personId }
app.get("/api/nba/player-id", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q) return res.status(400).json({ error: "q required" });
      const personId = await findPlayerIdByName(q);
      if (!personId) return res.status(404).json({ error: "Player not found" });
      res.json({ personId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "lookup failed" });
    }
  });
  
  // GET /api/nba/season-avg?playerId=2544&season=2024-25
  // returns per-game averages for that season
// GET /api/nba/season-avg?playerId=2544&season=2024-25
// Minimal: per-game averages for that season, straight from stats.nba.com
app.get("/api/nba/season-avg", async (req, res) => {
    try {
      const playerId = String(req.query.playerId || "");
      const season = String(req.query.season || "2024-25");
      if (!playerId) return res.status(400).json({ error: "playerId required" });
  
      // optional: guard against super long waits
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort("timeout"), 12000);
  
      const url = new URL("https://stats.nba.com/stats/playerprofilev2");
      url.searchParams.set("PlayerID", playerId);
      url.searchParams.set("PerMode", "PerGame");
      url.searchParams.set("LeagueID", "00");
      url.searchParams.set("Season", season);
  
      console.time(`[NBA] playerprofilev2 ${playerId} ${season}`);
      const r = await fetch(url, { headers: NBA_HEADERS, signal: ac.signal });
      console.timeEnd(`[NBA] playerprofilev2 ${playerId} ${season}`);
      clearTimeout(timer);
  
      if (!r.ok) {
        const detail = await r.text().catch(() => "");
        return res.status(r.status).json({ error: "nba upstream", detail: detail.slice(0, 300) });
      }
  
      const j = await r.json();
  
      // The table we want is "SeasonTotalsRegularSeason"
      const rs = (j.resultSets || j.ResultSets || []).find(
        x => (x.name || x.Name) === "SeasonTotalsRegularSeason"
      );
      const headers = rs?.headers || rs?.Headers || [];
      const rows = rs?.rowSet || rs?.RowSet || [];
  
      // headers -> index map (e.g., map.SEASON_ID, map.PTS, etc.)
      const map = headers.reduce((m, h, i) => ((m[h] = i), m), {});
      const row = rows.find(rw => String(rw[map.SEASON_ID]) === season);
  
      if (!row) {
        return res.json({ source: "stats.nba.com", season, playerId, averages: null });
      }
  
      const get = k => row[map[k]];
      const averages = {
        gp: get("GP"),
        min: get("MIN"),
        pts: get("PTS"),
        reb: get("REB"),
        ast: get("AST"),
        stl: get("STL"),
        blk: get("BLK"),
        tov: get("TOV"),
        fg_pct: get("FG_PCT"),
        fg3_pct: get("FG3_PCT"),
        ft_pct: get("FT_PCT"),
      };
  
      res.json({ source: "stats.nba.com", season, playerId, averages });
    } catch (e) {
      const msg = e?.name === "AbortError" ? "timeout from stats.nba.com" : "season avg failed";
      console.error(msg, e);
      res.status(500).json({ error: msg });
    }
  });
  
  

// ---------------- Balldontlie (SDK uses env key) ----------------
const api = new BalldontlieAPI({ apiKey: BALLDONTLIE_API_KEY });

app.get("/api/players/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ data: [], meta: { total: 0 } });
  try {
    const response = await api.nba.getPlayers({ search: q, per_page: 25 });
    res.json({ data: response.data, meta: response.meta });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "API error" });
  }
});

// manual fetches also use env key (same style that works for your account)
const BDL_HEADERS = {
  Accept: "application/json",
  Authorization: process.env.BALLDONTLIE_API_KEY,              // if your plan needs Bearer, switch to:
  // Authorization: `Bearer ${BALLDONTLIE_API_KEY}`,
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
      id: g.id,
      date: g.date,
      status: g.status,
      home: g.home_team?.full_name,
      home_abbr: g.home_team?.abbreviation,
      home_score: g.home_team_score,
      visitor: g.visitor_team?.full_name,
      visitor_abbr: g.visitor_team?.abbreviation,
      visitor_score: g.visitor_team_score
    }));
    res.json({ date: dateET, data, meta: json.meta || {} });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------- Gemini ----------------
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// "On This Day" mini-report (no live stats required)
app.post("/api/ai/on-this-day", express.json(), async (req, res) => {
  try {
    const { name, date, tz = "America/New_York" } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    // month-day like "November 7" (or use provided date)
    const md = date
      ? new Date(date).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: tz })
      : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: tz });

    const prompt = `
You are writing a short "On This Day" blurb for NBA fans.

Player: ${name}
Month/Day: ${md}

Rules:
- Do NOT discuss the current season or upcoming games.
- Focus on notable performances or milestones that happened on this month/day in past years.
- If you can't find a specific game for this date, say so briefly and instead include 2–3 career highlights and a fun fact (birthplace, draft slot, awards, rivalries, nicknames, signature moments, etc.).
- Keep it 120–180 words max.
- Use clear sections with short headers: "Notable game(s)", "Fun facts", "Quick context".
- Be careful with dates; if you're uncertain, avoid exact numbers and call it out.

Output as plain text, no markdown lists beyond dashes.
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
    });

    const text = response.text;
    res.json({ report: text || "No report returned.", date: md });
  } catch (e) {
    console.error("Gemini on-this-day error:", e);
    res.status(500).json({ error: "AI on-this-day failed" });
  }
});


// --- X (Twitter) posting ---
import { TwitterApi } from "twitter-api-v2";

const X_API_KEY       = process.env.X_API_KEY || "";
const X_API_SECRET    = process.env.X_API_SECRET || "";
const X_ACCESS_TOKEN  = process.env.X_ACCESS_TOKEN || "";
const X_ACCESS_SECRET = process.env.X_ACCESS_SECRET || "";

// create a single user-authenticated client (posts as @your_account)
const xClient = (X_API_KEY && X_API_SECRET && X_ACCESS_TOKEN && X_ACCESS_SECRET)
  ? new TwitterApi({
      appKey: X_API_KEY,
      appSecret: X_API_SECRET,
      accessToken: X_ACCESS_TOKEN,
      accessSecret: X_ACCESS_SECRET,
    })
  : null;

// helper: safe trim to 280 chars (simple version)
function toTweetLength(s) {
  if (!s) return "";
  // optional: collapse whitespace
  s = s.replace(/\s+\n/g, "\n").trim();
  if (s.length <= 280) return s;
  return s.slice(0, 277) + "…";
}

// POST /api/x/post-report { name?: string }
// If name omitted, defaults to "LeBron James"
app.post("/api/x/post-report", async (req, res) => {
  try {
    if (!xClient) {
      return res.status(500).json({ error: "X client not configured (missing env vars)" });
    }
    const name = String(req.body?.name || "LeBron James");

    // 1) generate the AI blurb you already have
    const aiResp = await fetch("http://localhost:5050/api/ai/on-this-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!aiResp.ok) {
      const detail = await aiResp.text().catch(() => "");
      return res.status(500).json({ error: "AI generation failed", detail: detail.slice(0, 300) });
    }
    const { report, date } = await aiResp.json();

    // 2) craft tweet text (keep it short for now)
    // You can prepend a header & date; keep under 280
    let tweetText = `On this day: ${name}\n\n${report}`;
    tweetText = toTweetLength(tweetText);

    // 3) post to X
    const posted = await xClient.v2.tweet(tweetText);

    return res.json({
      ok: true,
      tweet_id: posted.data?.id,
      text: tweetText,
      dateUsed: date,
    });
  } catch (e) {
    console.error("Tweet error:", e);
    // surface basic error info
    return res.status(500).json({ error: "Tweet failed" });
  }
});



// SPA fallback
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  if (req.method === "GET" && req.accepts("html")) {
    return res.sendFile(path.join(__dirname, "..", "client", "index.html"));
  }
  next();
});

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
