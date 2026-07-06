// ─────────────────────────────────────────────────────────────────────────────
// Lioninside Kids Player – Spotify Configuration
// NOTE: The client SECRET is intentionally omitted. PKCE auth does not need it.
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  CLIENT_ID: '17e0079554f7472aa14f0b4482a546bb',
  // Redirect-URI wird zur Laufzeit aus der Adresse dieser Seite gebildet, damit
  // der Player unabhängig vom Deploy-Ordner funktioniert. Diese exakte URL muss
  // im Spotify Developer Dashboard unter "Redirect URIs" eingetragen sein.
  REDIRECT_URI: window.location.origin + window.location.pathname,
  SCOPES: [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-library-read',
    'user-library-modify',
  ].join(' '),
};
