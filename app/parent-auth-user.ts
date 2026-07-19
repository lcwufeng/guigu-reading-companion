import { cookies } from "next/headers";
import { getParentSessionUser } from "../db/parent-auth";

export const PARENT_SESSION_COOKIE = "guigu_parent_session";
export const PARENT_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type AuthenticatedParent = {
  id: string;
  displayName: string;
  mustResetPassword: boolean;
};

export async function getAuthenticatedParent(): Promise<AuthenticatedParent | null> {
  const token = (await cookies()).get(PARENT_SESSION_COOKIE)?.value || "";
  if (!token) return null;
  const user = await getParentSessionUser(token);
  if (!user) return null;
  return { id: user.id, displayName: user.username, mustResetPassword: user.mustResetPassword };
}

export async function getActiveParent(): Promise<AuthenticatedParent | null> {
  const parent = await getAuthenticatedParent();
  return parent && !parent.mustResetPassword ? parent : null;
}

export function parentSessionCookieOptions(request: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: PARENT_SESSION_MAX_AGE_SECONDS,
  };
}
