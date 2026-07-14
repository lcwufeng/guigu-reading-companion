import { randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

import type { RawData } from "ws";

export const SPEECH_ENDPOINT = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream";
export const DEFAULT_SPEECH_RESOURCE_ID = "volc.bigasr.sauc.duration";

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

async function loadNodeWebSocket() {
  // Keep this as a runtime import. A static import is resolved by the worker build
  // to ws/browser.js, which intentionally throws instead of opening a Node socket.
  const moduleName = ["w", "s"].join("");
  const websocketModule = await import(/* @vite-ignore */ moduleName) as typeof import("ws");
  return websocketModule.default;
}

export async function recognizeVolcSpeech(audio: Buffer) {
  const appId = process.env.VOLC_SPEECH_APP_ID;
  const accessToken = process.env.VOLC_SPEECH_ACCESS_TOKEN;
  if (!appId || !accessToken) throw new Error("speech credentials missing");

  const WebSocket = await loadNodeWebSocket();
  const connectionId = randomUUID();
  const resourceId = process.env.VOLC_SPEECH_RESOURCE_ID || DEFAULT_SPEECH_RESOURCE_ID;
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
    let settled = false;
    const timeout = setTimeout(() => {
      socket.terminate();
      finish(new Error("speech api timeout"));
    }, 20_000);

    const finish = (error?: Error, text?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (socket.readyState === WebSocket.OPEN) socket.close();
      if (error) reject(error);
      else resolve(text || "");
    };

    socket.once("open", () => {
      const payload = gzipSync(Buffer.from(JSON.stringify(request)));
      socket.send(frame([0x11, 0x10, 0x11, 0x00], payload));
    });
    socket.on("message", (raw: RawData) => {
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
    socket.once("error", (error: Error) => finish(error));
  });
}
