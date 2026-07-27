import { NextResponse } from "next/server";
import {
  addParentMemoryFact,
  cancelStudentDeletion,
  clearStudentChat,
  deleteParentAttemptPhoto,
  deleteParentMemoryItem,
  deleteParentMistake,
  deleteParentMistakePhoto,
  parentCanAccessStudent,
  requestStudentDeletion,
  updateParentControls,
} from "../../../../db/parent-center";
import { getActiveParent } from "../../../parent-auth-user";
import { mutationOriginError, validMutationOrigin } from "../../../../lib/request-security";

type ActionBody = {
  action?: string;
  childId?: string;
  factType?: "learned" | "interest";
  kind?: "learned" | "interest" | "book" | "activity";
  value?: string;
  mistakeId?: string;
  attemptId?: string;
  interestAnalysisEnabled?: boolean;
  chatMemoryEnabled?: boolean;
  mistakePhotoRetentionDays?: number;
};

export async function POST(request: Request) {
  if (!validMutationOrigin(request)) return mutationOriginError();
  const parent = await getActiveParent();
  if (!parent) return NextResponse.json({ error: "请先登录家长中心。" }, { status: 401 });
  const body = await request.json().catch(() => null) as ActionBody | null;
  const childId = typeof body?.childId === "string" ? body.childId.slice(0, 80) : "";
  if (!childId) return NextResponse.json({ error: "请先选择孩子。" }, { status: 400 });
  try {
    if (!await parentCanAccessStudent(parent.id, childId)) return NextResponse.json({ error: "无权操作该学生数据。" }, { status: 403 });
    switch (body?.action) {
      case "update-controls":
        await updateParentControls(childId, {
          interestAnalysisEnabled: body.interestAnalysisEnabled,
          chatMemoryEnabled: body.chatMemoryEnabled,
          mistakePhotoRetentionDays: body.mistakePhotoRetentionDays,
        });
        break;
      case "clear-chat":
        await clearStudentChat(childId);
        break;
      case "add-memory":
        if (body.factType !== "learned" && body.factType !== "interest") throw new Error("invalid fact type");
        await addParentMemoryFact(childId, body.factType, body.value);
        break;
      case "delete-memory":
        if (!body.kind || !body.value) throw new Error("invalid memory item");
        await deleteParentMemoryItem(childId, body.kind, body.value);
        break;
      case "delete-mistake":
        if (!body.mistakeId || !await deleteParentMistake(childId, body.mistakeId)) throw new Error("mistake missing");
        break;
      case "delete-mistake-photo":
        if (!body.mistakeId || !await deleteParentMistakePhoto(childId, body.mistakeId)) throw new Error("photo missing");
        break;
      case "delete-attempt-photo":
        if (!body.attemptId || !await deleteParentAttemptPhoto(childId, body.attemptId)) throw new Error("photo missing");
        break;
      case "request-deletion":
        await requestStudentDeletion(parent.id, childId);
        break;
      case "cancel-deletion":
        await cancelStudentDeletion(parent.id, childId);
        break;
      default:
        return NextResponse.json({ error: "不支持这个操作。" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "操作没有完成，请刷新后重试。" }, { status: 400 });
  }
}
