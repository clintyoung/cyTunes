-- cyTunes schema. Runs automatically on first Postgres boot.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- =============================================================================
-- users
-- One row per Spotify account that has logged in.
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spotify_user_id             TEXT UNIQUE NOT NULL,
    display_name                TEXT,
    email                       TEXT,
    product                     TEXT,                  -- 'premium' / 'free' / 'open'
    spotify_access_token        TEXT,
    spotify_refresh_token       TEXT,
    spotify_token_expires_at    TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- trims
-- Start/end millisecond points for a track. Keyed by ISRC so they survive
-- across services and across re-adds of the same song.
-- Scope:
--   'song'     → always applied (playlist_id must be NULL)
--   'playlist' → applied only when track is played from that playlist
-- =============================================================================
CREATE TABLE IF NOT EXISTS trims (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    isrc            TEXT NOT NULL,
    scope           TEXT NOT NULL CHECK (scope IN ('song', 'playlist')),
    playlist_id     TEXT,
    start_ms        INTEGER NOT NULL DEFAULT 0 CHECK (start_ms >= 0),
    end_ms          INTEGER CHECK (end_ms IS NULL OR end_ms > start_ms),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT trim_scope_consistency CHECK (
        (scope = 'song'     AND playlist_id IS NULL) OR
        (scope = 'playlist' AND playlist_id IS NOT NULL)
    )
);

-- A user can have at most one song-scoped trim per ISRC, and at most one
-- playlist-scoped trim per (ISRC, playlist).
CREATE UNIQUE INDEX IF NOT EXISTS trims_song_unique
    ON trims(user_id, isrc)
    WHERE scope = 'song';

CREATE UNIQUE INDEX IF NOT EXISTS trims_playlist_unique
    ON trims(user_id, isrc, playlist_id)
    WHERE scope = 'playlist';

CREATE INDEX IF NOT EXISTS trims_lookup_idx
    ON trims(user_id, isrc);

-- =============================================================================
-- play_history
-- One row per track played. Spin Mode plays are flagged so we can show
-- "times played in spin mode" and "last played in spin mode" per song.
-- =============================================================================
CREATE TABLE IF NOT EXISTS play_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    isrc                TEXT NOT NULL,
    spotify_track_id    TEXT,
    playlist_id         TEXT,
    mode                TEXT NOT NULL CHECK (mode IN ('spin', 'normal')),
    played_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS play_history_user_isrc_idx
    ON play_history(user_id, isrc);
CREATE INDEX IF NOT EXISTS play_history_played_at_idx
    ON play_history(played_at DESC);
CREATE INDEX IF NOT EXISTS play_history_user_mode_idx
    ON play_history(user_id, mode);

-- =============================================================================
-- bpm_cache
-- Global cache (not per-user) of BPM lookups by ISRC. Populated on first
-- sight of a track. Can be manually overridden via `source = 'manual'`.
-- =============================================================================
CREATE TABLE IF NOT EXISTS bpm_cache (
    isrc            TEXT PRIMARY KEY,
    bpm             NUMERIC(5,2),
    source          TEXT NOT NULL,           -- 'getsongbpm' | 'manual' | 'unknown'
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_response    JSONB
);

-- =============================================================================
-- updated_at triggers
-- =============================================================================
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_touch ON users;
CREATE TRIGGER users_touch BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trims_touch ON trims;
CREATE TRIGGER trims_touch BEFORE UPDATE ON trims
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
