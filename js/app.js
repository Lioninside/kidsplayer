// ─────────────────────────────────────────────────────────────────────────────
// Lioninside Kids Player – Main Application
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  // ── State ────────────────────────────────────────────────────────────────────
  const state = {
    sdkPlayer:      null,   // Spotify Web Playback SDK instance
    deviceId:       null,
    currentTrack:   null,
    isPlaying:      false,
    positionMs:     0,
    durationMs:     0,
    volume:         80,
    muted:          false,
    volumeBeforeMute: 80,
    savedIds:       new Set(),
    blockedWords:   [],
    progressTimer:  null,   // local timer to tick progress between SDK events
  };

  // ── Load blocked words ───────────────────────────────────────────────────────
  try {
    const res  = await fetch('./blocked-words.json');
    const data = await res.json();
    state.blockedWords = Object.values(data)
      .flat()
      .filter(w => typeof w === 'string')
      .map(w => w.toLowerCase());
  } catch (e) {
    console.warn('Could not load blocked-words.json', e);
  }

  // ── Auth callback handling ───────────────────────────────────────────────────
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('code')) {
    try {
      await Auth.handleCallback(urlParams.get('code'));
    } catch (e) {
      console.error('Auth callback failed', e);
      PlayerUI.showLoginScreen();
      PlayerUI.showToast('Login failed. Please try again.');
      return;
    }
    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname);
  }

  // ── Check auth ───────────────────────────────────────────────────────────────
  const token = await Auth.getValidToken();
  if (!token) {
    PlayerUI.showLoginScreen();
    setupLoginButtons();
    return;
  }

  // ── Show player ───────────────────────────────────────────────────────────────
  PlayerUI.showPlayerScreen();
  setupLoginButtons();
  setupControls();
  setupSearch();
  setupTabs();
  loadUserInfo();
  loadFavorites();

  // ── Spotify Web Playback SDK ──────────────────────────────────────────────────
  window.onSpotifyWebPlaybackSDKReady = initSDK;

  // SDK script may already have fired; check by seeing if Spotify global exists
  if (typeof Spotify !== 'undefined') initSDK();

  // ─────────────────────────────────────────────────────────────────────────────
  // SDK Init
  // ─────────────────────────────────────────────────────────────────────────────
  async function initSDK() {
    const tkn = await Auth.getValidToken();
    if (!tkn) return;

    const player = new Spotify.Player({
      name:   'Lioninside Kids Player',
      volume: state.volume / 100,
      getOAuthToken: async cb => {
        const t = await Auth.getValidToken();
        cb(t || '');
      },
    });

    player.addListener('ready', ({ device_id }) => {
      state.deviceId = device_id;
      state.sdkPlayer = player;
      console.log('SDK ready, device:', device_id);
      // Transfer playback to this browser tab
      API.transferPlayback(device_id, false).catch(() => {});
    });

    player.addListener('not_ready', () => {
      state.deviceId = null;
      PlayerUI.showToast('Player disconnected. Reconnecting…');
    });

    player.addListener('player_state_changed', onSDKStateChange);

    player.addListener('authentication_error', () => {
      PlayerUI.showToast('Spotify session expired. Please reconnect.');
    });

    player.addListener('account_error', () => {
      PlayerUI.showToast('Spotify Premium is required.');
    });

    await player.connect();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SDK State Change
  // ─────────────────────────────────────────────────────────────────────────────
  function onSDKStateChange(sdkState) {
    if (!sdkState) return;

    const track = sdkState.track_window?.current_track;
    const paused = sdkState.paused;

    state.isPlaying  = !paused;
    state.positionMs = sdkState.position;
    state.durationMs = sdkState.duration;

    if (track && track.id !== state.currentTrack?.id) {
      // Content guard: skip explicit tracks
      if (track.explicit) {
        state.sdkPlayer?.nextTrack();
        PlayerUI.showToast('Skipped explicit content');
        return;
      }
      const normalized = normalizeSdkTrack(track);
      state.currentTrack = normalized;
      PlayerUI.setTrack(normalized);
      highlightActiveTrack(track.id);
      // Check & update saved state, then update the now-playing fav button
      checkSavedState([track.id]).then(() => {
        PlayerUI.setNowPlayingFav(state.savedIds.has(track.id));
      });
      // Silently pre-load album into the album tab
      const albumId = normalized.album?.id;
      if (albumId) showAlbum(albumId, false);
    }

    PlayerUI.setPlayState(state.isPlaying);
    PlayerUI.setProgress(state.positionMs, state.durationMs);

    // Keep local timer in sync
    clearInterval(state.progressTimer);
    if (state.isPlaying) startProgressTimer();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Local progress ticker (updates slider between SDK events)
  // ─────────────────────────────────────────────────────────────────────────────
  function startProgressTimer() {
    const TICK = 500;
    state.progressTimer = setInterval(() => {
      if (!state.isPlaying) return;
      state.positionMs = Math.min(state.positionMs + TICK, state.durationMs);
      PlayerUI.setProgress(state.positionMs, state.durationMs);
    }, TICK);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  function normalizeSdkTrack(t) {
    return {
      id:       t.id,
      name:     t.name,
      explicit: t.explicit,
      artists:  t.artists,
      album: {
        id:     t.album?.uri?.split(':').pop(),
        name:   t.album?.name,
        images: t.album?.images,
      },
    };
  }

  async function checkSavedState(ids) {
    try {
      const results = await API.checkSavedTracks(ids);
      ids.forEach((id, i) => {
        if (results[i]) state.savedIds.add(id);
        else             state.savedIds.delete(id);
      });
    } catch (e) { /* ignore */ }
    // Return so callers can .then() after it resolves
  }

  function highlightActiveTrack(id) {
    ['search-results', 'favorites-list', 'album-tracks'].forEach(listId => {
      PlayerUI.setActiveInList(document.getElementById(listId), id);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Play a track
  // ─────────────────────────────────────────────────────────────────────────────
  async function playTrack(track) {
    if (!state.deviceId) {
      PlayerUI.showToast('Player not ready. Please wait…');
      return;
    }
    if (track.explicit) {
      PlayerUI.showToast('This track contains explicit content and cannot be played here.');
      return;
    }
    try {
      await API.startPlayback(state.deviceId, { uris: [`spotify:track:${track.id}`] });
    } catch (e) {
      PlayerUI.showToast('Playback error: ' + (e.message || 'Unknown'));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Toggle favorite
  // ─────────────────────────────────────────────────────────────────────────────
  async function toggleFavorite(track, btn) {
    const saved = state.savedIds.has(track.id);
    const newSaved = !saved;
    try {
      if (saved) {
        await API.removeTrack(track.id);
        state.savedIds.delete(track.id);
        PlayerUI.showToast('Removed from favorites');
      } else {
        await API.saveTrack(track.id);
        state.savedIds.add(track.id);
        PlayerUI.showToast('Added to favorites ❤️');
      }
      // Sync all fav buttons for this track across all lists
      document.querySelectorAll(`.track-item[data-id="${track.id}"] .btn-fav`).forEach(b => {
        PlayerUI.updateFavBtn(b, newSaved);
      });
      // Sync the now-playing fav button if this is the current track
      if (state.currentTrack?.id === track.id) {
        PlayerUI.setNowPlayingFav(newSaved);
      }
    } catch (e) {
      PlayerUI.showToast('Could not update favorites');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Load user info
  // ─────────────────────────────────────────────────────────────────────────────
  async function loadUserInfo() {
    try {
      const me = await API.getMe();
      if (me?.display_name) {
        document.getElementById('user-name').textContent = me.display_name;
      }
    } catch (e) { /* ignore */ }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Load favorites
  // ─────────────────────────────────────────────────────────────────────────────
  async function loadFavorites() {
    const container = document.getElementById('favorites-list');
    container.innerHTML = `<div class="state-msg"><span>⏳</span>Loading…</div>`;
    try {
      const tracks = await API.getSavedTracks(50);
      tracks.forEach(t => state.savedIds.add(t.id));

      PlayerUI.renderTrackList(container, tracks, {
        savedIds: state.savedIds,
        activeId: state.currentTrack?.id,
        onPlay:   playTrack,
        onFav:    toggleFavorite,
      });
    } catch (e) {
      container.innerHTML = `<div class="state-msg"><span>⚠️</span>Could not load favorites</div>`;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Show album
  // ─────────────────────────────────────────────────────────────────────────────
  async function showAlbum(albumId, switchToTab = true) {
    if (!albumId) return;
    if (switchToTab) PlayerUI.switchTab('album');

    const headerEl = document.getElementById('album-header');
    const tracksEl = document.getElementById('album-tracks');

    headerEl.innerHTML = `<div class="state-msg"><span>⏳</span>Loading album…</div>`;
    tracksEl.innerHTML = '';

    try {
      const [album, tracks] = await Promise.all([
        API.getAlbum(albumId),
        API.getAlbumTracks(albumId),
      ]);

      // Album tracks from /albums/:id/tracks don't have album info; add it back
      tracks.forEach(t => { t.album = album; });

      PlayerUI.renderAlbumHeader(headerEl, album);
      PlayerUI.renderTrackList(tracksEl, tracks, {
        savedIds: state.savedIds,
        activeId: state.currentTrack?.id,
        onPlay:   playTrack,
        onFav:    toggleFavorite,
      });
    } catch (e) {
      headerEl.innerHTML = `<div class="state-msg"><span>⚠️</span>Could not load album</div>`;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Search
  // ─────────────────────────────────────────────────────────────────────────────
  function isQueryBlocked(query) {
    const lower = query.toLowerCase();
    return state.blockedWords.some(word => {
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(lower);
    });
  }

  async function doSearch() {
    const input = document.getElementById('search-input');
    const error = document.getElementById('search-error');
    const results = document.getElementById('search-results');
    const query = input.value.trim();

    if (!query) return;

    error.classList.add('hidden');

    if (isQueryBlocked(query)) {
      error.textContent = '🚫 This search is not allowed here.';
      error.classList.remove('hidden');
      results.innerHTML = '';
      return;
    }

    results.innerHTML = `<div class="state-msg"><span>🔍</span>Searching…</div>`;
    PlayerUI.switchTab('search');

    try {
      const tracks = await API.search(query);
      // Check saved state for all results
      if (tracks.length) {
        const ids = tracks.map(t => t.id);
        try {
          const saved = await API.checkSavedTracks(ids);
          ids.forEach((id, i) => {
            if (saved[i]) state.savedIds.add(id);
          });
        } catch (e) { /* ignore */ }
      }

      PlayerUI.renderTrackList(results, tracks, {
        savedIds: state.savedIds,
        activeId: state.currentTrack?.id,
        onPlay:   playTrack,
        onFav:    toggleFavorite,
      });
    } catch (e) {
      results.innerHTML = `<div class="state-msg"><span>⚠️</span>Search failed. Try again.</div>`;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Wiring
  // ─────────────────────────────────────────────────────────────────────────────
  function setupLoginButtons() {
    const loginBtn     = document.getElementById('login-btn');
    const reconnectBtn = document.getElementById('reconnect-btn');
    if (loginBtn)     loginBtn.addEventListener('click', () => Auth.login());
    if (reconnectBtn) reconnectBtn.addEventListener('click', () => Auth.login());
  }

  function setupControls() {
    // Play / Pause
    document.getElementById('play-pause-btn').addEventListener('click', async () => {
      if (!state.sdkPlayer) return;
      state.sdkPlayer.togglePlay();
    });

    // Prev
    document.getElementById('prev-btn').addEventListener('click', async () => {
      if (!state.sdkPlayer) return;
      try { await state.sdkPlayer.previousTrack(); }
      catch (e) { /* ignore */ }
    });

    // Next
    document.getElementById('next-btn').addEventListener('click', async () => {
      if (!state.sdkPlayer) return;
      try { await state.sdkPlayer.nextTrack(); }
      catch (e) { /* ignore */ }
    });

    // Progress slider
    let seekingViaSlider = false;
    const progSlider = PlayerUI.progressSlider;

    progSlider.addEventListener('mousedown', () => { seekingViaSlider = true; });
    progSlider.addEventListener('touchstart', () => { seekingViaSlider = true; }, { passive: true });

    progSlider.addEventListener('input', () => {
      const pct = parseFloat(progSlider.value);
      progSlider.style.setProperty('--pct', `${pct}%`);
      // Update time label while dragging
      const pos = (pct / 100) * state.durationMs;
      document.getElementById('current-time').textContent = PlayerUI.formatTime(pos);
    });

    progSlider.addEventListener('change', async () => {
      if (!state.deviceId) return;
      seekingViaSlider = false;
      const pct = parseFloat(progSlider.value);
      const pos = Math.floor((pct / 100) * state.durationMs);
      state.positionMs = pos;
      try { await API.seek(pos, state.deviceId); }
      catch (e) { /* ignore */ }
    });

    // Volume slider
    const volSlider = PlayerUI.volumeSlider;
    volSlider.addEventListener('input', async () => {
      const vol = parseInt(volSlider.value, 10);
      state.volume = vol;
      state.muted  = vol === 0;
      PlayerUI.setVolume(vol);
      if (state.sdkPlayer) {
        try { await state.sdkPlayer.setVolume(vol / 100); }
        catch (e) { /* ignore */ }
      }
    });

    // Mute toggle
    PlayerUI.muteBtn.addEventListener('click', async () => {
      if (state.muted) {
        state.muted  = false;
        state.volume = state.volumeBeforeMute || 80;
      } else {
        state.volumeBeforeMute = state.volume;
        state.muted  = true;
        state.volume = 0;
      }
      PlayerUI.setVolume(state.volume);
      if (state.sdkPlayer) {
        try { await state.sdkPlayer.setVolume(state.volume / 100); }
        catch (e) { /* ignore */ }
      }
    });

    // Now-playing favorite button
    PlayerUI.nowPlayingFavBtn.addEventListener('click', () => {
      if (!state.currentTrack) return;
      toggleFavorite(state.currentTrack, PlayerUI.nowPlayingFavBtn);
    });

    // Spacebar = play/pause (when not typing in an input)
    document.addEventListener('keydown', e => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        if (state.sdkPlayer) state.sdkPlayer.togglePlay();
      }
    });
  }

  function setupSearch() {
    const searchBtn   = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-input');
    const clearBtn    = document.getElementById('clear-search-btn');
    const errorEl     = document.getElementById('search-error');
    const resultsEl   = document.getElementById('search-results');

    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') doSearch();
    });

    // Show/hide clear button as user types
    searchInput.addEventListener('input', () => {
      clearBtn.classList.toggle('hidden', !searchInput.value);
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.classList.add('hidden');
      errorEl.classList.add('hidden');
      resultsEl.innerHTML = '';
      searchInput.focus();
    });
  }

  function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        PlayerUI.switchTab(btn.dataset.tab);
        if (btn.dataset.tab === 'favorites') loadFavorites();
        // If album tab opened and empty, load the current track's album
        if (btn.dataset.tab === 'album') {
          const albumId = state.currentTrack?.album?.id;
          const hasContent = document.getElementById('album-tracks').children.length > 0;
          if (albumId && !hasContent) showAlbum(albumId, false);
        }
      });
    });

    document.getElementById('refresh-favs-btn').addEventListener('click', loadFavorites);
  }

})();
