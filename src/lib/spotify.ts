import { env } from "@/lib/env";
import { query } from "@/lib/db";

// =============================================================================
// Spotify OAuth + API helpers
// =============================================================================

export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-library-read",
].join(" ");

export type SpotifyTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: "Bearer";
  scope: string;
};

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.spotify.clientId,
    response_type: "code",
    redirect_uri: env.spotify.redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
    show_dialog: "false",
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function tokenRequest(body: URLSearchParams): Promise<SpotifyTokenResponse> {
  const basic = Buffer.from(
    `${env.spotify.clientId}:${env.spotify.clientSecret}`
  ).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token error ${res.status}: ${text}`);
  }
  return (await res.json()) as SpotifyTokenResponse;
}

export async function exchangeCodeForToken(code: string): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.spotify.redirectUri,
  });
  return tokenRequest(body);
}

export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return tokenRequest(body);
}

/**
 * Get a fresh access token for a user. Refreshes via Spotify if expiring within 60s.
 * Updates the users row with the new token info.
 */
export async function getAccessTokenForUser(userId: string): Promise<string> {
  const { rows } = await query<{
    spotify_access_token: string;
    spotify_refresh_token: string;
    spotify_token_expires_at: Date;
  }>(
    `SELECT spotify_access_token, spotify_refresh_token, spotify_token_expires_at
     FROM users WHERE id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) throw new Error("User not found");

  const expiresAt = new Date(row.spotify_token_expires_at).getTime();
  const expiringSoon = expiresAt - Date.now() < 60_000;

  if (!expiringSoon) return row.spotify_access_token;

  const refreshed = await refreshAccessToken(row.spotify_refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  await query(
    `UPDATE users
       SET spotify_access_token = $1,
           spotify_refresh_token = COALESCE($2, spotify_refresh_token),
           spotify_token_expires_at = $3
     WHERE id = $4`,
    [refreshed.access_token, refreshed.refresh_token ?? null, newExpiresAt, userId]
  );
  return refreshed.access_token;
}

/**
 * Authenticated fetch against the Spotify Web API. Handles 401 by refreshing
 * the token once and retrying.
 */
export async function spotifyFetch(
  userId: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const doFetch = async (token: string) => {
    const url = path.startsWith("http") ? path : `https://api.spotify.com/v1${path}`;
    return fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
  };

  const token = await getAccessTokenForUser(userId);
  let res = await doFetch(token);
  if (res.status === 401) {
    // Force refresh by zeroing the expiry then retrying once
    await query(
      `UPDATE users SET spotify_token_expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
      [userId]
    );
    const fresh = await getAccessTokenForUser(userId);
    res = await doFetch(fresh);
  }
  return res;
}

export type SpotifyUserProfile = {
  id: string;
  display_name: string | null;
  email: string;
  product: "premium" | "free" | "open";
};

export async function fetchMe(accessToken: string): Promise<SpotifyUserProfile> {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Spotify /me failed: ${res.status}`);
  return (await res.json()) as SpotifyUserProfile;
}
