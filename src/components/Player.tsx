"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Track, TrimMap } from "@/app/playlists/[id]/PlaylistView";

// =============================================================================
// Spotify Web Playback SDK wrapper.
// - Boots the SDK with a token fetched from /api/auth/token
// - On play, transfers playback to this device and starts at trim start_ms
// - In Spin Mode, watches position vs trim end_ms and advances to next track
// - Logs every track start as a play_history row (mode: 'spin'|'normal')
// =============================================================================

const DEVICE_NAME = "cyTunes";

export function Player({
  playlistId,
  tracks,
  trims,
  spinMode,
  onCurrentTrackChange,
}: {
  playlistId: string;
  tracks: Track[];
  trims: TrimMap;
  spinMode: boolean;
  onCurrentTrackChange: (id: string | null) => void;
}) {
  const playerRef = useRef<Spotify.Player | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trackRef = useRef(tracks);
  trackRef.current = tracks;
  const trimsRef = useRef(trims);
  trimsRef.current = trims;
  const spinRef = useRef(spinMode);
  spinRef.current = spinMode;
  const currentIdxRef = useRef<number | null>(null);
  currentIdxRef.current = currentIdx;
  const playlistIdRef = useRef(playlistId);
  playlistIdRef.current = playlistId;

  // --- Initialize the SDK once ---
  useEffect(() => {
    let cancelled = false;

    const boot = () => {
      if (cancelled || playerRef.current) return;
      const player = new window.Spotify.Player({
        name: DEVICE_NAME,
        getOAuthToken: async (cb) => {
          try {
            const res = await fetch("/api/auth/token");
            const data = (await res.json()) as { access_token: string };
            cb(data.access_token);
          } catch {
            setError("Could not get Spotify token");
          }
        },
        volume: 0.8,
      });

      player.addListener("ready", ({ device_id }) => {
        deviceIdRef.current = device_id;
        setReady(true);
      });
      player.addListener("not_ready", () => setReady(false));
      player.addListener("initialization_error", ({ message }) => setError(message));
      player.addListener("authentication_error", ({ message }) => setError(message));
      player.addListener("account_error", ({ message }) =>
        setError(`${message} (Premium required)`)
      );
      player.addListener("playback_error", ({ message }) => setError(message));

      player.addListener("player_state_changed", (state) => {
        if (!state) return;
        setPaused(state.paused);
        setPosition(state.position);
        setDuration(state.duration);

        const curId = state.track_window.current_track?.id;
        if (curId) {
          const idx = trackRef.current.findIndex((t) => t.id === curId);
          if (idx >= 0 && idx !== currentIdxRef.current) {
            currentIdxRef.current = idx;
            setCurrentIdx(idx);
            onCurrentTrackChange(curId);
            logPlay(trackRef.current[idx], playlistIdRef.current, spinRef.current);
          }
        }
      });

      player.connect().catch(() => setError("Could not connect to Spotify"));
      playerRef.current = player;
    };

    if (window.Spotify) boot();
    else window.onSpotifyWebPlaybackSDKReady = boot;

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Position polling (Spotify only emits state_changed sporadically) ---
  useEffect(() => {
    const id = setInterval(async () => {
      const state = await playerRef.current?.getCurrentState();
      if (state) {
        setPosition(state.position);
        setDuration(state.duration);
        setPaused(state.paused);
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  // --- Spin Mode: enforce trim end_ms by skipping to next ---
  useEffect(() => {
    if (!spinMode) return;
    const id = setInterval(async () => {
      const idx = currentIdxRef.current;
      if (idx === null) return;
      const t = trackRef.current[idx];
      if (!t?.isrc) return;
      const trim = trimsRef.current[t.isrc];
      if (!trim?.end_ms) return;

      const state = await playerRef.current?.getCurrentState();
      if (!state) return;
      if (state.position >= trim.end_ms) {
        // jump to next track with its own trim applied
        await playTrackAt(idx + 1);
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinMode]);

  const playTrackAt = useCallback(async (idx: number) => {
    const t = trackRef.current[idx];
    if (!t) {
      // end of playlist
      await playerRef.current?.pause();
      return;
    }
    const deviceId = deviceIdRef.current;
    if (!deviceId) return;

    // Determine start position. In Spin Mode, apply trim start_ms.
    let position_ms = 0;
    if (spinRef.current && t.isrc) {
      const trim = trimsRef.current[t.isrc];
      if (trim?.start_ms) position_ms = trim.start_ms;
    }

    await fetch("/api/spotify/player/play", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id: deviceId,
        uris: [t.uri],
        position_ms,
      }),
    });
  }, []);

  const startPlayback = useCallback(async () => {
    if (!ready) return;
    // Transfer first so commands target this device
    await fetch("/api/spotify/player/transfer", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceIdRef.current, play: false }),
    });
    await playTrackAt(0);
  }, [ready, playTrackAt]);

  const togglePlay = useCallback(async () => {
    if (currentIdxRef.current === null) {
      await startPlayback();
      return;
    }
    await playerRef.current?.togglePlay();
  }, [startPlayback]);

  const next = useCallback(async () => {
    const idx = currentIdxRef.current;
    if (idx === null) return;
    await playTrackAt(idx + 1);
  }, [playTrackAt]);

  const prev = useCallback(async () => {
    const idx = currentIdxRef.current;
    if (idx === null) return;
    await playTrackAt(Math.max(0, idx - 1));
  }, [playTrackAt]);

  const current = currentIdx !== null ? tracks[currentIdx] : null;
  const trim = current?.isrc ? trims[current.isrc] : undefined;
  const displayDuration = trim?.end_ms ? trim.end_ms - (trim.start_ms ?? 0) : duration;
  const displayPosition = Math.max(0, position - (trim?.start_ms ?? 0));
  const progressPct =
    displayDuration > 0 ? Math.min(100, (displayPosition / displayDuration) * 100) : 0;

  return (
    <div className="player">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current?.album_image || "/placeholder-cover.svg"}
        alt=""
        className="player-cover"
      />
      <div className="player-meta">
        {error ? (
          <div className="error" style={{ fontSize: 13 }}>
            {error}
          </div>
        ) : (
          <>
            <div
              className="track-title"
              style={{ fontSize: 14, fontWeight: 600 }}
            >
              {current?.name || (ready ? "Press play to start" : "Connecting…")}
            </div>
            <div className="track-artist">{current?.artists || ""}</div>
            <div className="progress">
              <span>{formatTime(displayPosition)}</span>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <span>{formatTime(displayDuration)}</span>
            </div>
          </>
        )}
      </div>
      <div className="player-controls">
        <button className="player-btn" onClick={prev} aria-label="Previous">
          ⏮
        </button>
        <button className="player-btn play" onClick={togglePlay} aria-label="Play/Pause">
          {paused ? "▶" : "❚❚"}
        </button>
        <button className="player-btn" onClick={next} aria-label="Next">
          ⏭
        </button>
      </div>
    </div>
  );
}

function formatTime(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function logPlay(track: Track, playlistId: string, spinMode: boolean): Promise<void> {
  if (!track.isrc) return;
  try {
    await fetch("/api/plays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isrc: track.isrc,
        spotify_track_id: track.id,
        playlist_id: playlistId,
        mode: spinMode ? "spin" : "normal",
      }),
    });
  } catch {
    /* ignore */
  }
}
