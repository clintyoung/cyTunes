# cyTunes

A spin instructor's music player. Streams from your Spotify Premium account, but adds the things spin instructors actually need:

- **Trim points** per song (start/end ms) that survive across sessions
- **Trim scope**: "stay with the song" (always applied) or "stay with the playlist" (only when played from that playlist)
- **Spin Mode**: applies trims at playback and logs when each track was played
- **BPM** displayed on every track, sortable, cached locally
- **Create playlists on the fly** in Spotify, search the full catalog

## Stack

- **Next.js 14** (App Router, TypeScript, standalone output)
- **Postgres 16** for trims, play history, BPM cache
- **Cloudflare Tunnel** for public HTTPS without port-forwarding
- **Spotify Web Playback SDK** (requires Premium on the playback device)
- **GetSongBPM** for BPM lookups (free, attribution required)
- Runs as three containers via `docker-compose.yml` on ZimaOS

## Prerequisites

1. **Spotify Developer app** at https://developer.spotify.com/dashboard
   - Note the Client ID
   - **Rotate the client secret** (do this if it has ever been pasted into a chat or repo)
   - Add redirect URI: `https://cytunes.yourcompany.today/api/auth/callback/spotify`
2. **GetSongBPM API key** at https://getsongbpm.com/api (free, requires a back-link in your footer)
3. **Cloudflare account** with `yourcompany.today` nameservers pointed at Cloudflare
4. **ZimaOS** with Docker support and the App Store UI

## Deploying on ZimaOS

### 1. Create the Cloudflare Tunnel

1. https://one.dash.cloudflare.com → Networks → Tunnels → Create a tunnel
2. Connector: **Cloudflared**. Name it (e.g. `cytunes-home`). Save.
3. Cloudflare shows an install command — **copy just the long token** at the end (everything after `--token`). Save it as `CLOUDFLARED_TUNNEL_TOKEN` in your `.env`.
4. **Public Hostname** tab → Add a public hostname:
   - Subdomain: `cytunes`
   - Domain: `yourcompany.today`
   - Type: `HTTP`
   - URL: `web:3000`   ← the compose service name, not the host IP
5. Save.

### 2. Install on ZimaOS

1. Open ZimaOS → App Store → **Install a custom app** (or "Custom Install").
2. Paste the contents of `docker-compose.yml` from this repo.
3. ZimaOS will ask for environment variables — fill them in using `.env.example` as a guide.
4. Click deploy.
5. On first boot, Postgres runs `db/schema.sql` automatically.

### 3. Verify

- LAN: `http://<zimaos-ip>:4444` should load the app
- Public: `https://cytunes.yourcompany.today` should load the app
- Spotify login should redirect through Spotify and back

## Local development

```bash
git clone https://github.com/clintyoung/cyTunes
cd cyTunes
cp .env.example .env             # fill in real values
npm install
docker compose up -d db          # just Postgres locally
npm run dev                      # Next.js on http://localhost:3000
```

For local Spotify OAuth, change `SPOTIFY_REDIRECT_URI` to `http://localhost:3000/api/auth/callback/spotify` and add that URI to your Spotify app in the dashboard.

## Updating the deployed app

Every push to `main` triggers a GitHub Action that builds and publishes `ghcr.io/clintyoung/cytunes:latest`. To update on ZimaOS:

1. App Store → cyTunes → **Recreate** (or "Pull latest")
2. Postgres data and trims persist via the `cytunes-pgdata` volume

## Data model

See `db/schema.sql` for the full schema. The interesting bits:

- `trims(user_id, isrc, scope, playlist_id?, start_ms, end_ms)` — scope is `song` or `playlist`. Playlist-scoped trims take precedence over song-scoped when playing from that playlist.
- `play_history(user_id, isrc, mode, played_at, ...)` — mode is `spin` or `normal`.
- `bpm_cache(isrc, bpm, source, fetched_at)` — global cache so we hit GetSongBPM at most once per song ever.

## v1 scope (deliberately limited)

In v1: Spotify only, fixed per-song BPM, trim-as-seek-points, Spin Mode, play history, sort by BPM, create playlist on the fly.

Deferred to v2: Apple Music / Tidal, variable-BPM-over-time graphs, multi-user accounts.

## Attribution

BPM data provided by [GetSongBPM](https://getsongbpm.com). A visible link to GetSongBPM is included in the app footer per their API terms.
