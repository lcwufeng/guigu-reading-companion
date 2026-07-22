import {
  explorationNodeById,
  explorationNodes,
  interestDomainById,
  interestDomains,
  type InterestDomainId,
} from "../lib/exploration-catalog";
import { evaluateExplorationAnswer, type ExplorationEvaluation } from "../lib/exploration-evaluator";
import { readyRuntimeDatabase, type RuntimeDatabase } from "./runtime-database";
import { getStudentMemory, type StudentMemory } from "./student-memory";

export type ExplorationRecommendation = {
  domainId: InterestDomainId;
  reason: string;
};

export type ExplorationNodeProgress = {
  state: "learned" | "mastered";
  reviewStreak: number;
  learnedAt: number;
  nextReviewAt: number;
  lastReviewedAt: number;
  evidenceSummary: string;
  attempts: number;
};

export type ExplorationOverview = {
  completedNodeIds: string[];
  dueReviewNodeIds: string[];
  nodeProgress: Record<string, ExplorationNodeProgress>;
  recommended: ExplorationRecommendation[];
  totalNodes: number;
  availableNodes: number;
  updatedAt: number;
};

export type ExplorationActionResult = ExplorationEvaluation & {
  overview?: ExplorationOverview;
};

type LearningRow = {
  node_id: string;
  domain_id: InterestDomainId;
  state: "learned" | "mastered";
  review_streak: number;
  learned_at: number;
  next_review_at: number;
  last_reviewed_at: number;
  evidence_summary: string;
  updated_at: number;
};

type AttemptCountRow = { node_id: string; count: number };

const DAY_MS = 24 * 60 * 60 * 1_000;
const emptyMemory: StudentMemory = {
  studentName: "",
  books: [],
  learned: [],
  interests: [],
  learnedDetails: [],
  interestDetails: [],
  recentActivities: [],
  updatedAt: 0,
};

function cleanSignal(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 300) : "";
}

function personalizedRecommendations(memory: StudentMemory, rows: LearningRow[]): ExplorationRecommendation[] {
  const signals = [
    ...memory.interests.map((text) => ({ text: cleanSignal(text), weight: 5, kind: "interest" as const })),
    ...memory.books.flatMap((book) => [book.title, book.category].map((text) => ({ text: cleanSignal(text), weight: 3, kind: "reading" as const }))),
    ...memory.learned.map((text) => ({ text: cleanSignal(text), weight: 2, kind: "learning" as const })),
    ...memory.recentActivities.flatMap((activity) => [activity.activity, activity.detail].map((text) => ({ text: cleanSignal(text), weight: 1, kind: "activity" as const }))),
  ].filter((signal) => signal.text);

  const scored = interestDomains.map((domain, order) => {
    let score = 0;
    let bestMatch: { keyword: string; kind: (typeof signals)[number]["kind"]; weight: number } | null = null;
    for (const signal of signals) {
      for (const keyword of domain.keywords) {
        if (!signal.text.toLocaleLowerCase("zh-CN").includes(keyword.toLocaleLowerCase("zh-CN"))) continue;
        score += signal.weight;
        if (!bestMatch || signal.weight > bestMatch.weight) bestMatch = { keyword, kind: signal.kind, weight: signal.weight };
      }
    }
    return { domain, order, score, bestMatch };
  }).sort((left, right) => right.score - left.score || left.order - right.order);

  const completedByDomain = new Map<InterestDomainId, number>();
  for (const row of rows) completedByDomain.set(row.domain_id, (completedByDomain.get(row.domain_id) || 0) + 1);

  const recommendations: ExplorationRecommendation[] = [];
  const add = (domainId: InterestDomainId, reason: string) => {
    if (!recommendations.some((item) => item.domainId === domainId)) recommendations.push({ domainId, reason });
  };

  for (const item of scored.filter((entry) => entry.score > 0)) {
    const match = item.bestMatch;
    if (!match) continue;
    const reason = match.kind === "interest"
      ? `你最近对“${match.keyword}”很感兴趣，从这里继续会有新发现。`
      : match.kind === "reading"
        ? `最近的阅读里出现了“${match.keyword}”，可以沿着它走得更远。`
        : `你最近接触过“${match.keyword}”，这条路线正好能把知识连起来。`;
    add(item.domain.id, reason);
    if (recommendations.length >= 2) break;
  }

  if (recommendations.length === 1) {
    const first = interestDomainById(recommendations[0].domainId);
    const bridge = first?.bridges.find((domainId) => !recommendations.some((item) => item.domainId === domainId));
    if (first && bridge) {
      const bridgedDomain = interestDomainById(bridge);
      add(bridge, `把“${first.shortTitle}”和“${bridgedDomain?.shortTitle || "新知识"}”连起来看看。`);
    }
  }

  const fallbackReasons: Partial<Record<InterestDomainId, string>> = {
    nature: "“动物与自然”已经开放完整学习路线，可以从身边的生命开始真正学一学。",
    literature: "从熟悉的故事出发，练习理解人物和表达自己的想法。",
    science: "带着一个小问题做观察，慢慢长出科学思考。",
  };
  for (const domainId of ["nature", "literature", "science"] as InterestDomainId[]) {
    if (recommendations.length >= 3) break;
    add(domainId, fallbackReasons[domainId] || "这是一条适合开始的新路线。");
  }

  if (recommendations.length < 3) {
    const underExplored = [...interestDomains].sort((left, right) =>
      (completedByDomain.get(left.id) || 0) - (completedByDomain.get(right.id) || 0));
    for (const domain of underExplored) {
      if (recommendations.length >= 3) break;
      add(domain.id, `“${domain.shortTitle}”还等着你开始第一段学习。`);
    }
  }
  return recommendations.slice(0, 3);
}

async function readLearning(userId: string) {
  const database = await readyRuntimeDatabase();
  if (!database) return { database: null, rows: [] as LearningRow[], attemptCounts: [] as AttemptCountRow[] };
  const [rows, attemptCounts] = await Promise.all([
    database.all<LearningRow>(`SELECT node_id, domain_id, state, review_streak, learned_at, next_review_at,
      last_reviewed_at, evidence_summary, updated_at FROM user_exploration_learning
      WHERE user_id = ? ORDER BY learned_at ASC`, [userId]),
    database.all<AttemptCountRow>(`SELECT node_id, COUNT(*) AS count FROM user_exploration_attempts
      WHERE user_id = ? GROUP BY node_id`, [userId]),
  ]);
  return { database, rows, attemptCounts };
}

export async function getExplorationOverview(userId: string, now = Date.now()): Promise<ExplorationOverview> {
  const { rows, attemptCounts } = await readLearning(userId);
  const memory = await getStudentMemory(userId).catch(() => emptyMemory);
  const attemptsByNode = new Map(attemptCounts.map((row) => [row.node_id, Number(row.count) || 0]));
  const nodeProgress: Record<string, ExplorationNodeProgress> = {};
  for (const row of rows) {
    nodeProgress[row.node_id] = {
      state: row.state,
      reviewStreak: row.review_streak,
      learnedAt: row.learned_at,
      nextReviewAt: row.next_review_at,
      lastReviewedAt: row.last_reviewed_at,
      evidenceSummary: row.evidence_summary,
      attempts: attemptsByNode.get(row.node_id) || 0,
    };
  }
  return {
    completedNodeIds: rows.map((row) => row.node_id),
    dueReviewNodeIds: rows.filter((row) => row.state === "learned" && row.next_review_at > 0 && row.next_review_at <= now).map((row) => row.node_id),
    nodeProgress,
    recommended: personalizedRecommendations(memory, rows),
    totalNodes: explorationNodes.length,
    availableNodes: explorationNodes.filter((node) => Boolean(node.lesson)).length,
    updatedAt: rows.reduce((latest, row) => Math.max(latest, row.updated_at), 0),
  };
}

async function requireLearningNode(database: RuntimeDatabase, userId: string, nodeId: string) {
  const node = explorationNodeById(nodeId);
  const domain = node ? interestDomainById(node.domainId) : null;
  if (!node || !domain) throw new Error("这个知识点不存在");
  if (!node.lesson) throw new Error("这个兴趣区的完整学习内容还在准备中");
  const previousNodes = domain.nodes.filter((item) => item.order < node.order && item.lesson);
  if (previousNodes.length) {
    const learnedRows = await database.all<{ node_id: string }>(`SELECT node_id FROM user_exploration_learning
      WHERE user_id = ? AND node_id IN (${previousNodes.map(() => "?").join(",")})`, [userId, ...previousNodes.map((item) => item.id)]);
    const learned = new Set(learnedRows.map((row) => row.node_id));
    if (!previousNodes.every((item) => learned.has(item.id))) throw new Error("请先完成前一个学习任务");
  }
  return { node, domain, lesson: node.lesson };
}

async function saveAttempt(database: RuntimeDatabase, input: {
  userId: string;
  nodeId: string;
  type: "quiz" | "project" | "review";
  answer: string;
  evaluation: ExplorationEvaluation;
  now: number;
}) {
  await database.run(`INSERT INTO user_exploration_attempts
    (attempt_id, user_id, node_id, attempt_type, answer, correct, feedback, model_source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    crypto.randomUUID(), input.userId, input.nodeId, input.type, cleanSignal(input.answer), input.evaluation.correct ? 1 : 0,
    input.evaluation.feedback, input.evaluation.source, input.now,
  ]);
}

export async function submitExplorationQuiz(input: {
  userId: string;
  nodeId: string;
  selectedOption: number;
  now?: number;
}): Promise<ExplorationActionResult> {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("知识探险进度暂时无法保存");
  const { lesson } = await requireLearningNode(database, input.userId, input.nodeId);
  if (!Number.isInteger(input.selectedOption) || input.selectedOption < 0 || input.selectedOption >= lesson.quiz.options.length) {
    throw new Error("请先选择一个答案");
  }
  const now = input.now ?? Date.now();
  const correct = input.selectedOption === lesson.quiz.correctIndex;
  const previousWrong = await database.first<{ count: number }>(`SELECT COUNT(*) AS count FROM user_exploration_attempts
    WHERE user_id = ? AND node_id = ? AND attempt_type = 'quiz' AND correct = 0`, [input.userId, input.nodeId]);
  const evaluation: ExplorationEvaluation = {
    correct,
    feedback: correct ? lesson.quiz.success : lesson.quiz.hints[Math.min(Number(previousWrong?.count) || 0, lesson.quiz.hints.length - 1)],
    source: "local",
  };
  await saveAttempt(database, { userId: input.userId, nodeId: input.nodeId, type: "quiz", answer: String(input.selectedOption), evaluation, now });
  return evaluation;
}

export async function submitExplorationProject(input: {
  userId: string;
  nodeId: string;
  answer: unknown;
  now?: number;
}): Promise<ExplorationActionResult> {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("知识探险进度暂时无法保存");
  const { node, domain } = await requireLearningNode(database, input.userId, input.nodeId);
  const quizPassed = await database.first<{ passed: number }>(`SELECT 1 AS passed FROM user_exploration_attempts
    WHERE user_id = ? AND node_id = ? AND attempt_type = 'quiz' AND correct = 1 LIMIT 1`, [input.userId, input.nodeId]);
  if (!quizPassed) throw new Error("先完成前面的互动检查，再来做实践表达");
  const answer = cleanSignal(input.answer);
  const now = input.now ?? Date.now();
  const evaluation = await evaluateExplorationAnswer("project", node, answer);
  await saveAttempt(database, { userId: input.userId, nodeId: input.nodeId, type: "project", answer, evaluation, now });
  if (!evaluation.correct) return evaluation;

  const detail = `完成“${domain.title}”里的“${node.title}”学习任务`;
  await database.batch([
    {
      sql: `INSERT INTO user_exploration_learning
        (user_id, node_id, domain_id, state, review_streak, learned_at, next_review_at, last_reviewed_at, evidence_summary, updated_at)
        VALUES (?, ?, ?, 'learned', 0, ?, ?, 0, ?, ?)
        ON CONFLICT(user_id, node_id) DO UPDATE SET state = CASE WHEN state = 'mastered' THEN state ELSE 'learned' END,
        next_review_at = CASE WHEN state = 'mastered' THEN next_review_at ELSE excluded.next_review_at END,
        evidence_summary = excluded.evidence_summary, updated_at = excluded.updated_at`,
      params: [input.userId, node.id, domain.id, now, now + DAY_MS, answer, now],
    },
    {
      sql: `INSERT INTO user_exploration_progress (user_id, node_id, domain_id, status, completed_at, updated_at)
        VALUES (?, ?, ?, 'completed', ?, ?)
        ON CONFLICT(user_id, node_id) DO UPDATE SET status = 'completed', updated_at = excluded.updated_at`,
      params: [input.userId, node.id, domain.id, now, now],
    },
    {
      sql: "INSERT OR IGNORE INTO user_activity_log (activity_id, user_id, activity, detail, happened_at) VALUES (?, ?, '知识探险', ?, ?)",
      params: [`exploration:${input.userId}:${node.id}`, input.userId, detail, now],
    },
    {
      sql: `INSERT INTO user_memory_profile (user_id, student_name, updated_at) VALUES (?, '', ?)
        ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at`,
      params: [input.userId, now],
    },
    {
      sql: `INSERT INTO user_memory_facts (user_id, fact_type, fact_value, source_type, created_at, last_used_at, expires_at)
        VALUES (?, 'learned', ?, 'knowledge-exploration', ?, ?, NULL)
        ON CONFLICT(user_id, fact_type, fact_value) DO UPDATE SET last_used_at = excluded.last_used_at`,
      params: [input.userId, node.takeaway, now, now],
    },
  ]);
  return { ...evaluation, overview: await getExplorationOverview(input.userId, now) };
}

export async function submitExplorationReview(input: {
  userId: string;
  nodeId: string;
  answer: unknown;
  now?: number;
}): Promise<ExplorationActionResult> {
  const database = await readyRuntimeDatabase();
  if (!database) throw new Error("知识探险进度暂时无法保存");
  const { node } = await requireLearningNode(database, input.userId, input.nodeId);
  const learning = await database.first<LearningRow>(`SELECT node_id, domain_id, state, review_streak, learned_at, next_review_at,
    last_reviewed_at, evidence_summary, updated_at FROM user_exploration_learning WHERE user_id = ? AND node_id = ?`, [input.userId, input.nodeId]);
  if (!learning) throw new Error("请先完成这个知识点的学习任务");
  if (learning.state === "mastered") throw new Error("这片知识已经掌握，可以随时回顾");
  const now = input.now ?? Date.now();
  if (learning.next_review_at > now) throw new Error("还没到复习时间，龟龟会准时提醒你");
  const answer = cleanSignal(input.answer);
  const evaluation = await evaluateExplorationAnswer("review", node, answer);
  await saveAttempt(database, { userId: input.userId, nodeId: input.nodeId, type: "review", answer, evaluation, now });
  if (!evaluation.correct) return evaluation;

  const nextStreak = learning.review_streak + 1;
  const mastered = nextStreak >= 3;
  const nextReviewAt = mastered ? 0 : now + (nextStreak === 1 ? 2 : 4) * DAY_MS;
  await database.run(`UPDATE user_exploration_learning SET state = ?, review_streak = ?, next_review_at = ?,
    last_reviewed_at = ?, updated_at = ? WHERE user_id = ? AND node_id = ?`, [
    mastered ? "mastered" : "learned", nextStreak, nextReviewAt, now, now, input.userId, input.nodeId,
  ]);
  return {
    ...evaluation,
    feedback: mastered ? `${evaluation.feedback} 你已经通过三次间隔复习，正式掌握这片知识！` : evaluation.feedback,
    overview: await getExplorationOverview(input.userId, now),
  };
}
