import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { spotifyFetch } from "@/lib/spotify";

// PUT /api/spotify/player/transfer
// Body: { device_id, play? }
// Transfers playback to the given device.
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { device_id?: string; play?: boolean };
  if (!body.device_id) return NextResponse.json({ error: "device_id required" }, { status: 400 });

  const res = await spotifyFetch(user.id, `/me/player`, {
    method: "PUT",
    body: JSON.stringify({
      device_ids: [body.device_id],
      play: body.play ?? false,
    }),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: res.status });
  }
  return NextResponse.json({ ok: true });
}
