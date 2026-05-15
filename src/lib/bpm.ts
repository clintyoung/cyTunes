import { env } from "@/lib/env";
import { query } from "@/lib/db";

// =============================================================================
// BPM lookup with Postgres-backed cache. We hit GetSongBPM at most once per
// ISRC ever (until manually invalidated).
// =============================================================================

export type BpmResult = {
  isrc: string;
  bpm: number | null;
  source: "getsongbpm" | "manual" | "unknown";
  cached: boolean;
};

export async function getBpm(
  isrc: string,
  hint?: { title?: string; artist?: string }
): Promise<BpmResult> {
  // 1) cache hit?
  const cached = await query<{ bpm: string | null; source: string }>(
    `SELECT bpm, source FROM bpm_cache WHERE isrc = $1`,
    [isrc]
  );
  if (cached.rows[0]) {
    const row = cached.rows[0];
    return {
      isrc,
      bpm: row.bpm === null ? null : Number(row.bpm),
      source: row.source as BpmResult["source"],
      cached: true,
    };
  }

  // 2) fetch from GetSongBPM (best-effort)
  let bpm: number | null = null;
  let raw: unknown = null;
  let source: BpmResult["source"] = "unknown";

  if (env.getSongBpmKey && hint?.title && hint.artist) {
    try {
      const url = new URL("https://api.getsong.co/search/");
      url.searchParams.set("api_key", env.getSongBpmKey);
      url.searchParams.set("type", "both");
      url.searchParams.set(
        "lookup",
        `song:${hint.title.toLowerCase()} artist:${hint.artist.toLowerCase()}`
      );
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as {
          search?: Array<{ tempo?: string; song_title?: string }>;
        };
        raw = data;
        const first = Array.isArray(data.search) ? data.search[0] : undefined;
        const tempo = first?.tempo ? Number(first.tempo) : NaN;
        if (Number.isFinite(tempo) && tempo > 0) {
          bpm = Math.round(tempo);
          source = "getsongbpm";
        }
      }
    } catch {
      // swallow — we'll cache as 'unknown' so we don't hammer the API
    }
  }

  await query(
    `INSERT INTO bpm_cache (isrc, bpm, source, raw_response)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (isrc) DO NOTHING`,
    [isrc, bpm, source, raw]
  );

  return { isrc, bpm, source, cached: false };
}

export async function setManualBpm(isrc: string, bpm: number): Promise<void> {
  await query(
    `INSERT INTO bpm_cache (isrc, bpm, source, fetched_at)
     VALUES ($1, $2, 'manual', NOW())
     ON CONFLICT (isrc) DO UPDATE
       SET bpm = EXCLUDED.bpm,
           source = 'manual',
           fetched_at = NOW()`,
    [isrc, bpm]
  );
}
