import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { deleteSession } from "../../../../db/auth";
import { SESSION_COOKIE, sessionCookieOptions } from "../../../auth-user";

export async function POST(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value || "";
  await deleteSession(token).catch(() => undefined);
  const response = NextResponse.json({ loggedOut: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(request), maxAge: 0 });
  return response;
}
