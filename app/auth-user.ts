import { cookies } from "next/headers";
import { getSessionUser } from "../db/auth";
import { requestUsesHttps } from "../lib/request-security";

export const SESSION_COOKIE = "guigu_session";
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

export type AuthenticatedStudent = {
  id: string;
  displayName: string;
  mustResetPassword: boolean;
};

export async function getAuthenticatedStudent(): Promise<AuthenticatedStudent | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value || "";
  if (!token) return null;
  const user = await getSessionUser(token);
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.username,
    mustResetPassword: user.mustResetPassword,
  };
}

export async function getActiveStudent(): Promise<AuthenticatedStudent | null> {
  const student = await getAuthenticatedStudent();
  return student && !student.mustResetPassword ? student : null;
}

export function sessionCookieOptions(request: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: requestUsesHttps(request),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
