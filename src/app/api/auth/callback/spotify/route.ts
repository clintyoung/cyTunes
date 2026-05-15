import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { exchangeCodeForToken, fetchMe } from "@/lib/spotify";
import { query } from "@/lib/db";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(`${env.appUrl}/?error=${encodeURIComponent(errorParam)}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${env.appUrl}/?error=missing_code`);
  }

  const session = await getSession();
  if (!session.oauthState || session.oauthState !== state) {
    return NextResponse.redirect(`${env.appUrl}/?error=state_mismatch`);
  }

  // 1) Exchange code for tokens
  const tokens = await exchangeCodeForToken(code);

  // 2) Fetch profile so we know who this is
  const me = await fetchMe(tokens.access_token);

  // 3) Upsert user row
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const { rows } = await query<{ id: string }>(
    `INSERT INTO users (
        spotify_user_id, display_name, email, product,
        spotify_access_token, spotify_refresh_token, spotify_token_expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (spotify_user_id) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            email = EXCLUDED.email,
            product = EXCLUDED.product,
            spotify_access_token = EXCLUDED.spotify_access_token,
            spotify_refresh_token = EXCLUDED.spotify_refresh_token,
            spotify_token_expires_at = EXCLUDED.spotify_token_expires_at
     RETURNING id`,
    [
      me.id,
      me.display_name,
      me.email,
      me.product,
      tokens.access_token,
      tokens.refresh_token ?? null,
      expiresAt,
    ]
  );
  const userId = rows[0]?.id;
  if (!userId) {
    return NextResponse.redirect(`${env.appUrl}/?error=user_upsert_failed`);
  }

  // 4) Persist session
  session.userId = userId;
  session.spotifyUserId = me.id;
  session.oauthState = undefined;
  await session.save();

  // 5) Warn if not Premium — Web Playback SDK won't work
  const dest = me.product === "premium" ? "/playlists" : "/?warn=not_premium";
  return NextResponse.redirect(`${env.appUrl}${dest}`);
}
