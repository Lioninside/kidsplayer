/* ============================================================
   Kids-Player — Konfiguration
   Die Client-ID stammt aus dem Spotify Developer Dashboard
   (App "kidsplayer"). Die Redirect-URI ist immer die URL,
   unter der diese Seite läuft — sie muss im Dashboard unter
   "Redirect URIs" eingetragen sein.
   ============================================================ */

window.KP_CONFIG = {
  clientId: "17e0079554f7472aa14f0b4482a546bb",
  playerName: "Kids-Player",
  scopes: [
    // Web Playback SDK (Wiedergabe im Browser, Premium nötig)
    "streaming",
    "user-read-email",
    "user-read-private",
    // Wiedergabe steuern & lesen
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "user-read-recently-played",
    // Eigene Inhalte lesen
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-library-read",
    // Lieblingssongs speichern/entfernen (Herz-Button)
    "user-library-modify",
  ],
};
