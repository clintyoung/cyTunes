import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAccessTokenForUser } from "@/lib/spotify";

// Returns a fresh Spotify access token for the logged-in user.
// Used by the Web Playback SDK in the browser via the getOAuthToken callback.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const token = await getAccessTokenForUser(user.id);
  return NextResponse.json({ access_token: token });
}
