// ========= FAVORITE PLAYER (CLIENT ONLY) =========
const FAV_KEY = "nba.favorite.player";
const favPanel     = document.getElementById("favoritePlayerPanel");
const favContent   = document.getElementById("favoritePlayerContent");
const favClearBtn  = document.getElementById("favoriteClearBtn");

function getFavoritePlayer() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || null; }
  catch { return null; }
}
function setFavoritePlayer(player) {
    if (!player || player.id == null) return;
    localStorage.setItem(FAV_KEY, JSON.stringify({
      id: String(player.id),             // normalize
      name: player.name || "",
      team: player.team || "-",
      position: player.position || "-"
    }));
    renderFavoritePanel();
  }
function clearFavoritePlayer() {
  localStorage.removeItem(FAV_KEY);
  renderFavoritePanel();
}
function initialsFrom(name) {
    const parts = String(name).trim().split(/\s+/);
    return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
  }
  
  function renderFavoritePanel() {
    const fav = getFavoritePlayer();
  
    if (!fav) {
      favContent.innerHTML = `
        <div class="fav-card">
          <div class="fav-avatar">☆</div>
          <div class="fav-body">
            <div class="fav-title">
              <span class="fav-star">No favorite</span>
            </div>
            <div class="fav-sub">Search for a player and click “⭐ Set Favorite”.</div>
          </div>
        </div>
      `;
      return;
    }
  
    const initials = initialsFrom(fav.name).toUpperCase();
  
    favContent.innerHTML = `
      <div class="fav-card">
        <div class="fav-avatar">${initials}</div>
        <div class="fav-body">
          <div class="fav-title">
            <span class="fav-star">⭐</span>
            <span>${fav.name}</span>
          </div>
          <div class="fav-sub">${fav.team} • ${fav.position}</div>
  
          <div class="fav-actions">
            <button id="favClearDyn" class="btn">Remove favorite</button>
            <button id="favAiDyn" class="btn primary">AI Report</button>
          </div>
        </div>
      </div>
    `;
  
    // re-bind buttons that were just injected
    document.getElementById("favClearDyn")?.addEventListener("click", clearFavoritePlayer);
    document.getElementById("favAiDyn")?.addEventListener("click", () => {
        aiSection.hidden = false;
        aiOutput.textContent = `Generating “On This Day” for ${fav.name}…`;
        generateOnThisDay(fav.name);
      });
  }
  
  async function fetchSeasonAvgByName(name, season = "2024-25") {
    // 1) name -> personId
    const idResp = await fetch(`/api/nba/player-id?q=${encodeURIComponent(name)}`);
    if (!idResp.ok) throw new Error("player id not found");
    const { personId } = await idResp.json();
  
    // 2) personId -> season averages
    const avgResp = await fetch(`/api/nba/season-avg?playerId=${personId}&season=${encodeURIComponent(season)}`);
    if (!avgResp.ok) throw new Error("season avg failed");
    return avgResp.json();
  }
  
  // Example: wire to your AI section temporarily
  // generateAiReport(name) could fallback to showing real averages:
  async function showSeasonAvg(name) {
    aiSection.hidden = false;
    aiOutput.textContent = "Loading season averages…";
    try {
      const { averages, season } = await fetchSeasonAvgByName(name, "2024-25");
      if (!averages) { aiOutput.textContent = `No averages yet for ${season}.`; return; }
      aiOutput.textContent =
        `${name} ${season} — ` +
        `PTS ${averages.pts}, REB ${averages.reb}, AST ${averages.ast}, ` +
        `FG% ${(averages.fg_pct*100).toFixed(1)}, 3P% ${(averages.fg3_pct*100).toFixed(1)}, FT% ${(averages.ft_pct*100).toFixed(1)}`;
    } catch (e) {
      aiOutput.textContent = "Could not load season averages.";
    }
  }
  
// ========= SEARCH TAB =========
const statusEl   = document.getElementById("status");
const qInput     = document.getElementById("q");
const searchBtn  = document.getElementById("searchBtn");
const tableBody  = document.getElementById("statsBody");
const aiSection  = document.getElementById("aiSection");
const aiOutput   = document.getElementById("aiOutput");


function clearTable() { tableBody.innerHTML = ""; }
let lastPlayers = []; // keep

function renderRows(players) {
  tableBody.innerHTML = "";
  const fav = getFavoritePlayer();

  for (const p of players) {
    const teamFull = p.team ? `${p.team.full_name} (${p.team.abbreviation})` : "-";
    const isFavorite = fav && String(fav.id) === String(p.id);

    const tr = document.createElement("tr");
    if (isFavorite) tr.classList.add("is-favorite");

    tr.innerHTML = `
      <td><strong>${p.first_name} ${p.last_name}</strong></td>
      <td>${teamFull}</td>
      <td>${p.position || "-"}</td>
      <td class="actions">
        <button class="ai-btn"
          data-name="${p.first_name} ${p.last_name}">
          AI Report
        </button>
        <button class="fav-btn ${isFavorite ? "is-fav" : ""}"
          data-id="${p.id}"
          data-name="${p.first_name} ${p.last_name}"
          data-team="${teamFull}"
          data-position="${p.position || "-"}">
          ${isFavorite ? "⭐ Favorite" : "☆ Set Favorite"}
        </button>
      </td>
    `;
    tableBody.appendChild(tr);
  }
}

// One click handler for both buttons
tableBody.addEventListener("click", (e) => {
  const favBtn = e.target.closest(".fav-btn");
  if (favBtn) {
    const player = {
      id: favBtn.dataset.id,
      name: favBtn.dataset.name,
      team: favBtn.dataset.team,
      position: favBtn.dataset.position
    };
    const current = getFavoritePlayer();

    if (current && String(current.id) === String(player.id)) {
      clearFavoritePlayer();
      statusEl.textContent = `Removed ${player.name} from favorites.`;
    } else {
      setFavoritePlayer(player);
      statusEl.textContent = `✅ Set ${player.name} as favorite!`;
    }

    renderFavoritePanel();     // <- ensure card updates immediately
    renderRows(lastPlayers);   // <- refresh table button labels/highlight
    return;
  }

  const aiBtn = e.target.closest(".ai-btn");
  if (aiBtn && !aiBtn.disabled) {
    aiBtn.disabled = true;
    const name = aiBtn.dataset.name;
    generateOnThisDay(name).finally(() => (aiBtn.disabled = false));
  }
});

function generateOnThisDay(name) {
    return new Promise((resolve) => {
      aiSection.hidden = false;
      aiOutput.textContent = `Generating “On This Day” for ${name}…`;
  
      const req = new XMLHttpRequest();
      req.open("POST", "/api/ai/on-this-day", true);
      req.setRequestHeader("Content-Type", "application/json");
  
      req.onload = function () {
        if (req.status !== 200) {
          aiOutput.textContent = `AI error: HTTP ${req.status}`;
          return resolve();
        }
        try {
          const payload = JSON.parse(req.responseText);
          aiOutput.textContent = payload.report || "No report returned.";
        } catch {
          aiOutput.textContent = "Parse error.";
        }
        resolve();
      };
      req.onerror = () => { aiOutput.textContent = "Network error."; resolve(); };
      req.send(JSON.stringify({ name }));
    });
  }

  

function generateAiReport(name, season = 2025) {
  return new Promise((resolve) => {
    aiSection.hidden = false;
    aiOutput.textContent = `Generating AI report for ${name}…`;

    const req = new XMLHttpRequest();
    req.open("POST", "/api/ai/report", true); // matches your server route
    req.setRequestHeader("Content-Type", "application/json");

    req.onload = function () {
      if (req.status !== 200) {
        aiOutput.textContent = `AI error: HTTP ${req.status}`;
        return resolve();
      }
      try {
        const payload = JSON.parse(req.responseText);
        aiOutput.textContent = payload.report || "No report returned.";
      } catch {
        aiOutput.textContent = "Parse error.";
      }
      resolve();
    };
    req.onerror = () => { aiOutput.textContent = "Network error."; resolve(); };
    req.send(JSON.stringify({ name, season }));
  });
}

// Add a button near your AI output or favorite panel:
const tweetBtn = document.getElementById("tweetLeBronBtn");
tweetBtn?.addEventListener("click", async () => {
  tweetBtn.disabled = true;
  aiSection.hidden = false;
  aiOutput.textContent = "Posting to X…";

  try {
    const r = await fetch("/api/x/post-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "LeBron James" }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      aiOutput.textContent = `X post error (HTTP ${r.status}).`;
      tweetBtn.disabled = false;
      return;
    }
    const payload = await r.json();
    aiOutput.textContent = payload.ok
      ? `✅ Posted! (ID: ${payload.tweet_id})`
      : "Post failed.";
  } catch {
    aiOutput.textContent = "Network error while posting.";
  } finally {
    tweetBtn.disabled = false;
  }
});



function searchPlayers(query) {
  if (!query) { statusEl.textContent = "Type a name to search."; return; }
  statusEl.textContent = "Searching…";
  clearTable();

  const req = new XMLHttpRequest();
  req.open("GET", `/api/players/search?q=${encodeURIComponent(query)}`, true);
  req.onload = function () {
    if (req.status !== 200) { statusEl.textContent = `Error: HTTP ${req.status}`; return; }
    try {
      const payload = JSON.parse(req.responseText);
      lastPlayers = payload.data || [];
      if (!lastPlayers.length) { statusEl.textContent = "No players found."; return; }
      renderRows(lastPlayers);
      statusEl.textContent = `Found ${lastPlayers.length} player${lastPlayers.length !== 1 ? "s" : ""}.`;
    } catch { statusEl.textContent = "Parse error."; }
  };
  req.onerror = () => (statusEl.textContent = "Network error.");
  req.send();
}

searchBtn.addEventListener("click", () => searchPlayers(qInput.value.trim()));
qInput.addEventListener("keydown", (e) => { if (e.key === "Enter") searchBtn.click(); });

// ========= TABS + GAMES BY DATE =========
const tabs        = Array.from(document.querySelectorAll(".tab"));
const tabSearch   = document.getElementById("tab-search");
const tabGames    = document.getElementById("tab-games");
const gamesStatus = document.getElementById("gamesStatus");
const gamesBody   = document.getElementById("gamesBody");
const gamesDate   = document.getElementById("gamesDate");
const gamesLoad   = document.getElementById("gamesLoadBtn");

function todayET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
function clearGames() { gamesBody.innerHTML = ""; }

function renderGames(games, dateStr) {
  clearGames();
  if (!games.length) { gamesStatus.textContent = `No NBA games for ${dateStr}.`; return; }

  for (const g of games) {
    const tr = document.createElement("tr");
    const matchup = `${g.visitor_abbr || g.visitor} @ ${g.home_abbr || g.home}`;
    const score = (g.visitor_score != null && g.home_score != null) ? `${g.visitor_score} - ${g.home_score}` : "—";
    tr.innerHTML = `<td>${matchup}</td><td>${g.status || ""}</td><td>${score}</td>`;
    gamesBody.appendChild(tr);
  }
  gamesStatus.textContent = `Showing ${games.length} game${games.length !== 1 ? "s" : ""} for ${dateStr}.`;
}

function loadGamesByDate(dateStr) {
  if (!dateStr) { gamesStatus.textContent = "Pick a date."; return; }
  gamesStatus.textContent = "Loading games…";
  clearGames();

  const req = new XMLHttpRequest();
  req.open("GET", `/api/games?date=${encodeURIComponent(dateStr)}`, true);
  req.onload = function () {
    if (req.status !== 200) { gamesStatus.textContent = `Error: HTTP ${req.status}`; return; }
    try {
      const payload = JSON.parse(req.responseText);
      renderGames(payload.data || [], dateStr);
    } catch { gamesStatus.textContent = "Parse error."; }
  };
  req.onerror = () => (gamesStatus.textContent = "Network error.");
  req.send();
}

// tab switching
let gamesInitialized = false;
tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    const which = btn.dataset.tab;

    if (which === "search") {
      tabSearch.hidden = false;
      tabGames.hidden  = true;
    } else {
      tabSearch.hidden = true;
      tabGames.hidden  = false;
      if (!gamesInitialized) {
        gamesDate.value = gamesDate.value || todayET();
        loadGamesByDate(gamesDate.value);
        gamesInitialized = true;
      }
    }
  });
});

gamesLoad.addEventListener("click", () => loadGamesByDate(gamesDate.value));
gamesDate.addEventListener("change", () => loadGamesByDate(gamesDate.value));
