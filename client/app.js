
const FAV_KEY = "nba.favorite.player";
const favPanel  = document.getElementById("favoritePlayerPanel");
const favContent  = document.getElementById("favoritePlayerContent");
const favClearBtn  = document.getElementById("favoriteClearBtn");

const aiSection = document.getElementById("aiSection");
const aiOutput = document.getElementById("aiOutput");
let lastAiReport = "";
let lastAiReportFor = "";

function sanitizeHandle(h) {
    return String(h || "").trim().replace(/^@+/, "").replace(/[^\w_]/g, "").slice(0, 15);
  }
  function toTweetLength(s) {
    if (!s) return "";
    s = String(s).replace(/\s+\n/g, "\n").trim();
    return s.length <= 280 ? s : s.slice(0, 279) + "…";
  }

function getFavoritePlayer() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || null; }
  catch { return null; }
}

function setFavoritePlayer(player) {
  if (!player || player.id == null) return;
  localStorage.setItem(FAV_KEY, JSON.stringify({
    id: String(player.id),
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

  document.getElementById("favClearDyn")?.addEventListener("click", clearFavoritePlayer);
  document.getElementById("favAiDyn")?.addEventListener("click", () => {
    aiSection.hidden = false;
    aiOutput.textContent = `Generating “On This Day” for ${fav.name}…`;
    generateOnThisDay(fav.name);
  });
}

//search tab
const statusEl = document.getElementById("status");
const qInput = document.getElementById("q");
const searchBtn = document.getElementById("searchBtn");
const tableBody = document.getElementById("statsBody");

function clearTable() { tableBody.innerHTML = ""; }
let lastPlayers = [];

function renderRows(players) {
  tableBody.innerHTML = "";
  const fav = getFavoritePlayer();

  for (const p of players) {
    const teamFull = p.team ? `${p.team.full_name} (${p.team.abbreviation})` : "-";
    const isFavorite = !!(fav && String(fav.id) === String(p.id));

    const tr = document.createElement("tr");
    if (isFavorite) tr.classList.add("is-favorite");

    tr.innerHTML = `
      <td><strong>${p.first_name} ${p.last_name}</strong></td>
      <td>${teamFull}</td>
      <td>${p.position || "-"}</td>
      <td class="actions">
        <button class="ai-btn" data-name="${p.first_name} ${p.last_name}">AI Report</button>
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

    renderFavoritePanel();
    renderRows(lastPlayers);
    return;
  }

  const aiBtn = e.target.closest(".ai-btn");
  if (aiBtn && !aiBtn.disabled) {
    aiBtn.disabled = true;
    const name = aiBtn.dataset.name;
    generateOnThisDay(name).finally(() => (aiBtn.disabled = false));
  }
});

function ensureMentionControls() {
    let wrap = document.getElementById("tweetAiWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "tweetAiWrap";
      wrap.style.display = "flex";
      wrap.style.gap = "8px";
      wrap.style.marginTop = "8px";
      wrap.style.flexWrap = "wrap";
      aiSection.appendChild(wrap);
    }
  
    // handle input
    let handleInput = document.getElementById("aiHandleInput");
    if (!handleInput) {
      handleInput = document.createElement("input");
      handleInput.id = "aiHandleInput";
      handleInput.type = "text";
      handleInput.placeholder = "@yourtwitterhandle";
      handleInput.autocomplete = "off";
      handleInput.style.padding = "8px";
      handleInput.style.minWidth = "160px";
      wrap.appendChild(handleInput);
    }
  
    // "Send it to me" button 
    let atBtn = document.getElementById("tweetAiAtBtn");
    if (!atBtn) {
      atBtn = document.createElement("button");
      atBtn.id = "tweetAiAtBtn";
      atBtn.className = "btn";
      atBtn.textContent = "Send it to me";
      wrap.appendChild(atBtn);
  
      atBtn.addEventListener("click", async () => {
        if (!lastAiReport.trim()) {
          aiOutput.textContent = "No report to tweet yet.";
          return;
        }
        const handle = sanitizeHandle((handleInput.value || ""));
        if (!handle) {
          aiOutput.textContent = "Enter a valid X handle (e.g., @yourname).";
          handleInput.focus();
          return;
        }
  
        //  @handle and keep within 280char
        let text = `@${handle} ${lastAiReport}`.replace(/\s+/g, " ").trim();
        text = toTweetLength(text);
  
        const original = atBtn.textContent;
        atBtn.disabled = true; atBtn.textContent = "Posting to X…";
        try {
          const r = await fetch("/api/x/post-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || j.ok === false) {
            aiOutput.textContent = `X post error (HTTP ${r.status || "?"}).`;
          } else {
            aiOutput.textContent = ` Posted mention! (ID: ${j.tweet_id})`;
          }
        } catch {
          aiOutput.textContent = "Network error while posting.";
        } finally {
          atBtn.disabled = false; atBtn.textContent = original;
        }
      });
    }
  }
  

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
          lastAiReport = "";
          return resolve();
        }
        try {
          const payload = JSON.parse(req.responseText);
          const text = payload.report || "No report returned.";
          lastAiReport = text;
          lastAiReportFor = name;
          aiOutput.textContent = text;
          ensureMentionControls();
        } catch {
          aiOutput.textContent = `Parse error. Body was:\n${req.responseText?.slice(0,300) || "(empty)"}`;
          lastAiReport = "";
        }
        resolve();
      };
  
      req.onerror = () => {
        lastAiReport = "";
        aiOutput.textContent = "Network error (request failed before reaching server).";
        resolve();
      };
  
      req.send(JSON.stringify({ name }));
    });
  }
  

//search
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

// tabs
const tabs  = Array.from(document.querySelectorAll(".tab"));
const tabSearch = document.getElementById("tab-search");
const tabGames = document.getElementById("tab-games");
const gamesStatus = document.getElementById("gamesStatus");
const gamesBody  = document.getElementById("gamesBody");
const gamesDate  = document.getElementById("gamesDate");
const gamesLoad  = document.getElementById("gamesLoadBtn");

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


document.addEventListener("DOMContentLoaded", () => {
  renderFavoritePanel();

  favClearBtn?.addEventListener("click", clearFavoritePlayer);

});


gamesLoad.addEventListener("click", () => loadGamesByDate(gamesDate.value));
gamesDate.addEventListener("change", () => loadGamesByDate(gamesDate.value));
