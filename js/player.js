// ─────────────────────────────────────────────────────────────────────────────
// Lioninside Kids Player – Player UI Manager
// ─────────────────────────────────────────────────────────────────────────────
const PlayerUI = (() => {

  // ── DOM references ──────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const vinyl            = $('vinyl');
  const vinylArt         = $('vinyl-art');
  const trackName        = $('track-name');
  const artistName       = $('artist-name');
  const nowPlayingFavBtn = $('now-playing-fav-btn');
  const progressSlider   = $('progress-slider');
  const currentTime   = $('current-time');
  const totalTime     = $('total-time');
  const playPauseBtn  = $('play-pause-btn');
  const iconPlay      = $('icon-play');
  const iconPause     = $('icon-pause');
  const volumeSlider  = $('volume-slider');
  const muteBtn       = $('mute-btn');
  const iconVolOn     = $('icon-vol-on');
  const iconVolOff    = $('icon-vol-off');
  const toast         = $('toast');

  let toastTimer = null;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function formatTime(ms) {
    const s   = Math.floor(ms / 1000);
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  // ── Track display ────────────────────────────────────────────────────────────
  function setTrack(track) {
    if (!track) {
      trackName.textContent  = 'No track playing';
      artistName.textContent = 'Select a song to start';
      vinylArt.src           = '';
      vinylArt.style.display = 'none';
      nowPlayingFavBtn.classList.add('hidden');
      return;
    }

    const art = track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || '';
    trackName.textContent  = track.name;
    trackName.title        = track.name; // tooltip for long names
    artistName.textContent = track.artists?.map(a => a.name).join(', ') || '';
    vinylArt.src           = art;
    vinylArt.style.display = art ? 'block' : 'none';
    nowPlayingFavBtn.classList.remove('hidden');
    nowPlayingFavBtn.dataset.trackId = track.id;

    document.title = `${track.name} – Lioninside Kids Player`;
  }

  function setNowPlayingFav(saved) {
    nowPlayingFavBtn.textContent = saved ? '❤️ Saved' : '🤍 Save';
    nowPlayingFavBtn.classList.toggle('saved', saved);
    nowPlayingFavBtn.title = saved ? 'Remove from favorites' : 'Add to favorites';
  }

  // ── Play/Pause state ─────────────────────────────────────────────────────────
  function setPlayState(playing) {
    document.body.classList.toggle('is-playing', playing);
    vinyl.classList.toggle('spinning', playing);
    iconPlay.classList.toggle('hidden', playing);
    iconPause.classList.toggle('hidden', !playing);
  }

  // ── Progress ─────────────────────────────────────────────────────────────────
  function setProgress(positionMs, durationMs) {
    currentTime.textContent = formatTime(positionMs);
    totalTime.textContent   = durationMs ? formatTime(durationMs) : '0:00';

    if (durationMs > 0) {
      const pct = (positionMs / durationMs) * 100;
      progressSlider.value = pct;
      progressSlider.style.setProperty('--pct', `${pct}%`);
    }
  }

  // ── Volume ───────────────────────────────────────────────────────────────────
  function setVolume(vol) {
    volumeSlider.value = vol;
    const muted = vol === 0;
    iconVolOn.classList.toggle('hidden', muted);
    iconVolOff.classList.toggle('hidden', !muted);
  }

  // ── Toast notification ───────────────────────────────────────────────────────
  function showToast(msg, duration = 2500) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    // Force reflow to restart animation
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  // ── Track list item builder ──────────────────────────────────────────────────
  function buildTrackItem(track, { isSaved = false, onPlay, onFav, isActive = false } = {}) {
    const art = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url || '';

    const item = document.createElement('div');
    item.className = `track-item${isActive ? ' active' : ''}`;
    item.dataset.id = track.id;

    item.innerHTML = `
      <img class="track-thumb" src="${art}" alt="" loading="lazy">
      <div class="playing-bars"><span></span><span></span><span></span></div>
      <div class="track-meta">
        <div class="track-title" title="${_esc(track.name)}">${_esc(track.name)}</div>
        <div class="track-artist">${_esc(track.artists?.map(a => a.name).join(', ') || '')}</div>
      </div>
      <div class="track-actions">
        <button class="btn-fav ${isSaved ? 'saved' : ''}" title="${isSaved ? 'Remove from favorites' : 'Add to favorites'}">
          ${isSaved ? '❤️' : '🤍'}
        </button>
      </div>
    `;

    item.querySelector('.btn-fav').addEventListener('click', e => {
      e.stopPropagation();
      if (onFav) onFav(track, item.querySelector('.btn-fav'));
    });

    item.addEventListener('click', () => {
      if (onPlay) onPlay(track);
    });

    return item;
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Track list renderer ──────────────────────────────────────────────────────
  function renderTrackList(container, tracks, { savedIds = new Set(), activeId = null, onPlay, onFav } = {}) {
    container.innerHTML = '';

    if (!tracks.length) {
      container.innerHTML = `<div class="state-msg"><span>🎵</span>No results found</div>`;
      return;
    }

    tracks.forEach(track => {
      const el = buildTrackItem(track, {
        isSaved:  savedIds.has(track.id),
        isActive: track.id === activeId,
        onPlay,
        onFav,
      });
      container.appendChild(el);
    });
  }

  // ── Update a fav button in any track list ────────────────────────────────────
  function updateFavBtn(btn, saved) {
    btn.textContent = saved ? '❤️' : '🤍';
    btn.classList.toggle('saved', saved);
    btn.title = saved ? 'Remove from favorites' : 'Add to favorites';
  }

  // ── Highlight active track in a list ─────────────────────────────────────────
  function setActiveInList(container, trackId) {
    container.querySelectorAll('.track-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === trackId);
    });
  }

  // ── Album header builder ─────────────────────────────────────────────────────
  function renderAlbumHeader(container, album) {
    const art  = album.images?.[1]?.url || album.images?.[0]?.url || '';
    const year = album.release_date?.slice(0, 4) || '';
    container.innerHTML = `
      <img class="album-cover" src="${art}" alt="${_esc(album.name)}">
      <div class="album-info">
        <div class="album-name">${_esc(album.name)}</div>
        <div class="album-artist">${_esc(album.artists?.map(a => a.name).join(', ') || '')}</div>
        <div class="album-year">${_esc(year)} · ${album.total_tracks || ''} tracks</div>
      </div>
    `;
  }

  // ── Screen switching ─────────────────────────────────────────────────────────
  function showLoginScreen() {
    $('login-screen').classList.remove('hidden');
    $('player-screen').classList.add('hidden');
  }

  function showPlayerScreen() {
    $('login-screen').classList.add('hidden');
    $('player-screen').classList.remove('hidden');
  }

  // ── Tab switching ────────────────────────────────────────────────────────────
  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-content').forEach(t => {
      const active = t.id === `tab-${name}`;
      t.classList.toggle('active', active);
      t.classList.toggle('hidden', !active);
    });
  }

  return {
    setTrack,
    setNowPlayingFav,
    setPlayState,
    setProgress,
    setVolume,
    showToast,
    buildTrackItem,
    renderTrackList,
    updateFavBtn,
    setActiveInList,
    renderAlbumHeader,
    showLoginScreen,
    showPlayerScreen,
    switchTab,
    formatTime,
    // expose DOM handles needed by app.js
    progressSlider,
    volumeSlider,
    muteBtn,
    nowPlayingFavBtn,
  };
})();
