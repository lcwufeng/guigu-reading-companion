import { gzipSync, gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import WebSocket from "ws";

const MAX_AUDIO_BYTES = 2_500_000;
const SPEECH_ENDPOINT = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream";
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

function frame(header: number[], payload: Buffer) {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(payload.length);
  return Buffer.concat([Buffer.from(header), size, payload]);
}

function parseServerFrame(data: Buffer) {
  const messageType = data[1] >> 4;
  const flags = data[1] & 0x0f;
  const compression = data[2] & 0x0f;
  let offset = 4;

  if (messageType === 0x0f) {
    const code = data.readUInt32BE(offset);
    const size = data.readUInt32BE(offset + 4);
    throw new Error(`speech api ${code}: ${data.subarray(offset + 8, offset + 8 + size).toString("utf8")}`);
  }

  if (flags === 0x01 || flags === 0x03) offset += 4;
  const size = data.readUInt32BE(offset);
  const packed = data.subarray(offset + 4, offset + 4 + size);
  const payload = compression === 0x01 ? gunzipSync(packed) : packed;
  return JSON.parse(payload.toString("utf8")) as { result?: { text?: string } };
}

async function recognizeSpeech(audio: Buffer) {
  const appId = process.env.VOLC_SPEECH_APP_ID;
  const accessToken = process.env.VOLC_SPEECH_ACCESS_TOKEN;
  if (!appId || !accessToken) throw new Error("speech credentials missing");

  const connectionId = randomUUID();
  const resourceId = process.env.VOLC_SPEECH_RESOURCE_ID || "volc.bigasr.sauc.duration";
  const request = {
    user: { uid: randomUUID() },
    audio: { format: "wav", codec: "raw", rate: 16000, bits: 16, channel: 1, language: "zh-CN" },
    request: {
      model_name: "bigmodel",
      enable_itn: true,
      enable_punc: true,
      enable_ddc: true,
    },
  };

  return new Promise<string>((resolve, reject) => {
    const socket = new WebSocket(SPEECH_ENDPOINT, {
      headers: {
        "X-Api-App-Key": appId,
        "X-Api-Access-Key": accessToken,
        "X-Api-Resource-Id": resourceId,
        "X-Api-Connect-Id": connectionId,
      },
      perMessageDeflate: false,
    });
    let audioSent = false;
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error("speech api timeout"));
    }, 20_000);

    const finish = (error?: Error, text?: string) => {
      clearTimeout(timeout);
      if (socket.readyState === WebSocket.OPEN) socket.close();
      if (error) reject(error);
      else resolve(text || "");
    };

    socket.once("open", () => {
      const payload = gzipSync(Buffer.from(JSON.stringify(request)));
      socket.send(frame([0x11, 0x10, 0x11, 0x00], payload));
    });
    socket.on("message", (raw) => {
      try {
        const response = parseServerFrame(Buffer.from(raw as ArrayBuffer));
        if (!audioSent) {
          audioSent = true;
          socket.send(frame([0x11, 0x22, 0x01, 0x00], gzipSync(audio)));
          return;
        }
        finish(undefined, response.result?.text?.trim());
      } catch (error) {
        finish(error instanceof Error ? error : new Error("speech response invalid"));
      }
    });
    socket.once("error", (error) => finish(error));
  });
}

export async function POST(request: Request) {
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

  try {
    const transcript = await recognizeSpeech(audio);
    if (!transcript) return NextResponse.json({ error: "没有听清楚，请再试一次" }, { status: 422 });
    return NextResponse.json({ transcript, source: "volc-doubao" });
  } catch (error) {
    console.error("Volc speech recognition failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "语音识别暂时不可用，请稍后再试" }, { status: 502 });
  }
}
