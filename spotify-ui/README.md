# Kids Player — Spotify-UI (Version 2)

Reichhaltigere Oberfläche für den Lioninside Kids Player, im Stil des
Spotify-Desktop-Clients: feste Seitenleiste (Home, Suche, Deine Bibliothek,
Playlists, Gespeicherte Alben), Zuletzt gehört, Warteschlange, Künstler-Ansichten,
Wiederhol-Modi. Spielt echte Musik über das Spotify-Konto (Web API +
Web Playback SDK, **Spotify Premium erforderlich**).

Dies ist eine von zwei eigenständigen Oberflächen in diesem Repo — siehe die
[Repo-Übersicht](../README.md); die verspielte Kinder-Oberfläche liegt in
[`../playful-ui/`](../playful-ui/). Die beiden teilen sich keinen Code, aber
denselben Kinderschutz-Ansatz.

## Kinderschutz (wie Version 1)

Drei Schutzebenen — identisch zur bestehenden Version:

1. **Suchbegriff-Filter** — Suchen mit gesperrten Wörtern aus `blocked-words.json`
   (Gewalt, Drogen, Sexuelles, Schimpfwörter, Hass) werden abgewiesen, bevor
   überhaupt die Spotify-Suche aufgerufen wird.
2. **Explicit-Filter** — jeder von Spotify als *explicit* markierte Titel wird an
   allen Stellen entfernt: Suche, Favoriten, Playlists, Alben, Künstler-Titel,
   Warteschlange, Zuletzt gehört.
3. **Wiedergabe-Schutz** — abgespielt wird immer eine gefilterte URI-Liste, nie ein
   roher `context_uri` (sonst würde Spotify die komplette, ungefilterte Sammlung
   abspielen). Zusätzlich springt der Player als Sicherheitsnetz sofort weiter,
   falls doch ein expliziter Titel starten sollte.

`blocked-words.json` liegt in diesem Ordner (Kopie der Root-Version) und kann hier
unabhängig gepflegt werden.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Struktur: Login, Sidebar, Hauptbereich, Player-Leiste, Warteschlange |
| `style.css` | Dark-Mode-Design |
| `config.js` | Client-ID und Berechtigungen (Scopes) |
| `auth.js` | Spotify-Anmeldung (Authorization Code + PKCE, ohne Client Secret) |
| `api.js` | Spotify Web API inkl. Explicit-Filter an jeder Grenze |
| `app.js` | Ansichten, Navigation, Wiedergabe, Warteschlange, Suchwort-Filter |
| `blocked-words.json` | Gesperrte Suchbegriffe |

## Einrichtung / Deployment

1. Diesen Ordner auf den Webserver legen, z. B. nach
   `…/bestkids/kidsplayerv2/spotify-ui/` — dann erreichbar unter
   `https://bartlome.com/bestkids/kidsplayerv2/spotify-ui/`.
2. **Redirect-URI im Spotify Dashboard eintragen:** die exakte URL dieser Seite,
   also `https://bartlome.com/bestkids/kidsplayerv2/spotify-ui/index.html`.
   Der Login-Screen zeigt die benötigte URI unten an.
3. **HTTPS** ist Pflicht (Web Playback SDK).
4. Der angemeldete Account braucht **Spotify Premium**. Im Development-Mode der
   App muss er ausserdem unter *User Management* freigeschaltet sein.

Client-ID und Redirect-Ziel-Logik sind identisch zur Version 1; die Redirect-URI
wird zur Laufzeit aus der Adresse der Seite gebildet, passt sich also automatisch
an den Unterordner an.

## Bedienung

- **Sidebar:** Home, Suche, Deine Bibliothek, Playlists, Gespeicherte Alben, eigene
  Playlists; unten „Abmelden"
- **Oben:** Zurück/Vorwärts und Suchfeld
- **Player-Leiste:** Cover + Titel + Herz links; Zurück / Play-Pause / Weiter /
  Wiederholen mittig (bewusst **ohne Shuffle**); Warteschlange, Bluetooth,
  Lautstärke rechts
- **Herz** speichert Songs in den Spotify-Lieblingssongs
