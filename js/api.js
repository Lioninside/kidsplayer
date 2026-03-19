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

    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (res.status === 401) {
      const refreshed = await Auth.refreshToken();
      if (!refreshed) { Auth.login(); return null; }
      return _fetch(path, options); // retry once
    }

    if (res.status === 204 || res.status === 202) return null; // no content
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }

    return res.json();
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
    if (!data) return [];

    // Filter out any explicit tracks that may have slipped through
    return (data.items || [])
      .map(item => item.track)
      .filter(t => t && !t.explicit && t.type === 'track');
  }

  async function checkSavedTracks(ids) {
    if (!ids.length) return [];
    const data = await _fetch(`/me/tracks/contains?ids=${ids.join(',')}`);
    return data || [];
  }

  async function saveTrack(id) {
    await _fetch(`/me/tracks?ids=${id}`, { method: 'PUT' });
  }

  async function removeTrack(id) {
    await _fetch(`/me/tracks?ids=${id}`, { method: 'DELETE' });
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
