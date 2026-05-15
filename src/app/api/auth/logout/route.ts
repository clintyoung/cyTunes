import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { env } from "@/lib/env";

export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.redirect(`${env.appUrl}/`, { status: 303 });
}

// Allow GET for a plain <a href> logout link too
export async function GET() {
  const session = await getSession();
  session.destroy();
  return NextResponse.redirect(`${env.appUrl}/`);
}
