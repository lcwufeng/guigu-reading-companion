import { NextResponse } from "next/server";
import {
  getExplorationOverview,
  submitExplorationProject,
  submitExplorationQuiz,
  submitExplorationReview,
} from "../../../db/exploration";
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
  const body = await request.json().catch(() => null) as {
    action?: unknown;
    nodeId?: unknown;
    selectedOption?: unknown;
    answer?: unknown;
  } | null;
  const action = typeof body?.action === "string" ? body.action.trim() : "";
  const nodeId = typeof body?.nodeId === "string" ? body.nodeId.trim() : "";
  if (!nodeId || nodeId.length > 80) return NextResponse.json({ error: "请选择要学习的知识点" }, { status: 400 });
  try {
    if (action === "quiz") {
      return NextResponse.json(await submitExplorationQuiz({
        userId: student.id,
        nodeId,
        selectedOption: Number(body?.selectedOption),
      }));
    }
    if (action === "project") {
      return NextResponse.json(await submitExplorationProject({ userId: student.id, nodeId, answer: body?.answer }));
    }
    if (action === "review") {
      return NextResponse.json(await submitExplorationReview({ userId: student.id, nodeId, answer: body?.answer }));
    }
    return NextResponse.json({ error: "请选择要进行的学习步骤" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "知识探险进度暂时无法保存";
    const status = /不存在|请先|还没到|已经掌握|准备中|请选择/.test(message) ? 400 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
