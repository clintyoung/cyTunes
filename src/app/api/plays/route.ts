import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

// POST /api/plays
// Body: { isrc, spotify_track_id?, playlist_id?, mode: 'spin'|'normal' }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    isrc?: string;
    spotify_track_id?: string;
    playlist_id?: string;
    mode?: "spin" | "normal";
  };
  if (!body.isrc) return NextResponse.json({ error: "isrc required" }, { status: 400 });
  if (body.mode !== "spin" && body.mode !== "normal") {
    return NextResponse.json({ error: "mode must be 'spin' or 'normal'" }, { status: 400 });
  }

  await query(
    `INSERT INTO play_history (user_id, isrc, spotify_track_id, playlist_id, mode)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, body.isrc, body.spotify_track_id ?? null, body.playlist_id ?? null, body.mode]
  );
  return NextResponse.json({ ok: true });
}

// GET /api/plays?isrc=...&mode=spin
// Returns aggregate stats for a track: total spin plays + last spin play.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const isrc = url.searchParams.get("isrc");
  if (!isrc) return NextResponse.json({ error: "isrc required" }, { status: 400 });

  const { rows } = await query<{
    spin_count: string;
    last_spin_at: Date | null;
  }>(
    `SELECT
        COUNT(*) FILTER (WHERE mode = 'spin') AS spin_count,
        MAX(played_at) FILTER (WHERE mode = 'spin') AS last_spin_at
       FROM play_history
      WHERE user_id = $1 AND isrc = $2`,
    [user.id, isrc]
  );
  const row = rows[0];
  return NextResponse.json({
    spin_count: row ? Number(row.spin_count) : 0,
    last_spin_at: row?.last_spin_at ?? null,
  });
}
