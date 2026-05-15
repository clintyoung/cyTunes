import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBpm, setManualBpm } from "@/lib/bpm";

// POST /api/bpm
// Body: { isrc, title?, artist? }  — looks up + caches BPM
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { isrc?: string; title?: string; artist?: string };
  if (!body.isrc) return NextResponse.json({ error: "isrc required" }, { status: 400 });

  const result = await getBpm(body.isrc, { title: body.title, artist: body.artist });
  return NextResponse.json(result);
}

// PUT /api/bpm
// Body: { isrc, bpm }  — manual override
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { isrc?: string; bpm?: number };
  if (!body.isrc) return NextResponse.json({ error: "isrc required" }, { status: 400 });
  if (typeof body.bpm !== "number" || body.bpm <= 0) {
    return NextResponse.json({ error: "bpm must be a positive number" }, { status: 400 });
  }
  await setManualBpm(body.isrc, body.bpm);
  return NextResponse.json({ ok: true });
}
