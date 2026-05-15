"use client";

import { useState } from "react";
import type { Track, Trim } from "@/app/playlists/[id]/PlaylistView";

// =============================================================================
// Trim editor modal. The interesting decision the user makes here is the
// SCOPE: "stay with the song" (always applied) vs "stay with the playlist"
// (only applied when played from this playlist).
// =============================================================================

export function TrimEditor({
  track,
  existing,
  onSave,
  onDelete,
  onClose,
}: {
  track: Track;
  existing?: Trim;
  onSave: (scope: "song" | "playlist", start_ms: number, end_ms: number | null) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<"song" | "playlist">(existing?.scope ?? "song");
  const [startSec, setStartSec] = useState<number>((existing?.start_ms ?? 0) / 1000);
  const [endSec, setEndSec] = useState<number>(
    existing?.end_ms != null ? existing.end_ms / 1000 : track.duration_ms / 1000
  );
  const [endEnabled, setEndEnabled] = useState<boolean>(existing?.end_ms != null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trackDurSec = track.duration_ms / 1000;

  const handleSave = async () => {
    setError(null);
    const start_ms = Math.round(startSec * 1000);
    const end_ms = endEnabled ? Math.round(endSec * 1000) : null;
    if (start_ms < 0 || start_ms >= track.duration_ms) {
      setError("Start must be within the song");
      return;
    }
    if (end_ms !== null && end_ms <= start_ms) {
      setError("End must be after start");
      return;
    }
    setSaving(true);
    try {
      await onSave(scope, start_ms, end_ms);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Trim song</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {track.name} — {track.artists}
        </p>

        <div className="form-row">
          <label>Apply trim to…</label>
          <select value={scope} onChange={(e) => setScope(e.target.value as "song" | "playlist")}>
            <option value="song">Stay with the song (always applied)</option>
            <option value="playlist">Stay with this playlist only</option>
          </select>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {scope === "song"
              ? "These trim points follow this song everywhere — every playlist, every play."
              : "These trim points only apply when this song is played from this playlist."}
          </p>
        </div>

        <div className="form-row">
          <label>Start ({formatTime(startSec)})</label>
          <input
            type="range"
            min={0}
            max={trackDurSec}
            step={0.5}
            value={startSec}
            onChange={(e) => setStartSec(Number(e.target.value))}
          />
        </div>

        <div className="form-row">
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={endEnabled}
              onChange={(e) => setEndEnabled(e.target.checked)}
            />
            End trim ({endEnabled ? formatTime(endSec) : "off"})
          </label>
          {endEnabled && (
            <input
              type="range"
              min={0}
              max={trackDurSec}
              step={0.5}
              value={endSec}
              onChange={(e) => setEndSec(Number(e.target.value))}
            />
          )}
        </div>

        {error && <p className="error">{error}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 16 }}>
          {existing ? (
            <button className="btn btn-danger" onClick={onDelete}>
              Remove trim
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save trim"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(sec: number): string {
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
