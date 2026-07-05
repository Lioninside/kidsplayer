/* ============================================================
   Kids-Player — Spotify-UI (Version 2)
   Echter Spotify-Player: Anmeldung per PKCE, Wiedergabe über
   das Web Playback SDK (Premium), Inhalte live aus der Web API.
   Reduziert auf das Wesentliche: kein Shuffle, keine
   Empfehlungen, keine Podcasts — nur die eigene Musik.
   ============================================================ */

(function () {
  "use strict";

  const LS_VOLUME = "kp_spotify_volume";

  const state = {
    // Navigation
    history: [{ view: "home", id: null }],
    historyIndex: 0,
    searchQuery: "",
    // SDK / Gerät
    player: null,
    deviceId: null,
    sdkError: null,
    // Wiedergabezustand (aus player_state_changed, interpoliert)
    playback: null, // {id, uri, title, artist, image, durationMs, positionMs, paused, repeat, ts}
    likedCurrent: false,
    lastLikeCheckId: null,
    // Gerenderte Titellisten je Ansicht: Schlüssel → {tracks}
    lists: {},
    listSeq: 0,
    // Einfacher Antwort-Cache (60 s), damit Navigation flott bleibt
    cache: {},
    // Kinderschutz: gesperrte Suchbegriffe aus blocked-words.json
    blockedWords: [],
  };

  const els = {};
  [
    "loginScreen", "btnLogin", "redirectUriHint", "appRoot",
    "content", "sidebarPlaylists", "searchInput", "btnBack", "btnForward",
    "btnLogout", "toast",
    "playerCover", "playerTitle", "playerArtist", "btnFav",
    "btnPrev", "btnPlay", "btnNext", "btnRepeat", "repeatOne",
    "iconPlay", "iconPause", "timeCurrent", "timeTotal",
    "progressBar", "progressFill", "volumeSlider",
    "btnQueue", "btnBluetooth", "queuePanel", "queueList", "btnCloseQueue",
    "btModal", "btModalText", "btnCloseModal",
  ].forEach((id) => { els[id] = document.getElementById(id); });

  // ----------------------------------------------------------
  // Hilfsfunktionen
  // ----------------------------------------------------------

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function stripHtml(s) {
    const div = document.createElement("div");
    div.innerHTML = String(s || "");
    return div.textContent || "";
  }

  // ---- Kinderschutz: gesperrte Suchbegriffe ----
  async function loadBlockedWords() {
    try {
      const res = await fetch("blocked-words.json");
      const data = await res.json();
      state.blockedWords = Object.keys(data)
        .filter((k) => Array.isArray(data[k]))
        .reduce((all, k) => all.concat(data[k]), [])
        .filter((w) => typeof w === "string")
        .map((w) => w.toLowerCase());
    } catch (e) {
      state.blockedWords = [];
    }
  }

  function isQueryBlocked(query) {
    if (!state.blockedWords.length) return false;
    const lower = query.toLowerCase();
    return state.blockedWords.some((word) => {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp("\\b" + escaped + "\\b", "i").test(lower);
    });
  }

  function formatMs(ms) {
    const s = Math.max(0, Math.floor((ms || 0) / 1000));
    const m = Math.floor(s / 60);
    return m + ":" + String(s % 60).padStart(2, "0");
  }

  function imageUrl(images, small) {
    if (!images || !images.length) return null;
    if (small) return (images[images.length - 1] || images[0]).url;
    return images[0].url;
  }

  function showToast(msg, isError) {
    els.toast.textContent = msg;
    els.toast.classList.toggle("is-error", !!isError);
    els.toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { els.toast.hidden = true; }, 4500);
  }

  function handleError(err) {
    if (err && err.authExpired) { showLogin(); return; }
    showToast(err && err.message ? err.message : "Etwas hat nicht geklappt.", true);
  }

  async function cached(key, fn) {
    const hit = state.cache[key];
    if (hit && Date.now() - hit.ts < 60000) return hit.value;
    const value = await fn();
    state.cache[key] = { ts: Date.now(), value: value };
    return value;
  }

  function invalidateCache() { state.cache = {}; }

  // ---- Normalisierung der API-Objekte ----

  function normAlbum(a) {
    return {
      kind: "album", id: a.id, uri: a.uri,
      title: a.name,
      sub: (a.artists || []).map((x) => x.name).join(", "),
      image: imageUrl(a.images),
    };
  }

  function normPlaylist(p) {
    return {
      kind: "playlist", id: p.id, uri: p.uri,
      title: p.name,
      sub: (p.tracks && p.tracks.total != null ? p.tracks.total + " Songs" : "Playlist"),
      image: imageUrl(p.images),
    };
  }

  function normArtist(a) {
    return {
      kind: "artist", id: a.id, uri: a.uri,
      title: a.name, sub: "Künstler",
      image: imageUrl(a.images), round: true,
    };
  }

  function normTrack(t, fallbackImage) {
    return {
      id: t.id, uri: t.uri,
      title: t.name,
      artist: (t.artists || []).map((x) => x.name).join(", "),
      image: (t.album ? imageUrl(t.album.images, true) : null) || fallbackImage || null,
      albumId: t.album ? t.album.id : null,
      durationMs: t.duration_ms || 0,
    };
  }

  // ----------------------------------------------------------
  // Navigation (Zurück / Vorwärts)
  // ----------------------------------------------------------

  function currentRoute() { return state.history[state.historyIndex]; }

  function navigate(view, id) {
    const cur = currentRoute();
    if (cur.view === view && cur.id === (id || null)) return;
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push({ view: view, id: id || null });
    state.historyIndex++;
    render();
  }

  function goBack() { if (state.historyIndex > 0) { state.historyIndex--; render(); } }
  function goForward() { if (state.historyIndex < state.history.length - 1) { state.historyIndex++; render(); } }

  function updateNavButtons() {
    els.btnBack.disabled = state.historyIndex <= 0;
    els.btnForward.disabled = state.historyIndex >= state.history.length - 1;
  }

  function updateSidebarActive() {
    let active = currentRoute().view;
    if (active === "playlist") active = "playlists";
    if (active === "album" || active === "artist") active = "albums";
    document.querySelectorAll(".sidebar .nav-item").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.view === active);
    });
  }

  // ----------------------------------------------------------
  // Bausteine (HTML)
  // ----------------------------------------------------------

  function playIconSvg() {
    return '<svg viewBox="0 0 24 24"><path d="M8 5.1v13.8c0 .9 1 1.4 1.7.9l10-6.9c.6-.4.6-1.4 0-1.8l-10-6.9C9 3.7 8 4.2 8 5.1z"/></svg>';
  }

  function heartSvg() {
    return '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.7-10-9.2C.4 8.5 2.3 4.9 5.8 4.4c2-.3 4 .6 5.2 2.2l1 1.3 1-1.3c1.2-1.6 3.2-2.5 5.2-2.2 3.5.5 5.4 4.1 3.8 7.4C19.5 16.3 12 21 12 21z"/></svg>';
  }

  function coverHtml(item, cls) {
    const round = item.round ? " is-round" : "";
    if (item.image) {
      return '<div class="' + cls + round + '"><img src="' + esc(item.image) + '" alt="" loading="lazy"></div>';
    }
    return '<div class="' + cls + round + ' is-empty">&#9835;</div>';
  }

  function cardHtml(item) {
    const playable = item.kind !== "artist"
      ? '<button class="card-play" data-play title="Abspielen" aria-label="Abspielen">' + playIconSvg() + "</button>"
      : "";
    return (
      '<div class="card" data-kind="' + item.kind + '" data-id="' + esc(item.id) + '" data-uri="' + esc(item.uri) + '">' +
        '<button class="card-open" data-open>' +
          coverHtml(item, "card-cover") +
          '<div class="card-title">' + esc(item.title) + "</div>" +
          '<div class="card-sub">' + esc(item.sub) + "</div>" +
        "</button>" + playable +
      "</div>"
    );
  }

  function sectionHtml(title, inner) {
    return (
      '<section class="section">' +
        '<div class="section-header"><h2 class="section-title">' + esc(title) + "</h2></div>" +
        inner +
      "</section>"
    );
  }

  function registerList(tracks) {
    const key = "l" + (++state.listSeq);
    state.lists[key] = { tracks: tracks };
    return key;
  }

  function trackRowsHtml(tracks) {
    const key = registerList(tracks);
    const currentId = state.playback ? state.playback.id : null;
    return (
      '<div class="track-list" data-list="' + key + '">' +
      tracks.map((t, i) => {
        const isCur = t.id && t.id === currentId;
        return (
          '<div class="track-row' + (isCur ? " is-current" : "") + '" data-index="' + i + '" data-id="' + esc(t.id) + '" role="button" tabindex="0">' +
            '<span class="track-num">' + (i + 1) + "</span>" +
            '<span class="track-cover">' + (t.image ? '<img src="' + esc(t.image) + '" alt="" loading="lazy">' : "&#9835;") + "</span>" +
            '<span class="track-main">' +
              '<span class="track-name">' + esc(t.title) + "</span>" +
              '<span class="track-artist" style="display:block">' + esc(t.artist) + "</span>" +
            "</span>" +
            '<button class="track-fav" data-fav="' + esc(t.id) + '" title="Lieblingssong" aria-label="Lieblingssong">' + heartSvg() + "</button>" +
            '<span class="track-time">' + formatMs(t.durationMs) + "</span>" +
          "</div>"
        );
      }).join("") +
      "</div>"
    );
  }

  function loadingHtml(text) {
    return '<div class="loading"><div class="spinner"></div><p>' + esc(text || "Lädt …") + "</p></div>";
  }

  function emptyHtml(icon, title, text) {
    return (
      '<div class="empty-state"><div class="big">' + icon + "</div>" +
      "<h3>" + esc(title) + "</h3><p>" + esc(text || "") + "</p></div>"
    );
  }

  // Herz-Status für alle sichtbaren Titel nachladen
  async function markFavourites() {
    const btns = Array.from(document.querySelectorAll(".track-fav[data-fav]"));
    const ids = Array.from(new Set(btns.map((b) => b.dataset.fav).filter((id) => id && id !== "null")));
    if (!ids.length) return;
    try {
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const flags = await KPApi.tracksContains(batch);
        batch.forEach((id, j) => {
          document.querySelectorAll('.track-fav[data-fav="' + id + '"]').forEach((b) => {
            b.classList.toggle("is-fav", !!flags[j]);
          });
        });
      }
    } catch (e) { /* Herzen sind nicht kritisch */ }
  }

  // ----------------------------------------------------------
  // Ansichten
  // ----------------------------------------------------------

  let renderSeq = 0;

  function render() {
    const route = currentRoute();
    const seq = ++renderSeq;
    updateNavButtons();
    updateSidebarActive();
    state.lists = {};
    if (route.view !== "search" && els.searchInput.value) {
      els.searchInput.value = "";
      state.searchQuery = "";
    }
    const fns = {
      home: renderHome, search: renderSearch, library: renderLibrary,
      playlists: renderPlaylists, albums: renderAlbums,
      playlist: (s) => renderPlaylistDetail(route.id, s),
      album: (s) => renderAlbumDetail(route.id, s),
      artist: (s) => renderArtistDetail(route.id, s),
    };
    const fn = fns[route.view] || renderHome;
    Promise.resolve(fn(seq)).catch(handleError);
    els.content.scrollTop = 0;
  }

  function stale(seq) { return seq !== renderSeq; }

  async function renderHome(seq) {
    els.content.innerHTML = loadingHtml("Deine Musik wird geladen …");
    const [recent, playlists, albums, saved] = await Promise.all([
      cached("recent", () => KPApi.recentlyPlayed().catch(() => null)),
      cached("playlists", () => KPApi.myPlaylists()),
      cached("albums", () => KPApi.savedAlbums()),
      cached("saved", () => KPApi.savedTracks(25)),
    ]);
    if (stale(seq)) return;

    let html = "";

    // Zuletzt gehört: eindeutige Alben aus dem Verlauf
    if (recent && recent.items && recent.items.length) {
      const seen = {};
      const cards = [];
      recent.items.forEach((it) => {
        const alb = it.track && it.track.album;
        if (!alb || seen[alb.id]) return;
        seen[alb.id] = true;
        cards.push(cardHtml(normAlbum(alb)));
      });
      if (cards.length) {
        html += sectionHtml("Zuletzt gehört", '<div class="card-grid">' + cards.slice(0, 6).join("") + "</div>");
      }
    }

    html += sectionHtml(
      "Meine Playlists",
      playlists.length
        ? '<div class="card-grid">' + playlists.map((p) => cardHtml(normPlaylist(p))).join("") + "</div>"
        : emptyHtml("🎵", "Noch keine Playlists", "In Spotify erstellte Playlists erscheinen hier.")
    );

    html += sectionHtml(
      "Gespeicherte Alben",
      albums.length
        ? '<div class="card-grid">' + albums.map((x) => cardHtml(normAlbum(x.album))).join("") + "</div>"
        : emptyHtml("💿", "Noch keine Alben gespeichert", "In Spotify gespeicherte Alben erscheinen hier.")
    );

    const savedTracks = (saved.items || []).map((it) => normTrack(it.track));
    if (savedTracks.length) {
      html += sectionHtml("Lieblingssongs", trackRowsHtml(savedTracks));
    }

    els.content.innerHTML = html || emptyHtml("🎧", "Noch keine Musik", "Speichere Songs und Alben in Spotify — sie erscheinen dann hier.");
    markFavourites();
  }

  async function renderSearch(seq) {
    const q = state.searchQuery.trim();
    if (!q) {
      els.content.innerHTML = emptyHtml("🔍", "Was möchtest du hören?", "Suche nach Songs, Künstlern, Alben oder Playlists.");
      return;
    }
    if (isQueryBlocked(q)) {
      els.content.innerHTML = emptyHtml("🚫", "Diese Suche ist nicht erlaubt", "Bitte suche nach anderer Musik.");
      return;
    }
    els.content.innerHTML = loadingHtml("Suche läuft …");
    const res = await KPApi.search(q);
    if (stale(seq) || state.searchQuery.trim() !== q) return;

    let html = "";
    const tracks = ((res.tracks && res.tracks.items) || []).filter(Boolean).map((t) => normTrack(t));
    if (tracks.length) html += sectionHtml("Songs", trackRowsHtml(tracks));

    const artists = ((res.artists && res.artists.items) || []).filter(Boolean).map(normArtist);
    if (artists.length) html += sectionHtml("Künstler", '<div class="card-grid">' + artists.map(cardHtml).join("") + "</div>");

    const albums = ((res.albums && res.albums.items) || []).filter(Boolean).map(normAlbum);
    if (albums.length) html += sectionHtml("Alben", '<div class="card-grid">' + albums.map(cardHtml).join("") + "</div>");

    const playlists = ((res.playlists && res.playlists.items) || []).filter(Boolean).map(normPlaylist);
    if (playlists.length) html += sectionHtml("Playlists", '<div class="card-grid">' + playlists.map(cardHtml).join("") + "</div>");

    els.content.innerHTML = html || emptyHtml("🤷", "Nichts gefunden", "Für «" + q + "» gibt es kein Ergebnis.");
    markFavourites();
  }

  async function renderLibrary(seq) {
    els.content.innerHTML = loadingHtml();
    const [playlists, albums] = await Promise.all([
      cached("playlists", () => KPApi.myPlaylists()),
      cached("albums", () => KPApi.savedAlbums()),
    ]);
    if (stale(seq)) return;
    const cards =
      playlists.map((p) => cardHtml(normPlaylist(p))).join("") +
      albums.map((x) => cardHtml(normAlbum(x.album))).join("");
    els.content.innerHTML = sectionHtml(
      "Deine Bibliothek",
      cards ? '<div class="card-grid">' + cards + "</div>" : emptyHtml("🎧", "Noch leer", "Playlists und gespeicherte Alben erscheinen hier.")
    );
  }

  async function renderPlaylists(seq) {
    els.content.innerHTML = loadingHtml();
    const playlists = await cached("playlists", () => KPApi.myPlaylists());
    if (stale(seq)) return;
    els.content.innerHTML = sectionHtml(
      "Playlists",
      playlists.length
        ? '<div class="card-grid">' + playlists.map((p) => cardHtml(normPlaylist(p))).join("") + "</div>"
        : emptyHtml("🎵", "Noch keine Playlists", "In Spotify erstellte Playlists erscheinen hier.")
    );
  }

  async function renderAlbums(seq) {
    els.content.innerHTML = loadingHtml();
    const albums = await cached("albums", () => KPApi.savedAlbums());
    if (stale(seq)) return;
    els.content.innerHTML = sectionHtml(
      "Gespeicherte Alben",
      albums.length
        ? '<div class="card-grid">' + albums.map((x) => cardHtml(normAlbum(x.album))).join("") + "</div>"
        : emptyHtml("💿", "Noch keine Alben gespeichert", "In Spotify gespeicherte Alben erscheinen hier.")
    );
  }

  function detailHeaderHtml(kind, item, subline) {
    return (
      '<div class="detail-header">' +
        coverHtml(item, "detail-cover") +
        "<div>" +
          '<div class="detail-kind">' + esc(kind) + "</div>" +
          '<h1 class="detail-title">' + esc(item.title) + "</h1>" +
          '<div class="detail-sub">' + subline + "</div>" +
        "</div>" +
      "</div>" +
      '<button class="detail-play" data-play-first>' + playIconSvg() + "<span>Abspielen</span></button>"
    );
  }

  async function renderPlaylistDetail(id, seq) {
    els.content.innerHTML = loadingHtml();
    const [pl, items] = await Promise.all([
      KPApi.playlist(id),
      KPApi.playlistTracks(id),
    ]);
    if (stale(seq)) return;
    const tracks = items
      .filter((it) => it && it.track && it.track.type === "track")
      .map((it) => normTrack(it.track));
    const item = normPlaylist(pl);
    const total = tracks.reduce((s, t) => s + t.durationMs, 0);
    const desc = stripHtml(pl.description);
    const sub = (desc ? esc(desc) + " · " : "") + tracks.length + " Songs · " + formatMs(total);
    els.content.innerHTML =
      detailHeaderHtml("Playlist", item, sub) +
      (tracks.length ? trackRowsHtml(tracks) : emptyHtml("🎵", "Diese Playlist ist leer", ""));
    markFavourites();
  }

  async function renderAlbumDetail(id, seq) {
    els.content.innerHTML = loadingHtml();
    const album = await KPApi.album(id);
    if (stale(seq)) return;
    const image = imageUrl(album.images, true);
    const tracks = ((album.tracks && album.tracks.items) || []).map((t) => normTrack(t, image));
    const item = normAlbum(album);
    const total = tracks.reduce((s, t) => s + t.durationMs, 0);
    const sub = esc(item.sub) + " · " + tracks.length + " Songs · " + formatMs(total);
    els.content.innerHTML =
      detailHeaderHtml("Album", item, sub) +
      trackRowsHtml(tracks);
    markFavourites();
  }

  async function renderArtistDetail(id, seq) {
    els.content.innerHTML = loadingHtml();
    const [artist, top, albums] = await Promise.all([
      KPApi.artist(id),
      KPApi.artistTopTracks(id),
      KPApi.artistAlbums(id),
    ]);
    if (stale(seq)) return;
    const item = normArtist(artist);
    const tracks = ((top && top.tracks) || []).map((t) => normTrack(t));
    let html = detailHeaderHtml("Künstler", item, "Die beliebtesten Titel");
    if (tracks.length) html += sectionHtml("Top-Titel", trackRowsHtml(tracks));
    const seen = {};
    const albumCards = ((albums && albums.items) || [])
      .filter((a) => { if (seen[a.name]) return false; seen[a.name] = true; return true; })
      .map((a) => cardHtml(normAlbum(a)));
    if (albumCards.length) html += sectionHtml("Alben", '<div class="card-grid">' + albumCards.join("") + "</div>");
    els.content.innerHTML = html;
    markFavourites();
  }

  function renderSidebarPlaylists(playlists) {
    els.sidebarPlaylists.innerHTML = playlists.slice(0, 12)
      .map((p) => {
        const img = imageUrl(p.images, true);
        return (
          '<button class="sidebar-playlist" data-id="' + esc(p.id) + '">' +
            '<span class="mini-cover">' + (img ? '<img src="' + esc(img) + '" alt="">' : "&#9835;") + "</span>" +
            "<span>" + esc(p.name) + "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  // ----------------------------------------------------------
  // Web Playback SDK
  // ----------------------------------------------------------

  function loadSdk() {
    return new Promise((resolve, reject) => {
      window.onSpotifyWebPlaybackSDKReady = resolve;
      const s = document.createElement("script");
      s.src = "https://sdk.scdn.co/spotify-player.js";
      s.onerror = () => reject(new Error("Spotify-Player konnte nicht geladen werden."));
      document.head.appendChild(s);
    });
  }

  function initPlayer() {
    const volume = savedVolume() / 100;
    const player = new Spotify.Player({
      name: window.KP_CONFIG.playerName,
      getOAuthToken: (cb) => { KPAuth.getAccessToken().then((t) => { if (t) cb(t); }); },
      volume: volume,
    });

    player.addListener("ready", (e) => {
      state.deviceId = e.device_id;
      state.sdkError = null;
    });
    player.addListener("not_ready", () => { state.deviceId = null; });
    player.addListener("player_state_changed", onPlayerState);
    player.addListener("initialization_error", (e) => { state.sdkError = e.message; });
    player.addListener("authentication_error", (e) => { state.sdkError = e.message; showToast("Anmeldung abgelaufen — bitte neu anmelden.", true); });
    player.addListener("account_error", () => {
      state.sdkError = "premium";
      showToast("Für die Wiedergabe im Browser wird Spotify Premium benötigt.", true);
    });

    player.connect();
    state.player = player;
  }

  function onPlayerState(s) {
    if (!s || !s.track_window || !s.track_window.current_track) {
      if (state.playback) { state.playback.paused = true; updatePlayerBar(); }
      return;
    }
    const cur = s.track_window.current_track;
    // Kinderschutz-Sicherheitsnetz: sollte doch ein expliziter Titel starten
    // (z. B. durch Spotify-Autoplay), sofort überspringen.
    if (cur.explicit === true) {
      showToast("Expliziter Titel übersprungen.");
      if (state.player) state.player.nextTrack().catch(() => {});
      return;
    }
    state.playback = {
      id: cur.id,
      uri: cur.uri,
      title: cur.name,
      artist: (cur.artists || []).map((a) => a.name).join(", "),
      image: imageUrl(cur.album && cur.album.images),
      durationMs: s.duration,
      positionMs: s.position,
      paused: s.paused,
      repeat: s.repeat_mode, // 0 aus, 1 Kontext, 2 Titel
      ts: Date.now(),
    };
    updatePlayerBar();
    refreshTrackHighlights();
    checkCurrentLiked();
  }

  function currentPositionMs() {
    const p = state.playback;
    if (!p) return 0;
    if (p.paused) return p.positionMs;
    return Math.min(p.durationMs, p.positionMs + (Date.now() - p.ts));
  }

  setInterval(() => {
    if (state.playback && !state.playback.paused) updateProgress();
  }, 500);

  async function checkCurrentLiked() {
    const p = state.playback;
    if (!p || !p.id || p.id === state.lastLikeCheckId) return;
    state.lastLikeCheckId = p.id;
    try {
      const flags = await KPApi.tracksContains([p.id]);
      state.likedCurrent = !!(flags && flags[0]);
      els.btnFav.classList.toggle("is-fav", state.likedCurrent);
    } catch (e) { /* unkritisch */ }
  }

  function savedVolume() {
    const v = parseInt(localStorage.getItem(LS_VOLUME), 10);
    return isNaN(v) ? 70 : Math.max(0, Math.min(100, v));
  }

  // ----------------------------------------------------------
  // Wiedergabe-Aktionen
  // ----------------------------------------------------------

  function requireDevice() {
    if (state.sdkError === "premium") {
      showToast("Für die Wiedergabe im Browser wird Spotify Premium benötigt.", true);
      return false;
    }
    if (!state.deviceId) {
      showToast("Der Player wird noch vorbereitet — gleich nochmal versuchen.");
      return false;
    }
    return true;
  }

  // Wiedergabe läuft immer als gefilterte URI-Liste — nie als roher
  // context_uri. So kann kein explizit markierter Titel in die Wiedergabe
  // gelangen (Spotify würde bei context_uri die ganze, ungefilterte Liste
  // abspielen).
  async function playUris(uris, index) {
    if (!requireDevice()) return;
    if (!uris || !uris.length) {
      showToast("Hier gibt es nichts zum Abspielen.");
      return;
    }
    index = index || 0;
    // Fenster von max. 100 Titeln ab dem gewählten Titel (Spotify-Limit)
    let start = 0;
    let pos = index;
    if (uris.length > 100) {
      start = Math.min(index, uris.length - 100);
      pos = index - start;
    }
    await KPApi.play(state.deviceId, { uris: uris.slice(start, start + 100), offset: { position: pos } });
    // Bewusst linear wie ein Kassettendeck: Shuffle immer aus
    KPApi.shuffleOff(state.deviceId).catch(() => {});
  }

  // Ganze Sammlung (Album/Playlist) abspielen: Titel werden frisch geladen
  // und dabei bereits explicit-gefiltert, dann als URI-Liste gestartet.
  async function playCollection(kind, id) {
    if (!requireDevice()) return;
    try {
      let uris = [];
      if (kind === "album") uris = await KPApi.albumTrackUris(id);
      else if (kind === "playlist") uris = await KPApi.playlistTrackUris(id);
      await playUris(uris, 0);
    } catch (e) { handleError(e); }
  }

  // Die erste gerenderte Titelliste der aktuellen Ansicht abspielen
  // (für den grossen „Abspielen"-Knopf in Detail-Ansichten).
  function playFirstList() {
    const keys = Object.keys(state.lists);
    if (!keys.length) return;
    const list = state.lists[keys[0]];
    if (list && list.tracks.length) {
      playUris(list.tracks.map((t) => t.uri), 0).catch(handleError);
    } else {
      showToast("Hier gibt es nichts zum Abspielen.");
    }
  }

  function togglePlay() {
    if (!state.player) return;
    if (!state.playback) {
      // Noch nichts gewählt → mit den Lieblingssongs starten
      KPApi.savedTracks(50).then((saved) => {
        const uris = (saved.items || []).map((it) => it.track && it.track.uri).filter(Boolean);
        if (uris.length) return playUris(uris, 0);
        showToast("Wähle zuerst einen Song, ein Album oder eine Playlist.");
      }).catch(handleError);
      return;
    }
    state.player.togglePlay().catch(handleError);
  }

  function nextTrack() {
    if (state.player) state.player.nextTrack().catch(handleError);
  }

  function prevTrack() {
    if (!state.player) return;
    if (currentPositionMs() > 3000) {
      state.player.seek(0).catch(handleError);
    } else {
      state.player.previousTrack().catch(handleError);
    }
  }

  function cycleRepeat() {
    if (!requireDevice()) return;
    const cur = state.playback ? state.playback.repeat : 0;
    const next = cur === 0 ? "context" : cur === 1 ? "track" : "off";
    KPApi.setRepeat(next, state.deviceId)
      .then(() => {
        const mode = next === "off" ? 0 : next === "context" ? 1 : 2;
        if (state.playback) state.playback.repeat = mode;
        updateRepeatButton(mode);
      })
      .catch(handleError);
  }

  function updateRepeatButton(mode) {
    els.btnRepeat.classList.toggle("is-on", mode !== 0);
    els.repeatOne.hidden = mode !== 2;
    els.btnRepeat.title = mode === 0 ? "Wiederholen" : mode === 1 ? "Alle wiederholen" : "Titel wiederholen";
  }

  // ----------------------------------------------------------
  // Player-Leiste
  // ----------------------------------------------------------

  function updatePlayerBar() {
    const p = state.playback;
    if (p) {
      els.playerCover.innerHTML = p.image ? '<img src="' + esc(p.image) + '" alt="">' : "&#9835;";
      els.playerTitle.textContent = p.title;
      els.playerArtist.textContent = p.artist;
      els.timeTotal.textContent = formatMs(p.durationMs);
      els.btnFav.hidden = false;
      updateRepeatButton(p.repeat);
    }
    const playing = p && !p.paused;
    els.iconPlay.style.display = playing ? "none" : "";
    els.iconPause.style.display = playing ? "" : "none";
    els.btnPlay.title = playing ? "Pause" : "Abspielen";
    updateProgress();
  }

  function updateProgress() {
    const p = state.playback;
    const pos = currentPositionMs();
    const pct = p && p.durationMs > 0 ? (pos / p.durationMs) * 100 : 0;
    els.progressFill.style.width = Math.min(100, pct) + "%";
    els.timeCurrent.textContent = formatMs(pos);
  }

  function refreshTrackHighlights() {
    const currentId = state.playback ? state.playback.id : null;
    document.querySelectorAll(".track-row").forEach((row) => {
      row.classList.toggle("is-current", !!currentId && row.dataset.id === currentId);
    });
  }

  // ----------------------------------------------------------
  // Warteschlange
  // ----------------------------------------------------------

  async function renderQueuePanel() {
    els.queueList.innerHTML = loadingHtml();
    let data = null;
    try { data = await KPApi.queue(); } catch (e) { /* unten behandelt */ }
    const items = [];
    if (data && data.currently_playing) items.push({ t: data.currently_playing, current: true });
    ((data && data.queue) || []).forEach((t) => items.push({ t: t, current: false }));
    if (!items.length) {
      els.queueList.innerHTML =
        '<div class="empty-state" style="padding:32px 16px"><p>Die Warteschlange ist leer.<br>Wähle Musik zum Abspielen aus.</p></div>';
      return;
    }
    els.queueList.innerHTML = items
      .filter((x) => x.t && x.t.type === "track")
      .map((x) => {
        const t = normTrack(x.t);
        return (
          '<button class="queue-item' + (x.current ? " is-current" : "") + '" data-uri="' + esc(t.uri) + '">' +
            '<span class="mini-cover">' + (t.image ? '<img src="' + esc(t.image) + '" alt="">' : "&#9835;") + "</span>" +
            '<span class="queue-item-main">' +
              '<span class="q-title" style="display:block">' + esc(t.title) + "</span>" +
              '<span class="q-artist" style="display:block">' + esc(t.artist) + "</span>" +
            "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  function toggleQueuePanel(force) {
    const show = force !== undefined ? force : els.queuePanel.hidden;
    els.queuePanel.hidden = !show;
    els.btnQueue.classList.toggle("is-on", show);
    if (show) renderQueuePanel();
  }

  // ----------------------------------------------------------
  // Bluetooth
  // ----------------------------------------------------------

  function connectBluetooth() {
    if (navigator.bluetooth && navigator.bluetooth.requestDevice) {
      navigator.bluetooth
        .requestDevice({ acceptAllDevices: true })
        .then((device) => {
          els.btnBluetooth.classList.add("is-on");
          els.btnBluetooth.title = "Bluetooth: " + (device.name || "verbunden");
        })
        .catch(() => { /* Abgebrochen — kein Fehler nötig */ });
    } else {
      els.btModalText.textContent =
        "Dieser Browser kann Bluetooth nicht direkt steuern. " +
        "Verbinde den Lautsprecher über die Bluetooth-Einstellungen des Geräts — " +
        "die Musik läuft dann automatisch darüber.";
      els.btModal.hidden = false;
    }
  }

  // ----------------------------------------------------------
  // Lieblingssongs (Herz)
  // ----------------------------------------------------------

  async function toggleFav(trackId, btn) {
    if (!trackId || trackId === "null") return;
    const isFav = btn ? btn.classList.contains("is-fav")
      : (state.playback && state.playback.id === trackId ? state.likedCurrent : false);
    try {
      if (isFav) await KPApi.removeTrack(trackId);
      else await KPApi.saveTrack(trackId);
      document.querySelectorAll('.track-fav[data-fav="' + trackId + '"]').forEach((b) => {
        b.classList.toggle("is-fav", !isFav);
      });
      if (state.playback && state.playback.id === trackId) {
        state.likedCurrent = !isFav;
        els.btnFav.classList.toggle("is-fav", !isFav);
      }
      delete state.cache.saved;
    } catch (e) { handleError(e); }
  }

  // ----------------------------------------------------------
  // Ereignisse
  // ----------------------------------------------------------

  function bindEvents() {
    els.btnLogin.addEventListener("click", () => { KPAuth.login().catch(handleError); });
    els.btnLogout.addEventListener("click", () => {
      if (state.player) state.player.disconnect();
      KPAuth.logout();
    });

    document.querySelectorAll(".sidebar .nav-item").forEach((btn) => {
      btn.addEventListener("click", () => navigate(btn.dataset.view));
    });

    els.sidebarPlaylists.addEventListener("click", (e) => {
      const btn = e.target.closest(".sidebar-playlist");
      if (btn) navigate("playlist", btn.dataset.id);
    });

    els.btnBack.addEventListener("click", goBack);
    els.btnForward.addEventListener("click", goForward);

    // Suche (mit kurzer Verzögerung, um die API zu schonen)
    let searchTimer = null;
    els.searchInput.addEventListener("input", () => {
      state.searchQuery = els.searchInput.value;
      if (currentRoute().view !== "search") {
        navigate("search");
        els.searchInput.focus();
        return;
      }
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const seq = ++renderSeq;
        renderSearch(seq).catch(handleError);
      }, 350);
    });
    els.searchInput.addEventListener("focus", () => {
      if (currentRoute().view !== "search") {
        navigate("search");
        els.searchInput.focus();
      }
    });

    // Inhalte: Karten, Titelzeilen, Abspielen
    els.content.addEventListener("click", (e) => {
      const playBtn = e.target.closest("[data-play]");
      if (playBtn) {
        const card = playBtn.closest(".card");
        if (card) playCollection(card.dataset.kind, card.dataset.id);
        return;
      }
      const playFirst = e.target.closest("[data-play-first]");
      if (playFirst) { playFirstList(); return; }

      const favBtn = e.target.closest("[data-fav]");
      if (favBtn) { toggleFav(favBtn.dataset.fav, favBtn); return; }

      const row = e.target.closest(".track-row");
      if (row) {
        const listEl = row.closest(".track-list");
        const list = listEl ? state.lists[listEl.dataset.list] : null;
        if (!list) return;
        const idx = parseInt(row.dataset.index, 10) || 0;
        playUris(list.tracks.map((t) => t.uri), idx).catch(handleError);
        return;
      }
      const open = e.target.closest("[data-open]");
      if (open) {
        const card = open.closest(".card");
        if (card) navigate(card.dataset.kind, card.dataset.id);
      }
    });

    els.content.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const row = e.target.closest(".track-row");
      if (row) row.click();
    });

    // Player-Steuerung
    els.btnPlay.addEventListener("click", togglePlay);
    els.btnPrev.addEventListener("click", prevTrack);
    els.btnNext.addEventListener("click", nextTrack);
    els.btnRepeat.addEventListener("click", cycleRepeat);
    els.btnFav.addEventListener("click", () => {
      if (state.playback) toggleFav(state.playback.id, null);
    });

    els.progressBar.addEventListener("click", (e) => {
      const p = state.playback;
      if (!p || !state.player) return;
      const rect = els.progressBar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      state.player.seek(Math.floor(ratio * p.durationMs)).catch(handleError);
      p.positionMs = ratio * p.durationMs;
      p.ts = Date.now();
      updateProgress();
    });

    els.volumeSlider.addEventListener("input", () => {
      const v = parseInt(els.volumeSlider.value, 10) || 0;
      localStorage.setItem(LS_VOLUME, String(v));
      if (state.player) state.player.setVolume(v / 100).catch(() => {});
    });

    els.btnQueue.addEventListener("click", () => toggleQueuePanel());
    els.btnCloseQueue.addEventListener("click", () => toggleQueuePanel(false));
    els.queueList.addEventListener("click", (e) => {
      const item = e.target.closest(".queue-item");
      if (item && item.dataset.uri) playUris([item.dataset.uri], 0).catch(handleError);
    });

    els.btnBluetooth.addEventListener("click", connectBluetooth);
    els.btnCloseModal.addEventListener("click", () => { els.btModal.hidden = true; });
    els.btModal.addEventListener("click", (e) => {
      if (e.target === els.btModal) els.btModal.hidden = true;
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        toggleQueuePanel(false);
        els.btModal.hidden = true;
      }
      if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        togglePlay();
      }
    });
  }

  // ----------------------------------------------------------
  // Start
  // ----------------------------------------------------------

  function showLogin() {
    els.appRoot.hidden = true;
    els.loginScreen.hidden = false;
    els.redirectUriHint.textContent = KPAuth.redirectUri();
  }

  async function showApp() {
    els.loginScreen.hidden = true;
    els.appRoot.hidden = false;
    els.volumeSlider.value = savedVolume();
    render();
    cached("playlists", () => KPApi.myPlaylists())
      .then(renderSidebarPlaylists)
      .catch(() => { /* Sidebar-Playlists sind nicht kritisch */ });
    try {
      await loadSdk();
      initPlayer();
    } catch (e) {
      showToast(e.message, true);
    }
  }

  async function init() {
    bindEvents();
    loadBlockedWords();
    try {
      await KPAuth.handleRedirect();
    } catch (e) {
      showToast(e.message, true);
    }
    const token = await KPAuth.getAccessToken();
    if (token) {
      invalidateCache();
      showApp();
    } else {
      showLogin();
    }
  }

  init();
})();
