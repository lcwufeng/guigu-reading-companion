import { NextResponse } from "next/server";
import { getActiveStudent } from "../../auth-user";
import { getMistakeForUser, recordMistakeReviewForUser } from "../../../db/mistakes";
import { deleteMistakeImage, saveMistakeImage } from "../../../db/mistake-images";
import { decodeMistakeImageData, evaluateMistakeAnswer, mistakeModelSource, validateMistakeImageData } from "../../../lib/mistake-ai";
import { recordServiceHealthEvent } from "../../../db/service-health";

const mistakeIdPattern = /^\d{10,20}$/;

export async function POST(request: Request) {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as null | { mistakeId?: string | number; imageData?: string };
  const mistakeId = String(body?.mistakeId || "");
  if (!mistakeIdPattern.test(mistakeId)) return NextResponse.json({ error: "错题编号无效" }, { status: 400 });
  if (!validateMistakeImageData(body?.imageData)) {
    return NextResponse.json({ error: "请上传清晰的答案和步骤照片" }, { status: 400 });
  }
  const mistake = await getMistakeForUser(student.id, mistakeId);
  if (!mistake) return NextResponse.json({ error: "这道错题不存在" }, { status: 404 });
  if (!process.env.MIMO_API_KEY) return NextResponse.json({ error: "错题判断服务尚未配置" }, { status: 503 });

  let answerImageId = "";
  const startedAt = Date.now();
  try {
    const result = await evaluateMistakeAnswer({
      imageData: body.imageData,
      question: mistake.question,
      wrongAnswer: mistake.wrongAnswer,
      correction: mistake.correction,
    });
    if (!result.readable) {
      await recordServiceHealthEvent({ service: "mistake-ai", operation: "answer-review", provider: "mimo", status: "success", durationMs: Date.now() - startedAt, detail: "image-unreadable" });
      return NextResponse.json({ result, saved: false, source: mistakeModelSource() });
    }

    const { bytes, contentType } = decodeMistakeImageData(body.imageData);
    answerImageId = await saveMistakeImage(student.id, bytes, contentType);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const answerImageUrl = `${basePath}/api/mistake-image?id=${encodeURIComponent(answerImageId)}`;
    const review = await recordMistakeReviewForUser(student.id, mistakeId, {
      answerImageUrl,
      recognizedAnswer: result.recognizedAnswer,
      recognizedSteps: result.recognizedSteps,
      correct: result.correct,
      feedback: result.feedback,
      notice: result.notice,
      modelSource: mistakeModelSource(),
    });
    if (!review) throw new Error("mistake disappeared");
    await recordServiceHealthEvent({ service: "mistake-ai", operation: "answer-review", provider: "mimo", status: "success", durationMs: Date.now() - startedAt });
    return NextResponse.json({ result, review, saved: true, source: mistakeModelSource() });
  } catch {
    await recordServiceHealthEvent({ service: "mistake-ai", operation: "answer-review", provider: "mimo", status: "failed", durationMs: Date.now() - startedAt, detail: "review-failed" });
    if (answerImageId) await deleteMistakeImage(student.id, answerImageId).catch(() => undefined);
    return NextResponse.json({ error: "龟龟这次没有看清答案，请重新拍照或稍后再试" }, { status: 502 });
  }
}
