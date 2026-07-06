# Kids Player — Playful UI (Version 1)

A safe, kid-friendly Spotify music player — no explicit content, no adult podcasts, no distracting videos. Just music.

This is the **playful, colourful** interface (vinyl look, big buttons), built for
kids. It is one of two independent front-ends in this repo — see the
[repository overview](../README.md); the Spotify-desktop-style interface lives in
[`../spotify-ui/`](../spotify-ui/). The two share no code.

## What it does

- Connects to your Spotify account via a secure login
- Lets kids search and play music
- Automatically blocks explicit tracks
- Filters out inappropriate search terms (violence, drugs, sexual content, hate speech)
- Shows album views and lets kids save their favorite songs
- Works entirely in the browser — no app install needed

## Requirements

- Spotify Premium account
- A modern web browser

## Tech stack

- Vanilla JavaScript (no frameworks)
- Spotify Web Playback SDK
- Spotify Web API with OAuth 2.0 PKCE flow
- Static HTML/CSS — no backend needed

## Content filtering

Two layers of protection:

1. **Explicit track filter** — any track marked explicit by Spotify is blocked before it plays
2. **Search word filter** — searches containing blocked terms (defined in `blocked-words.json`) are rejected with a friendly message

## Setup

1. Create a Spotify app at [developer.spotify.com](https://developer.spotify.com)
   (the `CLIENT_ID` in `js/config.js` is already set for the Lioninside app).
2. The `REDIRECT_URI` is derived automatically at runtime from this page's own
   URL, so the player works from any deploy folder. Add that exact URL to the
   Spotify app's *Redirect URIs* — the login screen shows it.
3. Serve the files over HTTPS on any static web server.

No build step, no dependencies to install.

## Project structure

```
playful-ui/
├── index.html
├── blocked-words.json
├── css/
│   └── style.css
└── js/
    ├── config.js       # Spotify credentials & scopes
    ├── auth.js         # PKCE OAuth flow & token refresh
    ├── api.js          # Spotify API wrapper
    ├── player.js       # UI rendering
    └── app.js          # Main app logic & state
```

## Deployment

Deploy this folder to its own URL, e.g. `bartlome.com/bestkids/kidsplayerv2/playful-ui/`,
and register that URL (`…/playful-ui/index.html`) as a redirect URI in the Spotify dashboard.
