import { getResolvedModelConfig } from "../db/model-config";

export type BookPageOcrResult = {
  text: string;
  chapterTitle: string;
  frontMatter: boolean;
  hasIllustration: boolean;
  notice: string;
  model: string;
};

type MiMoResponse = { choices?: Array<{ message?: { content?: string } }> };

const imagePattern = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

function clean(value: unknown, limit: number, preserveLines = false) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  return (preserveLines ? normalized : normalized.replace(/\s+/g, " ")).trim().slice(0, limit);
}

function parseJson(content: string) {
  return JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()) as Record<string, unknown>;
}

export function validateBookOcrImage(value: unknown): value is string {
  return typeof value === "string" && value.length <= 5_500_000 && imagePattern.test(value);
}

export async function recognizeBookPage(imageData: string, pageNumber: number): Promise<BookPageOcrResult> {
  if (!validateBookOcrImage(imageData)) throw new Error("扫描页图片无效。");
  const config = await getResolvedModelConfig("multimodal");
  if (!config.configured) throw new Error("多模态模型尚未配置，暂时不能识别扫描版 PDF。");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    const response = await fetch(config.baseUrl, {
      method: "POST",
      headers: { "api-key": config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: [
            "你是儿童读物数字化整理助手。逐字识别页面里真正的正文，保留自然段边界，不翻译、不改写、不补写看不清的文字。",
            "页码、反复出现的页眉页脚、出版社信息、版权信息不要放进 text。姓名、学校等与正文无关的个人信息也不要输出。",
            "判断这一页是否属于目录、前言、序言、出版说明、作者简介、版权页等非阅读正文；如果是，frontMatter=true。",
            "chapterTitle 只填写本页明确出现的正文篇章标题；普通小标题、页眉和目录条目不要当成新章节。",
            "hasIllustration 只在页面有值得随正文保留的原书插画时为 true；装饰线、页码图案和纯文字页面为 false。",
            "只返回 JSON，不要 Markdown。固定格式：",
            '{"text":"保留自然段换行的正文","chapterTitle":"明确的新篇章标题，没有则为空字符串","frontMatter":false,"hasIllustration":false,"notice":"模糊或缺字说明，没有则为空字符串"}',
          ].join("\n") },
          { role: "user", content: [
            { type: "image_url", image_url: { url: imageData } },
            { type: "text", text: `这是原书第 ${Math.max(1, Math.floor(pageNumber))} 页，请识别和分类。` },
          ] },
        ],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        max_completion_tokens: 3_800,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`多模态模型返回 ${response.status}`);
    const payload = await response.json() as MiMoResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("多模态模型没有返回识别结果。");
    const parsed = parseJson(content);
    return {
      text: clean(parsed.text, 16_000, true), chapterTitle: clean(parsed.chapterTitle, 140),
      frontMatter: parsed.frontMatter === true, hasIllustration: parsed.hasIllustration === true,
      notice: clean(parsed.notice, 240), model: config.model,
    };
  } finally { clearTimeout(timeout); }
}
