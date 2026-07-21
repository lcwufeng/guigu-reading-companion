import { NextResponse } from "next/server";
import { completeExplorationNode, getExplorationOverview } from "../../../db/exploration";
import { getActiveStudent } from "../../auth-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    return NextResponse.json(await getExplorationOverview(student.id), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "知识探险暂时走不开，请稍后再试" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as { nodeId?: unknown } | null;
  const nodeId = typeof body?.nodeId === "string" ? body.nodeId.trim() : "";
  if (!nodeId || nodeId.length > 80) return NextResponse.json({ error: "请选择要完成的知识点" }, { status: 400 });
  try {
    return NextResponse.json(await completeExplorationNode(student.id, nodeId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "知识探险进度暂时无法保存";
    const status = /不存在|请先完成/.test(message) ? 400 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
