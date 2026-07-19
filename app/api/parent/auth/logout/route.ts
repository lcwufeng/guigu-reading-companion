import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { deleteParentSession } from "../../../../../db/parent-auth";
import { PARENT_SESSION_COOKIE, parentSessionCookieOptions } from "../../../../parent-auth-user";

export async function POST(request: Request) {
  const token = (await cookies()).get(PARENT_SESSION_COOKIE)?.value || "";
  await deleteParentSession(token).catch(() => undefined);
  const response = NextResponse.json({ loggedOut: true });
  response.cookies.set(PARENT_SESSION_COOKIE, "", { ...parentSessionCookieOptions(request), maxAge: 0 });
  return response;
}
