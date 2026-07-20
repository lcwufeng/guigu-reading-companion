import { NextResponse } from "next/server";
import { getAdminAccounts, getAdminAiData, getAdminAuditLogs, getAdminLearning, getAdminOverview } from "../../../../db/admin-center";
import { getActiveAdmin } from "../../../admin-auth-user";

export async function GET(request: Request) {
  const admin = await getActiveAdmin();
  if (!admin) return NextResponse.json({ error: "请先登录管理后台。" }, { status: 401 });
  const url = new URL(request.url);
  const section = url.searchParams.get("section") || "overview";
  try {
    if (section === "overview") return NextResponse.json({ overview: await getAdminOverview(), admin });
    if (section === "accounts") return NextResponse.json({ accounts: await getAdminAccounts((url.searchParams.get("search") || "").slice(0, 30)), admin });
    if (section === "learning") {
      const studentId = (url.searchParams.get("studentId") || "").slice(0, 80);
      const accounts = await getAdminAccounts();
      const selectedId = studentId || accounts.students[0]?.id || "";
      return NextResponse.json({ learning: selectedId ? await getAdminLearning(selectedId, Number(url.searchParams.get("days")) || 14) : null, accounts, admin });
    }
    if (section === "ai") return NextResponse.json({ ai: await getAdminAiData(), admin });
    if (section === "books") return NextResponse.json({ admin });
    if (section === "audit") return NextResponse.json({ audits: await getAdminAuditLogs(200), admin });
    return NextResponse.json({ error: "未知的数据页面。" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "后台数据读取失败，请稍后重试。" }, { status: 503 });
  }
}
