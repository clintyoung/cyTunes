import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

export type TrimRow = {
  id: string;
  isrc: string;
  scope: "song" | "playlist";
  playlist_id: string | null;
  start_ms: number;
  end_ms: number | null;
};

// GET /api/trims?isrc=...&playlist_id=...
// Returns the song-scoped trim (if any) plus the playlist-scoped trim
// (if any) for the given playlist. Caller decides which one wins
// (playlist-scoped takes precedence in Spin Mode).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const isrc = url.searchParams.get("isrc");
  const playlistId = url.searchParams.get("playlist_id");
  if (!isrc) return NextResponse.json({ error: "isrc required" }, { status: 400 });

  const { rows } = await query<TrimRow>(
    `SELECT id, isrc, scope, playlist_id, start_ms, end_ms
       FROM trims
      WHERE user_id = $1 AND isrc = $2
        AND (scope = 'song' OR ($3::text IS NOT NULL AND playlist_id = $3))`,
    [user.id, isrc, playlistId]
  );
  return NextResponse.json({ trims: rows });
}

// POST /api/trims
// Upsert a trim. Body: { isrc, scope: 'song'|'playlist', playlist_id?, start_ms, end_ms }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Partial<TrimRow>;
  const { isrc, scope, playlist_id = null, start_ms = 0, end_ms = null } = body;

  if (!isrc) return NextResponse.json({ error: "isrc required" }, { status: 400 });
  if (scope !== "song" && scope !== "playlist") {
    return NextResponse.json({ error: "scope must be 'song' or 'playlist'" }, { status: 400 });
  }
  if (scope === "playlist" && !playlist_id) {
    return NextResponse.json({ error: "playlist_id required for playlist scope" }, { status: 400 });
  }
  if (scope === "song" && playlist_id) {
    return NextResponse.json({ error: "playlist_id must be null for song scope" }, { status: 400 });
  }
  if (end_ms !== null && end_ms <= start_ms) {
    return NextResponse.json({ error: "end_ms must be > start_ms" }, { status: 400 });
  }

  // Upsert using the partial unique indexes from schema.sql
  if (scope === "song") {
    const { rows } = await query<TrimRow>(
      `INSERT INTO trims (user_id, isrc, scope, start_ms, end_ms)
       VALUES ($1, $2, 'song', $3, $4)
       ON CONFLICT (user_id, isrc) WHERE scope = 'song'
       DO UPDATE SET start_ms = EXCLUDED.start_ms, end_ms = EXCLUDED.end_ms
       RETURNING id, isrc, scope, playlist_id, start_ms, end_ms`,
      [user.id, isrc, start_ms, end_ms]
    );
    return NextResponse.json({ trim: rows[0] });
  } else {
    const { rows } = await query<TrimRow>(
      `INSERT INTO trims (user_id, isrc, scope, playlist_id, start_ms, end_ms)
       VALUES ($1, $2, 'playlist', $3, $4, $5)
       ON CONFLICT (user_id, isrc, playlist_id) WHERE scope = 'playlist'
       DO UPDATE SET start_ms = EXCLUDED.start_ms, end_ms = EXCLUDED.end_ms
       RETURNING id, isrc, scope, playlist_id, start_ms, end_ms`,
      [user.id, isrc, playlist_id, start_ms, end_ms]
    );
    return NextResponse.json({ trim: rows[0] });
  }
}

// DELETE /api/trims?id=...
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await query(`DELETE FROM trims WHERE id = $1 AND user_id = $2`, [id, user.id]);
  return NextResponse.json({ ok: true });
}
