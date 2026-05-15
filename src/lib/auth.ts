import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";

export type CurrentUser = {
  id: string;
  spotifyUserId: string;
  displayName: string | null;
  email: string | null;
  product: string | null;
};

/**
 * Server-side: returns the current user or null if not logged in.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session.userId) return null;
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
  if (!row) return null;
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
  if (!user) redirect("/");
  return user;
}
