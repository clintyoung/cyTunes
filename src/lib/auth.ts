import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";

export type CurrentUser = {
  id: string;
  spotifyUserId: string;
  displayName: string | null;
  email: string | null;
  product: string | null;
};

// Debug instrumentation. Set DEBUG_AUTH=1 in the env to enable verbose
// per-request auth logging. Helpful for diagnosing session-loss bugs.
const DEBUG = process.env.DEBUG_AUTH === "1";

async function logAuth(tag: string, fields: Record<string, unknown>) {
  if (!DEBUG) return;
  const hdrs = await headers();
  const cookie = hdrs.get("cookie") ?? "";
  const cyt = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("cytunes_session="));
  // eslint-disable-next-line no-console
  console.log(`[auth] ${tag}`, {
    referer: hdrs.get("referer") ?? "?",
    cookiePresent: !!cyt,
    cookieLen: cyt ? cyt.length : 0,
    ...fields,
  });
}

/**
 * Server-side: returns the current user or null if not logged in.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  await logAuth("getCurrentUser:enter", {
    hasUserId: !!session.userId,
    sessionUserId: session.userId ?? null,
  });

  if (!session.userId) {
    await logAuth("getCurrentUser:no-userId", {});
    return null;
  }
  const { rows } = await query<{
    id: string;
    spotify_user_id: string;
    display_name: string | null;
    email: string | null;
    product: string | null;
  }>(
    `SELECT id, spotify_user_id, display_name, email, product
     FROM users WHERE id = $1`,
    [session.userId]
  );
  const row = rows[0];
  if (!row) {
    await logAuth("getCurrentUser:no-db-row", { searchedId: session.userId });
    return null;
  }
  await logAuth("getCurrentUser:ok", {
    userId: row.id,
    product: row.product,
  });
  return {
    id: row.id,
    spotifyUserId: row.spotify_user_id,
    displayName: row.display_name,
    email: row.email,
    product: row.product,
  };
}

/**
 * Use at the top of protected server components / route handlers.
 * Redirects to / if not logged in.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    await logAuth("requireUser:redirect-to-/", {});
    redirect("/");
  }
  return user;
}
