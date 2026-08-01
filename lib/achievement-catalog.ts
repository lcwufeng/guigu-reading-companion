export type AchievementTrackId = "reading" | "mistakes" | "travel" | "games" | "knowledge";

export type AchievementMetricKey =
  | "readingAnswers"
  | "completedBooks"
  | "mistakesAdded"
  | "mistakesMastered"
  | "travelTrips"
  | "gamesCompleted"
  | "knowledgeLearned";

export type AchievementDefinition = {
  id: string;
  trackId: AchievementTrackId;
  level: 1 | 2 | 3 | 4;
  title: string;
  shortDescription: string;
  requirement: string;
  metricKey: AchievementMetricKey;
  target: number;
  badgeSrc: string;
};

export type AchievementTrack = {
  id: AchievementTrackId;
  title: string;
  subtitle: string;
  color: string;
};

export const achievementTracks: AchievementTrack[] = [
  { id: "reading", title: "书香成长路", subtitle: "读故事、想问题，让每一页都留下印记", color: "#4e8d57" },
  { id: "mistakes", title: "错题进步路", subtitle: "发现卡点、重新作答，把不会变成会", color: "#d17a3d" },
  { id: "travel", title: "山海旅行路", subtitle: "背上小包出发，把新发现带回手帐", color: "#378daf" },
  { id: "games", title: "龟龟乐园路", subtitle: "勇敢闯关，在游戏里练观察和思考", color: "#9a68bc" },
  { id: "knowledge", title: "知识探险路", subtitle: "沿着兴趣出发，把不同知识连起来", color: "#d49b25" },
];

export const achievementCatalog: AchievementDefinition[] = [
  {
    id: "reading-sprout",
    trackId: "reading",
    level: 1,
    title: "书页小芽",
    shortDescription: "你的第一颗阅读小芽冒出来啦。",
    requirement: "答对 1 个伴读问题",
    metricKey: "readingAnswers",
    target: 1,
    badgeSrc: "/assets/achievements/reading-sprout.webp",
  },
  {
    id: "reading-pathfinder",
    trackId: "reading",
    level: 2,
    title: "故事探路者",
    shortDescription: "你已经会沿着故事细节寻找答案。",
    requirement: "累计答对 5 个伴读问题",
    metricKey: "readingAnswers",
    target: 5,
    badgeSrc: "/assets/achievements/reading-pathfinder.webp",
  },
  {
    id: "story-collector",
    trackId: "reading",
    level: 3,
    title: "书香收藏家",
    shortDescription: "许多故事已经住进了你的记忆里。",
    requirement: "累计答对 15 个伴读问题",
    metricKey: "readingAnswers",
    target: 15,
    badgeSrc: "/assets/achievements/story-collector.webp",
  },
  {
    id: "little-scholar",
    trackId: "reading",
    level: 4,
    title: "小小博览家",
    shortDescription: "你能在一本又一本书里发现更大的世界。",
    requirement: "累计答对 30 个伴读问题",
    metricKey: "readingAnswers",
    target: 30,
    badgeSrc: "/assets/achievements/little-scholar.webp",
  },
  {
    id: "mistake-detective",
    trackId: "mistakes",
    level: 1,
    title: "错题侦探",
    shortDescription: "敢于找到错题，就是进步的开始。",
    requirement: "收录 1 道错题",
    metricKey: "mistakesAdded",
    target: 1,
    badgeSrc: "/assets/achievements/mistake-detective.webp",
  },
  {
    id: "correction-helper",
    trackId: "mistakes",
    level: 2,
    title: "改错能手",
    shortDescription: "你已经能重新思考并修正答案。",
    requirement: "掌握 3 道错题",
    metricKey: "mistakesMastered",
    target: 3,
    badgeSrc: "/assets/achievements/correction-helper.webp",
  },
  {
    id: "solution-mender",
    trackId: "mistakes",
    level: 3,
    title: "思路修补师",
    shortDescription: "你会找到思路里的缺口，再把它补完整。",
    requirement: "掌握 10 道错题",
    metricKey: "mistakesMastered",
    target: 10,
    badgeSrc: "/assets/achievements/solution-mender.webp",
  },
  {
    id: "review-expert",
    trackId: "mistakes",
    level: 4,
    title: "复盘小专家",
    shortDescription: "你已经把复习变成了自己的超能力。",
    requirement: "掌握 20 道错题",
    metricKey: "mistakesMastered",
    target: 20,
    badgeSrc: "/assets/achievements/review-expert.webp",
  },
  {
    id: "first-departure",
    trackId: "travel",
    level: 1,
    title: "背包出发",
    shortDescription: "第一段旅程已经写进成长手帐。",
    requirement: "完成 1 次旅行",
    metricKey: "travelTrips",
    target: 1,
    badgeSrc: "/assets/achievements/first-departure.webp",
  },
  {
    id: "footprint-collector",
    trackId: "travel",
    level: 2,
    title: "足迹收集者",
    shortDescription: "你的足迹正在地图上慢慢连成线。",
    requirement: "累计完成 3 次旅行",
    metricKey: "travelTrips",
    target: 3,
    badgeSrc: "/assets/achievements/footprint-collector.webp",
  },
  {
    id: "mountain-sea-traveler",
    trackId: "travel",
    level: 3,
    title: "山海旅行家",
    shortDescription: "森林、海湾和远方都留下了你的发现。",
    requirement: "累计完成 8 次旅行",
    metricKey: "travelTrips",
    target: 8,
    badgeSrc: "/assets/achievements/mountain-sea-traveler.webp",
  },
  {
    id: "world-wanderer",
    trackId: "travel",
    level: 4,
    title: "世界小旅人",
    shortDescription: "你带着好奇心走过了许多不同的地方。",
    requirement: "累计完成 15 次旅行",
    metricKey: "travelTrips",
    target: 15,
    badgeSrc: "/assets/achievements/world-wanderer.webp",
  },
  {
    id: "park-rookie",
    trackId: "games",
    level: 1,
    title: "乐园新手",
    shortDescription: "你完成了龟龟乐园里的第一次挑战。",
    requirement: "通关 1 个小游戏",
    metricKey: "gamesCompleted",
    target: 1,
    badgeSrc: "/assets/achievements/park-rookie.webp",
  },
  {
    id: "level-brave",
    trackId: "games",
    level: 2,
    title: "闯关小勇士",
    shortDescription: "遇到新关卡，你会观察、尝试，再继续前进。",
    requirement: "累计通关 3 个小游戏",
    metricKey: "gamesCompleted",
    target: 3,
    badgeSrc: "/assets/achievements/level-brave.webp",
  },
  {
    id: "turtle-gamer",
    trackId: "games",
    level: 3,
    title: "龟龟游戏家",
    shortDescription: "不同玩法都难不倒认真思考的你。",
    requirement: "累计通关 5 个小游戏",
    metricKey: "gamesCompleted",
    target: 5,
    badgeSrc: "/assets/achievements/turtle-gamer.webp",
  },
  {
    id: "park-champion",
    trackId: "games",
    level: 4,
    title: "乐园全能王",
    shortDescription: "龟龟乐园的全部挑战都留下了你的名字。",
    requirement: "通关全部 10 个小游戏",
    metricKey: "gamesCompleted",
    target: 10,
    badgeSrc: "/assets/achievements/park-champion.webp",
  },
  {
    id: "curiosity-sprout",
    trackId: "knowledge",
    level: 1,
    title: "好奇心萌芽",
    shortDescription: "一个好问题，带你走进了知识探险。",
    requirement: "学会 1 个知识点",
    metricKey: "knowledgeLearned",
    target: 1,
    badgeSrc: "/assets/achievements/curiosity-sprout.webp",
  },
  {
    id: "knowledge-pathfinder",
    trackId: "knowledge",
    level: 2,
    title: "知识探路者",
    shortDescription: "你正在把一个个新发现连成自己的路线。",
    requirement: "累计学会 6 个知识点",
    metricKey: "knowledgeLearned",
    target: 6,
    badgeSrc: "/assets/achievements/knowledge-pathfinder.webp",
  },
  {
    id: "bridge-builder",
    trackId: "knowledge",
    level: 3,
    title: "跨界发现家",
    shortDescription: "你能发现不同知识之间藏着的桥。",
    requirement: "累计学会 12 个知识点",
    metricKey: "knowledgeLearned",
    target: 12,
    badgeSrc: "/assets/achievements/bridge-builder.webp",
  },
  {
    id: "little-mentor",
    trackId: "knowledge",
    level: 4,
    title: "小小知识导师",
    shortDescription: "你已经积累了许多可以分享给别人的发现。",
    requirement: "累计学会 24 个知识点",
    metricKey: "knowledgeLearned",
    target: 24,
    badgeSrc: "/assets/achievements/little-mentor.webp",
  },
];

export const achievementById = new Map(achievementCatalog.map((achievement) => [achievement.id, achievement]));
