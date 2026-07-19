import { NextResponse } from "next/server";
import { getParentDashboard } from "../../../../db/parent-center";
import { getActiveParent } from "../../../parent-auth-user";

export async function GET(request: Request) {
  const parent = await getActiveParent();
  if (!parent) return NextResponse.json({ error: "请先登录家长中心。" }, { status: 401 });
  const childId = (new URL(request.url).searchParams.get("childId") || "").slice(0, 80);
  try {
    const dashboard = await getParentDashboard(parent.id, parent.displayName, childId, 90);
    if (!dashboard) return NextResponse.json({ error: "找不到已绑定的孩子。" }, { status: 404 });
    const safeName = dashboard.selectedChild.displayName.replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 20) || "student";
    const exported = {
      exportedAt: new Date().toISOString(),
      child: dashboard.selectedChild,
      overview: dashboard.overview,
      reading: dashboard.reading,
      mistakes: dashboard.mistakes.map((mistake) => ({ ...mistake, imageId: mistake.imageId ? "已保存照片" : "", attempts: mistake.attempts.map((attempt) => ({ ...attempt, imageId: attempt.imageId ? "已保存照片" : "" })) })),
      memory: dashboard.memory,
      controls: dashboard.controls,
      note: "导出不包含聊天原文、密码和照片文件。",
    };
    return new Response(JSON.stringify(exported, null, 2), {
      headers: {
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeName}-学习数据.json`)}`,
        "content-type": "application/json; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "数据导出失败，请稍后重试。" }, { status: 503 });
  }
}
