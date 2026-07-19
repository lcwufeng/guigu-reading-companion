import { NextResponse } from "next/server";
import { getParentDashboard } from "../../../../db/parent-center";
import { getActiveParent } from "../../../parent-auth-user";

export async function GET(request: Request) {
  const parent = await getActiveParent();
  if (!parent) return NextResponse.json({ error: "请先登录家长中心。" }, { status: 401 });
  const url = new URL(request.url);
  const childId = (url.searchParams.get("childId") || "").slice(0, 80);
  const days = Number(url.searchParams.get("days") || 7);
  try {
    const dashboard = await getParentDashboard(parent.id, parent.displayName, childId, days);
    if (!dashboard) return NextResponse.json({ error: "暂时没有已绑定的学生账号。" }, { status: 404 });
    return NextResponse.json({ dashboard }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "家长报告暂时无法读取。" }, { status: 503 });
  }
}
