import { NextResponse } from "next/server";

type CompanionRequest = {
  mode?: "chat" | "reading";
  message?: string;
  title?: string;
  excerpt?: string;
  question?: string;
  answer?: string;
};

const personalInfoPattern = /(?:身份证|家庭住址|住在|手机号|电话号码|微信号|QQ号|学校.*班|1[3-9]\d{9})/i;
const urgentSafetyPattern = /(?:想死|自杀|伤害自己|不想活|杀了我)/i;

function clean(value: unknown, limit = 500) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
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

function extractOutputText(data: unknown) {
  const response = data as {
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("\n")
    .trim();
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ reply: localReply(body), source: "local" });
  }

  const readingContext = body.mode === "reading"
    ? [
        `书名：${clean(body.title, 80)}`,
        `片段：${clean(body.excerpt, 650)}`,
        `问题：${clean(body.question, 160)}`,
        `孩子的回答：${input}`,
      ].join("\n")
    : `孩子分享：${input}`;

  const instructions = body.mode === "reading"
    ? "你是面向小学生的电子宠物龟龟。用温暖、简短的中文回应孩子的阅读回答：先具体肯定一个有效发现，再用一个启发式问题引导孩子回到文本找证据。不要判分，不直接给标准答案，不索取个人信息，控制在90字以内。"
    : "你是面向小学生的电子宠物龟龟。用温暖、自然、简短的中文倾听孩子的日常和学习分享，优先鼓励复述、反思和表达感受。一次最多问一个问题，不做诊断，不索取个人信息，不让孩子保守秘密，控制在80字以内。";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_COMPANION_MODEL || "gpt-5.4-mini",
        instructions,
        input: readingContext,
        max_output_tokens: 220,
        store: false,
      }),
    });
    if (!response.ok) throw new Error(`responses api ${response.status}`);
    const reply = extractOutputText(await response.json());
    if (!reply) throw new Error("empty response");
    return NextResponse.json({ reply, source: "openai" });
  } catch {
    return NextResponse.json({ reply: localReply(body), source: "local" });
  }
}
