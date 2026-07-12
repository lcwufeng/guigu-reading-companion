import { NextResponse } from "next/server";

type ScanRequest = { imageData?: string };
type MiMoResponse = { choices?: Array<{ message?: { content?: string } }> };

const MAX_IMAGE_DATA_LENGTH = 4_000_000;
const IMAGE_DATA_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const subjects = ["数学", "语文", "英语", "科学", "其他"] as const;
const causes = ["知识点没记牢", "题目没读懂", "计算或书写失误", "方法没有想到", "还不确定"] as const;

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function enumValue<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]) {
  return typeof value === "string" && options.includes(value as T[number]) ? value as T[number] : fallback;
}

export async function POST(request: Request) {
  let body: ScanRequest;
  try {
    body = (await request.json()) as ScanRequest;
  } catch {
    return NextResponse.json({ error: "图片数据无效" }, { status: 400 });
  }

  const imageData = body.imageData || "";
  if (!IMAGE_DATA_PATTERN.test(imageData) || imageData.length > MAX_IMAGE_DATA_LENGTH) {
    return NextResponse.json({ error: "请上传清晰的 JPG、PNG 或 WebP 题目照片" }, { status: 400 });
  }

  const apiKey = process.env.MIMO_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "错题扫描服务尚未配置" }, { status: 503 });
  }

  try {
    const response = await fetch("https://api.xiaomimimo.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.MIMO_MODEL || "mimo-v2.5",
        messages: [
          {
            role: "system",
            content: [
              "你是龟龟伴读的错题整理助手，服务对象是小学生。",
              "请识别图片中的一道主要题目，并整理为可复习的错题记录。不要编造看不清的文字。",
              "仅返回 JSON，不要使用 Markdown 或添加解释。固定格式：",
              '{"subject":"数学|语文|英语|科学|其他","question":"完整题目文字","wrongAnswer":"图片中可见的学生原答案，没有则为空字符串","correction":"简洁、分步骤、适合小学生核对的正确思路与答案","cause":"知识点没记牢|题目没读懂|计算或书写失误|方法没有想到|还不确定","notice":"需要用户核对的模糊处，没有则为空字符串"}',
              "subject 和 cause 必须严格使用给定枚举。若题目不完整，在 notice 说明；无法可靠推断错因时使用还不确定。",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageData } },
              { type: "text", text: "识别并整理这张错题照片。" },
            ],
          },
        ],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        max_completion_tokens: 1200,
        stream: false,
      }),
    });
    if (!response.ok) throw new Error(`mimo api ${response.status}`);

    const payload = (await response.json()) as MiMoResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("empty response");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const result = {
      subject: enumValue(parsed.subject, subjects, "其他"),
      question: clean(parsed.question, 600),
      wrongAnswer: clean(parsed.wrongAnswer, 500),
      correction: clean(parsed.correction, 800),
      cause: enumValue(parsed.cause, causes, "还不确定"),
      notice: clean(parsed.notice, 180),
    };
    if (!result.question) throw new Error("question not recognized");
    return NextResponse.json({ result, source: "mimo-v2.5" });
  } catch {
    return NextResponse.json({ error: "这张照片暂时没有识别清楚，请换一张或手工填写" }, { status: 502 });
  }
}
