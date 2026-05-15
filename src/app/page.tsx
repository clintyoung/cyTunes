import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; warn?: string }>;
}) {
  const user = await getCurrentUser();
  if (user && user.product === "premium") redirect("/playlists");

  const params = await searchParams;

  return (
    <>
      <div className="topbar">
        <div className="brand">
          cy<span className="brand-accent">Tunes</span>
        </div>
      </div>
      <main className="main">
        <div className="card" style={{ textAlign: "center", padding: "32px 20px" }}>
          <h1 style={{ marginBottom: 8 }}>cyTunes</h1>
          <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>
            A music player for spin instructors. Trim songs, save trims with songs or playlists,
            see BPM, and play in Spin Mode.
          </p>

          {params.error && (
            <p className="error" style={{ marginBottom: 16 }}>
              Login error: {params.error}
            </p>
          )}
          {params.warn === "not_premium" && (
            <p className="error" style={{ marginBottom: 16 }}>
              Your Spotify account is not Premium. Web playback requires Premium.
            </p>
          )}

          <Link href="/api/auth/login" className="btn btn-primary btn-large">
            Log in with Spotify
          </Link>

          {user && (
            <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>
              Logged in as {user.displayName || user.email}.{" "}
              <Link href="/api/auth/logout">Log out</Link>
            </p>
          )}
        </div>

        <p className="footer-attrib">
          BPM data by{" "}
          <a href="https://getsongbpm.com" target="_blank" rel="noreferrer noopener">
            GetSongBPM
          </a>
          .
        </p>
      </main>
    </>
  );
}
