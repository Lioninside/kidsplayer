// ─────────────────────────────────────────────────────────────────────────────
// Lioninside Kids Player – PKCE Auth (no client secret required)
// ─────────────────────────────────────────────────────────────────────────────
const Auth = (() => {
  const STORAGE = {
    ACCESS_TOKEN:  'lkp_access_token',
    REFRESH_TOKEN: 'lkp_refresh_token',
    EXPIRES_AT:    'lkp_expires_at',
    CODE_VERIFIER: 'lkp_code_verifier',
  };

  // ── PKCE helpers ────────────────────────────────────────────────────────────
  function _randomBytes(length) {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return arr;
  }

  function _base64url(uint8Array) {
    return btoa(String.fromCharCode(...uint8Array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  async function _generateVerifier() {
    return _base64url(_randomBytes(32));
  }

  async function _generateChallenge(verifier) {
    const data   = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return _base64url(new Uint8Array(digest));
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  async function login() {
    const verifier   = await _generateVerifier();
    const challenge  = await _generateChallenge(verifier);
    sessionStorage.setItem(STORAGE.CODE_VERIFIER, verifier);

    const params = new URLSearchParams({
      client_id:             CONFIG.CLIENT_ID,
      response_type:         'code',
      redirect_uri:          CONFIG.REDIRECT_URI,
      scope:                 CONFIG.SCOPES,
      code_challenge_method: 'S256',
      code_challenge:        challenge,
      show_dialog:           'true',
    });
    window.location.href = `https://accounts.spotify.com/authorize?${params}`;
  }

  async function handleCallback(code) {
    const verifier = sessionStorage.getItem(STORAGE.CODE_VERIFIER);
    if (!verifier) throw new Error('Missing code verifier');

    const body = new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  CONFIG.REDIRECT_URI,
      client_id:     CONFIG.CLIENT_ID,
      code_verifier: verifier,
    });

    const res  = await fetch('https://accounts.spotify.com/api/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error_description || 'Token exchange failed');
    }

    const data = await res.json();
    _storeTokens(data);
    sessionStorage.removeItem(STORAGE.CODE_VERIFIER);
    return data.access_token;
  }

  async function refreshToken() {
    const token = localStorage.getItem(STORAGE.REFRESH_TOKEN);
    if (!token) return null;

    const body = new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: token,
      client_id:     CONFIG.CLIENT_ID,
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      logout();
      return null;
    }

    const data = await res.json();
    _storeTokens(data);
    return data.access_token;
  }

  async function getValidToken() {
    const accessToken = localStorage.getItem(STORAGE.ACCESS_TOKEN);
    const expiresAt   = parseInt(localStorage.getItem(STORAGE.EXPIRES_AT) || '0', 10);

    if (!accessToken) return null;

    // Refresh 60 seconds before expiry
    if (Date.now() >= expiresAt - 60_000) {
      return await refreshToken();
    }
    return accessToken;
  }

  function logout() {
    Object.values(STORAGE).forEach(k => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
  }

  function _storeTokens(data) {
    localStorage.setItem(STORAGE.ACCESS_TOKEN,  data.access_token);
    localStorage.setItem(STORAGE.EXPIRES_AT,    Date.now() + data.expires_in * 1000);
    if (data.refresh_token) {
      localStorage.setItem(STORAGE.REFRESH_TOKEN, data.refresh_token);
    }
  }

  return { login, handleCallback, refreshToken, getValidToken, logout };
})();
