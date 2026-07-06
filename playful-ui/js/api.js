// ─────────────────────────────────────────────────────────────────────────────
// Lioninside Kids Player – Spotify API Wrapper
// ─────────────────────────────────────────────────────────────────────────────
const API = (() => {
  const BASE = 'https://api.spotify.com/v1';

  async function _fetch(path, options = {}) {
    const token = await Auth.getValidToken();
    if (!token) {
      Auth.login();
      return null;
    }

    // Only send Content-Type when there is a request body
    const headers = { Authorization: `Bearer ${token}` };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (options.headers) Object.assign(headers, options.headers);

    const res = await fetch(`${BASE}${path}`, { ...options, headers });

    if (res.status === 401) {
      const refreshed = await Auth.refreshToken();
      if (!refreshed) { Auth.login(); return null; }
      return _fetch(path, options); // retry once
    }

    // Some endpoints return 204/202 No Content — that is fine
    if (res.status === 204 || res.status === 202) return null;

    if (!res.ok) {
      // Try to parse error body; fall back gracefully
      let msg = `API error ${res.status}`;
      try { const e = await res.json(); msg = e.error?.message || msg; } catch (_) {}
      throw new Error(msg);
    }

    // Safely parse JSON — Spotify returns 200 with empty body on some write endpoints
    const text = await res.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text);
  }

  // ── User ─────────────────────────────────────────────────────────────────────
  async function getMe() {
    return _fetch('/me');
  }

  // ── Search ───────────────────────────────────────────────────────────────────
  // Returns only non-explicit tracks (no podcasts, no episodes, no videos)
  async function search(query, limit = 30) {
    const params = new URLSearchParams({
      q:      query,
      type:   'track',          // tracks only — no podcasts/episodes
      limit:  String(limit),
      market: 'from_token',
    });
    const data = await _fetch(`/search?${params}`);
    if (!data) return [];

    return (data.tracks?.items || []).filter(t => !t.explicit);
  }

  // ── Saved Tracks (Favorites) ─────────────────────────────────────────────────
  async function getSavedTracks(limit = 50, offset = 0) {
    const data = await _fetch(`/me/tracks?limit=${limit}&offset=${offset}&market=from_token`);
    if (!data) return { tracks: [], total: 0 };

    const tracks = (data.items || [])
      .map(item => item.track)
      .filter(t => t && !t.explicit && t.type === 'track');
    return { tracks, total: data.total || 0 };
  }

  async function checkSavedTracks(ids) {
    if (!ids.length) return [];
    const data = await _fetch(`/me/tracks/contains?ids=${ids.join(',')}`);
    return data || [];
  }

  async function saveTrack(id) {
    await _fetch('/me/tracks', { method: 'PUT', body: JSON.stringify({ ids: [id] }) });
  }

  async function removeTrack(id) {
    await _fetch('/me/tracks', { method: 'DELETE', body: JSON.stringify({ ids: [id] }) });
  }

  // ── Album ─────────────────────────────────────────────────────────────────────
  async function getAlbum(albumId) {
    return _fetch(`/albums/${albumId}?market=from_token`);
  }

  async function getAlbumTracks(albumId, limit = 50) {
    const data = await _fetch(`/albums/${albumId}/tracks?limit=${limit}&market=from_token`);
    if (!data) return [];
    return (data.items || []).filter(t => !t.explicit);
  }

  // ── Playback ──────────────────────────────────────────────────────────────────
  async function transferPlayback(deviceId, play = false) {
    await _fetch('/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [deviceId], play }),
    });
  }

  async function startPlayback(deviceId, payload) {
    // payload: { uris: [...] } or { context_uri, offset }
    await _fetch(`/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      body:   JSON.stringify(payload),
    });
  }

  async function pausePlayback(deviceId) {
    await _fetch(`/me/player/pause?device_id=${deviceId}`, { method: 'PUT' });
  }

  async function resumePlayback(deviceId) {
    await _fetch(`/me/player/play?device_id=${deviceId}`, { method: 'PUT' });
  }

  async function nextTrack(deviceId) {
    await _fetch(`/me/player/next?device_id=${deviceId}`, { method: 'POST' });
  }

  async function prevTrack(deviceId) {
    await _fetch(`/me/player/previous?device_id=${deviceId}`, { method: 'POST' });
  }

  async function seek(positionMs, deviceId) {
    await _fetch(`/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`, { method: 'PUT' });
  }

  async function setVolume(volumePercent, deviceId) {
    await _fetch(`/me/player/volume?volume_percent=${volumePercent}&device_id=${deviceId}`, { method: 'PUT' });
  }

  async function getPlaybackState() {
    return _fetch('/me/player?market=from_token');
  }

  return {
    getMe,
    search,
    getSavedTracks,
    checkSavedTracks,
    saveTrack,
    removeTrack,
    getAlbum,
    getAlbumTracks,
    transferPlayback,
    startPlayback,
    pausePlayback,
    resumePlayback,
    nextTrack,
    prevTrack,
    seek,
    setVolume,
    getPlaybackState,
  };
})();
