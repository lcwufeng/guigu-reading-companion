export const MINI_GAME_ORDER = [
  "fruit-catch",
  "turtle-courier",
  "weather-outfit",
  "lotus-jump",
  "spot-difference",
  "story-puzzle",
  "turtle-sky",
  "tortoise-race",
  "shell-memory",
  "cloud-pairs",
] as const;

export type MiniGameId = typeof MINI_GAME_ORDER[number];

export type MiniGameRankingRule = {
  gameName: string;
  metric: "time" | "score";
  metricLabel: string;
  ruleText: string;
  secondaryDirection: "asc" | "desc" | null;
  secondaryLabel: string | null;
};

export const MINI_GAME_RANKING_RULES: Record<MiniGameId, MiniGameRankingRule> = {
  "fruit-catch": {
    gameName: "龟龟接果子",
    metric: "score",
    metricLabel: "最高得分",
    ruleText: "按最高分从高到低排列；同分时，最高连击更多的小朋友在前。",
    secondaryDirection: "desc",
    secondaryLabel: "最高连击",
  },
  "turtle-courier": {
    gameName: "乌龟快递员",
    metric: "time",
    metricLabel: "最快通关",
    ruleText: "完成全部快递任务后，按通关用时从短到长排列。",
    secondaryDirection: null,
    secondaryLabel: null,
  },
  "weather-outfit": {
    gameName: "天气穿搭",
    metric: "time",
    metricLabel: "最快通关",
    ruleText: "完成全部天气任务后，按通关用时从短到长排列。",
    secondaryDirection: null,
    secondaryLabel: null,
  },
  "lotus-jump": {
    gameName: "荷叶跳跳",
    metric: "time",
    metricLabel: "最快通关",
    ruleText: "完成全部荷叶关卡后，按通关用时从短到长排列。",
    secondaryDirection: null,
    secondaryLabel: null,
  },
  "spot-difference": {
    gameName: "龟龟找不同",
    metric: "time",
    metricLabel: "最快通关",
    ruleText: "找完全部不同后，按通关用时从短到长排列。",
    secondaryDirection: null,
    secondaryLabel: null,
  },
  "story-puzzle": {
    gameName: "拼故事",
    metric: "time",
    metricLabel: "最快通关",
    ruleText: "完成全部故事后，按通关用时从短到长排列。",
    secondaryDirection: null,
    secondaryLabel: null,
  },
  "turtle-sky": {
    gameName: "龟龟飞机大战",
    metric: "score",
    metricLabel: "最高星光分",
    ruleText: "按三关累计星光分从高到低排列；同分时，碰到乌云更少的小朋友在前。",
    secondaryDirection: "asc",
    secondaryLabel: "碰到乌云",
  },
  "tortoise-race": {
    gameName: "龟兔赛跑",
    metric: "time",
    metricLabel: "最快到达",
    ruleText: "龟龟获胜后，按从进入比赛到到达终点的用时从短到长排列。",
    secondaryDirection: null,
    secondaryLabel: null,
  },
  "shell-memory": {
    gameName: "贝壳翻翻乐",
    metric: "time",
    metricLabel: "最快通关",
    ruleText: "完成全部五关后，按找齐所有贝壳配对的总用时从短到长排列。",
    secondaryDirection: null,
    secondaryLabel: null,
  },
  "cloud-pairs": {
    gameName: "云朵配对",
    metric: "time",
    metricLabel: "最快通关",
    ruleText: "完成全部五关后，按找出所有关联配对的总用时从短到长排列。",
    secondaryDirection: null,
    secondaryLabel: null,
  },
};

export function isMiniGameId(value: unknown): value is MiniGameId {
  return typeof value === "string" && MINI_GAME_ORDER.includes(value as MiniGameId);
}
