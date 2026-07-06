/* ============================================================
   Kids-Player — Spotify Web API
   Dünner Fetch-Wrapper mit Token, 429-Retry und den wenigen
   Endpunkten, die der Player braucht.
   ============================================================ */

(function () {
  "use strict";

  const BASE = "https://api.spotify.com/v1";

  async function call(path, opts) {
    opts = opts || {};
    const token = await window.KPAuth.getAccessToken();
    if (!token) {
      const err = new Error("Nicht angemeldet");
      err.authExpired = true;
      throw err;
    }
    const headers = { Authorization: "Bearer " + token };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(BASE + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (res.status === 429 && !opts._retried) {
      const wait = (parseInt(res.headers.get("Retry-After"), 10) || 1) * 1000;
      await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
      return call(path, Object.assign({}, opts, { _retried: true }));
    }
    if (res.status === 204 || res.status === 202) return null;
    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try {
        const data = await res.json();
        if (data && data.error && data.error.message) msg = data.error.message;
      } catch (e) { /* Antwort ohne JSON */ }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // Paginierte Listen zusammenführen (max. `pages` Seiten)
  async function pageAll(path, pages) {
    let items = [];
    let data = await call(path);
    items = items.concat(data.items || []);
    let next = data.next;
    let n = 1;
    while (next && n < (pages || 2)) {
      data = await call(next.replace(BASE, ""));
      items = items.concat(data.items || []);
      next = data.next;
      n++;
    }
    return items;
  }

  // ---- Kinderschutz: explizite Titel werden überall herausgefiltert ----
  // Ein Titel gilt nur als erlaubt, wenn Spotify ihn NICHT als "explicit"
  // markiert. Dieser Filter greift an jeder Stelle, an der Titel geladen
  // werden — Suche, Favoriten, Playlists, Alben, Künstler, Warteschlange.
  function clean(t) { return !!t && t.explicit !== true; }

  window.KPApi = {
    // Profil & eigene Inhalte
    me: () => call("/me"),
    myPlaylists: () => pageAll("/me/playlists?limit=50", 2),
    savedAlbums: () => pageAll("/me/albums?limit=50", 2),

    savedTracks: async (limit) => {
      const data = await call("/me/tracks?market=from_token&limit=" + (limit || 50));
      if (data && data.items) {
        data.items = data.items.filter((it) => it && it.track && it.track.type === "track" && clean(it.track));
      }
      return data;
    },

    recentlyPlayed: async () => {
      const data = await call("/me/player/recently-played?limit=50");
      if (data && data.items) {
        data.items = data.items.filter((it) => it && it.track && clean(it.track));
      }
      return data;
    },

    // Detailansichten
    playlist: (id) => call("/playlists/" + id + "?market=from_token&fields=id,uri,name,description,images,owner(display_name),tracks(total)"),

    playlistTracks: async (id) => {
      const items = await pageAll("/playlists/" + id + "/tracks?market=from_token&limit=100", 3);
      return items.filter((it) => it && it.track && it.track.type === "track" && clean(it.track));
    },

    album: async (id) => {
      const album = await call("/albums/" + id + "?market=from_token");
      if (album && album.tracks && album.tracks.items) {
        album.tracks.items = album.tracks.items.filter(clean);
      }
      return album;
    },

    artist: (id) => call("/artists/" + id),

    artistTopTracks: async (id) => {
      const data = await call("/artists/" + id + "/top-tracks?market=from_token");
      if (data && data.tracks) data.tracks = data.tracks.filter(clean);
      return data;
    },

    artistAlbums: (id) => call("/artists/" + id + "/albums?include_groups=album,single&limit=24&market=from_token"),

    // Suche (nur Musik). Explizite Titel werden aus den Ergebnissen entfernt;
    // Alben/Playlists/Künstler werden beim Abspielen ohnehin gefiltert.
    search: async (q) => {
      const data = await call("/search?type=track,album,playlist,artist&limit=10&market=from_token&q=" + encodeURIComponent(q));
      if (data && data.tracks && data.tracks.items) {
        data.tracks.items = data.tracks.items.filter(clean);
      }
      return data;
    },

    // Track-URIs einer Sammlung laden (bereits explicit-gefiltert), damit die
    // Wiedergabe als saubere URI-Liste statt als roher context_uri läuft.
    albumTrackUris: async (id) => {
      const album = await call("/albums/" + id + "?market=from_token");
      return ((album && album.tracks && album.tracks.items) || []).filter(clean).map((t) => t.uri);
    },
    playlistTrackUris: async (id) => {
      const items = await pageAll("/playlists/" + id + "/tracks?market=from_token&limit=100", 3);
      return items.filter((it) => it && it.track && it.track.type === "track" && clean(it.track)).map((it) => it.track.uri);
    },

    // Wiedergabe
    play: (deviceId, body) => call("/me/player/play?device_id=" + encodeURIComponent(deviceId), { method: "PUT", body: body || {} }),
    transfer: (deviceId) => call("/me/player", { method: "PUT", body: { device_ids: [deviceId], play: false } }),
    shuffleOff: (deviceId) => call("/me/player/shuffle?state=false&device_id=" + encodeURIComponent(deviceId), { method: "PUT" }),
    setRepeat: (state, deviceId) => call("/me/player/repeat?state=" + state + "&device_id=" + encodeURIComponent(deviceId), { method: "PUT" }),

    queue: async () => {
      const data = await call("/me/player/queue");
      if (data) {
        if (data.currently_playing && !clean(data.currently_playing)) data.currently_playing = null;
        if (data.queue) data.queue = data.queue.filter(clean);
      }
      return data;
    },

    // Lieblingssongs
    tracksContains: (ids) => call("/me/tracks/contains?ids=" + ids.join(",")),
    saveTrack: (id) => call("/me/tracks?ids=" + id, { method: "PUT" }),
    removeTrack: (id) => call("/me/tracks?ids=" + id, { method: "DELETE" }),
  };
})();
