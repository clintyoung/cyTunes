import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { spotifyFetch } from "@/lib/spotify";

// GET /api/spotify/playlists
//   List the user's playlists (paginated; we fetch all pages).
// POST /api/spotify/playlists
//   Create a new playlist. Body: { name, description?, public? }

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  type Item = { id: string; name: string; images: { url: string }[]; tracks: { total: number } };
  const items: Item[] = [];
  let next: string | null = "/me/playlists?limit=50";
  while (next) {
    const res = await spotifyFetch(user.id, next);
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }
    const data = (await res.json()) as {
      items: Item[];
      next: string | null;
    };
    items.push(...data.items);
    // Spotify gives a full URL; spotifyFetch handles both.
    next = data.next;
  }
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    public?: boolean;
  };
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const res = await spotifyFetch(user.id, `/users/${user.spotifyUserId}/playlists`, {
    method: "POST",
    body: JSON.stringify({
      name: body.name,
      description: body.description ?? "",
      public: body.public ?? false,
    }),
  });
  const data = await res.json();
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  return NextResponse.json(data);
}
