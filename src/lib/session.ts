import { cookies } from "next/headers";
import { getIronSession, SessionOptions } from "iron-session";
import { env } from "@/lib/env";

export type SessionData = {
  userId?: string;          // our internal users.id (uuid)
  spotifyUserId?: string;   // convenience, also stored on the user row
  oauthState?: string;      // CSRF state for the OAuth round-trip
};

export const sessionOptions: SessionOptions = {
  password: env.sessionSecret,
  cookieName: "cytunes_session",
  cookieOptions: {
    secure: env.appUrl.startsWith("https://"),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
