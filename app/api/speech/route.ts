import { NextResponse } from "next/server";
import { getActiveStudent } from "../../auth-user";
import { recognizeVolcSpeech } from "../../../lib/volc-speech";
import { recordServiceHealthEvent } from "../../../db/service-health";

const MAX_AUDIO_BYTES = 2_500_000;
const speechRateLimits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(request: Request) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const current = speechRateLimits.get(key);
  if (!current || current.resetAt <= now) {
    speechRateLimits.set(key, { count: 1, resetAt: now + 5 * 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 12;
}

export async function POST(request: Request) {
  if (!await getActiveStudent()) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (rateLimited(request)) {
    return NextResponse.json({ error: "语音使用得有点频繁，请休息一会再试" }, { status: 429 });
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
