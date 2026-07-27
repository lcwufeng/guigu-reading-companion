import { NextResponse } from "next/server";
import { getActiveStudent } from "../../auth-user";
import { analyzeMistakeImage, decodeMistakeImageData, mistakeModelSource, validateMistakeImageData } from "../../../lib/mistake-ai";
import { getResolvedModelConfig } from "../../../db/model-config";
import { recordServiceHealthEvent } from "../../../db/service-health";
import { consumeRateLimit } from "../../../db/rate-limit";
import { mutationOriginError, validMutationOrigin } from "../../../lib/request-security";

type ScanRequest = { imageData?: string };

export async function POST(request: Request) {
  if (!validMutationOrigin(request)) return mutationOriginError();
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const rateLimit = await consumeRateLimit({ scope: "mistake-scan", identity: student.id, limit: 15, windowMs: 10 * 60_000 });
  if (rateLimit.limited) return NextResponse.json(
    { error: "错题识别使用得有点频繁，请稍后再试" },
    { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
  );
  let body: ScanRequest;
  try {
    body = (await request.json()) as ScanRequest;
  } catch {
    return NextResponse.json({ error: "图片数据无效" }, { status: 400 });
  }

  const imageData = body.imageData || "";
  if (!validateMistakeImageData(imageData)) {
    return NextResponse.json({ error: "请上传清晰的 JPG、PNG 或 WebP 题目照片" }, { status: 400 });
  }
  try {
    decodeMistakeImageData(imageData);
  } catch {
    return NextResponse.json({ error: "图片内容或尺寸无效，请重新选择照片" }, { status: 400 });
  }

  if (!(await getResolvedModelConfig("multimodal")).configured) {
    return NextResponse.json({ error: "错题扫描服务尚未配置" }, { status: 503 });
  }

  const startedAt = Date.now();
  try {
    const result = await analyzeMistakeImage(imageData);
    await recordServiceHealthEvent({ service: "mistake-ai", operation: "question-scan", provider: "mimo", status: "success", durationMs: Date.now() - startedAt });
    return NextResponse.json({ result, source: await mistakeModelSource() });
  } catch {
    await recordServiceHealthEvent({ service: "mistake-ai", operation: "question-scan", provider: "mimo", status: "failed", durationMs: Date.now() - startedAt, detail: "recognition-failed" });
    return NextResponse.json({ error: "这张照片暂时没有识别清楚，请重新拍照或换一张图片" }, { status: 502 });
  }
}
