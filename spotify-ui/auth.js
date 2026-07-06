/* ============================================================
   Kids-Player — Spotify-Anmeldung
   Authorization Code Flow mit PKCE: sicher für reine
   Browser-Apps, kein Client Secret nötig. Tokens werden im
   localStorage gehalten und automatisch erneuert.
   ============================================================ */

(function () {
  "use strict";

  const CFG = window.KP_CONFIG;
  const LS_AUTH = "kp_spotify_auth";
  const LS_VERIFIER = "kp_spotify_pkce_verifier";
  const LS_STATE = "kp_spotify_auth_state";

  function redirectUri() {
    return location.origin + location.pathname;
  }

  function randomString(bytes) {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return Array.from(a, (x) => ("0" + x.toString(16)).slice(-2)).join("");
  }

  function b64url(buffer) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  async function codeChallenge(verifier) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return b64url(digest);
  }

  function readAuth() {
    try { return JSON.parse(localStorage.getItem(LS_AUTH)) || null; }
    catch (e) { return null; }
  }

  function writeAuth(a) {
    localStorage.setItem(LS_AUTH, JSON.stringify(a));
  }

  // ---- Anmeldung starten (Weiterleitung zu Spotify) ----

  async function login() {
    const verifier = randomString(64);
    const state = randomString(16);
    localStorage.setItem(LS_VERIFIER, verifier);
    localStorage.setItem(LS_STATE, state);
    const params = new URLSearchParams({
      client_id: CFG.clientId,
      response_type: "code",
      redirect_uri: redirectUri(),
      scope: CFG.scopes.join(" "),
      code_challenge_method: "S256",
      code_challenge: await codeChallenge(verifier),
      state: state,
    });
    location.href = "https://accounts.spotify.com/authorize?" + params.toString();
  }

  // ---- Token-Endpunkt ----

  async function tokenRequest(body) {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try { msg = (await res.json()).error_description || msg; } catch (e) { /* egal */ }
      throw new Error("Spotify-Anmeldung fehlgeschlagen: " + msg);
    }
    const data = await res.json();
    const prev = readAuth() || {};
    writeAuth({
      access_token: data.access_token,
      refresh_token: data.refresh_token || prev.refresh_token || null,
      expires_at: Date.now() + Math.max(0, (data.expires_in - 60)) * 1000,
    });
    return data.access_token;
  }

  // ---- Rückkehr von Spotify (?code=...) verarbeiten ----

  async function handleRedirect() {
    const params = new URLSearchParams(location.search);
    if (params.get("error")) {
      history.replaceState({}, "", redirectUri());
      throw new Error("Anmeldung abgebrochen (" + params.get("error") + ")");
    }
    const code = params.get("code");
    if (!code) return false;

    const stateOk = params.get("state") === localStorage.getItem(LS_STATE);
    const verifier = localStorage.getItem(LS_VERIFIER);
    history.replaceState({}, "", redirectUri());
    localStorage.removeItem(LS_STATE);
    localStorage.removeItem(LS_VERIFIER);
    if (!stateOk || !verifier) {
      throw new Error("Ungültiger Anmelde-Status — bitte erneut anmelden.");
    }
    await tokenRequest({
      client_id: CFG.clientId,
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    });
    return true;
  }

  // ---- Gültiges Token liefern (bei Bedarf erneuern) ----

  let refreshing = null;

  async function getAccessToken() {
    const a = readAuth();
    if (!a) return null;
    if (Date.now() < a.expires_at) return a.access_token;
    if (!a.refresh_token) return null;
    if (!refreshing) {
      refreshing = tokenRequest({
        client_id: CFG.clientId,
        grant_type: "refresh_token",
        refresh_token: a.refresh_token,
      }).finally(() => { refreshing = null; });
    }
    try {
      return await refreshing;
    } catch (e) {
      localStorage.removeItem(LS_AUTH);
      return null;
    }
  }

  function isLoggedIn() {
    return readAuth() !== null;
  }

  function logout() {
    localStorage.removeItem(LS_AUTH);
    location.reload();
  }

  window.KPAuth = {
    login: login,
    handleRedirect: handleRedirect,
    getAccessToken: getAccessToken,
    isLoggedIn: isLoggedIn,
    logout: logout,
    redirectUri: redirectUri,
  };
})();
