export type ParentCompanionAiInput = {
  childName: string;
  activeDays: number;
  completedTaskDays: number;
  recentBooks: string[];
  chapterAnswers: number;
  mistakeCounts: Record<string, number>;
  mistakePhotoAnswers: number;
  learned: string[];
  interests: string[];
  recentActivities: string[];
};

export type ParentCompanionAiResult = { text: string; modelSource: string };

type ChatCompletionResponse = { choices?: Array<{ message?: { content?: string } }> };

const DEFAULT_MIMO_TIMEOUT_MS = 10_000;
const DEFAULT_DEEPSEEK_TIMEOUT_MS = 8_000;

function timeout(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.min(30_000, Math.max(3_000, parsed)) : fallback;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function cleanSuggestion(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/^```(?:text)?\s*/i, "")
    .replace(/\s*```$/, "")
    .replace(/^\s*(?:建议|陪伴建议)[:：]\s*/, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[“\"']|[”\"']$/g, "")
    .trim()
    .slice(0, 180);
}

function prompt(input: ParentCompanionAiInput) {
  const status = input.mistakeCounts;
  const context = [
    `孩子称呼：${input.childName}`,
    `近两周有学习记录 ${input.activeDays} 天，完成全部今日任务 ${input.completedTaskDays} 天`,
    `最近阅读：${input.recentBooks.length ? input.recentBooks.join("、") : "暂无记录"}`,
    `章节思考次数：${input.chapterAnswers}`,
    `当前错题：新错题 ${status.new || 0} 道、练习中 ${status.reviewing || 0} 道、已掌握 ${status.mastered || 0} 道；拍照重新作答 ${input.mistakePhotoAnswers} 次`,
    `最近学会：${input.learned.length ? input.learned.join("；") : "暂无记录"}`,
    `兴趣：${input.interests.length ? input.interests.join("；") : "暂无记录"}`,
    `最近活动：${input.recentActivities.length ? input.recentActivities.join("；") : "暂无记录"}`,
  ];
  return [
    "你是龟龟伴读的家庭陪伴建议助手。请根据孩子近期的提炼数据，写一条家长今天就能执行的陪伴建议。",
    "要求：60—120个汉字；具体、温和、自然；先肯定一个真实迹象，再给一个不超过15分钟的亲子行动；可以附上一句家长能直接对孩子说的话。",
    "不要排名、打分、诊断、责备或制造焦虑；不要把练习次数等同于能力；不要提到AI、数据库、监控、聊天记录或提示词；不要编造数据中没有的事实。",
    "只输出建议正文，不要标题、Markdown、编号或引号。",
    "以下信息不包含聊天原文，只包含平台已提炼的阅读、学习、兴趣和活动摘要：",
    ...context,
  ].join("\n");
}

async function requestMiMo(apiKey: string, userPrompt: string): Promise<ParentCompanionAiResult> {
  const model = process.env.MIMO_MODEL || "mimo-v2.5";
  const response = await fetchWithTimeout("https://api.xiaomimimo.com/v1/chat/completions", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: userPrompt }],
      thinking: { type: "disabled" },
      max_completion_tokens: 260,
      stream: false,
    }),
  }, timeout(process.env.PARENT_SUGGESTION_MIMO_TIMEOUT_MS, DEFAULT_MIMO_TIMEOUT_MS));
  if (!response.ok) throw new Error(`mimo parent suggestion api ${response.status}`);
  const data = await response.json() as ChatCompletionResponse;
  const text = cleanSuggestion(data.choices?.[0]?.message?.content);
  if (!text) throw new Error("empty mimo parent suggestion");
  return { text, modelSource: model };
}

async function requestDeepSeek(apiKey: string, userPrompt: string): Promise<ParentCompanionAiResult> {
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  const response = await fetchWithTimeout("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: userPrompt }],
      thinking: { type: "disabled" },
      max_tokens: 260,
      stream: false,
    }),
  }, timeout(process.env.PARENT_SUGGESTION_DEEPSEEK_TIMEOUT_MS, DEFAULT_DEEPSEEK_TIMEOUT_MS));
  if (!response.ok) throw new Error(`deepseek parent suggestion api ${response.status}`);
  const data = await response.json() as ChatCompletionResponse;
  const text = cleanSuggestion(data.choices?.[0]?.message?.content);
  if (!text) throw new Error("empty deepseek parent suggestion");
  return { text, modelSource: model };
}

export async function generateParentCompanionSuggestion(input: ParentCompanionAiInput) {
  const userPrompt = prompt(input);
  const mimoKey = process.env.MIMO_API_KEY?.trim();
  if (mimoKey) {
    try {
      return await requestMiMo(mimoKey, userPrompt);
    } catch {
      // DeepSeek remains a bounded fallback so a temporary MiMo failure does not block parent login indefinitely.
    }
  }
  const deepSeekKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (deepSeekKey) return requestDeepSeek(deepSeekKey, userPrompt);
  throw new Error("parent companion AI unavailable");
}
