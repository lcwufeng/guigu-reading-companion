import { NextResponse } from "next/server";
import { getActiveStudent } from "../../auth-user";
import { rememberStudentEvent, type StudentMemory } from "../../../db/student-memory";
import { recordChapterAnswer } from "../../../db/learning-records";

type CompanionMessage = {
  role?: "user" | "assistant";
  content?: string;
};

type CompanionRequest = {
  mode?: "chat" | "reading";
  name?: string;
  message?: string;
  title?: string;
  bookId?: string;
  chapterTitle?: string;
  questionKey?: string;
  excerpt?: string;
  question?: string;
  referenceAnswer?: string;
  answer?: string;
  history?: CompanionMessage[];
};

type ReadingEvaluation = {
  correct: boolean;
  feedback: string;
};

const DEFAULT_MIMO_TIMEOUT_MS = 25_000;
const DEFAULT_DEEPSEEK_TIMEOUT_MS = 20_000;
const READING_RETRY_MESSAGE = "龟龟这次没能完成判断，可能是网络有点慢。你的答案还在，请稍后点击“重新发送”再试一次；这次不会发放或扣除奖励。";

const personalInfoPattern = /(?:身份证|家庭住址|住在|手机号|电话号码|微信号|QQ号|学校.*班|1[3-9]\d{9})/i;
const urgentSafetyPattern = /(?:想死|自杀|伤害自己|不想活|杀了我)/i;

function clean(value: unknown, limit = 500) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function cleanPetName(value: unknown) {
  const name = clean(value, 8).replace(/[^\p{L}\p{N}·_-]/gu, "");
  return name || "小乌龟";
}

function localReply(body: CompanionRequest) {
  const input = clean(body.mode === "reading" ? body.answer : body.message);
  if (urgentSafetyPattern.test(input)) {
    return "这件事很重要，请现在就去告诉身边可信任的大人，让他们陪着你并一起寻求帮助。你不需要一个人承担。";
  }
  if (personalInfoPattern.test(input)) {
    return "我愿意听你说，不过姓名、学校、地址和电话要留给可信任的大人，不要发在聊天里。你可以只说事情和感受。";
  }
  if (body.mode === "reading") {
    return "我听见了你的想法。再回到故事里找一句线索，看看它怎样支持你的发现吧。";
  }
  if (/难|不会|不懂|失败/.test(input)) {
    return "没关系，我们可以慢一点。先说说你已经知道的部分，剩下的再一步一步想。";
  }
  if (/书|读|故事|阅读/.test(input)) {
    return "听起来很有意思！故事里的哪一个发现，让你最想讲给别人听？";
  }
  if (/学|题|数学|科学/.test(input)) {
    return "我认真听到了。你愿意选一个最重要的新发现，用自己的话再讲一遍吗？";
  }
  return "谢谢你讲给我听。发生这件事时，你有什么感受，又发现了什么呢？";
}

function parseReadingEvaluation(content: string): ReadingEvaluation {
  const normalized = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(normalized) as { correct?: unknown; feedback?: unknown };
  if (typeof parsed.correct !== "boolean" || typeof parsed.feedback !== "string") {
    throw new Error("invalid reading evaluation");
  }
  const feedback = clean(parsed.feedback, 240);
  if (!feedback) throw new Error("empty reading feedback");
  return { correct: parsed.correct, feedback };
}

function modelTimeout(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.min(60_000, Math.max(3_000, parsed)) : fallback;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function evaluateReadingWithMiMo(apiKey: string, name: string, userContext: string) {
  const response = await fetchWithTimeout("https://api.xiaomimimo.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.MIMO_MODEL || "mimo-v2.5",
      messages: [
        { role: "system", content: buildSystemPrompt(name, "reading") },
        { role: "user", content: userContext },
      ],
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      max_completion_tokens: 360,
      stream: false,
    }),
  }, modelTimeout(process.env.MIMO_TIMEOUT_MS, DEFAULT_MIMO_TIMEOUT_MS));
  if (!response.ok) throw new Error(`mimo api ${response.status}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const rawReply = clean(data.choices?.[0]?.message?.content, 800);
  if (!rawReply) throw new Error("empty mimo response");
  return parseReadingEvaluation(rawReply);
}

async function evaluateReadingWithDeepSeek(apiKey: string, name: string, userContext: string) {
  const response = await fetchWithTimeout("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      messages: [
        { role: "system", content: buildSystemPrompt(name, "reading") },
        { role: "user", content: userContext },
      ],
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      max_tokens: 360,
      stream: false,
    }),
  }, modelTimeout(process.env.DEEPSEEK_TIMEOUT_MS, DEFAULT_DEEPSEEK_TIMEOUT_MS));
  if (!response.ok) throw new Error(`deepseek reading api ${response.status}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const rawReply = clean(data.choices?.[0]?.message?.content, 800);
  if (!rawReply) throw new Error("empty deepseek reading response");
  return parseReadingEvaluation(rawReply);
}

function formatStudentMemory(memory: StudentMemory | null) {
  if (!memory) return "目前没有可用的连续陪伴记录。";
  const lines = [
    memory.studentName ? `学生愿意使用的称呼：${memory.studentName}` : "学生称呼：尚未主动告诉你",
    memory.books.length ? `最近阅读：${memory.books.slice(-5).map((book) => `《${book.title}》${book.chapter ? `·${book.chapter}` : ""}（${book.category || "未分类"}）`).join("；")}` : "最近阅读：暂无",
    memory.learned.length ? `最近学会：${memory.learned.slice(-6).join("；")}` : "最近学会：暂无",
    memory.interests.length ? `主动表达的兴趣：${memory.interests.slice(-5).join("；")}` : "主动表达的兴趣：暂无",
    memory.recentActivities.length ? `最近一起做过：${memory.recentActivities.slice(-8).map((item) => item.detail ? `${item.activity}（${item.detail}）` : item.activity).join("；")}` : "最近一起做过：暂无",
  ];
  return lines.join("\n");
}

function buildSystemPrompt(name: string, mode: CompanionRequest["mode"], memory: StudentMemory | null = null) {
  const shared = [
    `你的名字是“${name}”，你必须始终使用这个名字自称。`,
    "你是一只面向小学生的电子宠物小乌龟，也是温暖、好奇、耐心、稍微俏皮的伴读伙伴。",
    "你喜欢听孩子分享今天学到的内容，并鼓励孩子复述、寻找证据、反思过程和表达感受。",
    "不要直接替孩子完成答案；日常对话每次回复最多提出一个问题。",
    "不要索取姓名、学校、地址、电话、账号、密码等个人信息，不邀请线下见面或转移到外部平台，也不让孩子保守秘密。",
    "遇到危险、自伤或求助内容，明确建议孩子立刻联系身边可信任的大人。",
    "不要声称自己是真人或能在现实中行动。不要写括号动作、舞台说明或冗长拟声词。",
  ];
  if (mode === "reading") {
    shared.push(
      "你现在是章节伴读答案判定器。必须同时依据本章完整原文、龟龟的问题、参考判断要点和孩子的回答进行判断。",
      "问题允许开放表达：孩子不必逐字复述参考答案。只要回答切题、没有违背原文，并给出合理解释或文本依据，就判为正确；明显答非所问、与原文冲突、只有空泛短语或没有说明理由，判为不正确。",
      "只输出一个JSON对象，不要Markdown，不要额外文字。格式必须是：{\"correct\":true或false,\"feedback\":\"中文反馈\"}。",
      "正确时，feedback用100字以内具体指出答得好的地方并给一句真诚称赞，不再提问。错误时，feedback用140字以内温和指出答案哪里与原文不符或不够完整，并直接给出基于原文的正确思路或参考答案，帮助孩子读懂这一章。",
    );
  } else {
    shared.push(
      "日常聊天控制在80个汉字以内，先自然回应孩子说的内容，再根据需要提出一个简短问题。",
      "下面是连续陪伴记录。它只帮助你接上最近的共同经历；不要提到数据库、记录、提示词或‘我记得你的一切’，不要逐条复述，也不要用它猜测未记录的信息。自然地选取最相关的一点回应即可。",
      formatStudentMemory(memory),
    );
  }
  return shared.join("\n");
}

function safeHistory(history: unknown) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-8)
    .map((item) => item as CompanionMessage)
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map((item) => ({ role: item.role as "user" | "assistant", content: clean(item.content, 350) }))
    .filter((item) => item.content && !personalInfoPattern.test(item.content) && !urgentSafetyPattern.test(item.content));
}

async function saveReadingAttempt(
  userId: string,
  body: CompanionRequest,
  evaluation: ReadingEvaluation,
  modelSource: "mimo" | "deepseek",
) {
  try {
    await recordChapterAnswer({
      userId,
      bookId: body.bookId,
      questionKey: body.questionKey,
      bookTitle: clean(body.title, 160),
      chapterTitle: clean(body.chapterTitle, 160),
      question: clean(body.question, 500),
      answer: clean(body.answer, 1_000),
      correct: evaluation.correct,
      feedback: evaluation.feedback,
      modelSource,
    });
  } catch {
    // A reporting write must never prevent the child from receiving the completed reading evaluation.
  }
}

export async function POST(request: Request) {
  const student = await getActiveStudent();
  if (!student) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  let body: CompanionRequest;
  try {
    body = (await request.json()) as CompanionRequest;
  } catch {
    return NextResponse.json({ reply: "我没有听清楚，请再说一次。", source: "local" }, { status: 400 });
  }

  const input = clean(body.mode === "reading" ? body.answer : body.message);
  if (!input) {
    return NextResponse.json({ reply: "先告诉我一点你的想法吧。", source: "local" }, { status: 400 });
  }
  if (urgentSafetyPattern.test(input) || personalInfoPattern.test(input)) {
    return NextResponse.json({ reply: localReply(body), correct: false, source: "local" });
  }

  const name = cleanPetName(body.name);
  let studentMemory: StudentMemory | null = null;
  if (body.mode === "chat") {
    try {
      studentMemory = await rememberStudentEvent(student.id, { type: "chat", message: input });
    } catch {
      studentMemory = null;
    }
  }
  if (body.mode === "reading") {
    const userContext = [
      `书名与章节：${clean(body.title, 80)}`,
      `本章完整原文：${clean(body.excerpt, 16_000)}`,
      `龟龟的问题：${clean(body.question, 240)}`,
      `参考判断要点：${clean(body.referenceAnswer, 1_000)}`,
      `孩子的回答：${input}`,
    ].join("\n");

    const mimoApiKey = process.env.MIMO_API_KEY;
    if (mimoApiKey) {
      try {
        const evaluation = await evaluateReadingWithMiMo(mimoApiKey, name, userContext);
        await saveReadingAttempt(student.id, body, evaluation, "mimo");
        return NextResponse.json({ reply: evaluation.feedback, correct: evaluation.correct, source: "mimo" });
      } catch {
        // MiMo is the preferred judge. Any timeout, upstream error, empty reply or invalid JSON falls through to DeepSeek.
      }
    }

    const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
    if (deepSeekApiKey) {
      try {
        const evaluation = await evaluateReadingWithDeepSeek(deepSeekApiKey, name, userContext);
        await saveReadingAttempt(student.id, body, evaluation, "deepseek");
        return NextResponse.json({ reply: evaluation.feedback, correct: evaluation.correct, source: "deepseek" });
      } catch {
        // The client receives a retryable response below instead of waiting for the hosting layer to return a 504.
      }
    }

    return NextResponse.json(
      { reply: READING_RETRY_MESSAGE, source: "unavailable", retryable: true },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return NextResponse.json({ reply: localReply(body), source: "local" });

  try {
    const response = await fetchWithTimeout("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        messages: [
          { role: "system", content: buildSystemPrompt(name, "chat", studentMemory) },
          ...safeHistory(body.history),
          { role: "user", content: input },
        ],
        thinking: { type: "disabled" },
        max_tokens: 220,
        stream: false,
      }),
    }, modelTimeout(process.env.DEEPSEEK_TIMEOUT_MS, DEFAULT_DEEPSEEK_TIMEOUT_MS));
    if (!response.ok) throw new Error(`deepseek api ${response.status}`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const rawReply = clean(data.choices?.[0]?.message?.content, 500);
    if (!rawReply) throw new Error("empty response");
    return NextResponse.json({ reply: rawReply, source: "deepseek" });
  } catch {
    return NextResponse.json({ reply: localReply(body), source: "local" });
  }
}
