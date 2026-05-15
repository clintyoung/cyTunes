import { requireUser } from "@/lib/auth";
import { spotifyFetch } from "@/lib/spotify";
import { query } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { PlaylistView, type Track, type TrimMap } from "./PlaylistView";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

async function loadPlaylist(userId: string, playlistId: string) {
  // 1) Meta
  const metaRes = await spotifyFetch(userId, `/playlists/${playlistId}`);
  if (!metaRes.ok) throw new Error(`Spotify ${metaRes.status}`);
  const meta = (await metaRes.json()) as {
    id: string;
    name: string;
    description: string;
    images: { url: string }[];
    owner: { display_name: string };
    tracks: { total: number };
  };

  // 2) Tracks
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
  const tracks: Track[] = [];
  let next: string | null = `/playlists/${playlistId}/tracks?limit=100`;
  while (next) {
    const res = await spotifyFetch(userId, next);
    if (!res.ok) break;
    const data = (await res.json()) as { items: RawItem[]; next: string | null };
    for (const item of data.items) {
      if (!item.track) continue;
      tracks.push({
        id: item.track.id,
        uri: item.track.uri,
        name: item.track.name,
        duration_ms: item.track.duration_ms,
        isrc: item.track.external_ids?.isrc ?? null,
        album_name: item.track.album.name,
        album_image: item.track.album.images[0]?.url ?? null,
        artists: item.track.artists.map((a) => a.name).join(", "),
      });
    }
    next = data.next;
  }
  return { meta, tracks };
}

async function loadTrimsForPlaylist(userId: string, playlistId: string, isrcs: string[]) {
  if (isrcs.length === 0) return {};
  const { rows } = await query<{
    isrc: string;
    scope: "song" | "playlist";
    start_ms: number;
    end_ms: number | null;
    id: string;
  }>(
    `SELECT id, isrc, scope, start_ms, end_ms
       FROM trims
      WHERE user_id = $1
        AND isrc = ANY($2::text[])
        AND (scope = 'song' OR (scope = 'playlist' AND playlist_id = $3))`,
    [userId, isrcs, playlistId]
  );
  // Playlist-scoped wins over song-scoped for a given ISRC.
  const map: TrimMap = {};
  for (const r of rows) {
    const existing = map[r.isrc];
    if (!existing || (r.scope === "playlist" && existing.scope === "song")) {
      map[r.isrc] = {
        id: r.id,
        scope: r.scope,
        start_ms: r.start_ms,
        end_ms: r.end_ms,
      };
    }
  }
  return map;
}

async function loadBpmsForIsrcs(isrcs: string[]): Promise<Record<string, number | null>> {
  if (isrcs.length === 0) return {};
  const { rows } = await query<{ isrc: string; bpm: string | null }>(
    `SELECT isrc, bpm FROM bpm_cache WHERE isrc = ANY($1::text[])`,
    [isrcs]
  );
  const map: Record<string, number | null> = {};
  for (const r of rows) map[r.isrc] = r.bpm === null ? null : Number(r.bpm);
  return map;
}

export default async function PlaylistDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser();
  const { meta, tracks } = await loadPlaylist(user.id, id);

  const isrcs = tracks.map((t) => t.isrc).filter((x): x is string => !!x);
  const [trims, bpms] = await Promise.all([
    loadTrimsForPlaylist(user.id, id, isrcs),
    loadBpmsForIsrcs(isrcs),
  ]);

  // Annotate tracks with known BPMs (null = not looked up yet)
  const annotated = tracks.map((t) => ({
    ...t,
    bpm: t.isrc ? bpms[t.isrc] ?? null : null,
  }));

  return (
    <>
      <TopBar back="/playlists" title={meta.name} />
      <main className="main">
        <PlaylistView playlistId={id} tracks={annotated} initialTrims={trims} />
      </main>
    </>
  );
}
