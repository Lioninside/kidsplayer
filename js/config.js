// ─────────────────────────────────────────────────────────────────────────────
// Lioninside Kids Player – Spotify Configuration
// NOTE: The client SECRET is intentionally omitted. PKCE auth does not need it.
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  CLIENT_ID: '17e0079554f7472aa14f0b4482a546bb',
  REDIRECT_URI: 'https://bartlome.com/bestkids/kidsplayerv2/index.html',
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
