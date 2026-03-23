# Lioninside Kids Player

A safe, kid-friendly Spotify music player — no explicit content, no adult podcasts, no distracting videos. Just music.

Built for parents who want their kids to enjoy Spotify freely without stumbling into inappropriate content.

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
2. Set your `CLIENT_ID` and `REDIRECT_URI` in `js/config.js`
3. Add your redirect URI to the Spotify app's allowed redirect URIs
4. Host the files on any static web server

No build step, no dependencies to install.

## Project structure

```
kidsplayer/
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

## Live demo

[bartlome.com/bestkids/kidsplayerv2/](https://bartlome.com/bestkids/kidsplayerv2/)
