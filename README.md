# Lioninside Kids Player

Sicherer, kinderfreundlicher Spotify-Player — keine expliziten Inhalte, keine
Erwachsenen-Podcasts, keine ablenkenden Videos. Nur Musik.

Dieses Repo enthält **zwei eigenständige Oberflächen**, die getrennt
weiterentwickelt werden. Beide setzen denselben Kinderschutz um, haben aber
jeweils komplett eigene Dateien — **kein gemeinsamer Code** (bewusst so, damit
beide unabhängig voneinander wachsen können).

## Die zwei Versionen

| Ordner | Version | Charakter |
|---|---|---|
| [`playful-ui/`](playful-ui/) | Version 1 | Verspielt und bunt, für Kinder — Vinyl-Optik, grosse Buttons, verspielte Animationen |
| [`spotify-ui/`](spotify-ui/) | Version 2 | Nah am Spotify-Desktop-Client — feste Seitenleiste, Playlists, Alben, Warteschlange, Künstler-Ansichten |

Jeder Ordner ist eine **vollständige, für sich lauffähige App** mit eigener
`index.html`, eigenem `blocked-words.json` und eigenem JS/CSS. Jede Version wird
separat auf eine eigene URL deployt.

## Gemeinsame technische Basis

- Vanilla JavaScript, kein Framework, kein Build-Schritt
- Spotify Web Playback SDK + Web API, OAuth 2.0 mit PKCE (kein Client Secret)
- **Spotify Premium erforderlich** (Browser-Wiedergabe)
- Statisches Hosting genügt (nur HTML/CSS/JS)
- Gleiche Spotify-App / Client-ID für beide Versionen

## Kinderschutz (beide Versionen)

1. **Explicit-Filter** — jeder von Spotify als *explicit* markierte Titel wird
   herausgefiltert und nicht abgespielt.
2. **Suchwort-Filter** — Suchen mit gesperrten Begriffen aus `blocked-words.json`
   (Gewalt, Drogen, Sexuelles, Schimpfwörter, Hass) werden abgewiesen.

## Einrichtung & Deployment

1. Client-ID steht in der jeweiligen `config.js` (beide nutzen dieselbe App).
2. Jede Version leitet ihre **Redirect-URI zur Laufzeit aus ihrer eigenen
   Adresse ab** — sie funktioniert also in jedem Deploy-Ordner. Die exakte URL
   jeder deployten Version muss im
   [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) unter
   *Redirect URIs* eingetragen sein. Die Login-Seite jeder Version zeigt die
   benötigte URL an.
3. HTTPS ist Pflicht (Web Playback SDK).
4. Im Development-Mode der App muss der genutzte Account unter *User Management*
   freigeschaltet sein.

Details je Version stehen in der README im jeweiligen Ordner:
[`playful-ui/README.md`](playful-ui/README.md) · [`spotify-ui/README.md`](spotify-ui/README.md)

## Struktur

```
kidsplayer/
├── README.md                 ← diese Übersicht
├── playful-ui/               ← Version 1 (verspielt, für Kids)
│   ├── index.html
│   ├── blocked-words.json
│   ├── css/style.css
│   └── js/{config,auth,api,player,app}.js
└── spotify-ui/               ← Version 2 (Spotify-Desktop-Stil)
    ├── index.html
    ├── style.css
    ├── blocked-words.json
    └── {config,auth,api,app}.js
```

Gemeinsame, geteilte Daten sind derzeit **nicht** vorgesehen. Falls später doch
etwas geteilt werden soll, käme dafür ein eigener `shared/`-Ordner in Frage.
