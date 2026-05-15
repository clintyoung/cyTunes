import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { spotifyFetch } from "@/lib/spotify";

// GET /api/spotify/playlists/[id]
// Returns playlist meta + all tracks (paginated through automatically).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 1) Meta
  const metaRes = await spotifyFetch(user.id, `/playlists/${params.id}`);
  if (!metaRes.ok) {
    const text = await metaRes.text();
    return NextResponse.json({ error: text }, { status: metaRes.status });
  }
  const meta = (await metaRes.json()) as {
    id: string;
    name: string;
    description: string;
    images: { url: string }[];
    owner: { display_name: string };
    tracks: { total: number };
  };

  // 2) Tracks (paginated)
  type RawItem = {
    track: {
      id: string;
      uri: string;
      name: string;
      duration_ms: number;
      external_ids?: { isrc?: string };
      album: { name: string; images: { url: string }[] };
      artists: { id: string; name: string }[];
    } | null;
  };
  const items: RawItem[] = [];
  let next: string | null = `/playlists/${params.id}/tracks?limit=100`;
  while (next) {
    const res = await spotifyFetch(user.id, next);
    if (!res.ok) break;
    const data = (await res.json()) as { items: RawItem[]; next: string | null };
    items.push(...data.items);
    next = data.next;
  }

  const tracks = items
    .filter((i) => i.track && i.track.id)
    .map((i) => ({
      id: i.track!.id,
      uri: i.track!.uri,
      name: i.track!.name,
      duration_ms: i.track!.duration_ms,
      isrc: i.track!.external_ids?.isrc ?? null,
      album: {
        name: i.track!.album.name,
        image: i.track!.album.images[0]?.url ?? null,
      },
      artists: i.track!.artists.map((a) => ({ id: a.id, name: a.name })),
    }));

  return NextResponse.json({
    id: meta.id,
    name: meta.name,
    description: meta.description,
    image: meta.images[0]?.url ?? null,
    owner: meta.owner.display_name,
    total: meta.tracks.total,
    tracks,
  });
}
