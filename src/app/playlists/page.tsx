import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { spotifyFetch } from "@/lib/spotify";
import { TopBar } from "@/components/TopBar";

type SpotifyPlaylist = {
  id: string;
  name: string;
  images: { url: string }[];
  tracks: { total: number };
};

async function fetchAllPlaylists(userId: string): Promise<SpotifyPlaylist[]> {
  const items: SpotifyPlaylist[] = [];
  let next: string | null = "/me/playlists?limit=50";
  while (next) {
    const res = await spotifyFetch(userId, next);
    if (!res.ok) break;
    const data = (await res.json()) as { items: SpotifyPlaylist[]; next: string | null };
    items.push(...data.items);
    next = data.next;
  }
  return items;
}

export default async function PlaylistsPage() {
  const user = await requireUser();
  const playlists = await fetchAllPlaylists(user.id);

  return (
    <>
      <TopBar />
      <main className="main">
        <h1>Your playlists</h1>
        <div className="playlist-list">
          {playlists.length === 0 && (
            <p className="muted">No playlists yet. Create one in Spotify or use the +New button below.</p>
          )}
          {playlists.map((p) => (
            <Link key={p.id} href={`/playlists/${p.id}`} className="playlist-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.images?.[0]?.url || "/placeholder-cover.svg"}
                alt=""
                className="playlist-cover"
              />
              <div className="playlist-meta">
                <div className="playlist-name">{p.name}</div>
                <div className="playlist-count">{p.tracks.total} tracks</div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
