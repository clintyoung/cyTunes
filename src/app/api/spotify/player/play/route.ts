import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { spotifyFetch } from "@/lib/spotify";

// PUT /api/spotify/player/play
// Body: { device_id, uris?, context_uri?, offset?, position_ms? }
// Forwards to PUT /me/player/play with the device_id query param.
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    device_id: string;
    uris?: string[];
    context_uri?: string;
    offset?: { uri?: string; position?: number };
    position_ms?: number;
  };
  if (!body.device_id) return NextResponse.json({ error: "device_id required" }, { status: 400 });

  const { device_id, ...rest } = body;
  const res = await spotifyFetch(
    user.id,
    `/me/player/play?device_id=${encodeURIComponent(device_id)}`,
    { method: "PUT", body: JSON.stringify(rest) }
  );
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: res.status });
  }
  return NextResponse.json({ ok: true });
}
