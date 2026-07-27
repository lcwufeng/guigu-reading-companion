import { getResolvedModelConfig } from "../db/model-config";
import { decodeImageDataUrl, validateImageDataUrl } from "./image-data";

export const MISTAKE_SUBJECTS = ["数学", "语文", "英语", "科学", "其他"] as const;
export const MISTAKE_CAUSES = ["知识点没记牢", "题目没读懂", "计算或书写失误", "方法没有想到", "还不确定"] as const;

export type MistakeAnalysis = {
  subject: typeof MISTAKE_SUBJECTS[number];
  question: string;
  wrongAnswer: string;
  correction: string;
  cause: typeof MISTAKE_CAUSES[number];
  notice: string;
};

export type MistakeReviewAnalysis = {
  readable: boolean;
  recognizedAnswer: string;
  recognizedSteps: string;
  correct: boolean;
  feedback: string;
  notice: string;
};

type MiMoResponse = { choices?: Array<{ message?: { content?: string } }> };

const MAX_IMAGE_DATA_LENGTH = 2_700_000;
const MAX_IMAGE_BYTES = 1_900_000;
const DEFAULT_MIMO_TIMEOUT_MS = 30_000;

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function enumValue<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]) {
  return typeof value === "string" && options.includes(value as T[number]) ? value as T[number] : fallback;
}

function modelTimeout() {
  const parsed = Number.parseInt(process.env.MIMO_TIMEOUT_MS || "", 10);
  return Number.isFinite(parsed) ? Math.min(60_000, Math.max(3_000, parsed)) : DEFAULT_MIMO_TIMEOUT_MS;
}

function parseJson(content: string) {
  return JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()) as Record<string, unknown>;
}

export function validateMistakeImageData(imageData: unknown): imageData is string {
  return validateImageDataUrl(imageData, MAX_IMAGE_DATA_LENGTH);
}

export function decodeMistakeImageData(imageData: unknown) {
  return decodeImageDataUrl(imageData, {
    maxDataLength: MAX_IMAGE_DATA_LENGTH,
    maxBytes: MAX_IMAGE_BYTES,
    maxPixels: 12_000_000,
  });
}

export function normalizeConfirmedMistake(value: unknown): MistakeAnalysis {
  const parsed = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    subject: enumValue(parsed.subject, MISTAKE_SUBJECTS, "其他"),
    question: clean(parsed.question, 600),
    wrongAnswer: clean(parsed.wrongAnswer, 500),
    correction: clean(parsed.correction, 800),
    cause: enumValue(parsed.cause, MISTAKE_CAUSES, "还不确定"),
    notice: clean(parsed.notice, 180),
  };
}

async function requestMiMo(
  systemPrompt: string,
  userContent: string | Array<{ type: "image_url"; image_url: { url: string } } | { type: "text"; text: string }>,
  maxCompletionTokens: number,
) {
  const config = await getResolvedModelConfig("multimodal");
  if (!config.configured) throw new Error("mimo unavailable");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), modelTimeout());
  try {
    const response = await fetch(config.baseUrl, {
      method: "POST",
      headers: { "api-key": config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        max_completion_tokens: maxCompletionTokens,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`mimo api ${response.status}`);
    const payload = await response.json() as MiMoResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("empty response");
    return parseJson(content);
  } finally {
    clearTimeout(timeout);
  }
}

export async function mistakeModelSource() {
  return (await getResolvedModelConfig("multimodal")).model;
}

export async function analyzeMistakeImage(imageData: string): Promise<MistakeAnalysis> {
  const parsed = await requestMiMo([
    "你是龟龟伴读的错题整理助手，服务对象是小学生。",
    "识别图片中的一道主要错题，并判断学科、完整题目、学生原答案、正确思路和可能错因。不要编造看不清的文字，不要输出或复述姓名、学校等个人信息。",
    "正确思路要简洁、分步骤、适合小学生核对。",
    "仅返回 JSON，不要使用 Markdown。固定格式：",
    '{"subject":"数学|语文|英语|科学|其他","question":"完整题目文字","wrongAnswer":"图片中可见的学生原答案，没有则为空字符串","correction":"正确思路与答案","cause":"知识点没记牢|题目没读懂|计算或书写失误|方法没有想到|还不确定","notice":"需要学生核对的模糊处，没有则为空字符串"}',
    "subject 和 cause 必须使用给定选项。题目不完整时在 notice 中说明；无法可靠判断错因时使用还不确定。",
  ].join("\n"), [
    { type: "image_url", image_url: { url: imageData } },
    { type: "text", text: "识别并整理这张错题照片。" },
  ], 1200);
  const result = normalizeConfirmedMistake(parsed);
  if (!result.question || !result.correction) throw new Error("incomplete recognition");
  return result;
}

export async function evaluateMistakeAnswer(input: {
  imageData: string;
  question: string;
  wrongAnswer: string;
  correction: string;
}): Promise<MistakeReviewAnalysis> {
  const recognized = await requestMiMo([
    "你是严格的手写作业图片识别器。你不知道原题，也不知道正确答案，只能逐字读取图片中实际可见的学生书写内容。",
    "绝对不能推测、补全、计算或编造图片里没有的答案。插画、人物、空白纸、印刷题目或其他无关图片都不算学生作答。",
    "只有清楚看见学生手写的最终答案或解题步骤时，readable 才能为 true。看不清、内容被截断、没有手写作答或图片与作业无关时必须为 false。",
    "不要输出或复述姓名、学校等个人信息。只返回 JSON，不要 Markdown。固定格式：",
    '{"readable":true或false,"recognizedAnswer":"图片中实际可见的最终答案，没有则为空字符串","recognizedSteps":"图片中实际可见的主要步骤，没有则为空字符串","notice":"需要重拍或核对的模糊处，没有则为空字符串"}',
  ].join("\n"), [
    { type: "image_url", image_url: { url: input.imageData } },
    { type: "text", text: "只识别这张图片里实际可见的手写答案和步骤，不要猜测原题或答案。" },
  ], 700);
  const readable = recognized.readable === true;
  const recognizedAnswer = clean(recognized.recognizedAnswer, 600);
  const recognizedSteps = clean(recognized.recognizedSteps, 1_200);
  const recognitionNotice = clean(recognized.notice, 220);
  if (!readable || (!recognizedAnswer && !recognizedSteps)) {
    return {
      readable: false,
      recognizedAnswer,
      recognizedSteps,
      correct: false,
      feedback: "请把手写答案和完整步骤拍清楚后再试一次。",
      notice: recognitionNotice || "没有识别到清晰、完整的手写答案和步骤，请重新拍照。",
    };
  }

  const judged = await requestMiMo([
    "你是龟龟伴读的错题复习老师，服务对象是小学生。",
    "手写内容已经由独立的图片识别步骤提取完成。请根据原题独立验算，再判断学生答案和关键步骤是否正确。",
    "不要因为写法与参考思路不同就判错；最终答案和题目要求的关键推理都正确才判为 correct=true。",
    "有错误时用温和、具体的中文指出错在哪里、下一步怎么改。只返回 JSON，不要 Markdown。固定格式：",
    '{"correct":true或false,"feedback":"给学生的具体反馈","notice":"仍需学生核对的地方，没有则为空字符串"}',
  ].join("\n"), [
    `原题：${clean(input.question, 600)}`,
    `本次照片中实际识别出的最终答案：${recognizedAnswer || "未单独写明"}`,
    `本次照片中实际识别出的步骤：${recognizedSteps || "未写步骤"}`,
    `参考思路（只用于复核，不可改写学生作答）：${clean(input.correction, 800)}`,
    `上次错误答案（只用于了解易错点）：${clean(input.wrongAnswer, 500) || "未记录"}`,
    "请独立验算并判断本次作答。",
  ].join("\n"), 800);
  const feedback = clean(judged.feedback, 500);
  const result = {
    readable: true,
    recognizedAnswer,
    recognizedSteps,
    correct: judged.correct === true,
    feedback,
    notice: clean(judged.notice, 220) || recognitionNotice,
  };
  if (!result.feedback) throw new Error("incomplete review judgment");
  return result;
}
