import { NextResponse } from "next/server";

type CompanionMessage = {
  role?: "user" | "assistant";
  content?: string;
};

type CompanionRequest = {
  mode?: "chat" | "reading";
  name?: string;
  message?: string;
  title?: string;
  excerpt?: string;
  question?: string;
  answer?: string;
  history?: CompanionMessage[];
};

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

function buildSystemPrompt(name: string, mode: CompanionRequest["mode"]) {
  const shared = [
    `你的名字是“${name}”，你必须始终使用这个名字自称。`,
    "你是一只面向小学生的电子宠物小乌龟，也是温暖、好奇、耐心、稍微俏皮的伴读伙伴。",
    "你喜欢听孩子分享今天学到的内容，并鼓励孩子复述、寻找证据、反思过程和表达感受。",
    "你不是老师或评分者，不直接抛出标准答案；每次回复最多提出一个问题。",
    "不要索取姓名、学校、地址、电话、账号、密码等个人信息，不邀请线下见面或转移到外部平台，也不让孩子保守秘密。",
    "遇到危险、自伤或求助内容，明确建议孩子立刻联系身边可信任的大人。",
    "不要声称自己是真人或能在现实中行动。不要写括号动作、舞台说明或冗长拟声词。",
  ];
  if (mode === "reading") {
    shared.push("阅读回应控制在100个汉字以内：先具体肯定一个有效发现，再用一个启发式问题引导孩子回到文本找证据。");
  } else {
    shared.push("日常聊天控制在80个汉字以内，先自然回应孩子说的内容，再根据需要提出一个简短问题。");
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

export async function POST(request: Request) {
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
    return NextResponse.json({ reply: localReply(body), source: "local" });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ reply: localReply(body), source: "local" });
  }

  const name = cleanPetName(body.name);
  const userContext = body.mode === "reading"
    ? [
        `书名：${clean(body.title, 80)}`,
        `片段：${clean(body.excerpt, 650)}`,
        `龟龟的问题：${clean(body.question, 160)}`,
        `孩子的回答：${input}`,
      ].join("\n")
    : input;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        messages: [
          { role: "system", content: buildSystemPrompt(name, body.mode) },
          ...(body.mode === "chat" ? safeHistory(body.history) : []),
          { role: "user", content: userContext },
        ],
        thinking: { type: "disabled" },
        max_tokens: 220,
        stream: false,
      }),
    });
    if (!response.ok) throw new Error(`deepseek api ${response.status}`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = clean(data.choices?.[0]?.message?.content, 500);
    if (!reply) throw new Error("empty response");
    return NextResponse.json({ reply, source: "deepseek" });
  } catch {
    return NextResponse.json({ reply: localReply(body), source: "local" });
  }
}
