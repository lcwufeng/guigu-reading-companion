import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { recordAdminAudit, requestIp } from "../../../../../db/admin-audit";
import { deleteAdminSession } from "../../../../../db/admin-auth";
import { ADMIN_SESSION_COOKIE, adminSessionCookieOptions, getAuthenticatedAdmin, validAdminMutationOrigin } from "../../../../admin-auth-user";

export async function POST(request: Request) {
  if (!validAdminMutationOrigin(request)) return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  const admin = await getAuthenticatedAdmin();
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value || "";
  await deleteAdminSession(token).catch(() => undefined);
  if (admin) await recordAdminAudit({ adminId: admin.id, adminUsername: admin.displayName, action: "admin.logout", targetType: "admin", targetId: admin.id, summary: "管理员退出后台", ipAddress: requestIp(request) }).catch(() => undefined);
  const response = NextResponse.json({ loggedOut: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", { ...adminSessionCookieOptions(request), maxAge: 0 });
  return response;
}
