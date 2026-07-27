import { cookies } from "next/headers";
import { getAdminSessionUser, type AdminRole } from "../db/admin-auth";
import { requestUsesHttps, validMutationOrigin } from "../lib/request-security";

export const ADMIN_SESSION_COOKIE = "guigu_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export type AuthenticatedAdmin = { id: string; displayName: string; role: AdminRole; mustResetPassword: boolean };

export async function getAuthenticatedAdmin(): Promise<AuthenticatedAdmin | null> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value || "";
  if (!token) return null;
  const user = await getAdminSessionUser(token);
  return user ? { id: user.id, displayName: user.username, role: user.role, mustResetPassword: user.mustResetPassword } : null;
}

export async function getActiveAdmin() {
  const admin = await getAuthenticatedAdmin();
  return admin && !admin.mustResetPassword ? admin : null;
}

export function adminSessionCookieOptions(request: Request) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: requestUsesHttps(request),
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  };
}

export function validAdminMutationOrigin(request: Request) {
  return validMutationOrigin(request);
}
