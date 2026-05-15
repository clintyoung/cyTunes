"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@/components/Player";
import { TrimEditor } from "@/components/TrimEditor";

export type Track = {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  isrc: string | null;
  album_name: string;
  album_image: string | null;
  artists: string;
  bpm?: number | null;
};

export type Trim = {
  id: string;
  scope: "song" | "playlist";
  start_ms: number;
  end_ms: number | null;
};

export type TrimMap = Record<string, Trim>;

type Sort = "playlist" | "bpm-asc" | "bpm-desc" | "name" | "duration";

export function PlaylistView({
  playlistId,
  tracks: initialTracks,
  initialTrims,
}: {
  playlistId: string;
  tracks: Track[];
  initialTrims: TrimMap;
}) {
  const [tracks, setTracks] = useState<Track[]>(initialTracks);
  const [trims, setTrims] = useState<TrimMap>(initialTrims);
  const [sort, setSort] = useState<Sort>("playlist");
  const [spinMode, setSpinMode] = useState(false);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);

  // Fetch BPM for any track that doesn't have one yet (rate-limited via sequential loop).
  const bpmFetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const t of tracks) {
        if (cancelled) return;
        if (!t.isrc) continue;
        if (t.bpm !== null && t.bpm !== undefined) continue;
        if (bpmFetchedRef.current.has(t.isrc)) continue;
        bpmFetchedRef.current.add(t.isrc);

        try {
          const res = await fetch("/api/bpm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              isrc: t.isrc,
              title: t.name,
              artist: t.artists.split(",")[0]?.trim(),
            }),
          });
          if (!res.ok) continue;
          const data = (await res.json()) as { bpm: number | null };
          setTracks((prev) =>
            prev.map((x) => (x.isrc === t.isrc ? { ...x, bpm: data.bpm } : x))
          );
        } catch {
          /* ignore */
        }
        // gentle pacing — don't hammer GetSongBPM
        await new Promise((r) => setTimeout(r, 150));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only re-run when the set of unloaded BPMs changes (initial mount typically).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedTracks = useMemo(() => {
    const copy = [...tracks];
    switch (sort) {
      case "bpm-asc":
        return copy.sort((a, b) => (a.bpm ?? Infinity) - (b.bpm ?? Infinity));
      case "bpm-desc":
        return copy.sort((a, b) => (b.bpm ?? -Infinity) - (a.bpm ?? -Infinity));
      case "name":
        return copy.sort((a, b) => a.name.localeCompare(b.name));
      case "duration":
        return copy.sort((a, b) => a.duration_ms - b.duration_ms);
      case "playlist":
      default:
        return copy;
    }
  }, [tracks, sort]);

  const saveTrim = useCallback(
    async (
      isrc: string,
      scope: "song" | "playlist",
      start_ms: number,
      end_ms: number | null
    ) => {
      const res = await fetch("/api/trims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isrc,
          scope,
          playlist_id: scope === "playlist" ? playlistId : null,
          start_ms,
          end_ms,
        }),
      });
      if (!res.ok) throw new Error("failed to save trim");
      const data = (await res.json()) as { trim: Trim & { isrc: string } };
      setTrims((prev) => ({ ...prev, [isrc]: data.trim }));
    },
    [playlistId]
  );

  const deleteTrim = useCallback(async (isrc: string) => {
    const trim = trims[isrc];
    if (!trim) return;
    await fetch(`/api/trims?id=${trim.id}`, { method: "DELETE" });
    setTrims((prev) => {
      const copy = { ...prev };
      delete copy[isrc];
      return copy;
    });
  }, [trims]);

  return (
    <>
      {spinMode && (
        <div className="spin-banner">
          <span>● SPIN MODE</span>
          <button className="btn btn-ghost" onClick={() => setSpinMode(false)}>
            Exit
          </button>
        </div>
      )}

      <div className="toolbar">
        <div>
          <button
            className={`btn ${spinMode ? "btn-ghost" : "btn-primary"}`}
            onClick={() => setSpinMode((v) => !v)}
          >
            {spinMode ? "Spin Mode: ON" : "Start Spin Mode"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label className="muted" htmlFor="sort">
            Sort
          </label>
          <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="playlist">Playlist order</option>
            <option value="bpm-asc">BPM ↑</option>
            <option value="bpm-desc">BPM ↓</option>
            <option value="name">Name</option>
            <option value="duration">Duration</option>
          </select>
        </div>
      </div>

      <div className="track-list">
        {sortedTracks.map((t) => {
          const trim = t.isrc ? trims[t.isrc] : undefined;
          const isPlaying = t.id === currentTrackId;
          return (
            <div key={t.id} className={`track-row${isPlaying ? " playing" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.album_image || "/placeholder-cover.svg"}
                alt=""
                className="track-cover"
              />
              <div className="track-meta">
                <div className="track-title">{t.name}</div>
                <div className="track-artist">{t.artists}</div>
              </div>
              <span className={`bpm-pill${trim ? " has-trim" : ""}`}>
                {t.bpm != null ? `${Math.round(t.bpm)}` : "—"}
              </span>
              <div className="track-actions">
                <button
                  className="icon-btn"
                  title="Edit trim"
                  onClick={() => setEditingTrack(t)}
                  aria-label="Edit trim"
                >
                  ✂
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Player
        playlistId={playlistId}
        tracks={sortedTracks}
        trims={trims}
        spinMode={spinMode}
        onCurrentTrackChange={setCurrentTrackId}
      />

      {editingTrack && (
        <TrimEditor
          track={editingTrack}
          existing={editingTrack.isrc ? trims[editingTrack.isrc] : undefined}
          onSave={async (scope, start_ms, end_ms) => {
            if (!editingTrack.isrc) return;
            await saveTrim(editingTrack.isrc, scope, start_ms, end_ms);
            setEditingTrack(null);
          }}
          onDelete={async () => {
            if (!editingTrack.isrc) return;
            await deleteTrim(editingTrack.isrc);
            setEditingTrack(null);
          }}
          onClose={() => setEditingTrack(null)}
        />
      )}
    </>
  );
}
