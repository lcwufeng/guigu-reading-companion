import {
  explorationNodeById,
  explorationNodes,
  interestDomainById,
  interestDomains,
  type InterestDomainId,
} from "../lib/exploration-catalog";
import { readyRuntimeDatabase } from "./runtime-database";
import { getStudentMemory, type StudentMemory } from "./student-memory";

export type ExplorationRecommendation = {
  domainId: InterestDomainId;
  reason: string;
};

export type ExplorationOverview = {
  completedNodeIds: string[];
  recommended: ExplorationRecommendation[];
  totalNodes: number;
  updatedAt: number;
};

type ProgressRow = { node_id: string; domain_id: InterestDomainId; completed_at: number; updated_at: number };

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
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 120) : "";
}

function personalizedRecommendations(memory: StudentMemory, rows: ProgressRow[]): ExplorationRecommendation[] {
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
    literature: "从熟悉的故事出发，练习理解人物和表达自己的想法。",
    nature: "从身边的生命出发，最容易发现值得追问的为什么。",
    science: "带着一个小问题做观察，慢慢长出科学思考。",
  };
  for (const domainId of ["literature", "nature", "science"] as InterestDomainId[]) {
    if (recommendations.length >= 3) break;
    add(domainId, fallbackReasons[domainId] || "这是一条适合开始的新路线。");
  }

  if (recommendations.length < 3) {
    const underExplored = [...interestDomains].sort((left, right) =>
      (completedByDomain.get(left.id) || 0) - (completedByDomain.get(right.id) || 0));
    for (const domain of underExplored) {
      if (recommendations.length >= 3) break;
      add(domain.id, `“${domain.shortTitle}”还等着你点亮第一片知识叶。`);
    }
  }

  return recommendations.slice(0, 3);
}

async function readProgress(userId: string) {
  const database = await readyRuntimeDatabase();
  if (!database) return { database: null, rows: [] as ProgressRow[] };
  const rows = await database.all<ProgressRow>(`SELECT node_id, domain_id, completed_at, updated_at
    FROM user_exploration_progress WHERE user_id = ? AND status = 'completed' ORDER BY completed_at ASC`, [userId]);
  return { database, rows };
}

export async function getExplorationOverview(userId: string): Promise<ExplorationOverview> {
  const { rows } = await readProgress(userId);
  const memory = await getStudentMemory(userId).catch(() => emptyMemory);
  return {
    completedNodeIds: [...new Set(rows.map((row) => row.node_id))],
    recommended: personalizedRecommendations(memory, rows),
    totalNodes: explorationNodes.length,
    updatedAt: rows.reduce((latest, row) => Math.max(latest, row.updated_at), 0),
  };
}

export async function completeExplorationNode(userId: string, nodeId: string): Promise<ExplorationOverview> {
  const node = explorationNodeById(nodeId);
  const domain = node ? interestDomainById(node.domainId) : null;
  if (!node || !domain) throw new Error("这个知识点不存在");

  const { database, rows } = await readProgress(userId);
  if (!database) throw new Error("知识探险进度暂时无法保存");
  const completed = new Set(rows.map((row) => row.node_id));
  const previousNodes = domain.nodes.filter((item) => item.order < node.order);
  if (!previousNodes.every((item) => completed.has(item.id))) throw new Error("请先完成前一个知识点");

  const now = Date.now();
  const detail = `完成“${domain.title}”里的“${node.title}”探索`;
  await database.batch([
    {
      sql: `INSERT INTO user_exploration_progress (user_id, node_id, domain_id, status, completed_at, updated_at)
        VALUES (?, ?, ?, 'completed', ?, ?)
        ON CONFLICT(user_id, node_id) DO UPDATE SET status = 'completed', updated_at = excluded.updated_at`,
      params: [userId, node.id, domain.id, now, now],
    },
    {
      sql: "INSERT OR IGNORE INTO user_activity_log (activity_id, user_id, activity, detail, happened_at) VALUES (?, ?, '知识探险', ?, ?)",
      params: [`exploration:${userId}:${node.id}`, userId, detail, now],
    },
    {
      sql: `INSERT INTO user_memory_profile (user_id, student_name, updated_at) VALUES (?, '', ?)
        ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at`,
      params: [userId, now],
    },
    {
      sql: `INSERT INTO user_memory_facts (user_id, fact_type, fact_value, source_type, created_at, last_used_at, expires_at)
        VALUES (?, 'learned', ?, 'knowledge-exploration', ?, ?, NULL)
        ON CONFLICT(user_id, fact_type, fact_value) DO UPDATE SET last_used_at = excluded.last_used_at`,
      params: [userId, node.takeaway, now, now],
    },
  ]);
  return getExplorationOverview(userId);
}
