import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSession } from "@/lib/session";
import { buildAuthorizeUrl } from "@/lib/spotify";

// Kick off Spotify OAuth. Generate a state, stash in session, redirect.
export async function GET() {
  const state = crypto.randomBytes(16).toString("hex");
  const session = await getSession();
  session.oauthState = state;
  await session.save();

  return NextResponse.redirect(buildAuthorizeUrl(state));
}
