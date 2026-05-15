import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { spotifyFetch } from "@/lib/spotify";
import { TopBar } from "@/components/TopBar";

// Spotify can return playlists where individual fields are null or missing
// (auto-generated mixes, deleted-but-cached items, etc.), so every nested
// field is optional here and we render defensively below.
type SpotifyPlaylist = {
  id: string;
  name: string;
  images: { url: string }[] | null;
  tracks: { total: number } | null;
};

const DEBUG = process.env.DEBUG_AUTH === "1";

async function fetchAllPlaylists(userId: string): Promise<SpotifyPlaylist[]> {
  const items: SpotifyPlaylist[] = [];
  let next: string | null = "/me/playlists?limit=50";
  let pageIdx = 0;
  while (next) {
    const res = await spotifyFetch(userId, next);
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[playlists] page ${pageIdx} fetch failed: ${res.status}`);
      break;
    }
    const data = (await res.json()) as {
      items: (SpotifyPlaylist | null)[];
      next: string | null;
    };
    // One-time dump of the first non-null playlist's shape so we can see
    // exactly what Spotify is returning — particularly whether `tracks`
    // is present, has a total, or has a different shape than expected.
    if (DEBUG && pageIdx === 0) {
      const sample = data.items.find((p) => p !== null);
      // eslint-disable-next-line no-console
      console.log("[playlists] first item raw:", JSON.stringify(sample, null, 2));
    }
    // Filter out null entries Spotify occasionally returns
    for (const p of data.items) {
      if (p && typeof p.id === "string") items.push(p);
    }
    next = data.next;
    pageIdx += 1;
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
                <div className="playlist-name">{p.name || "Untitled"}</div>
                <div className="playlist-count">
                  {p.tracks?.total ?? 0} tracks
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
