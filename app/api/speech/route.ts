import { NextResponse } from "next/server";
import { getActiveStudent } from "../../auth-user";
import { recognizeVolcSpeech } from "../../../lib/volc-speech";
import { recordServiceHealthEvent } from "../../../db/service-health";
import { consumeRateLimit } from "../../../db/rate-limit";
import { mutationOriginError, requestIpAddress, validMutationOrigin } from "../../../lib/request-security";

const MAX_AUDIO_BYTES = 2_500_000;

export async function POST(request: Request) {
  if (!validMutationOrigin(request)) return mutationOriginError();
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const rateLimit = await consumeRateLimit({
    scope: "speech",
    identity: `${student.id}:${requestIpAddress(request)}`,
    limit: 12,
    windowMs: 5 * 60_000,
  });
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: "语音使用得有点频繁，请休息一会再试" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }
  if (!request.headers.get("content-type")?.startsWith("audio/wav")) {
    return NextResponse.json({ error: "只支持 WAV 录音" }, { status: 415 });
  }
  const audio = Buffer.from(await request.arrayBuffer());
  if (audio.length < 48 || audio.length > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "录音长度不合适，请录制 1 到 30 秒" }, { status: 400 });
  }

  const startedAt = Date.now();
  try {
    const transcript = await recognizeVolcSpeech(audio);
    if (!transcript) {
      await recordServiceHealthEvent({ service: "speech", operation: "speech-to-text", provider: "volc-doubao", status: "failed", durationMs: Date.now() - startedAt, detail: "empty-transcript" });
      return NextResponse.json({ error: "没有听清楚，请再试一次" }, { status: 422 });
    }
    await recordServiceHealthEvent({ service: "speech", operation: "speech-to-text", provider: "volc-doubao", status: "success", durationMs: Date.now() - startedAt });
    return NextResponse.json({ transcript, source: "volc-doubao" });
  } catch (error) {
    await recordServiceHealthEvent({ service: "speech", operation: "speech-to-text", provider: "volc-doubao", status: "failed", durationMs: Date.now() - startedAt, detail: "provider-error" });
    console.error("Volc speech recognition failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "语音识别暂时不可用，请稍后再试" }, { status: 502 });
  }
}
