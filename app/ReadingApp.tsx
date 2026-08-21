/* eslint-disable @next/next/no-img-element -- This pixel-art interface uses local sprite sheets and transparent assets. */
"use client";

import {
  Backpack,
  BookOpen,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  Edit3,
  Gamepad2,
  Lightbulb,
  Lock,
  LogOut,
  Mic,
  MicOff,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  Trophy,
  Trash2,
  Upload,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { chapterKnowledge } from "./book-knowledge";
import { chapterPrompts, type ChapterPrompt } from "./book-prompts";
import classicBookManifest from "./classic-books-manifest.json";
import {
  GAME_PARK_ORDER,
  type FruitCatchDailyState,
  type FruitCatchResult,
  type GameParkGameId,
  type LearningMiniGameResult,
} from "./game-park-types";
import type {
  ExplorationNode,
  InterestDomain,
  InterestDomainId,
} from "../lib/exploration-catalog";
import {
  achievementById,
  achievementCatalog,
  achievementTracks,
  type AchievementMetricKey,
} from "../lib/achievement-catalog";
import {
  DEFAULT_SOUND_SETTINGS,
  getSoundEngine,
  normalizeSoundSettings,
  type SoundEffectId,
  type SoundScene,
  type SoundSettings,
} from "./sound-system";
import { preloadStartupAssets } from "./startup-preload";

type View = "home" | "library" | "mistakes" | "chat" | "travel" | "journal" | "leaderboard" | "achievements" | "explore" | "games";

declare global {
  interface Window {
    GuiguAndroid?: {
      checkForUpdates: () => void;
      getVersionName: () => string;
    };
  }
}

const subscribeAndroidBridge = () => () => {};
const getAndroidVersion = () => {
  try {
    return window.GuiguAndroid?.getVersionName() || null;
  } catch {
    return "Android";
  }
};
const getServerAndroidVersion = () => null;

function soundSceneForView(view: View): SoundScene {
  if (view === "library") return "library";
  if (view === "games") return "park";
  if (view === "travel") return "travel";
  return "home";
}

const GamePark = lazy(() => import("./GamePark"));
type BusyAction = "feeding" | "swimming" | "sleeping" | null;
type RecordTab = "travel" | "reading" | "items";
type ChatMessage = { id: number; role: "turtle" | "user"; text: string };
type ActiveTravel = { destinationId: string; startedAt: number; endsAt: number };
type ReadingRecord = {
  id: number;
  title: string;
  date: string;
  answer: string;
  summary: string;
};
type TravelRecord = {
  id: number;
  destinationId?: string;
  destination: string;
  date: string;
  reward: string;
  photo: string;
  knowledge?: string;
  knowledgeCardId?: string;
  knowledgeTitle?: string;
  knowledgeFacts?: string[];
};

type MistakeStatus = "new" | "reviewing" | "mastered";
type MistakeRecord = {
  id: number;
  subject: string;
  question: string;
  wrongAnswer: string;
  correction: string;
  cause: string;
  status: MistakeStatus;
  date: string;
  reviewCount: number;
  imageData?: string;
};

type MistakeScanResult = Pick<MistakeRecord, "subject" | "question" | "wrongAnswer" | "correction" | "cause"> & { notice?: string };
type MistakeDraft = { imageData: string; result: MistakeScanResult };
type MistakeReviewResult = {
  readable: boolean;
  recognizedAnswer: string;
  recognizedSteps: string;
  correct: boolean;
  feedback: string;
  notice: string;
};
type MistakeReviewSave = {
  reviewNumber: number;
  status: MistakeStatus;
  rewardStars: number;
  rewardPlayTickets: number;
  stars: number;
  playTickets: number;
  boredom: number;
  attemptId: string;
};
type MistakeReviewOutcome = { result: MistakeReviewResult; saved: boolean; review?: MistakeReviewSave };

const mistakeSubjects = ["数学", "语文", "英语", "科学", "其他"];
const mistakeCauses = ["知识点没记牢", "题目没读懂", "计算或书写失误", "方法没有想到", "还不确定"];

const dailyTaskKeys = ["feed", "swim", "hide", "games", "explore", "travel", "chat", "mistake"] as const;
type DailyTaskKey = (typeof dailyTaskKeys)[number];
type DailyMistakeMode = "add" | "review";
type DailyTaskValues = Record<DailyTaskKey, number>;
type DailyPlan = {
  dateKey: string;
  taskKeys: DailyTaskKey[];
  mistakeMode: DailyMistakeMode;
  targets: DailyTaskValues;
  progress: DailyTaskValues;
  rewardClaimed: boolean;
};
type DailyFruitPicking = { dateKey: string; picked: number };
type DailyHideAndSeek = { dateKey: string; completed: number };
type ReadingFontSize = "small" | "medium" | "large";
type GradeLevel = 1 | 2 | 3 | 4 | 5 | 6;
type LibraryMode = "shelf" | "reader";
type StudentMemoryEvent = {
  type: "reading" | "learning" | "activity";
  title?: string;
  category?: string;
  chapter?: string;
  detail?: string;
  activity?: string;
};

type GameState = {
  name: string;
  hunger: number;
  cleanliness: number;
  boredom: number;
  fruits: number;
  stars: number;
  tickets: number;
  playTickets: number;
  lastSeen: number;
  readingRecords: ReadingRecord[];
  readingRewards: string[];
  travelRecords: TravelRecord[];
  chatMessages: ChatMessage[];
  activeTravel: ActiveTravel | null;
  mistakes: MistakeRecord[];
  dailyPlan: DailyPlan;
  fruitPicking: DailyFruitPicking;
  hideAndSeekDaily: DailyHideAndSeek;
  fruitCatchDaily: FruitCatchDailyState;
  completedMiniGames: GameParkGameId[];
  readingFontSize: ReadingFontSize;
  soundSettings: SoundSettings;
};

type Book = {
  id: string;
  title: string;
  author: string;
  grade: GradeLevel;
  category: string;
  coverMark: string;
  coverClass: string;
  pages: { heading: string; body: string }[];
  summary: string;
  knowledge: string;
  memoryCategory: string;
  journalArt?: string;
  source?: {
    url: string;
    format: "markdown" | "gutenberg" | "json";
    chunked?: boolean;
    startHeading?: string;
    label: string;
    language: string;
  };
  unavailableReason?: string;
};

type ImportedBookCatalogItem = {
  id: string;
  title: string;
  author: string;
  grade: string;
  summary: string;
  knowledge: string;
  memoryCategory: string;
  sourceLabel: string;
  journalArt: string;
};

type BookPage = {
  heading: string;
  body: string;
  images?: Array<{ src: string; alt: string }>;
};
type BookChapter = {
  id: string;
  title: string;
  pages: BookPage[];
  pageCount?: number;
  loaded?: boolean;
};
type SavedReadingProgress = { chapter: number; page: number; completed: boolean };
type BookAudioInfo = {
  ready: true;
  audioUrl: string;
  bookId: string;
  chapterIndex: number;
  chapterTitle: string;
  pageTimings: Array<{ startMs: number; endMs: number }>;
  voiceType: string;
  voiceLabel: string;
};
type BookAudioPhase = "idle" | "loading" | "ready" | "playing" | "paused" | "unavailable";

type KnowledgeCard = {
  id: string;
  title: string;
  image: string;
  facts: string[];
};

type Destination = {
  id: string;
  name: string;
  note: string;
  duration: string;
  reward: string;
  photo: string;
  knowledge?: string;
  locationArt: string;
  knowledgeTitle: string;
  knowledgeFacts: string[];
  knowledgeCards: KnowledgeCard[];
  position: string;
  requiredStars: number;
};

type TravelDiscovery = { destination: Destination; card: KnowledgeCard; playTicketAwarded?: boolean };

type CompanionPayload = {
  mode: "chat" | "reading";
  name: string;
  message?: string;
  title?: string;
  bookId?: string;
  chapterTitle?: string;
  questionKey?: string;
  excerpt?: string;
  question?: string;
  referenceAnswer?: string;
  answer?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

type CompanionResponse = {
  reply: string;
  correct?: boolean;
  source?: "deepseek" | "mimo" | "local" | "unavailable";
  reward?: {
    alreadyClaimed: boolean;
    resource: "tickets" | "play_tickets";
    balances: { fruits: number; stars: number; tickets: number; playTickets: number };
  };
  rewardPending?: boolean;
};

type StudentActionResponse = {
  error?: string;
  balances?: { fruits: number; stars: number; tickets: number; playTickets: number };
  dailyPlan?: DailyPlan;
  fruitPicking?: DailyFruitPicking;
  hideAndSeekDaily?: DailyHideAndSeek;
  activeTravel?: ActiveTravel;
  picked?: boolean;
  rewarded?: boolean;
  dailyRewardedNow?: boolean;
  travelPlayTicketAwarded?: boolean;
  interactionBonus?: {
    awarded: boolean;
    resource: "tickets" | "play_tickets" | null;
  };
};

type LeaderboardCategoryKey = "interaction" | "reading" | "travel" | "mistake";
type WeeklyLeaderboard = {
  weekLabel: string;
  top: Array<{ rank: number; name: string; points: number }>;
  me: {
    rank: number;
    name: string;
    points: number;
    breakdown: Record<LeaderboardCategoryKey, number>;
  };
  participantCount: number;
  categories: Array<{
    key: LeaderboardCategoryKey;
    label: string;
    pointPerEvent: number;
    dailyCap: number;
    dailyMaxPoints: number;
  }>;
};

type AchievementOverview = {
  achievements: Array<{ id: string; unlockedAt: number | null; current: number }>;
  metrics: Record<AchievementMetricKey, number>;
  selectedAchievementId: string | null;
  newlyUnlockedIds: string[];
  totalUnlocked: number;
  totalAchievements: number;
  tracks: Array<{ id: string; unlocked: number; total: number }>;
};

type ExplorationOverview = {
  completedNodeIds: string[];
  dueReviewNodeIds: string[];
  nodeProgress: Record<string, {
    state: "learned" | "mastered";
    reviewStreak: number;
    learnedAt: number;
    nextReviewAt: number;
    lastReviewedAt: number;
    evidenceSummary: string;
    attempts: number;
  }>;
  recommended: Array<{ domainId: InterestDomainId; reason: string }>;
  totalNodes: number;
  availableNodes: number;
  updatedAt: number;
};

type ExplorationStage = "learn" | "quiz" | "project" | "review" | "learned" | "mastered";
type ExplorationFeedback = { correct: boolean; feedback: string; source: "deepseek" | "local" };
type VoiceTarget = "chat" | "reading" | "exploration";
type VoicePhase = "idle" | "recording" | "recognizing";
type VoiceSession = {
  target: VoiceTarget;
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  processor: ScriptProcessorNode | null;
  silentGain: GainNode | null;
  recorder: MediaRecorder | null;
  recordedChunks: Blob[];
  chunks: Float32Array[];
  sampleRate: number;
  startedAt: number;
  animationFrame: number;
  clockTimer: number;
  maxTimer: number;
};

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const ASSET = `${BASE_PATH}/assets`;
const MOBILE_LAYOUT_QUERY = "(max-width: 820px)";

function subscribeMobileLayout(onChange: () => void) {
  const media = window.matchMedia(MOBILE_LAYOUT_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getMobileLayoutSnapshot() {
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

function getServerMobileLayoutSnapshot() {
  return false;
}

const initialState: GameState = {
  name: "小乌龟",
  hunger: 30,
  cleanliness: 80,
  boredom: 25,
  fruits: 5,
  stars: 12,
  tickets: 3,
  playTickets: 0,
  lastSeen: Date.now(),
  readingRecords: [],
  readingRewards: [],
  travelRecords: [],
  chatMessages: [
    {
      id: 1,
      role: "turtle",
      text: "你回来啦！今天学到了什么新东西？我想听你讲讲。",
    },
  ],
  activeTravel: null,
  mistakes: [],
  dailyPlan: {
    dateKey: "",
    taskKeys: ["feed", "swim", "hide", "mistake"],
    mistakeMode: "add",
    targets: { feed: 1, swim: 1, hide: 1, games: 0, explore: 0, travel: 0, chat: 0, mistake: 1 },
    progress: { feed: 0, swim: 0, hide: 0, games: 0, explore: 0, travel: 0, chat: 0, mistake: 0 },
    rewardClaimed: false,
  },
  fruitPicking: { dateKey: "", picked: 0 },
  hideAndSeekDaily: { dateKey: "", completed: 0 },
  fruitCatchDaily: { dateKey: "", plays: 0, rewarded: false, bestScore: 0, totalCaught: 0 },
  completedMiniGames: [],
  readingFontSize: "medium",
  soundSettings: DEFAULT_SOUND_SETTINGS,
};

const readingFontOptions: Array<{ value: ReadingFontSize; label: string; hint: string }> = [
  { value: "small", label: "小", hint: "当前原文字号" },
  { value: "medium", label: "中", hint: "原文字号放大 2 像素" },
  { value: "large", label: "大", hint: "原文字号放大 4 像素" },
];

const gradeLevels: Array<{ value: GradeLevel; label: string }> = [
  { value: 1, label: "一年级" },
  { value: 2, label: "二年级" },
  { value: 3, label: "三年级" },
  { value: 4, label: "四年级" },
  { value: 5, label: "五年级" },
  { value: 6, label: "六年级" },
];

function gradeLevelFromLabel(label: string): GradeLevel {
  const chineseGrade = gradeLevels.find((grade) => label.includes(grade.label));
  if (chineseGrade) return chineseGrade.value;
  const numericGrade = Number(label.match(/[1-6]/)?.[0]);
  return numericGrade >= 1 && numericGrade <= 6 ? numericGrade as GradeLevel : 1;
}

const journalReadingArtByTitle: Record<string, string> = {
  "稻草人": "optimized/ui/journal/books/scarecrow-reading-book.webp",
  "格林童话": "optimized/ui/journal/books/grimm-reading-book.webp",
  "安徒生童话": "optimized/ui/journal/books/andersen-reading-book.webp",
  ...Object.fromEntries(classicBookManifest.map((book) => [book.title, `optimized/ui/journal/books/classics/${book.slug}.webp`])),
};

function journalReadingArtFor(title: string, imported: Book[]) {
  const staticArt = journalReadingArtByTitle[title];
  if (staticArt) return `${ASSET}/${staticArt}`;
  const dynamicArt = imported.find((book) => book.title === title)?.journalArt;
  return dynamicArt ? `${BASE_PATH}${dynamicArt}` : `${ASSET}/ui/journal/reading-record-book.png`;
}

function isReadingFontSize(value: unknown): value is ReadingFontSize {
  return value === "small" || value === "medium" || value === "large";
}

const classicBooks: Book[] = classicBookManifest.map((book) => ({
  id: book.slug,
  title: book.title,
  author: book.author,
  grade: gradeLevelFromLabel(book.grade),
  category: `${book.grade}经典读物`,
  coverMark: book.title.slice(0, 1),
  coverClass: "cover-classic",
  pages: [],
  summary: book.summary,
  knowledge: book.knowledge,
  memoryCategory: book.memoryCategory,
  source: {
    url: `${BASE_PATH}/api/library/bundled-book?id=${encodeURIComponent(book.slug)}`,
    format: "json",
    chunked: true,
    label: "用户提供电子版；扫描页经本地 OCR 整理并保留原书插图",
    language: "中文原文",
  },
}));

const books: Book[] = [
  {
    id: "scarecrow-zh",
    title: "稻草人",
    author: "叶圣陶",
    grade: 3,
    category: "中文电子版全文",
    coverMark: "稻",
    coverClass: "cover-scarecrow",
    pages: [],
    summary: "收录《稻草人》《小白船》《一粒种子》等 13 篇童话，按篇章完整阅读。",
    knowledge: "叶圣陶是中国现代童话创作的重要作家。《稻草人》通过童话人物的所见所感，引导读者观察生活并体会他人的处境。",
    memoryCategory: "中国儿童文学·童话",
    source: {
      url: `${BASE_PATH}/api/library/bundled-book?id=scarecrow-zh`,
      format: "markdown",
      label: "用户提供《稻草人》中文电子版",
      language: "中文原文",
    },
  },
  {
    id: "grimm-zh",
    title: "格林童话",
    author: "格林兄弟",
    grade: 3,
    category: "中文电子版全文",
    coverMark: "格",
    coverClass: "cover-grimm",
    pages: [],
    summary: "收录《青蛙王子》《小红帽》《白雪公主》等 22 篇童话，按篇章完整阅读。",
    knowledge: "格林兄弟整理的童话常以森林、城堡、考验与魔法展开。阅读时可以留意人物如何在选择中展现勇气、智慧与责任。",
    memoryCategory: "欧洲民间童话",
    source: {
      url: `${BASE_PATH}/api/library/bundled-book?id=grimm-zh`,
      format: "markdown",
      label: "用户提供三年级《格林童话》中文电子版（扫描版 OCR 整理）",
      language: "中文原文",
    },
  },
  {
    id: "andersen-zh",
    title: "安徒生童话",
    author: "安徒生",
    grade: 3,
    category: "中文电子版全文",
    coverMark: "安",
    coverClass: "cover-andersen",
    pages: [],
    summary: "收录《丑小鸭》《拇指姑娘》《野天鹅》等 10 篇童话，按篇章完整阅读。",
    knowledge: "安徒生童话常把温柔、幻想和现实感受放在一起。阅读时可以从人物的选择、愿望和变化中理解勇气、诚实与自我认同。",
    memoryCategory: "丹麦文学·童话",
    source: {
      url: `${BASE_PATH}/api/library/bundled-book?id=andersen-zh`,
      format: "markdown",
      label: "用户提供《安徒生童话》中文电子版",
      language: "中文原文",
    },
  },
  ...classicBooks,
];

function importedCatalogBook(book: ImportedBookCatalogItem): Book {
  return {
    id: book.id,
    title: book.title,
    author: book.author || "佚名",
    grade: gradeLevelFromLabel(book.grade),
    category: `${book.grade} · 后台导入`,
    coverMark: book.title.slice(0, 1),
    coverClass: "cover-classic",
    pages: [],
    summary: book.summary,
    knowledge: book.knowledge,
    memoryCategory: book.memoryCategory,
    journalArt: book.journalArt,
    source: {
      url: `${BASE_PATH}/api/library/books?id=${encodeURIComponent(book.id)}`,
      format: "json",
      chunked: true,
      label: book.sourceLabel,
      language: "中文原文",
    },
  };
}

function buildChapterPrompt(title: string): ChapterPrompt {
  const seed = [...title].reduce((total, character) => total + (character.codePointAt(0) || 0), 0) % 4;
  const prompts: ChapterPrompt[] = [
    {
      question: `读完《${title}》，哪一个人物、行动或变化最值得留意？它怎样推动了这一章的内容？`,
      guide: "回到原文找一个关键行动，再看看它发生以后，人物或事情有了什么变化。",
      referenceAnswer: "这是开放性问题。答案只要准确引用本章中的人物、行动或变化，并说明它对后续内容的影响，就应判为正确；不要要求唯一表述。",
    },
    {
      question: `《${title}》里，哪个细节最能帮助你理解这一章？请用原文内容说说理由。`,
      guide: "可以找一句话、一个动作、一处景物或一次观察，说明它告诉了你什么。",
      referenceAnswer: "这是开放性问题。答案只要选取本章真实存在的细节，并作出与原文相符的解释，就应判为正确；允许学生有自己的感受。",
    },
    {
      question: `如果请你给《${title}》再取一个小标题，你会取什么？为什么这个标题符合原文？`,
      guide: "先想想这一章最重要的人、事或发现，再从原文找一两个细节支持你的小标题。",
      referenceAnswer: "这是开放性问题。新标题不必唯一，只要能够概括本章核心内容，并有至少一个与原文相符的理由，就应判为正确。",
    },
    {
      question: `读《${title}》时，你发现人物、事情或观察结果前后有什么变化？请结合原文说明。`,
      guide: "找一找开头和结尾有什么不同；如果没有明显变化，也可以说说认识是怎样一步步变清楚的。",
      referenceAnswer: "这是开放性问题。答案只要指出本章前后真实存在的变化或认识过程，并用原文细节解释，就应判为正确。",
    },
  ];
  return prompts[seed];
}

function readableTitle(title: string) {
  return title.toLowerCase().replace(/(^|[\s[-])([a-z])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

function paginateChapter(title: string, paragraphs: string[]): BookPage[] {
  const pages: BookPage[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > 1450 && current) {
      pages.push({ heading: readableTitle(title), body: current });
      current = paragraph;
    } else {
      current = next;
    }
  }
  if (current) pages.push({ heading: readableTitle(title), body: current });
  return pages.length ? pages : [{ heading: readableTitle(title), body: "本章没有可显示的正文。" }];
}

function parseMarkdownBook(text: string): BookChapter[] {
  const normalized = text.replace(/\r/g, "");
  const firstDivider = normalized.search(/^---\s*$/m);
  const body = firstDivider >= 0 ? normalized.slice(firstDivider).replace(/^---\s*$/m, "") : normalized;
  const headings = [...body.matchAll(/^#\s+(.+)\s*$/gm)];

  return headings.flatMap((heading, index) => {
    const title = heading[1].trim();
    const start = (heading.index || 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? body.length;
    const paragraphs = body
      .slice(start, end)
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.replace(/^---\s*$/gm, "").trim())
      .filter(Boolean);
    if (!paragraphs.length) return [];
    return [{ id: `${index + 1}`, title, pages: paginateChapter(title, paragraphs) }];
  });
}

function parsePublicDomainBook(text: string, startHeading: string): BookChapter[] {
  const normalized = text.replace(/\r/g, "");
  const start = normalized.indexOf(`\n${startHeading}\n`);
  const end = normalized.indexOf("*** END OF THE PROJECT GUTENBERG EBOOK");
  if (start < 0) throw new Error("book start marker missing");
  const lines = normalized.slice(start + 1, end > start ? end : undefined).split("\n");
  const chapters: BookChapter[] = [];
  let title = "";
  let paragraphLines: string[] = [];
  let paragraphs: string[] = [];

  const flushParagraph = () => {
    const paragraph = paragraphLines.join(" ").replace(/\s+/g, " ").trim();
    if (paragraph) paragraphs.push(paragraph);
    paragraphLines = [];
  };
  const flushChapter = () => {
    flushParagraph();
    if (title && paragraphs.length) {
      chapters.push({ id: `${chapters.length + 1}`, title: readableTitle(title), pages: paginateChapter(title, paragraphs) });
    }
    paragraphs = [];
  };

  lines.forEach((raw, index) => {
    const line = raw.trim();
    const previousBlank = index === 0 || !lines[index - 1].trim();
    const nextBlank = index === lines.length - 1 || !lines[index + 1].trim();
    const heading = line.length > 2
      && line.length < 95
      && raw === line
      && line === line.toUpperCase()
      && /[A-Z]/.test(line)
      && !line.startsWith("***")
      && !line.startsWith("*")
      && previousBlank
      && nextBlank;
    if (heading) {
      flushChapter();
      title = line;
      return;
    }
    if (!line) flushParagraph();
    else paragraphLines.push(line);
  });
  flushChapter();
  return chapters;
}

const NEW_KNOWLEDGE_CARD_ASSET = `${ASSET}/travel/knowledge-cards-20260716`;

const destinations: Destination[] = [
  {
    id: "beach",
    name: "星沙海湾",
    note: "去找会发光的贝壳",
    duration: "8秒",
    reward: "随机海洋知识卡",
    photo: `${ASSET}/optimized/travel/photos/photo_beach.webp`,
    knowledge: `${ASSET}/optimized/travel/knowledge_cards/knowledge_tide.webp`,
    locationArt: `${ASSET}/legacy/travel/location_beach.png`,
    knowledgeTitle: "潮汐的小秘密",
    knowledgeFacts: ["海水会有规律地涨落。", "月球引力是形成潮汐的重要原因。"],
    knowledgeCards: [
      { id: "beach-tide", title: "潮汐的小秘密", image: `${ASSET}/optimized/travel/knowledge_cards/knowledge_tide.webp`, facts: ["海水会有规律地涨落。", "月球引力是形成潮汐的重要原因。"] },
      { id: "beach-coral-reef", title: "珊瑚礁知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/coral-reef.jpg`, facts: ["珊瑚礁是许多海洋生物的家。", "保护珊瑚礁要减少污染和踩踏。"] },
      { id: "beach-deep-sea", title: "深海世界知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/deep-sea.jpg`, facts: ["深海很黑，水压也非常大。", "有些深海生物会自己发光。"] },
      { id: "beach-sea-turtle", title: "海龟知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/sea-turtle.jpg`, facts: ["海龟会回到陆地上的沙滩产卵。", "减少塑料垃圾能帮助保护海龟。"] },
      { id: "beach-shark", title: "鲨鱼知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/shark.jpg`, facts: ["鲨鱼的骨骼主要由软骨组成。", "鲨鱼能帮助维持海洋生态平衡。"] },
    ],
    position: "destination-beach",
    requiredStars: 10,
  },
  {
    id: "forest",
    name: "森语树屋",
    note: "听一听大树的年轮故事",
    duration: "8秒",
    reward: "随机森林知识卡",
    photo: `${ASSET}/optimized/travel/photos/photo_forest.webp`,
    knowledge: `${ASSET}/optimized/travel/knowledge_cards/knowledge_tree_ring.webp`,
    locationArt: `${ASSET}/legacy/travel/location_forest.png`,
    knowledgeTitle: "大树的时间圈",
    knowledgeFacts: ["年轮记录着树木一年的生长。", "科学家会从年轮了解过去的气候。"],
    knowledgeCards: [
      { id: "forest-tree-ring-legacy", title: "大树的时间圈", image: `${ASSET}/optimized/travel/knowledge_cards/knowledge_tree_ring.webp`, facts: ["年轮记录着树木一年的生长。", "科学家会从年轮了解过去的气候。"] },
      { id: "forest-layers", title: "森林分层知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/forest-layers.jpg`, facts: ["森林从高到低有乔木、灌木和草本等层次。", "不同层次为不同动物提供食物和住所。"] },
      { id: "forest-tree-rings", title: "树木年轮知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/tree-rings.jpg`, facts: ["树干里的年轮通常能帮助判断树木年龄。", "年轮的宽窄还记录着过去的生长环境。"] },
      { id: "forest-seasons", title: "森林四季知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/forest-seasons.jpg`, facts: ["森林会随着四季发生不同变化。", "四季变化让森林更加丰富多彩。"] },
    ],
    position: "destination-forest",
    requiredStars: 15,
  },
  {
    id: "museum",
    name: "恐龙博物馆",
    note: "寻找巨大的远古脚印",
    duration: "8秒",
    reward: "随机恐龙知识卡",
    photo: `${ASSET}/optimized/travel/photos/photo_museum.webp`,
    knowledge: `${ASSET}/optimized/travel/knowledge_cards/knowledge_dinosaur.webp`,
    locationArt: `${ASSET}/legacy/travel/location_museum.png`,
    knowledgeTitle: "脚印里的远古线索",
    knowledgeFacts: ["恐龙脚印也能成为化石。", "大小、深浅和间距能帮助科学家推测恐龙怎样行动。"],
    knowledgeCards: [
      { id: "museum-footprints", title: "脚印里的远古线索", image: `${ASSET}/optimized/travel/knowledge_cards/knowledge_dinosaur.webp`, facts: ["恐龙脚印也能成为化石。", "脚印能帮助科学家推测恐龙怎样行动。"] },
      { id: "museum-dinosaur-types", title: "恐龙种类知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/dinosaur-types.jpg`, facts: ["恐龙有植食、肉食等不同种类。", "不同恐龙的体型和牙齿差别很大。"] },
      { id: "museum-dinosaur-fossils", title: "恐龙化石知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/dinosaur-fossils.jpg`, facts: ["化石是古生物留下的遗骸或痕迹。", "科学家通过化石了解远古生命。"] },
      { id: "museum-dinosaur-habits", title: "恐龙习性知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/dinosaur-habits.jpg`, facts: ["不同恐龙生活在不同环境里。", "科学家通过化石研究恐龙的食物和行动。"] },
      { id: "museum-dinosaur-extinction", title: "恐龙灭绝知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/dinosaur-extinction.jpg`, facts: ["恐龙大约在6600万年前大量消失。", "撞击和气候变化可能共同影响了恐龙。"] },
    ],
    position: "destination-museum",
    requiredStars: 50,
  },
  {
    id: "space",
    name: "太空站",
    note: "从太空看一看蓝色地球",
    duration: "8秒",
    reward: "随机太空知识卡",
    photo: `${ASSET}/legacy/travel/location_space.png`,
    locationArt: `${ASSET}/legacy/travel/location_space.png`,
    knowledgeTitle: "绕着地球旅行",
    knowledgeFacts: ["空间站像一座绕地球飞行的实验室。", "在微重力环境里，航天员和物品会呈现漂浮状态。"],
    knowledgeCards: [
      { id: "space-solar-system", title: "太阳系知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/solar-system.jpg`, facts: ["太阳系里有太阳和八大行星。", "地球是离太阳第三近的行星。"] },
      { id: "space-moon", title: "月球探秘知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/moon-exploration.jpg`, facts: ["月球是离地球最近的天然卫星。", "月球表面有许多大大小小的环形山。"] },
      { id: "space-constellations", title: "星座知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/constellations.jpg`, facts: ["人们把星星想象连线组成星座。", "观察星空可以帮助认识方向和季节。"] },
      { id: "space-mars", title: "火星探索知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/mars-exploration.jpg`, facts: ["火星表面有沙尘、峡谷和火山。", "科学家用探测器研究火星环境。"] },
    ],
    position: "destination-space",
    requiredStars: 70,
  },
  {
    id: "ancient",
    name: "古城遗迹",
    note: "沿着石阶寻找古城的故事",
    duration: "8秒",
    reward: "随机古文明知识卡",
    photo: `${ASSET}/legacy/travel/location_ancient_city.png`,
    locationArt: `${ASSET}/legacy/travel/location_ancient_city.png`,
    knowledgeTitle: "石头留下的城市记忆",
    knowledgeFacts: ["遗迹能帮助我们了解过去的人怎样生活。", "保护遗迹时，要尽量保留原有材料和历史信息。"],
    knowledgeCards: [
      { id: "ancient-ruins", title: "古代遗迹知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/ancient-ruins.jpg`, facts: ["古代遗迹记录着过去文明的生活。", "保护遗迹能帮助我们读懂历史。"] },
      { id: "ancient-pyramids", title: "金字塔知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/pyramids.jpg`, facts: ["金字塔是古代文明留下的重要遗迹。", "巨大的石块展现了古人的建筑智慧。"] },
    ],
    position: "destination-ancient",
    requiredStars: 100,
  },
  {
    id: "future",
    name: "未来车站",
    note: "看看未来的城市怎样出发",
    duration: "8秒",
    reward: "随机未来科学知识卡",
    photo: `${ASSET}/legacy/travel/location_future_station.png`,
    locationArt: `${ASSET}/legacy/travel/location_future_station.png`,
    knowledgeTitle: "会思考的交通站",
    knowledgeFacts: ["公共交通能让更多人共享一次出行。", "未来交通会更重视安全、节能与无障碍体验。"],
    knowledgeCards: [
      { id: "future-science", title: "未来科学知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/future-science.jpg`, facts: ["机器人和人工智能会帮助人们完成更多工作。", "未来科技会继续探索太空和智慧城市。"] },
      { id: "future-clean-energy", title: "清洁能源知识卡", image: `${NEW_KNOWLEDGE_CARD_ASSET}/clean-energy.jpg`, facts: ["太阳能和风能属于清洁能源。", "使用清洁能源能减少污染、保护环境。"] },
    ],
    position: "destination-future",
    requiredStars: 150,
  },
];

const hidePlaces = ["water", "tree", "behind", "lotus", "cave", "bush", "flowers", "pond-rocks", "fruit", "path-rock", "tree-root", "flower-bank", "lily-pad", "cave-door", "cave-flowers", "blue-flowers", "hedge", "path-grass", "pond-cobbles", "boulder"] as const;
type HidePlace = (typeof hidePlaces)[number];
type HomeSpot = "center" | "pond-edge" | "tree-shade" | "cave-door";
type TurtleAmbientMode = "idle" | "walking" | "looking" | "waving" | "resting" | "petted" | "tickled";
type TurtleDirection = "left" | "right";
const HIDE_TOTAL_ROUNDS = 5;
const HIDE_ROUND_SECONDS = 25;
const DAILY_HIDE_AND_SEEK_LIMIT = 5;
const TURTLE_WALK_DURATION_MS = 2_300;

const landHomeSpots: HomeSpot[] = ["center", "pond-edge", "tree-shade", "cave-door"];
const homeSpotHorizontalPosition: Record<HomeSpot, number> = {
  center: 50,
  "pond-edge": 27,
  "tree-shade": 48,
  "cave-door": 76,
};

const homeSpotArrival: Record<HomeSpot, { mode: TurtleAmbientMode; speech: string }> = {
  center: { mode: "waving", speech: "我回来陪你啦！" },
  "pond-edge": { mode: "looking", speech: "池塘里有小鱼游过去了！" },
  "tree-shade": { mode: "looking", speech: "果子闻起来香香的。" },
  "cave-door": { mode: "resting", speech: "在小屋门口歇一会儿。" },
};

const hideLabels: Record<HidePlace, string> = {
  water: "水波里",
  tree: "树梢上",
  behind: "树干后",
  lotus: "荷叶下",
  cave: "石头边",
  bush: "小草丛里",
  flowers: "花丛里",
  "pond-rocks": "池塘石缝里",
  fruit: "果树叶间",
  "path-rock": "小路石头旁",
  "tree-root": "大树根后",
  "flower-bank": "池边花丛",
  "lily-pad": "大荷叶后",
  "cave-door": "石洞门口",
  "cave-flowers": "石洞花丛",
  "blue-flowers": "树下蓝花间",
  hedge: "右边树篱",
  "path-grass": "小路草丛",
  "pond-cobbles": "池边石墙后",
  boulder: "大石头后",
};

const hideSceneClues: Record<HidePlace, { soft: string; strong: string }> = {
  water: { soft: "好像听见了轻轻的水声。", strong: "池塘的水波忽然晃了一下！" },
  tree: { soft: "高高的地方有叶子在沙沙响。", strong: "树梢上露出了一点绿色！" },
  behind: { soft: "大树附近传来窸窸窣窣的声音。", strong: "树干后面好像有小脚动了一下！" },
  lotus: { soft: "池塘边有一片叶子轻轻抖了抖。", strong: "荷叶下面冒出了一串小泡泡！" },
  cave: { soft: "右边的紫色石头附近好像有动静。", strong: "山洞旁的石缝里露出了一点绿色！" },
  bush: { soft: "画面中间的小草丛正在轻轻晃。", strong: "小草丛里的叶子突然分开了！" },
  flowers: { soft: "右下角的花草间传来穿行的声音。", strong: "高高的草叶后面闪过了龟龟的脸！" },
  "pond-rocks": { soft: "池塘边的几块石头后面静悄悄的。", strong: "左边水边的石缝里有小眼睛在眨！" },
  fruit: { soft: "红彤彤的果子旁，树叶好像变重了。", strong: "果树顶上的叶子中间藏着一张笑脸！" },
  "path-rock": { soft: "中间的小路边，花朵和石头挨得很近。", strong: "小路边的石头后露出了绿色的脑袋！" },
  "tree-root": { soft: "大树下面好像传来轻轻的脚步声。", strong: "粗粗的树根后面露出了绿色的小脸！" },
  "flower-bank": { soft: "池塘旁边有一片花朵在摇晃。", strong: "左边水岸的花丛里有一双亮亮的眼睛！" },
  "lily-pad": { soft: "池塘里有一片大叶子动了一下。", strong: "大荷叶后面悄悄探出了一颗绿色脑袋！" },
  "cave-door": { soft: "紫色石洞的门口传来沙沙声。", strong: "右边石洞门口有一只小手在挥呀挥！" },
  "cave-flowers": { soft: "石洞附近的花草好像被碰到了。", strong: "右边石洞旁的花丛后藏着龟龟！" },
  "blue-flowers": { soft: "树下的蓝色小花中间有一点绿色。", strong: "蓝色花朵后面露出了龟龟的红领结！" },
  hedge: { soft: "画面右边茂密的树叶轻轻晃了晃。", strong: "右边树篱中间有一张圆圆的笑脸！" },
  "path-grass": { soft: "小路旁的草叶好像被谁拨开了。", strong: "中间小路的草丛后面藏着一个小龟壳！" },
  "pond-cobbles": { soft: "水边整齐的小石头后面有动静。", strong: "左边池塘的石墙后露出两只小眼睛！" },
  boulder: { soft: "地上的大石头旁边传来窸窣声。", strong: "大石头后面探出了龟龟的绿色脑袋！" },
};

const hideSprites: Record<HidePlace, string> = {
  water: `${ASSET}/characters/turtle/turtle_hide_water.png`,
  tree: `${ASSET}/characters/turtle/turtle_hide_tree_top.png`,
  behind: `${ASSET}/characters/turtle/turtle_hide_tree_behind.png`,
  lotus: `${ASSET}/characters/turtle/turtle_hide_lotus.png`,
  cave: `${ASSET}/characters/turtle/hide-generated/turtle-hide-cave-20260716.png`,
  bush: `${ASSET}/characters/turtle/hide-generated/turtle-hide-bush-20260716.png`,
  flowers: `${ASSET}/characters/turtle/hide-generated/turtle-hide-flowers-20260716.png`,
  "pond-rocks": `${ASSET}/characters/turtle/hide-generated/turtle-hide-pond-rocks-20260716.png`,
  fruit: `${ASSET}/characters/turtle/hide-generated/turtle-hide-fruit-20260716.png`,
  "path-rock": `${ASSET}/characters/turtle/hide-generated/turtle-hide-path-rock-20260716.png`,
  "tree-root": `${ASSET}/characters/turtle/hide-generated/turtle-hide-tree-root-20260716.png`,
  "flower-bank": `${ASSET}/characters/turtle/hide-generated/turtle-hide-flower-bank-20260716.png`,
  "lily-pad": `${ASSET}/characters/turtle/hide-generated/turtle-hide-lily-pad-20260716.png`,
  "cave-door": `${ASSET}/characters/turtle/hide-generated/turtle-hide-cave-door-20260716.png`,
  "cave-flowers": `${ASSET}/characters/turtle/hide-generated/turtle-hide-cave-flowers-20260716.png`,
  "blue-flowers": `${ASSET}/characters/turtle/hide-generated/turtle-hide-blue-flowers-20260716.png`,
  hedge: `${ASSET}/characters/turtle/hide-generated/turtle-hide-hedge-20260716.png`,
  "path-grass": `${ASSET}/characters/turtle/hide-generated/turtle-hide-path-grass-20260716.png`,
  "pond-cobbles": `${ASSET}/characters/turtle/hide-generated/turtle-hide-pond-cobbles-20260716.png`,
  boulder: `${ASSET}/characters/turtle/hide-generated/turtle-hide-boulder-20260716.png`,
};

function randomHidePlace(previous?: HidePlace) {
  const choices = previous ? hidePlaces.filter((place) => place !== previous) : hidePlaces;
  return choices[Math.floor(Math.random() * choices.length)];
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function encodeWav(chunks: Float32Array[], inputRate: number) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Float32Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    merged.set(chunk, cursor);
    cursor += chunk.length;
  }

  const outputRate = 16000;
  const ratio = inputRate / outputRate;
  const output = new Float32Array(Math.max(1, Math.floor(merged.length / ratio)));
  for (let index = 0; index < output.length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, merged.length - 1);
    const mix = position - left;
    output[index] = merged[left] * (1 - mix) + merged[right] * mix;
  }

  let peak = 0;
  for (const sample of output) peak = Math.max(peak, Math.abs(sample));
  // Some microphones expose a very quiet signal after browser noise reduction.
  // Normalize speech conservatively, while keeping true silence as silence so
  // the UI can explain that the microphone did not capture a voice.
  const gain = peak >= 0.0003 ? Math.min(5, 0.9 / peak) : 1;

  const buffer = new ArrayBuffer(44 + output.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + output.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outputRate, true);
  view.setUint32(28, outputRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, output.length * 2, true);
  for (let index = 0; index < output.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, output[index] * gain));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return { blob: new Blob([buffer], { type: "audio/wav" }), peak };
}

function supportedRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
    .find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function formatDate() {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function currentDayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function ensureDailyFruitPicking(state: Pick<GameState, "fruitPicking">): DailyFruitPicking {
  const saved = state.fruitPicking;
  if (!saved || saved.dateKey !== currentDayKey()) return { dateKey: currentDayKey(), picked: 0 };
  return { dateKey: saved.dateKey, picked: Math.max(0, Math.min(5, Math.floor(Number(saved.picked) || 0))) };
}

function ensureDailyHideAndSeek(state: Pick<GameState, "hideAndSeekDaily">): DailyHideAndSeek {
  const saved = state.hideAndSeekDaily;
  if (!saved || saved.dateKey !== currentDayKey()) return { dateKey: currentDayKey(), completed: 0 };
  return {
    dateKey: saved.dateKey,
    completed: Math.max(0, Math.min(DAILY_HIDE_AND_SEEK_LIMIT, Math.floor(Number(saved.completed) || 0))),
  };
}

function ensureDailyFruitCatch(state: Pick<GameState, "fruitCatchDaily">): FruitCatchDailyState {
  const saved = state.fruitCatchDaily;
  if (!saved || saved.dateKey !== currentDayKey()) {
    return { dateKey: currentDayKey(), plays: 0, rewarded: false, bestScore: 0, totalCaught: 0 };
  }
  return {
    dateKey: saved.dateKey,
    plays: Math.max(0, Math.floor(Number(saved.plays) || 0)),
    rewarded: Boolean(saved.rewarded),
    bestScore: Math.max(0, Math.floor(Number(saved.bestScore) || 0)),
    totalCaught: Math.max(0, Math.floor(Number(saved.totalCaught) || 0)),
  };
}

function createDailyPlan(state: Pick<GameState, "mistakes">): DailyPlan {
  const pendingMistakes = state.mistakes.filter((mistake) => mistake.status !== "mastered").length;
  const dateKey = currentDayKey();
  const taskKeys = [...dailyTaskKeys]
    .map((task) => ({
      task,
      score: [...`${dateKey}:${task}`].reduce((total, character) => (total * 33 + (character.codePointAt(0) || 0)) >>> 0, 0),
    }))
    .sort((left, right) => left.score - right.score)
    .slice(0, 4)
    .map((item) => item.task);
  const targets = Object.fromEntries(dailyTaskKeys.map((task) => [task, taskKeys.includes(task) ? 1 : 0])) as DailyTaskValues;
  const progress = Object.fromEntries(dailyTaskKeys.map((task) => [task, 0])) as DailyTaskValues;
  return {
    dateKey,
    taskKeys,
    mistakeMode: pendingMistakes > 0 ? "review" : "add",
    targets,
    progress,
    rewardClaimed: false,
  };
}

function ensureDailyPlan(state: GameState): DailyPlan {
  const saved = state.dailyPlan;
  if (!saved || saved.dateKey !== currentDayKey()) return createDailyPlan(state);
  const mistakeMode = saved.mistakeMode === "review" ? "review" : "add";
  const taskKeys = Array.isArray(saved.taskKeys)
    ? saved.taskKeys.filter((task): task is DailyTaskKey => dailyTaskKeys.includes(task as DailyTaskKey)).slice(0, 4)
    : [];
  if (taskKeys.length !== 4) return createDailyPlan(state);
  const targets = Object.fromEntries(dailyTaskKeys.map((task) => [
    task,
    taskKeys.includes(task) ? Math.max(1, Number(saved.targets?.[task]) || 1) : 0,
  ])) as DailyTaskValues;
  const progress = Object.fromEntries(dailyTaskKeys.map((task) => [
    task,
    Math.max(0, Number(saved.progress?.[task]) || 0),
  ])) as DailyTaskValues;
  return {
    dateKey: saved.dateKey,
    taskKeys,
    mistakeMode,
    targets,
    progress,
    rewardClaimed: Boolean(saved.rewardClaimed),
  };
}

async function prepareMistakePhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
  if (file.size > 8 * 1024 * 1024) throw new Error("图片不能超过 8MB");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const scale = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(source);
  }
}

function getLocalReply(input: string, name: string) {
  if (/数学|算|题|乘法|加法/.test(input)) {
    return `数学像一条要慢慢走的小路。你愿意挑一道题，把解题的第一步讲给${name}听吗？`;
  }
  if (/书|读|故事|阅读/.test(input)) {
    return "听起来很有意思！故事里哪一个人或哪一件事，让你印象最深？";
  }
  if (/朋友|同学|玩|游戏/.test(input)) {
    return "和朋友一起的时光真开心。你们今天有没有互相帮忙，或者一起发现什么新鲜事？";
  }
  if (/难|不会|不懂|失败/.test(input)) {
    return "没关系，我们可以慢一点。先说说你已经知道的部分，剩下的我陪你一起想。";
  }
  if (/开心|高兴|喜欢/.test(input)) {
    return "我也跟着开心起来啦！把这件开心的事记在今天的小手账里吧。";
  }
  return "我认真听到了！你能再告诉我，这件事让你学到或发现了什么吗？";
}

async function askCompanion(payload: CompanionPayload) {
  const response = await fetch(`${BASE_PATH}/api/companion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({})) as Partial<CompanionResponse>;
  if (!response.ok) throw new Error(data.reply || "龟龟暂时没能完成判断，请稍后重新发送。");
  if (!data.reply) throw new Error("empty companion reply");
  return data as CompanionResponse;
}

async function runStudentAction(payload: Record<string, unknown>) {
  const response = await fetch(`${BASE_PATH}/api/student-actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({})) as StudentActionResponse;
  if (!response.ok) throw new Error(data.error || "这次操作暂时没有保存，请稍后再试。");
  return data;
}

function destinationForRecord(record: TravelRecord) {
  return destinations.find(
    (destination) =>
      destination.id === record.destinationId ||
      destination.name === record.destination ||
      destination.knowledge === record.knowledge,
  );
}

function knowledgeCardForRecord(record: TravelRecord, destination: Destination) {
  return destination.knowledgeCards.find((card) => (
    card.id === record.knowledgeCardId
    || card.image === record.knowledge
    || card.title === record.knowledgeTitle
    || card.title === record.reward
  )) ?? destination.knowledgeCards[0];
}

function discoveryForRecord(record: TravelRecord): TravelDiscovery | null {
  const destination = destinationForRecord(record);
  if (!destination) return null;
  return { destination, card: knowledgeCardForRecord(record, destination) };
}

function pickTravelKnowledgeCard(destination: Destination, records: TravelRecord[]) {
  const destinationRecords = records.filter((record) => (
    record.destinationId === destination.id || record.destination === destination.name
  ));
  const collectedIds = new Set(destinationRecords.map((record) => knowledgeCardForRecord(record, destination).id));
  const unseenCards = destination.knowledgeCards.filter((card) => !collectedIds.has(card.id));
  const lastCardId = destinationRecords[0] ? knowledgeCardForRecord(destinationRecords[0], destination).id : null;
  const cycleCards = unseenCards.length ? unseenCards : destination.knowledgeCards;
  const nonRepeatingCards = cycleCards.filter((card) => card.id !== lastCardId);
  const candidates = nonRepeatingCards.length ? nonRepeatingCards : cycleCards;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function KnowledgeArt({ card }: { card: KnowledgeCard }) {
  return <img src={card.image} alt={card.title} loading="lazy" decoding="async" />;
}

function KnowledgeCardPreview({ card, className = "" }: { card: KnowledgeCard; className?: string }) {
  return (
    <div className={`knowledge-card-preview ${className}`.trim()}>
      <img src={card.image} alt={`${card.title}里的龟龟主画面`} loading="lazy" decoding="async" />
    </div>
  );
}

function StatusPill({
  icon,
  label,
  value,
  reverse,
}: {
  icon: string;
  label: string;
  value: number;
  reverse?: boolean;
}) {
  const displayValue = reverse ? 100 - value : value;
  const activeSegments = Math.ceil(displayValue / 10);
  return (
    <div className="status-pill" aria-label={`${label} ${displayValue}`}>
      <img src={icon} alt="" />
      <div className="status-copy">
        <span>{label}</span>
        <div className="status-segments" aria-hidden="true">
          {Array.from({ length: 10 }, (_, index) => (
            <i className={index < activeSegments ? "active" : ""} key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

function NavButton({
  active,
  disabled,
  label,
  onClick,
  art,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  art: string;
}) {
  return (
    <button
      className={`nav-button ${active ? "active" : ""}`}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      type="button"
    >
      <img className="nav-icon" src={art} alt="" />
      <span className="nav-label">{label}</span>
    </button>
  );
}

function LeaderboardCategoryIcon({ category }: { category: LeaderboardCategoryKey }) {
  if (category === "interaction") return <Users aria-hidden="true" />;
  if (category === "reading") return <BookOpen aria-hidden="true" />;
  if (category === "travel") return <Compass aria-hidden="true" />;
  return <Camera aria-hidden="true" />;
}

function InterestDomainIcon({ domainId }: { domainId: InterestDomainId }) {
  if (domainId === "nature") return <Sparkles aria-hidden="true" />;
  if (domainId === "science") return <Lightbulb aria-hidden="true" />;
  if (domainId === "history") return <Compass aria-hidden="true" />;
  if (domainId === "literature") return <BookOpen aria-hidden="true" />;
  if (domainId === "geography") return <Backpack aria-hidden="true" />;
  if (domainId === "art") return <Camera aria-hidden="true" />;
  if (domainId === "math") return <Trophy aria-hidden="true" />;
  return <Users aria-hidden="true" />;
}

export default function ReadingApp({
  student,
}: {
  student: { displayName: string };
}) {
  const [view, setView] = useState<View>("home");
  const [libraryMode, setLibraryMode] = useState<LibraryMode>("shelf");
  const [bookOpening, setBookOpening] = useState<Book | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<GradeLevel>(3);
  const [explorationDomains, setExplorationDomains] = useState<InterestDomain[]>([]);
  const [game, setGame] = useState<GameState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [startupLoad, setStartupLoad] = useState({
    completed: 0,
    total: 1,
    failed: 0,
    percent: 0,
    label: "正在叫醒龟龟",
    ready: false,
    timedOut: false,
    settled: false,
  });
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [startupEntered, setStartupEntered] = useState(false);
  const [startupEntering, setStartupEntering] = useState(false);
  const [soundPanelOpen, setSoundPanelOpen] = useState(false);
  const androidVersion = useSyncExternalStore(subscribeAndroidBridge, getAndroidVersion, getServerAndroidVersion);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [actionProgress, setActionProgress] = useState(0);
  const [turtleSprite, setTurtleSprite] = useState<string | null>(null);
  const [homeSpot, setHomeSpot] = useState<HomeSpot>("center");
  const [turtleAmbientMode, setTurtleAmbientMode] = useState<TurtleAmbientMode>("idle");
  const [turtleDirection, setTurtleDirection] = useState<TurtleDirection>("right");
  const [turtleAmbientSpeech, setTurtleAmbientSpeech] = useState("你回来啦，摸摸我吧！");
  const [toast, setToast] = useState("");
  const [fruitPicker, setFruitPicker] = useState(false);
  const [hideTarget, setHideTarget] = useState<HidePlace | null>(null);
  const [hideRound, setHideRound] = useState(0);
  const [hideSeconds, setHideSeconds] = useState(HIDE_ROUND_SECONDS);
  const [hideFastRounds, setHideFastRounds] = useState(0);
  const [hideFound, setHideFound] = useState<HidePlace | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [selectedBook, setSelectedBook] = useState<Book>(books[0]);
  const [importedBooks, setImportedBooks] = useState<Book[]>([]);
  const [selectedChapter, setSelectedChapter] = useState(0);
  const [bookPage, setBookPage] = useState(0);
  const [loadedBooks, setLoadedBooks] = useState<Record<string, BookChapter[]>>({});
  const [bookLoading, setBookLoading] = useState(false);
  const [bookLoadError, setBookLoadError] = useState("");
  const [readingProgressByBook, setReadingProgressByBook] = useState<Record<string, SavedReadingProgress>>({});
  const [readingProgressLoaded, setReadingProgressLoaded] = useState(false);
  const [bookAudio, setBookAudio] = useState<BookAudioInfo | null>(null);
  const [bookAudioResultKey, setBookAudioResultKey] = useState("");
  const [bookAudioPhase, setBookAudioPhase] = useState<BookAudioPhase>("idle");
  const [bookAudioRate, setBookAudioRate] = useState(1);
  const [answeredChapterQuestions, setAnsweredChapterQuestions] = useState<string[]>([]);
  const [readerSideTab, setReaderSideTab] = useState<"companion" | "knowledge">("companion");
  const [chapterListOpen, setChapterListOpen] = useState(false);
  const [readerKnowledgeOpen, setReaderKnowledgeOpen] = useState(false);
  const [chapterQuestionOpen, setChapterQuestionOpen] = useState(false);
  const [readingAnswer, setReadingAnswer] = useState("");
  const [readingFeedback, setReadingFeedback] = useState("");
  const [readingEvaluation, setReadingEvaluation] = useState<"correct" | "incorrect" | "error" | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatThinking, setChatThinking] = useState(false);
  const [companionLoading, setCompanionLoading] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [voiceTarget, setVoiceTarget] = useState<VoiceTarget>("chat");
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [voiceLevel, setVoiceLevel] = useState(0.08);
  const [selectedDestination, setSelectedDestination] = useState<Destination>(destinations[0]);
  const [travelProgress, setTravelProgress] = useState(0);
  const [travelReward, setTravelReward] = useState<TravelDiscovery | null>(null);
  const [knowledgeOpen, setKnowledgeOpen] = useState<TravelDiscovery | null>(null);
  const [recordTab, setRecordTab] = useState<RecordTab>("travel");
  const [mistakeFilter, setMistakeFilter] = useState<"all" | "review" | "mastered">("all");
  const [mistakeFormOpen, setMistakeFormOpen] = useState(false);
  const [mistakeScanning, setMistakeScanning] = useState(false);
  const [mistakeSaving, setMistakeSaving] = useState(false);
  const [mistakeScanNotice, setMistakeScanNotice] = useState("");
  const [mistakeDraft, setMistakeDraft] = useState<MistakeDraft | null>(null);
  const [reviewMistake, setReviewMistake] = useState<MistakeRecord | null>(null);
  const [reviewScanning, setReviewScanning] = useState(false);
  const [reviewScanNotice, setReviewScanNotice] = useState("");
  const [reviewPhotoPreview, setReviewPhotoPreview] = useState("");
  const [reviewOutcome, setReviewOutcome] = useState<MistakeReviewOutcome | null>(null);
  const [dailyTasksOpen, setDailyTasksOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<WeeklyLeaderboard | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [achievementOverview, setAchievementOverview] = useState<AchievementOverview | null>(null);
  const [achievementLoading, setAchievementLoading] = useState(false);
  const [achievementSaving, setAchievementSaving] = useState(false);
  const [achievementError, setAchievementError] = useState("");
  const [explorationOverview, setExplorationOverview] = useState<ExplorationOverview | null>(null);
  const [selectedInterestDomain, setSelectedInterestDomain] = useState<InterestDomainId | null>(null);
  const [activeExplorationNode, setActiveExplorationNode] = useState<ExplorationNode | null>(null);
  const [explorationLoading, setExplorationLoading] = useState(false);
  const [explorationSaving, setExplorationSaving] = useState(false);
  const [explorationError, setExplorationError] = useState("");
  const [explorationStage, setExplorationStage] = useState<ExplorationStage>("learn");
  const [explorationQuizOption, setExplorationQuizOption] = useState<number | null>(null);
  const [explorationAnswer, setExplorationAnswer] = useState("");
  const [explorationFeedback, setExplorationFeedback] = useState<ExplorationFeedback | null>(null);
  const [miniGamePlaying, setMiniGamePlaying] = useState(false);
  const [miniGameLeaderboardVersion, setMiniGameLeaderboardVersion] = useState(0);
  const mobileLayout = useSyncExternalStore(subscribeMobileLayout, getMobileLayoutSnapshot, getServerMobileLayoutSnapshot);
  const availableBooks = useMemo(() => [...books, ...importedBooks], [importedBooks]);
  const selectedGradeBooks = useMemo(
    () => availableBooks.filter((book) => book.grade === selectedGrade),
    [availableBooks, selectedGrade],
  );
  const gradeBookCounts = useMemo(() => Object.fromEntries(
    gradeLevels.map((grade) => [grade.value, availableBooks.filter((book) => book.grade === grade.value).length]),
  ) as Record<GradeLevel, number>, [availableBooks]);
  const dailyTasksExpanded = mobileLayout ? dailyTasksOpen : true;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideAdvanceTimerRef = useRef<number | null>(null);
  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const autoFinishVoiceRef = useRef<() => void>(() => undefined);
  const voiceAbortRef = useRef<AbortController | null>(null);
  const accountStateLoadedRef = useRef(false);
  const restoredBookRef = useRef<Record<string, boolean>>({});
  const bookOpeningTimerRef = useRef<number | null>(null);
  const readerTextRef = useRef<HTMLDivElement | null>(null);
  const bookAudioRef = useRef<HTMLAudioElement | null>(null);
  const bookAudioPageStartRef = useRef(0);
  const bookAudioPageEndRef = useRef(0);
  const submitChatRef = useRef<(message: string) => void>(() => undefined);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const travelCompletingRef = useRef(false);
  const achievementInitialSyncRef = useRef(false);
  const soundPanelRef = useRef<HTMLDivElement | null>(null);
  const turtleTouchRef = useRef({ count: 0, lastAt: 0 });

  useEffect(() => () => {
    if (bookOpeningTimerRef.current !== null) window.clearTimeout(bookOpeningTimerRef.current);
  }, []);

  const mood = useMemo(
    () => clamp(0.35 * (100 - game.hunger) + 0.3 * game.cleanliness + 0.35 * (100 - game.boredom)),
    [game.hunger, game.cleanliness, game.boredom],
  );

  const traveling = useMemo(
    () => destinations.find((destination) => destination.id === game.activeTravel?.destinationId) ?? null,
    [game.activeTravel],
  );

  const visibleMistakes = useMemo(() => game.mistakes.filter((mistake) => {
    if (mistakeFilter === "review") return mistake.status !== "mastered";
    if (mistakeFilter === "mastered") return mistake.status === "mastered";
    return true;
  }), [game.mistakes, mistakeFilter]);

  const mistakeStats = useMemo(() => ({
    review: game.mistakes.filter((mistake) => mistake.status !== "mastered").length,
    mastered: game.mistakes.filter((mistake) => mistake.status === "mastered").length,
  }), [game.mistakes]);

  const dailyPlan = useMemo(() => ensureDailyPlan(game), [game]);
  const dailyCompletedCount = useMemo(
    () => dailyPlan.taskKeys.filter((key) => dailyPlan.progress[key] >= dailyPlan.targets[key]).length,
    [dailyPlan],
  );

  const ambientSprite = useMemo(() => {
    if (game.hunger > 72) return "turtle_hungry.png";
    if (game.cleanliness < 38) return "turtle_dirty.png";
    if (game.boredom > 70) return "turtle_bored_sitting.png";
    if (mood < 55) return "turtle_low_mood.png";
    if (homeSpot === "tree-shade") return "turtle_thinking.png";
    if (homeSpot === "cave-door") return "turtle_waving.png";
    return "turtle_idle_front.png";
  }, [game.boredom, game.cleanliness, game.hunger, homeSpot, mood]);

  const ambientActionSprite = useMemo(() => {
    if (turtleAmbientMode === "petted") return "turtle_happy_hearts.png";
    if (turtleAmbientMode === "tickled") return "turtle_excited.png";
    if (turtleAmbientMode === "walking") return "turtle_idle_standing.png";
    const needsAttention = game.hunger > 72 || game.cleanliness < 38 || game.boredom > 70 || mood < 55;
    if (needsAttention) return ambientSprite;
    if (turtleAmbientMode === "looking") return "turtle_thinking.png";
    if (turtleAmbientMode === "waving") return "turtle_waving.png";
    if (turtleAmbientMode === "resting") return "turtle_bored_sitting.png";
    return ambientSprite;
  }, [ambientSprite, game.boredom, game.cleanliness, game.hunger, mood, turtleAmbientMode]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3600);
  }, []);

  const soundScene = soundSceneForView(view);

  const playSound = useCallback((effect: SoundEffectId) => {
    getSoundEngine().playEffect(effect);
  }, []);

  const applySoundSettings = useCallback((next: SoundSettings) => {
    const normalized = normalizeSoundSettings(next);
    const engine = getSoundEngine();
    engine.unlock(normalized, soundScene);
    engine.update(normalized);
    setGame((current) => ({ ...current, soundSettings: normalized }));
  }, [soundScene]);

  const enterAfterStartup = useCallback(async () => {
    if (startupEntering) return;
    setStartupEntering(true);
    const playback = getSoundEngine().unlock(game.soundSettings, soundScene);
    await Promise.race([
      playback,
      new Promise<void>((resolve) => window.setTimeout(resolve, 900)),
    ]);
    setStartupEntered(true);
    setStartupEntering(false);
  }, [game.soundSettings, soundScene, startupEntering]);

  useEffect(() => {
    const engine = getSoundEngine();
    engine.configure(
      game.soundSettings,
      soundScene,
      view === "library" && libraryMode === "reader",
      bookAudioPhase === "playing" || voicePhase !== "idle",
    );
  }, [bookAudioPhase, game.soundSettings, libraryMode, soundScene, view, voicePhase]);

  useEffect(() => {
    const engine = getSoundEngine();
    const unlockAndTap = (event: PointerEvent) => {
      engine.unlock(game.soundSettings, soundScene);
      const target = event.target instanceof Element ? event.target.closest("button, [role='button']") : null;
      if (target && !target.matches(":disabled") && !target.hasAttribute("data-sound-silent")) {
        engine.playEffect("ui-tap");
      }
    };
    document.addEventListener("pointerdown", unlockAndTap, true);
    return () => document.removeEventListener("pointerdown", unlockAndTap, true);
  }, [game.soundSettings, soundScene]);

  useEffect(() => {
    const handleSoundEffect = (event: Event) => {
      const detail = (event as CustomEvent<SoundEffectId>).detail;
      if (detail) playSound(detail);
    };
    window.addEventListener("guigu-sound-effect", handleSoundEffect);
    return () => window.removeEventListener("guigu-sound-effect", handleSoundEffect);
  }, [playSound]);

  useEffect(() => {
    if (!soundPanelOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (soundPanelRef.current?.contains(event.target as Node)) return;
      setSoundPanelOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [soundPanelOpen]);

  const stopBookAudio = useCallback((reset = true) => {
    const audio = bookAudioRef.current;
    if (audio) {
      audio.pause();
      if (reset) audio.currentTime = 0;
    }
    setBookAudioPhase((phase) => phase === "playing" || phase === "paused" ? "ready" : phase);
  }, []);

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    setLeaderboardError("");
    try {
      const response = await fetch(`${BASE_PATH}/api/leaderboard`, { cache: "no-store" });
      const data = await response.json().catch(() => null) as WeeklyLeaderboard | { error?: string } | null;
      if (!response.ok || !data || !("top" in data)) {
        throw new Error(data && "error" in data ? data.error || "排行榜暂时不可用" : "排行榜暂时不可用");
      }
      setLeaderboard(data);
    } catch (error) {
      setLeaderboardError(error instanceof Error ? error.message : "排行榜暂时不可用");
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  const loadExploration = useCallback(async () => {
    setExplorationLoading(true);
    setExplorationError("");
    try {
      const response = await fetch(`${BASE_PATH}/api/exploration`, { cache: "no-store" });
      const data = await response.json().catch(() => null) as ExplorationOverview | { error?: string } | null;
      if (!response.ok || !data || !("completedNodeIds" in data)) {
        throw new Error(data && "error" in data ? data.error || "知识探险暂时走不开" : "知识探险暂时走不开");
      }
      setExplorationOverview(data);
    } catch (error) {
      setExplorationError(error instanceof Error ? error.message : "知识探险暂时走不开");
    } finally {
      setExplorationLoading(false);
    }
  }, []);

  const loadAchievements = useCallback(async (announce = true) => {
    setAchievementLoading(true);
    setAchievementError("");
    try {
      const response = await fetch(`${BASE_PATH}/api/achievements`, { cache: "no-store" });
      const data = await response.json().catch(() => null) as AchievementOverview | { error?: string } | null;
      if (!response.ok || !data || !("achievements" in data)) {
        throw new Error(data && "error" in data ? data.error || "称号进度暂时不可用" : "称号进度暂时不可用");
      }
      setAchievementOverview(data);
      if (announce && data.newlyUnlockedIds.length) {
        const newest = achievementById.get(data.newlyUnlockedIds.at(-1) || "");
        showToast(data.newlyUnlockedIds.length === 1 && newest
          ? `新成就解锁：${newest.title}！`
          : `一次解锁了 ${data.newlyUnlockedIds.length} 个成长成就！`);
      }
    } catch (error) {
      setAchievementError(error instanceof Error ? error.message : "称号进度暂时不可用");
    } finally {
      setAchievementLoading(false);
    }
  }, [showToast]);

  const selectAchievement = useCallback(async (achievementId: string) => {
    if (achievementSaving) return;
    setAchievementSaving(true);
    setAchievementError("");
    try {
      const response = await fetch(`${BASE_PATH}/api/achievements`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ achievementId }),
      });
      const data = await response.json().catch(() => null) as AchievementOverview | { error?: string } | null;
      if (!response.ok || !data || !("achievements" in data)) {
        throw new Error(data && "error" in data ? data.error || "称号暂时没有戴好" : "称号暂时没有戴好");
      }
      setAchievementOverview(data);
      showToast(`已佩戴称号：${achievementById.get(achievementId)?.title || "新称号"}`);
    } catch (error) {
      setAchievementError(error instanceof Error ? error.message : "称号暂时没有戴好");
    } finally {
      setAchievementSaving(false);
    }
  }, [achievementSaving, showToast]);

  const navigateTo = useCallback((nextView: View) => {
    stopBookAudio();
    getSoundEngine().setScene(soundSceneForView(nextView));
    if (nextView === "library") {
      setLibraryMode("shelf");
      setChapterListOpen(false);
      setReaderKnowledgeOpen(false);
      setChapterQuestionOpen(false);
    }
    if (nextView === "leaderboard") void loadLeaderboard();
    if (nextView === "achievements") void loadAchievements();
    if (nextView === "explore") {
      setSelectedInterestDomain(null);
      setActiveExplorationNode(null);
      void loadExploration();
    }
    if (nextView === "games") setMiniGamePlaying(false);
    setView(nextView);
  }, [loadAchievements, loadExploration, loadLeaderboard, stopBookAudio]);

  const remember = useCallback((event: StudentMemoryEvent) => {
    return fetch(`${BASE_PATH}/api/student-memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event }),
    }).then(() => undefined).catch(() => undefined);
  }, []);

  const completeFruitCatchRound = useCallback(async (result: FruitCatchResult, runId: string) => {
    const wasRewarded = ensureDailyFruitCatch(game).rewarded;
    try {
      const response = await fetch(`${BASE_PATH}/api/minigames`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          gameId: "fruit-catch",
          runId,
          score: result.score,
          caught: result.caught,
          secondaryScore: result.bestCombo,
        }),
      });
      const data = await response.json() as {
        error?: string;
        balances?: { fruits: number; stars: number; tickets: number; playTickets: number };
        dailyPlan?: DailyPlan;
        completedGames?: GameParkGameId[];
        fruitCatchDaily?: FruitCatchDailyState;
        success?: boolean;
      };
      if (!response.ok || !data.balances) throw new Error(data.error || "本局成绩暂时没有保存");
      setGame((current) => ({
        ...current,
        ...data.balances!,
        boredom: clamp(current.boredom - Math.min(8, Math.max(3, Math.floor(result.score / 3)))),
        ...(data.dailyPlan ? { dailyPlan: data.dailyPlan } : {}),
        fruitCatchDaily: data.fruitCatchDaily || current.fruitCatchDaily,
        completedMiniGames: data.completedGames || current.completedMiniGames,
      }));
      if (data.success) setMiniGameLeaderboardVersion((current) => current + 1);
      playSound(result.success ? "game-win" : "answer-retry");
      showToast(result.success
        ? !wasRewarded ? "接果子过关，获得 1 颗星星！" : "接果子过关啦，今天的星星已经领过了"
        : `本局得到 ${result.score} 分，再试一次就更接近啦`);
      void remember({
        type: "activity",
        activity: "龟龟接果子",
        detail: `完成一局接果子，得到${result.score}分，接到${result.caught}个果子`,
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "本局成绩暂时没有保存");
    }
  }, [game, playSound, remember, showToast]);

  const completeLearningMiniGame = useCallback(async (result: LearningMiniGameResult, runId: string) => {
    const activity = {
      "turtle-courier": "乌龟快递员",
      "weather-outfit": "天气穿搭",
      "lotus-jump": "荷叶跳跳",
      "spot-difference": "龟龟找不同",
      "story-puzzle": "拼故事",
      "turtle-sky": "龟龟飞机大战",
      "tortoise-race": "龟兔赛跑",
      "shell-memory": "贝壳翻翻乐",
      "cloud-pairs": "云朵配对",
    }[result.game];
    try {
      const response = await fetch(`${BASE_PATH}/api/minigames`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          gameId: result.game,
          runId,
          score: result.score,
          secondaryScore: result.secondaryScore,
        }),
      });
      const data = await response.json() as {
        error?: string;
        balances?: { fruits: number; stars: number; tickets: number; playTickets: number };
        dailyPlan?: DailyPlan;
        completedGames?: GameParkGameId[];
      };
      if (!response.ok || !data.balances) throw new Error(data.error || "通关记录暂时没有保存");
      setGame((current) => ({
        ...current,
        ...data.balances!,
        ...(data.dailyPlan ? { dailyPlan: data.dailyPlan } : {}),
        boredom: clamp(current.boredom - 6),
        completedMiniGames: data.completedGames || current.completedMiniGames,
      }));
      setMiniGameLeaderboardVersion((current) => current + 1);
      playSound("game-win");
      showToast(`${activity}挑战完成，龟龟又学会了一项新本领！`);
      void remember({ type: "activity", activity, detail: result.detail });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "通关记录暂时没有保存");
    }
  }, [playSound, remember, showToast]);

  const spendPlayTicket = useCallback(async (gameId: GameParkGameId) => {
    const activity = {
      "fruit-catch": "龟龟接果子",
      "turtle-courier": "乌龟快递员",
      "weather-outfit": "天气穿搭",
      "lotus-jump": "荷叶跳跳",
      "spot-difference": "龟龟找不同",
      "story-puzzle": "拼故事",
      "turtle-sky": "龟龟飞机大战",
      "tortoise-race": "龟兔赛跑",
      "shell-memory": "贝壳翻翻乐",
      "cloud-pairs": "云朵配对",
    }[gameId];
    try {
      const response = await fetch(`${BASE_PATH}/api/minigames`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start", gameId }),
      });
      const data = await response.json() as {
        error?: string;
        runId?: string;
        balances?: { fruits: number; stars: number; tickets: number; playTickets: number };
      };
      if (!response.ok || !data.runId || !data.balances) throw new Error(data.error || "小游戏暂时不能开始");
      setGame((current) => ({ ...current, ...data.balances! }));
      showToast(`使用 1 张游玩票，开始${activity}`);
      void remember({ type: "activity", activity: "进入龟龟乐园", detail: `使用1张游玩票开始${activity}` });
      return data.runId;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "小游戏暂时不能开始");
      return null;
    }
  }, [remember, showToast]);

  const openExplorationNode = useCallback((node: ExplorationNode) => {
    const progress = explorationOverview?.nodeProgress[node.id];
    const dueForReview = explorationOverview?.dueReviewNodeIds.includes(node.id);
    setExplorationError("");
    setExplorationFeedback(null);
    setExplorationQuizOption(null);
    setExplorationAnswer("");
    setExplorationStage(progress?.state === "mastered" ? "mastered" : dueForReview ? "review" : progress ? "learned" : "learn");
    setActiveExplorationNode(node);
  }, [explorationOverview]);

  const submitExplorationQuizAnswer = useCallback(async () => {
    if (!activeExplorationNode || explorationSaving || explorationQuizOption === null) return;
    setExplorationSaving(true);
    setExplorationError("");
    setExplorationFeedback(null);
    try {
      const response = await fetch(`${BASE_PATH}/api/exploration`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "quiz", nodeId: activeExplorationNode.id, selectedOption: explorationQuizOption }),
      });
      const data = await response.json().catch(() => null) as ExplorationFeedback | { error?: string } | null;
      if (!response.ok || !data || !("correct" in data)) {
        throw new Error(data && "error" in data ? data.error || "互动检查暂时没能提交" : "互动检查暂时没能提交");
      }
      setExplorationFeedback(data);
    } catch (error) {
      setExplorationError(error instanceof Error ? error.message : "互动检查暂时没能提交");
    } finally {
      setExplorationSaving(false);
    }
  }, [activeExplorationNode, explorationQuizOption, explorationSaving]);

  const submitExplorationWrittenAnswer = useCallback(async (action: "project" | "review") => {
    if (!activeExplorationNode || explorationSaving || !explorationAnswer.trim()) return;
    setExplorationSaving(true);
    setExplorationError("");
    setExplorationFeedback(null);
    try {
      const response = await fetch(`${BASE_PATH}/api/exploration`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, nodeId: activeExplorationNode.id, answer: explorationAnswer }),
      });
      const data = await response.json().catch(() => null) as (ExplorationFeedback & {
        overview?: ExplorationOverview;
        balances?: { fruits: number; stars: number; tickets: number; playTickets: number };
        dailyPlan?: DailyPlan;
        rewardedPlayTickets?: number;
      }) | { error?: string } | null;
      if (!response.ok || !data || !("correct" in data)) {
        throw new Error(data && "error" in data ? data.error || "龟龟暂时没能看完" : "龟龟暂时没能看完");
      }
      setExplorationFeedback(data);
      if (data.correct && data.overview) {
        setExplorationOverview(data.overview);
        setGame((current) => ({
          ...current,
          ...(data.balances || {}),
          ...(data.dailyPlan ? { dailyPlan: data.dailyPlan } : {}),
        }));
        const progress = data.overview.nodeProgress[activeExplorationNode.id];
        setExplorationStage(progress?.state === "mastered" ? "mastered" : "learned");
        showToast(data.rewardedPlayTickets
          ? `完成一个知识单元，获得 ${data.rewardedPlayTickets} 张游玩票！`
          : progress?.state === "mastered"
            ? "这片知识已经牢牢掌握啦！"
            : "完成学习，龟龟会在合适的时间请你再想一次");
      }
    } catch (error) {
      setExplorationError(error instanceof Error ? error.message : "龟龟暂时没能看完");
    } finally {
      setExplorationSaving(false);
    }
  }, [activeExplorationNode, explorationAnswer, explorationSaving, showToast]);

  const logout = useCallback(async () => {
    await fetch(`${BASE_PATH}/api/auth/logout`, { method: "POST" }).catch(() => undefined);
    window.location.reload();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${BASE_PATH}/api/user-state`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("state unavailable")))
      .then((data: { state?: Partial<GameState> | null }) => {
        const parsed = data.state;
        let restored = initialState;
        if (parsed) {
          try {
            const hours = Math.min(24, Math.max(0, (Date.now() - (parsed.lastSeen || Date.now())) / 3_600_000));
            restored = {
              ...initialState,
              ...parsed,
              hunger: clamp((parsed.hunger ?? initialState.hunger) + hours * 3),
              cleanliness: clamp((parsed.cleanliness ?? initialState.cleanliness) - hours),
              boredom: clamp((parsed.boredom ?? initialState.boredom) + hours * 2),
              readingRewards: Array.isArray(parsed.readingRewards)
                ? [...new Set(parsed.readingRewards.filter((key): key is string => typeof key === "string" && key.startsWith("chapter:")))]
                : [],
              completedMiniGames: Array.isArray(parsed.completedMiniGames)
                ? [...new Set(parsed.completedMiniGames.filter((gameId): gameId is GameParkGameId => GAME_PARK_ORDER.includes(gameId as GameParkGameId)))]
                : [],
              readingFontSize: isReadingFontSize(parsed.readingFontSize) ? parsed.readingFontSize : "medium",
              soundSettings: normalizeSoundSettings(parsed.soundSettings),
              lastSeen: Date.now(),
            };
          } catch {
            restored = initialState;
          }
        }
        setGame({
          ...restored,
          dailyPlan: ensureDailyPlan(restored),
          fruitPicking: ensureDailyFruitPicking(restored),
          hideAndSeekDaily: ensureDailyHideAndSeek(restored),
          fruitCatchDaily: ensureDailyFruitCatch(restored),
        });
        accountStateLoadedRef.current = true;
      })
      .catch(() => setGame(initialState))
      .finally(() => setHydrated(true));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void preloadStartupAssets((progress) => {
      if (!active || progress.phase !== "initial") return;
      setStartupLoad((current) => ({
        ...current,
        completed: progress.completed,
        total: progress.total,
        failed: progress.failed,
        percent: progress.percent,
        label: progress.label,
      }));
    }, controller.signal).then((result) => {
      if (!active) return;
      const ready = result.ready;
      const settledPercent = ready
        ? 100
        : Math.min(99, Math.floor(result.completed / Math.max(1, result.total) * 100));
      setStartupLoad({
        completed: result.completed,
        total: result.total,
        failed: result.failed,
        percent: settledPercent,
        label: ready
          ? "学习屋首页和背景音乐准备完成，其他内容正在后台加载"
          : result.timedOut
            ? "首屏加载超过5分钟，请检查网络后重试"
            : result.failed
              ? `${result.failed} 项资源未能完整加载，请重试`
              : "资源还没有准备完整，请重试",
        ready,
        timedOut: result.timedOut,
        settled: true,
      });
    }).catch(() => {
      if (!active) return;
      setStartupLoad((current) => ({
        ...current,
        failed: Math.max(1, current.failed),
        label: "完整资源清单读取失败，请检查网络后重试",
        ready: false,
        timedOut: false,
        settled: true,
      }));
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [startupAttempt]);

  useEffect(() => {
    if (view !== "explore" || explorationDomains.length) return;
    let active = true;
    void import("../lib/exploration-catalog")
      .then((module) => {
        if (active) setExplorationDomains(module.interestDomains);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [explorationDomains.length, view]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      const announce = achievementInitialSyncRef.current;
      void loadAchievements(announce).finally(() => {
        achievementInitialSyncRef.current = true;
      });
    }, achievementInitialSyncRef.current ? 450 : 0);
    return () => window.clearTimeout(timer);
  }, [
    explorationOverview?.completedNodeIds.length,
    game.completedMiniGames.length,
    game.mistakes.length,
    mistakeStats.mastered,
    game.readingRewards.length,
    game.travelRecords.length,
    hydrated,
    loadAchievements,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${BASE_PATH}/api/library/books`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("catalog unavailable")))
      .then((data: { books?: ImportedBookCatalogItem[] }) => setImportedBooks((data.books || []).map(importedCatalogBook)))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!hydrated || !accountStateLoadedRef.current) return;
    const timer = window.setTimeout(() => {
      const stateForSync = {
        name: game.name,
        hunger: game.hunger,
        cleanliness: game.cleanliness,
        boredom: game.boredom,
        lastSeen: Date.now(),
        readingFontSize: game.readingFontSize,
        soundSettings: game.soundSettings,
        chatMessages: game.chatMessages.slice(-16),
      };
      void fetch(`${BASE_PATH}/api/user-state`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: stateForSync, updatedAt: Date.now() }),
      }).catch(() => undefined);
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [game, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    void fetch(`${BASE_PATH}/api/reading-progress`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("progress unavailable")))
      .then((data: { progress?: Record<string, SavedReadingProgress> }) => setReadingProgressByBook(data.progress || {}))
      .catch(() => undefined)
      .finally(() => setReadingProgressLoaded(true));
    return () => controller.abort();
  }, [hydrated]);

  useEffect(() => {
    if (bookLoadError || !selectedBook.source || loadedBooks[selectedBook.id]) return;
    const controller = new AbortController();
    const sourceUrl = selectedBook.source.chunked
      ? `${selectedBook.source.url}&manifest=1`
      : selectedBook.source.url;
    void fetch(sourceUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("book download failed");
        const source = selectedBook.source!;
        if (source.format === "json") {
          const payload = await response.json() as {
            chapters?: Array<BookChapter | { id: string; title: string; pageCount: number }>;
          };
          return (payload.chapters || []).map((chapter) => ({
            ...chapter,
            pages: "pages" in chapter && Array.isArray(chapter.pages) ? chapter.pages : [],
            pageCount: "pageCount" in chapter
              ? Math.max(0, Number(chapter.pageCount) || 0)
              : ("pages" in chapter && Array.isArray(chapter.pages) ? chapter.pages.length : 0),
            loaded: !source.chunked,
          }));
        }
        const text = await response.text();
        const chapters = source.format === "markdown"
          ? parseMarkdownBook(text)
          : parsePublicDomainBook(text, source.startHeading || "");
        return chapters;
      })
      .then((chapters) => {
        if (!chapters.length) throw new Error("book chapters missing");
        setLoadedBooks((current) => ({ ...current, [selectedBook.id]: chapters }));
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setBookLoadError("完整原文暂时没有加载成功，请稍后重试。");
      })
      .finally(() => setBookLoading(false));
    return () => controller.abort();
  }, [bookLoadError, loadedBooks, selectedBook]);

  useEffect(() => {
    const source = selectedBook.source;
    const chapter = loadedBooks[selectedBook.id]?.[selectedChapter];
    if (bookLoadError || !source?.chunked || !chapter || chapter.loaded) return;
    const controller = new AbortController();
    let active = true;
    void fetch(`${source.url}&chapter=${selectedChapter}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("chapter download failed");
        const payload = await response.json() as { chapter?: BookChapter };
        if (!payload.chapter?.pages?.length) throw new Error("chapter pages missing");
        return payload.chapter;
      })
      .then((loadedChapter) => {
        if (!active) return;
        setLoadedBooks((current) => {
          const chapters = current[selectedBook.id];
          if (!chapters?.[selectedChapter]) return current;
          const nextChapters = [...chapters];
          nextChapters[selectedChapter] = {
            ...loadedChapter,
            pageCount: loadedChapter.pages.length,
            loaded: true,
          };
          return { ...current, [selectedBook.id]: nextChapters };
        });
      })
      .catch((error: Error) => {
        if (active && error.name !== "AbortError") {
          setBookLoadError("这一章暂时没有加载成功，请稍后重试。");
        }
      })
      .finally(() => {
        if (active) setBookLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [bookLoadError, loadedBooks, selectedBook.id, selectedBook.source, selectedChapter]);

  useEffect(() => {
    const chapters = loadedBooks[selectedBook.id];
    if (!readingProgressLoaded || !chapters?.length || restoredBookRef.current[selectedBook.id]) return;
    const saved = readingProgressByBook[selectedBook.id];
    const chapter = Math.min(Math.max(0, saved?.chapter || 0), chapters.length - 1);
    const pageCount = chapters[chapter].pageCount ?? chapters[chapter].pages.length;
    const page = Math.min(Math.max(0, saved?.page || 0), Math.max(0, pageCount - 1));
    setSelectedChapter(chapter);
    setBookPage(page);
    restoredBookRef.current[selectedBook.id] = true;
  }, [loadedBooks, readingProgressByBook, readingProgressLoaded, selectedBook.id]);

  useEffect(() => {
    const chapters = loadedBooks[selectedBook.id];
    const currentChapter = chapters?.[selectedChapter];
    if (
      !chapters?.length
      || !currentChapter
      || (selectedBook.source?.chunked && !currentChapter.loaded)
      || !restoredBookRef.current[selectedBook.id]
    ) return;
    const timer = window.setTimeout(() => {
      const pageCount = currentChapter.pageCount ?? currentChapter.pages.length;
      const completed = selectedChapter === chapters.length - 1 && bookPage === pageCount - 1;
      const progress = { chapter: selectedChapter, page: bookPage, completed };
      setReadingProgressByBook((current) => ({ ...current, [selectedBook.id]: progress }));
      void fetch(`${BASE_PATH}/api/reading-progress`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookId: selectedBook.id, ...progress }),
      }).catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [bookPage, loadedBooks, selectedBook.id, selectedBook.source?.chunked, selectedChapter]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      readerTextRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bookPage, selectedChapter]);

  useEffect(() => () => {
    bookAudioRef.current?.pause();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const syncDay = () => {
      setGame((current) => {
        const dateKey = currentDayKey();
        if (
          current.dailyPlan.dateKey === dateKey
          && current.fruitPicking.dateKey === dateKey
          && current.hideAndSeekDaily.dateKey === dateKey
          && current.fruitCatchDaily.dateKey === dateKey
        ) return current;
        return {
          ...current,
          dailyPlan: current.dailyPlan.dateKey === dateKey ? current.dailyPlan : createDailyPlan(current),
          fruitPicking: current.fruitPicking.dateKey === dateKey ? current.fruitPicking : { dateKey, picked: 0 },
          hideAndSeekDaily: current.hideAndSeekDaily.dateKey === dateKey
            ? current.hideAndSeekDaily
            : { dateKey, completed: 0 },
          fruitCatchDaily: current.fruitCatchDaily.dateKey === dateKey
            ? current.fruitCatchDaily
            : { dateKey, plays: 0, rewarded: false, bestScore: 0, totalCaught: 0 },
        };
      });
    };
    const interval = window.setInterval(syncDay, 60_000);
    return () => window.clearInterval(interval);
  }, [hydrated]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (hideAdvanceTimerRef.current) clearTimeout(hideAdvanceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!hideTarget || hideFound) return;
    const interval = window.setInterval(() => {
      setHideSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [hideFound, hideTarget]);

  useEffect(() => {
    if (view !== "home" || busy || hideTarget || traveling || !startupEntered) return;

    const delay = turtleAmbientMode === "idle"
      ? 5_500 + Math.random() * 5_500
      : turtleAmbientMode === "walking"
        ? TURTLE_WALK_DURATION_MS
        : turtleAmbientMode === "petted" || turtleAmbientMode === "tickled"
          ? 2_200
          : 3_400;

    const timer = window.setTimeout(() => {
      if (turtleAmbientMode === "walking") {
        const arrival = homeSpotArrival[homeSpot];
        setTurtleAmbientMode(arrival.mode);
        setTurtleAmbientSpeech(arrival.speech);
        return;
      }

      if (turtleAmbientMode !== "idle") {
        setTurtleAmbientMode("idle");
        setTurtleAmbientSpeech("");
        return;
      }

      if (Math.random() < 0.62) {
        const destinations = landHomeSpots.filter((spot) => spot !== homeSpot);
        const destination = destinations[Math.floor(Math.random() * destinations.length)] || "center";
        setTurtleDirection(homeSpotHorizontalPosition[destination] < homeSpotHorizontalPosition[homeSpot] ? "left" : "right");
        setTurtleAmbientSpeech(destination === "pond-edge"
          ? "我去池塘边看看～"
          : destination === "tree-shade"
            ? "我去闻闻果子的香味～"
            : destination === "cave-door"
              ? "我去小屋门口坐坐～"
              : "我回来找你啦～");
        setTurtleAmbientMode("walking");
        setHomeSpot(destination);
        return;
      }

      const quietActions: TurtleAmbientMode[] = game.boredom > 58
        ? ["waving", "resting", "looking"]
        : ["looking", "looking", "waving", "resting"];
      const nextAction = quietActions[Math.floor(Math.random() * quietActions.length)] || "looking";
      setTurtleAmbientMode(nextAction);
      setTurtleAmbientSpeech(nextAction === "looking"
        ? "咦，那边是不是有动静？"
        : nextAction === "waving"
          ? "我在这里呀！"
          : "晒一会儿太阳，好舒服。");
    }, delay);

    return () => window.clearTimeout(timer);
  }, [busy, game.boredom, hideTarget, homeSpot, startupEntered, traveling, turtleAmbientMode, view]);

  const patchGame = useCallback((patch: Partial<GameState>) => {
    setGame((current) => ({ ...current, ...patch }));
  }, []);

  const applyServerProgress = useCallback((data: StudentActionResponse) => {
    setGame((current) => ({
      ...current,
      ...(data.balances || {}),
      ...(data.dailyPlan ? { dailyPlan: data.dailyPlan } : {}),
      ...(data.fruitPicking ? { fruitPicking: data.fruitPicking } : {}),
      ...(data.hideAndSeekDaily ? { hideAndSeekDaily: data.hideAndSeekDaily } : {}),
      ...(data.activeTravel ? { activeTravel: data.activeTravel } : {}),
    }));
  }, []);

  useEffect(() => {
    const active = game.activeTravel;
    if (!hydrated || !active || !traveling) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      const duration = Math.max(1, active.endsAt - active.startedAt);
      const progress = Math.min(100, ((now - active.startedAt) / duration) * 100);
      setTravelProgress(progress);
      if (progress < 100) return;

      window.clearInterval(interval);
      if (travelCompletingRef.current) return;
      travelCompletingRef.current = true;
      const knowledgeCard = pickTravelKnowledgeCard(traveling, game.travelRecords);
      const record: TravelRecord = {
        id: active.startedAt,
        destinationId: traveling.id,
        destination: traveling.name,
        date: formatDate(),
        reward: knowledgeCard.title,
        photo: traveling.photo,
        knowledge: knowledgeCard.image,
        knowledgeCardId: knowledgeCard.id,
        knowledgeTitle: knowledgeCard.title,
        knowledgeFacts: knowledgeCard.facts,
      };
      void runStudentAction({
        action: "finish-travel",
        destinationId: traveling.id,
        destination: traveling.name,
        reward: knowledgeCard.title,
        photo: traveling.photo,
        knowledge: knowledgeCard.image,
        knowledgeCardId: knowledgeCard.id,
        knowledgeTitle: knowledgeCard.title,
        knowledgeFacts: knowledgeCard.facts,
      }).then((data) => {
        setGame((current) => {
          if (current.activeTravel?.startedAt !== active.startedAt) return current;
          return {
            ...current,
            ...(data.balances || {}),
            ...(data.dailyPlan ? { dailyPlan: data.dailyPlan } : {}),
            activeTravel: null,
            boredom: clamp(current.boredom - 18),
            hunger: clamp(current.hunger + 6),
            travelRecords: [record, ...current.travelRecords.filter((item) => item.id !== record.id)],
          };
        });
        setTravelProgress(0);
        setTravelReward({
          destination: traveling,
          card: knowledgeCard,
          playTicketAwarded: Boolean(data.travelPlayTicketAwarded),
        });
        playSound("travel-arrive");
        showToast(`${game.name}带着新发现回来啦！`);
        void remember({ type: "activity", activity: "旅行", detail: `一起去了${traveling.name}，随机带回${knowledgeCard.title}` });
      }).catch((error) => {
        showToast(error instanceof Error ? error.message : "旅行记录暂时没有保存");
        window.setTimeout(() => {
          travelCompletingRef.current = false;
          setGame((current) => current.activeTravel
            ? { ...current, activeTravel: { ...current.activeTravel } }
            : current);
        }, 2_000);
      }).finally(() => {
        travelCompletingRef.current = false;
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [game.activeTravel, game.name, game.travelRecords, hydrated, playSound, remember, showToast, traveling]);

  const runTimedAction = useCallback(
    (
      action: Exclude<BusyAction, null>,
      duration: number,
      sprite: string,
      onDone: () => void,
      startMessage: string,
    ) => {
      if (busy || hideTarget || traveling) return;
      setBusy(action);
      setTurtleSprite(sprite);
      setActionProgress(0);
      showToast(startMessage);
      const started = Date.now();
      const interval = window.setInterval(() => {
        const progress = Math.min(100, ((Date.now() - started) / duration) * 100);
        setActionProgress(progress);
        if (progress >= 100) {
          window.clearInterval(interval);
          setBusy(null);
          setActionProgress(0);
          onDone();
        }
      }, 100);
    },
    [busy, hideTarget, showToast, traveling],
  );

  const dailyFruitPicking = ensureDailyFruitPicking(game);
  const fruitPickingRemaining = Math.max(0, 5 - dailyFruitPicking.picked);
  const dailyHideAndSeek = ensureDailyHideAndSeek(game);
  const hideGamesRemaining = Math.max(0, DAILY_HIDE_AND_SEEK_LIMIT - dailyHideAndSeek.completed);
  const fruitCatchDaily = ensureDailyFruitCatch(game);

  const pickFruitAndOpen = async () => {
    if (fruitPickingRemaining > 0) {
      try {
        const data = await runStudentAction({ action: "pick-fruit" });
        applyServerProgress(data);
        if (data.picked) {
          playSound("fruit-pick");
          showToast(`从树上摘下 1 个果子，今天还可以摘 ${Math.max(0, 5 - (data.fruitPicking?.picked || 0))} 个`);
          void remember({ type: "activity", activity: "摘果喂食", detail: "从果树上摘下一个新鲜果子" });
        } else {
          showToast("今天已经摘满 5 个果子啦，明天树上会重新长好");
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : "果树暂时还没准备好");
      }
    } else {
      showToast("今天已经摘满 5 个果子啦，明天树上会重新长好");
    }
    setFruitPicker(true);
  };

  const feedFruit = (fruit: string) => {
    if (game.fruits < 1) {
      showToast("果篮空啦，读书或旅行可以带回新果子");
      return;
    }
    setFruitPicker(false);
    playSound("feed-bite");
    runTimedAction(
      "feeding",
      1800,
      "turtle_eating_fruit.png",
      () => {
        void runStudentAction({ action: "feed" }).then((data) => {
          setGame((current) => ({
            ...current,
            ...(data.balances || {}),
            ...(data.dailyPlan ? { dailyPlan: data.dailyPlan } : {}),
            hunger: clamp(current.hunger - 22),
            boredom: clamp(current.boredom - 3),
          }));
          setTurtleSprite("turtle_satisfied.png");
          const bonus = data.interactionBonus?.awarded
            ? data.interactionBonus.resource === "play_tickets" ? "，还幸运获得 1 张游玩票！" : "，还幸运获得 1 张旅行票！"
            : "";
          showToast(`${game.name}吃下${fruit}，肚子满足啦${bonus}`);
          void remember({ type: "activity", activity: "摘果喂食", detail: `给龟龟喂了${fruit}` });
          window.setTimeout(() => setTurtleSprite(null), 1800);
        }).catch((error) => {
          setTurtleSprite(null);
          showToast(error instanceof Error ? error.message : "喂食记录暂时没有保存");
        });
      },
      `${game.name}正在大口吃果子…`,
    );
  };

  const startSwim = () => {
    playSound("water-splash");
    runTimedAction(
      "swimming",
      5200,
      "turtle_swimming.png",
      () => {
        void runStudentAction({ action: "swim" }).then((data) => {
          setGame((current) => ({
            ...current,
            ...(data.balances || {}),
            ...(data.dailyPlan ? { dailyPlan: data.dailyPlan } : {}),
            cleanliness: 100,
          }));
          setTurtleSprite("turtle_clean_sparkle.png");
          const bonus = data.interactionBonus?.awarded
            ? data.interactionBonus.resource === "play_tickets" ? "还幸运获得 1 张游玩票！" : "还幸运获得 1 张旅行票！"
            : "";
          showToast(`游泳完成，龟壳亮晶晶！${bonus}`);
          void remember({ type: "activity", activity: "游泳", detail: "一起在池塘里游泳清洁" });
          window.setTimeout(() => setTurtleSprite(null), 2000);
        }).catch((error) => {
          setTurtleSprite(null);
          showToast(error instanceof Error ? error.message : "游泳记录暂时没有保存");
        });
      },
      `${game.name}扑通一声跳进池塘`,
    );
  };

  const startSleep = () => {
    playSound("sleep-yawn");
    runTimedAction(
      "sleeping",
      5000,
      "turtle_sleeping.png",
      () => {
        setGame((current) => ({
          ...current,
          boredom: clamp(current.boredom - 6),
          hunger: clamp(current.hunger + 3),
        }));
        setTurtleSprite("turtle_waving.png");
        showToast(`${game.name}睡醒啦，精神满满`);
        void remember({ type: "activity", activity: "休息", detail: "陪龟龟在小屋里睡了一会儿" });
        window.setTimeout(() => setTurtleSprite(null), 1800);
      },
      "嘘，做一个香香的梦吧",
    );
  };

  const respondToTurtleTouch = () => {
    if (busy || hideTarget || traveling || view !== "home") return;
    const now = Date.now();
    const touchCount = now - turtleTouchRef.current.lastAt < 1_300
      ? turtleTouchRef.current.count + 1
      : 1;
    turtleTouchRef.current = { count: touchCount, lastAt: now };

    if (touchCount >= 3) {
      turtleTouchRef.current.count = 0;
      setTurtleAmbientMode("tickled");
      setTurtleAmbientSpeech("哈哈哈，好痒呀！");
      return;
    }

    setTurtleAmbientMode("petted");
    setTurtleAmbientSpeech(touchCount === 2 ? "再摸一下，再摸一下～" : "眼睛都舒服得眯起来啦～");
  };

  const startHideAndSeek = () => {
    if (busy || traveling) return;
    if (hideGamesRemaining <= 0) {
      showToast("今天已经完成 5 局捉迷藏啦，明天再一起玩吧");
      return;
    }
    if (hideAdvanceTimerRef.current) clearTimeout(hideAdvanceTimerRef.current);
    setHideTarget(randomHidePlace());
    setHideRound(1);
    setHideSeconds(HIDE_ROUND_SECONDS);
    setHideFastRounds(0);
    setHideFound(null);
    showToast(`${game.name}藏好啦！直接点到藏起来的龟龟就算找到`);
  };

  const cancelHideAndSeek = () => {
    if (hideAdvanceTimerRef.current) clearTimeout(hideAdvanceTimerRef.current);
    hideAdvanceTimerRef.current = null;
    setHideTarget(null);
    setHideRound(0);
    setHideFound(null);
    showToast("先休息一下，下次再继续找龟龟");
  };

  const findHiddenTurtle = () => {
    if (!hideTarget || hideFound) return;
    playSound("hide-found");
    const nextFastRounds = hideFastRounds + (hideSeconds > HIDE_ROUND_SECONDS - 5 ? 1 : 0);
    const completedRound = hideRound;
    setHideFastRounds(nextFastRounds);
    setHideFound(hideTarget);
    showToast(`第 ${completedRound} 轮找到啦！龟龟藏在${hideLabels[hideTarget]}`);
    hideAdvanceTimerRef.current = window.setTimeout(() => {
      if (completedRound < HIDE_TOTAL_ROUNDS) {
        setHideTarget(randomHidePlace(hideTarget));
        setHideRound(completedRound + 1);
        setHideSeconds(HIDE_ROUND_SECONDS);
        setHideFound(null);
        showToast(`第 ${completedRound + 1} 轮开始，龟龟又藏好啦！`);
        return;
      }
      const nextCompletedToday = Math.min(DAILY_HIDE_AND_SEEK_LIMIT, dailyHideAndSeek.completed + 1);
      setHideTarget(null);
      setHideRound(0);
      setHideSeconds(HIDE_ROUND_SECONDS);
      setHideFound(null);
      setTurtleSprite("turtle_excited.png");
      void runStudentAction({ action: "hide-and-seek" }).then((data) => {
        setGame((current) => ({
          ...current,
          ...(data.balances || {}),
          ...(data.dailyPlan ? { dailyPlan: data.dailyPlan } : {}),
          ...(data.hideAndSeekDaily ? { hideAndSeekDaily: data.hideAndSeekDaily } : {}),
          boredom: clamp(current.boredom - 30),
        }));
        if (data.rewarded) playSound("reward-star");
        const bonus = data.interactionBonus?.awarded
          ? data.interactionBonus.resource === "play_tickets" ? "，还幸运获得 1 张游玩票" : "，还幸运获得 1 张旅行票"
          : "";
        showToast(data.rewarded
          ? `五次全找到！奖励 1 颗星星${bonus}，今天已完成 ${data.hideAndSeekDaily?.completed || nextCompletedToday}/5 局`
          : "今天的捉迷藏奖励已经领满啦");
        void remember({ type: "activity", activity: "捉迷藏", detail: `完成一局捉迷藏，连续找到5次，获得1颗星星；其中${nextFastRounds}次在5秒内找到` });
      }).catch((error) => {
        showToast(error instanceof Error ? error.message : "捉迷藏记录暂时没有保存");
      });
      window.setTimeout(() => setTurtleSprite(null), 2400);
    }, 1200);
  };

  const selectedChapters = loadedBooks[selectedBook.id] || [];
  const activeChapter = selectedChapters[selectedChapter];
  const activePages = activeChapter?.pages || [];
  const activePage = activePages[bookPage];
  const activeChapterLoading = Boolean(
    !bookLoadError && selectedBook.source?.chunked && activeChapter && !activeChapter.loaded,
  );
  const totalBookPages = selectedChapters.reduce((total, chapter) => total + (chapter.pageCount ?? chapter.pages.length), 0);
  const pagesBeforeChapter = selectedChapters.slice(0, selectedChapter)
    .reduce((total, chapter) => total + (chapter.pageCount ?? chapter.pages.length), 0);
  const overallPageNumber = totalBookPages ? pagesBeforeChapter + bookPage + 1 : 0;
  const overallProgress = totalBookPages ? (overallPageNumber / totalBookPages) * 100 : 0;
  const overallProgressLabel = overallProgress.toFixed(2);
  const activeChapterPrompt = activeChapter
    ? chapterPrompts[selectedBook.id]?.[activeChapter.title] || buildChapterPrompt(activeChapter.title)
    : null;
  const currentChapterQuestionKey = activeChapter ? `chapter:${selectedBook.id}:${activeChapter.title}` : "";
  const currentChapterQuestionAnswered = Boolean(currentChapterQuestionKey)
    && (answeredChapterQuestions.includes(currentChapterQuestionKey) || game.readingRewards.includes(currentChapterQuestionKey));
  const completedChapterButtonLabel = selectedChapter === selectedChapters.length - 1
    ? "已回答 · 查看阅读小结"
    : "已回答 · 进入下一章";
  const activeChapterKnowledge = activeChapter
    ? chapterKnowledge[selectedBook.id]?.[activeChapter.title] || selectedBook.knowledge
    : selectedBook.knowledge;
  const activeHideHint = hideTarget
    ? hideSeconds <= 8
      ? hideSceneClues[hideTarget].strong
      : hideSeconds <= HIDE_ROUND_SECONDS - 5
        ? hideSceneClues[hideTarget].soft
        : ""
    : "";
  const activeBookAudioKey = activeChapter ? `${selectedBook.id}:${selectedChapter}` : "";
  const currentBookAudio = bookAudio?.bookId === selectedBook.id && bookAudio.chapterIndex === selectedChapter
    ? bookAudio
    : null;
  const currentBookAudioPhase: BookAudioPhase = view !== "library" || !activeChapter
    ? "idle"
    : bookAudioResultKey === activeBookAudioKey
      ? bookAudioPhase
      : "loading";

  useEffect(() => {
    const audio = bookAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (view !== "library" || !activeChapter) return;
    const controller = new AbortController();
    const resultKey = `${selectedBook.id}:${selectedChapter}`;
    const url = new URL(`${window.location.origin}${BASE_PATH}/api/book-audio`);
    url.searchParams.set("bookId", selectedBook.id);
    url.searchParams.set("chapter", String(selectedChapter));
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null) as BookAudioInfo | null;
        if (!response.ok || !data?.ready) throw new Error("audio unavailable");
        return data;
      })
      .then((data) => {
        setBookAudio(data);
        setBookAudioResultKey(resultKey);
        setBookAudioPhase("ready");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setBookAudio(null);
          setBookAudioResultKey(resultKey);
          setBookAudioPhase("unavailable");
        }
      });
    return () => controller.abort();
  }, [activeChapter, selectedBook.id, selectedChapter, view]);

  useEffect(() => {
    if (view !== "library" || !activeChapter) return;
    void remember({
      type: "reading",
      title: selectedBook.title,
      category: selectedBook.memoryCategory,
      chapter: activeChapter.title,
    });
  }, [activeChapter, remember, selectedBook.memoryCategory, selectedBook.title, view]);

  const saveName = () => {
    const cleaned = draftName.trim().slice(0, 8);
    if (!cleaned) return;
    patchGame({ name: cleaned });
    setEditingName(false);
    showToast(`以后就叫我“${cleaned}”啦`);
  };

  const chooseBook = (book: Book) => {
    if (bookOpening) return;
    stopBookAudio();
    if (bookOpeningTimerRef.current !== null) window.clearTimeout(bookOpeningTimerRef.current);
    setBookOpening(book);
    playSound("page-turn");
    setSelectedGrade(book.grade);
    setSelectedBook(book);
    setBookLoading(Boolean(book.source && !loadedBooks[book.id]));
    setBookLoadError("");
    setSelectedChapter(0);
    setBookPage(0);
    setReadingAnswer("");
    setReadingFeedback("");
    setReadingEvaluation(null);
    setAnsweredChapterQuestions([]);
    setChapterQuestionOpen(false);
    setReaderSideTab("companion");
    setChapterListOpen(false);
    setReaderKnowledgeOpen(false);
    restoredBookRef.current[book.id] = false;

    const enterReader = () => {
      setLibraryMode("reader");
      setBookOpening(null);
      bookOpeningTimerRef.current = null;
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) enterReader();
    else bookOpeningTimerRef.current = window.setTimeout(enterReader, 920);
  };

  const returnToLibraryShelf = () => {
    stopBookAudio();
    if (bookOpeningTimerRef.current !== null) window.clearTimeout(bookOpeningTimerRef.current);
    bookOpeningTimerRef.current = null;
    setBookOpening(null);
    setLibraryMode("shelf");
    setChapterListOpen(false);
    setReaderKnowledgeOpen(false);
    setChapterQuestionOpen(false);
  };

  const nextBookPage = () => {
    if (!activeChapter) return;
    stopBookAudio();
    if (bookPage < activeChapter.pages.length - 1) {
      playSound("page-turn");
      setBookPage((page) => page + 1);
      setReadingAnswer("");
      setReadingFeedback("");
      setReadingEvaluation(null);
    } else if (currentChapterQuestionAnswered) {
      continueAfterChapterQuestion();
    } else if (activeChapterPrompt) {
      setReadingAnswer("");
      setReadingFeedback("");
      setReadingEvaluation(null);
      setChapterQuestionOpen(true);
    } else {
      showToast("这一章的伴读问题正在整理，请稍后再试");
    }
  };

  const previousBookPage = () => {
    stopBookAudio();
    if (bookPage > 0) {
      playSound("page-turn");
      setBookPage((page) => page - 1);
    } else if (selectedChapter > 0) {
      playSound("page-turn");
      const previousChapter = selectedChapters[selectedChapter - 1];
      setSelectedChapter((chapter) => chapter - 1);
      setBookPage(Math.max(0, (previousChapter.pageCount ?? previousChapter.pages.length) - 1));
    }
    setReadingAnswer("");
    setReadingFeedback("");
    setReadingEvaluation(null);
    setChapterQuestionOpen(false);
  };

  const chooseChapter = (index: number) => {
    stopBookAudio();
    if (index !== selectedChapter) playSound("page-turn");
    setBookLoadError("");
    setSelectedChapter(index);
    setBookPage(0);
    setReadingAnswer("");
    setReadingFeedback("");
    setReadingEvaluation(null);
    setChapterQuestionOpen(false);
    setChapterListOpen(false);
  };

  const toggleBookAudio = async () => {
    const audio = bookAudioRef.current;
    const timing = currentBookAudio?.pageTimings[bookPage];
    if (!audio || !currentBookAudio || !timing) {
      showToast("本章的温柔女声音频还在提前生成，请稍后再来听");
      return;
    }
    if (currentBookAudioPhase === "playing") {
      audio.pause();
      setBookAudioPhase("paused");
      return;
    }
    try {
      audio.playbackRate = bookAudioRate;
      if (currentBookAudioPhase !== "paused") audio.currentTime = timing.startMs / 1000;
      bookAudioPageStartRef.current = timing.startMs / 1000;
      bookAudioPageEndRef.current = timing.endMs / 1000;
      await audio.play();
      setBookAudioPhase("playing");
    } catch {
      setBookAudioPhase("unavailable");
      showToast("这段朗读暂时没能播放，请稍后再试");
    }
  };

  const updateBookAudioRate = (rate: number) => {
    setBookAudioRate(rate);
    if (bookAudioRef.current) bookAudioRef.current.playbackRate = rate;
  };

  const finishBookAudioPage = () => {
    const audio = bookAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = bookAudioPageStartRef.current;
    setBookAudioPhase("ready");
  };

  const submitReadingAnswer = async () => {
    if (!readingAnswer.trim()) {
      showToast("先把你的想法告诉龟龟吧");
      return;
    }
    setCompanionLoading(true);
    if (!activeChapterPrompt || !activeChapter) {
      setCompanionLoading(false);
      return;
    }
    try {
      const result = await askCompanion({
        mode: "reading",
        name: game.name,
        title: `${selectedBook.title} · ${activeChapter?.title || ""}`,
        bookId: selectedBook.id,
        chapterTitle: activeChapter?.title || "",
        questionKey: currentChapterQuestionKey,
        answer: readingAnswer.trim().slice(0, 500),
      });
      if (typeof result.correct !== "boolean") throw new Error("reading evaluation missing");
      if (result.correct) {
        setReadingEvaluation("correct");
        setAnsweredChapterQuestions((questions) => questions.includes(currentChapterQuestionKey) ? questions : [...questions, currentChapterQuestionKey]);
        const alreadyRewarded = result.reward?.alreadyClaimed ?? game.readingRewards.includes(currentChapterQuestionKey);
        const rewardKind = result.reward?.resource;
        const rewardLabel = rewardKind === "tickets" ? "2 张旅行票" : "2 张游玩票";
        if (result.reward) {
          setGame((current) => ({
            ...current,
            boredom: clamp(current.boredom - 8),
            ...result.reward!.balances,
            readingRewards: current.readingRewards.includes(currentChapterQuestionKey)
              ? current.readingRewards
              : [...current.readingRewards, currentChapterQuestionKey],
          }));
        }
        playSound(alreadyRewarded ? "answer-correct" : rewardKind ? "reward-ticket" : "answer-correct");
        const rewardMessage = result.rewardPending
          ? ""
          : alreadyRewarded
            ? " 这道题的奖励已经领取过啦。"
            : result.reward
              ? ` 这次随机获得了${rewardLabel}！`
              : "";
        setReadingFeedback(`${result.reply}${rewardMessage}`);
        showToast(result.rewardPending
          ? "回答正确，奖励稍后再领取"
          : alreadyRewarded
            ? "回答正确，这道题的奖励已经领取过啦"
            : result.reward
              ? `回答正确，随机获得${rewardLabel}！`
              : "回答正确！");
        void remember({
          type: "learning",
          detail: `在《${selectedBook.title}·${activeChapter?.title || "本章"}》中依据原文回答了伴读问题`,
        });
      } else {
        setReadingFeedback(result.reply);
        setReadingEvaluation("incorrect");
        playSound("answer-retry");
        showToast("龟龟把这一章的思考整理给你啦");
      }
    } catch (error) {
      setReadingFeedback(error instanceof Error && error.message
        ? error.message
        : "龟龟这次没能完成判断。你的答案还在，请稍后重新发送；这次不会发放或扣除奖励。");
      setReadingEvaluation("error");
    }
    setCompanionLoading(false);
  };

  const finishReading = async () => {
    const record: ReadingRecord = {
      id: Date.now(),
      title: selectedBook.title,
      date: formatDate(),
      answer: readingAnswer || "今天认真读完了整篇故事。",
      summary: selectedBook.summary,
    };
    try {
      const data = await runStudentAction({
        action: "finish-book",
        bookId: selectedBook.id,
        title: selectedBook.title,
        answer: record.answer,
        summary: record.summary,
      });
      setGame((current) => ({
        ...current,
        ...(data.balances || {}),
        ...(data.dailyPlan ? { dailyPlan: data.dailyPlan } : {}),
        boredom: clamp(current.boredom - 12),
        readingRecords: [record, ...current.readingRecords.filter((item) => item.title !== record.title)],
      }));
      playSound("reward-ticket");
      void remember({
        type: "learning",
        detail: `完成《${selectedBook.title}》全书阅读`,
      });
      setSummaryOpen(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "阅读完成记录暂时没有保存");
    }
  };

  const continueAfterChapterQuestion = async () => {
    const hasNextChapter = selectedChapter < selectedChapters.length - 1;
    setChapterQuestionOpen(false);
    setReadingAnswer("");
    setReadingFeedback("");
    setReadingEvaluation(null);
    if (hasNextChapter) {
      playSound("page-turn");
      setSelectedChapter((chapter) => chapter + 1);
      setBookPage(0);
      showToast("已经进入下一章，进度自动保存啦");
    } else {
      await finishReading();
    }
  };

  const skipChapterQuestion = () => {
    showToast("这次先跳过，之后回来还可以再想一想");
    void continueAfterChapterQuestion();
  };

  const retryChapterQuestion = () => {
    setReadingFeedback("");
    setReadingEvaluation(null);
  };

  const thinkAgainChapterQuestion = () => {
    setChapterQuestionOpen(false);
    setReadingAnswer("");
    setReadingFeedback("");
    setReadingEvaluation(null);
    showToast("先回到这一章再读一读，想好了龟龟还在这里等你");
  };

  const releaseVoiceSession = useCallback(() => {
    const session = voiceSessionRef.current;
    if (!session) return null;
    window.cancelAnimationFrame(session.animationFrame);
    window.clearInterval(session.clockTimer);
    window.clearTimeout(session.maxTimer);
    if (session.recorder && session.recorder.state !== "inactive") session.recorder.stop();
    session.processor?.disconnect();
    session.analyser.disconnect();
    session.source.disconnect();
    session.silentGain?.disconnect();
    session.stream.getTracks().forEach((track) => track.stop());
    void session.context.close();
    voiceSessionRef.current = null;
    return session;
  }, []);

  const cancelVoiceInput = useCallback(() => {
    releaseVoiceSession();
    voiceAbortRef.current?.abort();
    voiceAbortRef.current = null;
    setVoicePhase("idle");
    setVoiceSeconds(0);
    setVoiceLevel(0.08);
  }, [releaseVoiceSession]);

  const finishVoiceInput = useCallback(async () => {
    const session = voiceSessionRef.current;
    if (!session) return;
    voiceSessionRef.current = null;
    window.cancelAnimationFrame(session.animationFrame);
    window.clearInterval(session.clockTimer);
    window.clearTimeout(session.maxTimer);
    if (Date.now() - session.startedAt < 600) {
      if (session.recorder && session.recorder.state !== "inactive") session.recorder.stop();
      session.processor?.disconnect();
      session.analyser.disconnect();
      session.source.disconnect();
      session.silentGain?.disconnect();
      session.stream.getTracks().forEach((track) => track.stop());
      void session.context.close();
      setVoicePhase("idle");
      showToast("说得太短啦，请再试一次");
      return;
    }

    setVoicePhase("recognizing");
    setVoiceLevel(0.08);
    const controller = new AbortController();
    voiceAbortRef.current = controller;
    try {
      let wav: ReturnType<typeof encodeWav>;
      if (session.recorder) {
        if (session.recorder.state !== "inactive") {
          await new Promise<void>((resolve, reject) => {
            session.recorder!.addEventListener("stop", () => resolve(), { once: true });
            session.recorder!.addEventListener("error", () => reject(new Error("录音文件生成失败")), { once: true });
            session.recorder!.stop();
          });
        }
        const recording = new Blob(session.recordedChunks, { type: session.recorder.mimeType || "audio/webm" });
        if (recording.size < 128) throw new Error("没有录到声音，请确认麦克风后再试");
        const decoded = await session.context.decodeAudioData(await recording.arrayBuffer());
        const mono = new Float32Array(decoded.length);
        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          const samples = decoded.getChannelData(channel);
          for (let index = 0; index < decoded.length; index += 1) mono[index] += samples[index] / decoded.numberOfChannels;
        }
        wav = encodeWav([mono], decoded.sampleRate);
      } else {
        if (!session.chunks.length) throw new Error("没有录到声音，请确认麦克风后再试");
        wav = encodeWav(session.chunks, session.sampleRate);
      }
      if (wav.peak < 0.0003) throw new Error("没有录到声音，请检查麦克风是否静音或选错设备");
      const response = await fetch(`${BASE_PATH}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: wav.blob,
        signal: controller.signal,
      });
      const data = (await response.json()) as { transcript?: string; error?: string };
      if (!response.ok || !data.transcript) throw new Error(data.error || "speech unavailable");
      if (session.target === "chat") {
        setChatInput("");
        showToast(`听清楚啦，正在发给${game.name}`);
        submitChatRef.current(data.transcript);
      } else if (session.target === "reading") {
        setReadingAnswer(data.transcript);
        showToast("听清楚啦，文字已经填好");
      } else {
        setExplorationAnswer(data.transcript);
        showToast("听清楚啦，已经放进探险回答里");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        const message = error instanceof Error ? error.message : "";
        showToast(message.includes("没有听清楚") || message.includes("没有录到声音")
          ? message
          : "语音识别暂时不可用，可以改用文字输入");
      }
    } finally {
      session.processor?.disconnect();
      session.analyser.disconnect();
      session.source.disconnect();
      session.silentGain?.disconnect();
      session.stream.getTracks().forEach((track) => track.stop());
      void session.context.close();
      if (voiceAbortRef.current === controller) {
        voiceAbortRef.current = null;
        setVoicePhase("idle");
        setVoiceSeconds(0);
      }
    }
  }, [game.name, showToast]);

  useEffect(() => {
    autoFinishVoiceRef.current = () => void finishVoiceInput();
  }, [finishVoiceInput]);

  useEffect(() => () => {
    releaseVoiceSession();
    voiceAbortRef.current?.abort();
  }, [releaseVoiceSession]);

  const beginVoiceInput = async (target: VoiceTarget) => {
    if (voicePhase !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast("当前浏览器暂不支持录音，可以用文字告诉龟龟");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const context = new AudioContext({ latencyHint: "interactive" });
      if (context.state === "suspended") await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      let processor: ScriptProcessorNode | null = null;
      let silentGain: GainNode | null = null;
      let recorder: MediaRecorder | null = null;
      const recordedChunks: Blob[] = [];
      const chunks: Float32Array[] = [];
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      if (typeof MediaRecorder !== "undefined") {
        try {
          const mimeType = supportedRecorderMimeType();
          recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
          recorder.addEventListener("dataavailable", (event) => {
            if (event.data.size) recordedChunks.push(event.data);
          });
          recorder.start(250);
        } catch {
          recorder = null;
        }
      }
      if (!recorder) {
        processor = context.createScriptProcessor(4096, 1, 1);
        silentGain = context.createGain();
        // A tiny non-zero monitor gain prevents Chromium from optimizing the
        // legacy fallback graph into silence; it remains inaudible to users.
        silentGain.gain.value = 0.00001;
        processor.onaudioprocess = (event) => chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(context.destination);
      }

      const session: VoiceSession = {
        target,
        stream,
        context,
        source,
        analyser,
        processor,
        silentGain,
        recorder,
        recordedChunks,
        chunks,
        sampleRate: context.sampleRate,
        startedAt: Date.now(),
        animationFrame: 0,
        clockTimer: 0,
        maxTimer: 0,
      };
      const samples = new Uint8Array(analyser.fftSize);
      const updateLevel = () => {
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += ((sample - 128) / 128) ** 2;
        setVoiceLevel(Math.min(1, Math.max(0.08, Math.sqrt(energy / samples.length) * 4.8)));
        session.animationFrame = window.requestAnimationFrame(updateLevel);
      };
      session.animationFrame = window.requestAnimationFrame(updateLevel);
      session.clockTimer = window.setInterval(() => setVoiceSeconds(Math.min(30, Math.floor((Date.now() - session.startedAt) / 1000))), 250);
      session.maxTimer = window.setTimeout(() => autoFinishVoiceRef.current(), 30_000);
      voiceSessionRef.current = session;
      setVoiceTarget(target);
      setVoiceSeconds(0);
      setVoicePhase("recording");
    } catch {
      showToast("没有获得麦克风权限，请允许访问后再试");
    }
  };

  const sendChat = useCallback(async (messageOverride?: string) => {
    const message = (messageOverride ?? chatInput).trim();
    if (!message || chatThinking) return;
    const userMessage: ChatMessage = { id: Date.now(), role: "user", text: message };
    setGame((current) => ({
      ...current,
      boredom: clamp(current.boredom - 5),
      chatMessages: [...current.chatMessages, userMessage].slice(-16),
    }));
    setChatInput("");
    setChatThinking(true);
    let reply: string;
    try {
      reply = (await askCompanion({
        mode: "chat",
        name: game.name,
        message: message.slice(0, 500),
        history: game.chatMessages.slice(-8).map((item) => ({
          role: item.role === "turtle" ? "assistant" : "user",
          content: item.text,
        })),
      })).reply;
    } catch {
      reply = getLocalReply(message, game.name);
    }
    const turtleMessage: ChatMessage = { id: Date.now() + 1, role: "turtle", text: reply };
    setGame((current) => ({
      ...current,
      chatMessages: [...current.chatMessages, turtleMessage].slice(-16),
    }));
    try {
      applyServerProgress(await runStudentAction({ action: "daily-task", task: "chat" }));
    } catch {
      // The conversation remains usable if daily progress syncing is briefly unavailable.
    }
    setChatThinking(false);
  }, [applyServerProgress, chatInput, chatThinking, game.chatMessages, game.name]);

  useEffect(() => {
    submitChatRef.current = (message) => void sendChat(message);
  }, [sendChat]);

  useEffect(() => {
    if (view !== "chat") return;
    const frame = window.requestAnimationFrame(() => {
      messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chatThinking, game.chatMessages, view]);

  const openMistakeForm = () => {
    setMistakeScanNotice("");
    setMistakeDraft(null);
    setMistakeFormOpen(true);
  };

  const closeMistakeForm = () => {
    if (mistakeScanning || mistakeSaving) return;
    setMistakeFormOpen(false);
    setMistakeDraft(null);
    setMistakeScanNotice("");
  };

  const attachMistakePhoto = async (file?: File) => {
    if (!file) return;
    try {
      const imageData = await prepareMistakePhoto(file);
      setMistakeScanning(true);
      setMistakeScanNotice("");
      const response = await fetch(`${BASE_PATH}/api/mistake-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
      });
      const data = (await response.json()) as { result?: MistakeScanResult; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || "照片识别失败");
      setMistakeDraft({ imageData, result: data.result });
      setMistakeScanNotice(data.result.notice || "");
    } catch (error) {
      setMistakeScanNotice("这张照片没有读清楚，请重新拍照或换一张图片。" );
      showToast(error instanceof Error ? error.message : "图片读取失败，请换一张试试");
    } finally {
      setMistakeScanning(false);
    }
  };

  const updateMistakeDraft = (field: keyof MistakeScanResult, value: string) => {
    setMistakeDraft((current) => current ? { ...current, result: { ...current.result, [field]: value } } : current);
  };

  const confirmMistakeDraft = async () => {
    if (!mistakeDraft || mistakeSaving) return;
    if (!mistakeDraft.result.question.trim() || !mistakeDraft.result.correction.trim()) {
      setMistakeScanNotice("请先把题目和正确思路补充完整，再收进错题本。");
      return;
    }
    setMistakeSaving(true);
    setMistakeScanNotice("");
    try {
      const response = await fetch(`${BASE_PATH}/api/mistakes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: mistakeDraft.imageData, analysis: mistakeDraft.result }),
      });
      const data = (await response.json()) as { record?: MistakeRecord; error?: string };
      if (!response.ok || !data.record) throw new Error(data.error || "错题保存失败");
      const record = data.record;
      setGame((current) => ({ ...current, mistakes: [record, ...current.mistakes] }));
      try {
        applyServerProgress(await runStudentAction({ action: "daily-task", task: "mistake" }));
      } catch {
        showToast("错题已保存，今日任务进度稍后会再同步");
      }
      void remember({ type: "activity", activity: "整理错题", detail: `收录了一道${record.subject}错题：${record.question.slice(0, 45)}` });
      setMistakeFormOpen(false);
      setMistakeDraft(null);
      showToast("龟龟已经收好这道错题，之后可以回来挑战它");
    } catch (error) {
      const message = error instanceof Error ? error.message : "错题保存失败，请稍后再试";
      setMistakeScanNotice(message);
      showToast(message);
    } finally {
      setMistakeSaving(false);
    }
  };

  const startMistakeReview = (mistake: MistakeRecord) => {
    setReviewMistake(mistake);
    setReviewScanning(false);
    setReviewScanNotice("");
    setReviewPhotoPreview("");
    setReviewOutcome(null);
  };

  const closeMistakeReview = () => {
    if (reviewScanning) return;
    setReviewMistake(null);
    setReviewScanNotice("");
    setReviewPhotoPreview("");
    setReviewOutcome(null);
  };

  const resetMistakeReviewPhoto = () => {
    if (reviewScanning) return;
    setReviewPhotoPreview("");
    setReviewOutcome(null);
    setReviewScanNotice("");
  };

  const attachMistakeReviewPhoto = async (file?: File) => {
    if (!file || !reviewMistake || reviewScanning) return;
    try {
      const imageData = await prepareMistakePhoto(file);
      setReviewPhotoPreview(imageData);
      setReviewOutcome(null);
      setReviewScanning(true);
      setReviewScanNotice("");
      const response = await fetch(`${BASE_PATH}/api/mistake-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mistakeId: reviewMistake.id, imageData }),
      });
      const data = (await response.json()) as MistakeReviewOutcome & { error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || "答案识别失败");
      setReviewOutcome({ result: data.result, saved: data.saved, review: data.review });
      if (!data.saved || !data.result.readable || !data.review) {
        setReviewScanNotice(data.result.notice || "龟龟没有看清，请把答案和完整步骤重新拍清楚。");
        return;
      }
      const review = data.review;
      setReviewMistake((current) => current ? { ...current, status: review.status, reviewCount: review.reviewNumber } : current);
      setGame((current) => ({
        ...current,
        stars: review.stars,
        playTickets: review.playTickets,
        boredom: review.boredom,
        mistakes: current.mistakes.map((item) => item.id === reviewMistake.id ? {
          ...item,
          status: review.status,
          reviewCount: review.reviewNumber,
        } : item),
      }));
      try {
        applyServerProgress(await runStudentAction({ action: "daily-task", task: "mistake" }));
      } catch {
        showToast("错题复习已保存，今日任务进度稍后会再同步");
      }
      void remember({
        type: data.result.correct ? "learning" : "activity",
        ...(data.result.correct
          ? { detail: `拍照复习并掌握一道${reviewMistake.subject}错题` }
          : { activity: "整理错题", detail: `拍照复习了一道${reviewMistake.subject}错题，龟龟给出了修改建议` }),
      });
      showToast(data.result.correct
        ? (review.rewardStars || review.rewardPlayTickets
          ? `掌握啦！获得 ${review.rewardStars} 颗成长星星和 ${review.rewardPlayTickets} 张游玩票`
          : "答对啦，这道题依然很稳")
        : "龟龟找到了一处可以改进的地方，再试一次吧");
    } catch (error) {
      const message = error instanceof Error ? error.message : "龟龟暂时没有看清答案，请重新拍照";
      setReviewScanNotice(message);
      showToast(message);
    } finally {
      setReviewScanning(false);
    }
  };

  const deleteMistake = async (mistake: MistakeRecord) => {
    if (!window.confirm("确定要删除这道错题吗？删除后不能恢复。")) return;
    try {
      const response = await fetch(`${BASE_PATH}/api/mistakes?id=${encodeURIComponent(mistake.id)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "错题删除失败");
      setGame((current) => ({ ...current, mistakes: current.mistakes.filter((item) => item.id !== mistake.id) }));
      showToast("这道错题已经删除");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "错题删除失败，请稍后再试");
    }
  };

  const startTravel = async () => {
    if (traveling || busy) return;
    if (game.stars < selectedDestination.requiredStars) {
      showToast(`还差 ${selectedDestination.requiredStars - game.stars} 颗星才能解锁${selectedDestination.name}`);
      return;
    }
    if (game.tickets < 1) {
      showToast("旅行票不足，读完一本书可以获得 1 张");
      return;
    }
    try {
      const data = await runStudentAction({ action: "start-travel", destinationId: selectedDestination.id });
      if (!data.activeTravel || !data.balances) throw new Error("旅行暂时不能开始");
      setGame((current) => ({ ...current, ...data.balances!, activeTravel: data.activeTravel! }));
      playSound("travel-depart");
      showToast(`${game.name}背好行囊，出发去${selectedDestination.name}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "旅行暂时不能开始");
    }
  };

  const resetReading = () => {
    setSummaryOpen(false);
    setChapterQuestionOpen(false);
    setAnsweredChapterQuestions([]);
    setReadingAnswer("");
    setReadingFeedback("");
    setReadingEvaluation(null);
  };

  const dailyTaskCatalog: Array<{ key: DailyTaskKey; label: string }> = [
    { key: "feed", label: `给${game.name}喂 1 个果子` },
    { key: "swim", label: `陪${game.name}游泳清洁` },
    { key: "hide", label: "完成 1 局捉迷藏" },
    { key: "games", label: "通关 1 个乐园游戏" },
    { key: "explore", label: "完成 1 个知识单元" },
    { key: "travel", label: "完成 1 次旅行" },
    { key: "chat", label: `和${game.name}聊一聊` },
    {
      key: "mistake",
      label: dailyPlan.mistakeMode === "review" ? "复习 1 道错题" : "收录 1 道错题",
    },
  ];
  const dailyTaskItems = dailyPlan.taskKeys
    .map((key) => dailyTaskCatalog.find((task) => task.key === key))
    .filter((task): task is { key: DailyTaskKey; label: string } => Boolean(task));

  const openDailyTask = (task: DailyTaskKey) => {
    if (task === "feed") {
      pickFruitAndOpen();
      return;
    }
    if (task === "swim") {
      startSwim();
      return;
    }
    if (task === "hide") {
      startHideAndSeek();
      return;
    }
    if (task === "games") {
      navigateTo("games");
      return;
    }
    if (task === "explore") {
      navigateTo("explore");
      return;
    }
    if (task === "travel") {
      navigateTo("travel");
      return;
    }
    if (task === "chat") {
      navigateTo("chat");
      return;
    }
    if (dailyPlan.mistakeMode === "add") {
      openMistakeForm();
      return;
    }
    setMistakeFilter("review");
    navigateTo("mistakes");
  };

  const homeTurtleClass = busy === "swimming" ? "in-pond" : busy === "sleeping" ? "in-cave" : `spot-${homeSpot}`;
  const turtleSpeech = busy === "swimming"
    ? "我在练习划水！"
    : busy === "sleeping"
      ? "呼…呼…"
      : turtleAmbientSpeech
        || (game.hunger > 70
          ? "肚子咕咕叫啦"
          : game.boredom > 65
            ? "陪我玩一会儿吧"
            : game.cleanliness < 38
              ? "我想去池塘里洗洗啦"
              : "");
  const navigationLocked = !!busy || !!hideTarget || !!traveling || miniGamePlaying;
  const immersiveReader = view === "library" && libraryMode === "reader";
  const completedExplorationNodes = new Set(explorationOverview?.completedNodeIds || []);
  const dueExplorationNodes = new Set(explorationOverview?.dueReviewNodeIds || []);
  const masteredExplorationCount = Object.values(explorationOverview?.nodeProgress || {}).filter((progress) => progress.state === "mastered").length;
  const selectedInterestDomainData: InterestDomain | null = selectedInterestDomain
    ? explorationDomains.find((domain) => domain.id === selectedInterestDomain) || null
    : null;
  const activeExplorationProgress = activeExplorationNode ? explorationOverview?.nodeProgress[activeExplorationNode.id] : undefined;
  const selectedDestinationUnlocked = game.stars >= selectedDestination.requiredStars;
  const selectedDestinationMissingStars = Math.max(0, selectedDestination.requiredStars - game.stars);
  const journalTravelItems = game.travelRecords.slice(0, 9);
  const journalUnlockedItems = Math.min(12, 3 + journalTravelItems.length);
  const achievementStateById = new Map((achievementOverview?.achievements || []).map((achievement) => [achievement.id, achievement]));
  const selectedAchievement = achievementOverview?.selectedAchievementId
    ? achievementById.get(achievementOverview.selectedAchievementId) || null
    : null;
  const startupPrepared = hydrated && startupLoad.ready;
  const startupProgress = startupPrepared
    ? 100
    : startupLoad.percent;
  if (!startupPrepared || !startupEntered) {
    const startupLabel = startupLoad.ready && !hydrated ? "正在读取你的专属学习进度" : startupLoad.label;
    return (
      <main
        className={`startup-loading-screen ${startupPrepared ? "ready" : ""} ${startupLoad.timedOut || startupLoad.failed ? "degraded" : ""}`}
        style={{ "--startup-background": `url("${ASSET}/optimized/backgrounds/main_home.webp")` } as React.CSSProperties}
      >
        <div className="startup-cloud cloud-one" aria-hidden="true" />
        <div className="startup-cloud cloud-two" aria-hidden="true" />
        <img className="startup-loading-logo" src={`${ASSET}/ui/supplied/brand/logo-20260715.png`} alt="龟龟伴读" />
        <section className="startup-loading-card" role={startupPrepared ? undefined : "status"} aria-live="polite">
          <div className="startup-turtle-stage" aria-hidden="true">
            <i className="startup-path path-one" />
            <i className="startup-path path-two" />
            <i className="startup-path path-three" />
            <img src={`${ASSET}/characters/turtle/turtle_idle_standing.png`} alt="" />
          </div>
          <h1>{startupPrepared ? "今天的小屋准备好啦" : "龟龟正在准备今天的小屋"}</h1>
          <p>{startupPrepared ? "点一下，和龟龟一起开始今天的学习吧！" : startupLabel}</p>
          <div
            className="startup-progress-track"
            role="progressbar"
            aria-label="启动资源加载进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={startupProgress}
          >
            <i style={{ width: `${startupProgress}%` }} />
          </div>
          <div className="startup-progress-meta">
            <span>{startupLoad.completed}/{startupLoad.total} 项资源</span>
            <strong>{startupProgress}%</strong>
          </div>
          {startupPrepared ? (
            <>
              <button
                className="startup-enter-button"
                type="button"
                disabled={startupEntering}
                onClick={() => void enterAfterStartup()}
              >
                <Volume2 aria-hidden="true" />
                {startupEntering ? "龟龟正在开门…" : "进入学习屋"}
                <ChevronRight aria-hidden="true" />
              </button>
              <small>这次点击会开启声音权限；如果声音设置已开启，首页音乐会马上播放。</small>
            </>
          ) : startupLoad.settled ? (
            <>
              <button
                className="startup-enter-button startup-retry-button"
                type="button"
                onClick={() => {
                  setStartupLoad({
                    completed: 0,
                    total: 1,
                    failed: 0,
                    percent: 0,
                    label: "龟龟正在重新检查主要界面图片",
                    ready: false,
                    timedOut: false,
                    settled: false,
                  });
                  setStartupAttempt((attempt) => attempt + 1);
                }}
              >
                <RotateCcw aria-hidden="true" />
                重新加载主要资源
                <ChevronRight aria-hidden="true" />
              </button>
              <small>
                {startupLoad.timedOut
                  ? "网络较慢，首屏资源在5分钟内未准备好；已加载的图片会保留缓存。"
                  : `${startupLoad.failed || 1} 项主要资源尚未完成，加载成功后才能进入。`}
              </small>
            </>
          ) : (
            <small>
              正在准备学习屋首页和背景音乐；进入后，书房、错题屋、旅行和手帐等资源会继续在后台加载。
            </small>
          )}
        </section>
      </main>
    );
  }
  return (
    <main
      className={`app view-${view}${immersiveReader ? " immersive-reader" : ""}`}
      style={{
        "--home-background": `url("${ASSET}/optimized/backgrounds/main_home.webp")`,
        "--library-background": `url("${ASSET}/optimized/backgrounds/reading_room.webp")`,
        "--chat-background": `url("${ASSET}/optimized/backgrounds/playground_legacy.webp")`,
        "--travel-background": `url("${ASSET}/optimized/backgrounds/travel_map.webp")`,
        "--mistake-background": `url("${ASSET}/ui/mistakes/background.webp")`,
        "--mistake-content-frame": `url("${ASSET}/ui/mistakes/content-frame.png")`,
        "--pixel-frame": `url("${ASSET}/ui/home-refresh/frames/top-frame.png")`,
        "--status-frame": `url("${ASSET}/ui/home-refresh/status/panel.png")`,
        "--daily-task-panel": `url("${ASSET}/ui/daily-tasks/panel.png")`,
      } as React.CSSProperties}
    >
      {bookOpening && (
        <div className="book-opening-overlay" role="status" aria-live="polite" aria-label={`正在翻开《${bookOpening.title}》`}>
          <div className="book-opening-book" aria-hidden="true">
            <div className="book-opening-pages">
              <span><BookOpen /><i /></span>
              <span><i /><i /><i /></span>
            </div>
            <div className={`book-opening-cover ${bookOpening.coverClass}`}>
              <small>{bookOpening.category}</small>
              <b>{bookOpening.title}</b>
              <i>{bookOpening.author}</i>
            </div>
            <span className="book-opening-spine" />
          </div>
          <p>正在翻开《{bookOpening.title}》</p>
        </div>
      )}

      {!immersiveReader && (
      <header className="topbar">
        <div className="identity-cluster">
          <img className="brand-logo" src={`${ASSET}/ui/supplied/brand/logo-20260715.png`} alt="龟龟伴读" />
          <button
            className="pet-name"
            type="button"
            onClick={() => {
              setDraftName(game.name);
              setEditingName(true);
            }}
            title="修改名字"
          >
            <span className="avatar-dot">
              <img src={`${ASSET}/characters/turtle/turtle_idle_front.png`} alt="" />
            </span>
            <span>
              <small>我的伙伴</small>
              <strong>{game.name}</strong>
            </span>
            <Edit3 size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="wallet-group">
          <div className="wallet" aria-label={`${game.stars}颗星星，${game.fruits}个果子，${game.tickets}张旅行票，${game.playTickets}张游玩票`}>
            <span><Star className="wallet-star" fill="currentColor" aria-hidden="true" /> {game.stars}</span>
            <span><img className="wallet-icon" src={`${ASSET}/objects/fruit_orange.png`} alt="" /> {game.fruits}</span>
            <span className="wallet-ticket"><img src={`${ASSET}/legacy/travel/travel_ticket.png`} alt="" /> {game.tickets}</span>
            <span className="wallet-play-ticket" title="游玩票"><img src={`${ASSET}/ui/icons/play-ticket-pixel.png`} alt="" /> {game.playTickets}</span>
            <button
              className={`achievement-button ${view === "achievements" ? "active" : ""}`}
              type="button"
              onClick={() => navigateTo("achievements")}
              disabled={navigationLocked}
              aria-label={selectedAchievement ? `打开成长称号，当前称号${selectedAchievement.title}` : "打开成长称号"}
              title={selectedAchievement ? `当前称号：${selectedAchievement.title}` : "成长称号"}
            >
              {selectedAchievement
                ? <img src={`${BASE_PATH}${selectedAchievement.badgeSrc}`} alt="" />
                : <Sparkles aria-hidden="true" />}
              <b>{selectedAchievement?.title || "成长称号"}</b>
            </button>
            <button
              className={`leaderboard-button ${view === "leaderboard" ? "active" : ""}`}
              type="button"
              onClick={() => navigateTo("leaderboard")}
              disabled={navigationLocked}
              aria-label="打开本周成长榜"
              title="本周成长榜"
            >
              <Trophy aria-hidden="true" />
              <b>本周榜</b>
            </button>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="sound-control" ref={soundPanelRef}>
            <button
              className={`sound-menu-button ${game.soundSettings.enabled ? "enabled" : "muted"}`}
              type="button"
              onClick={() => setSoundPanelOpen((open) => !open)}
              aria-label={game.soundSettings.enabled ? "打开声音设置，当前声音已开启" : "打开声音设置，当前声音已关闭"}
              aria-expanded={soundPanelOpen}
              title="声音设置"
            >
              {game.soundSettings.enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
            </button>
            {soundPanelOpen && (
              <section className="sound-panel" role="dialog" aria-label="声音设置">
                <header>
                  <span><Music2 aria-hidden="true" /><strong>声音设置</strong></span>
                  <button type="button" onClick={() => setSoundPanelOpen(false)} aria-label="关闭声音设置"><X aria-hidden="true" /></button>
                </header>
                <button
                  className={`sound-master-toggle ${game.soundSettings.enabled ? "active" : ""}`}
                  type="button"
                  aria-pressed={game.soundSettings.enabled}
                  onClick={() => applySoundSettings({ ...game.soundSettings, enabled: !game.soundSettings.enabled })}
                >
                  <span>{game.soundSettings.enabled ? "声音已开启" : "声音已关闭"}</span>
                  <i aria-hidden="true" />
                </button>
                <label className={!game.soundSettings.enabled ? "disabled" : ""}>
                  <span>
                    <b>背景音乐</b>
                    <button
                      type="button"
                      aria-pressed={game.soundSettings.musicEnabled}
                      onClick={() => applySoundSettings({ ...game.soundSettings, musicEnabled: !game.soundSettings.musicEnabled })}
                    >
                      {game.soundSettings.musicEnabled ? "开" : "关"}
                    </button>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(game.soundSettings.musicVolume * 100)}
                    disabled={!game.soundSettings.enabled || !game.soundSettings.musicEnabled}
                    onChange={(event) => applySoundSettings({ ...game.soundSettings, musicVolume: Number(event.target.value) / 100 })}
                    aria-label="背景音乐音量"
                  />
                </label>
                <label className={!game.soundSettings.enabled ? "disabled" : ""}>
                  <span>
                    <b>操作音效</b>
                    <button
                      type="button"
                      aria-pressed={game.soundSettings.effectsEnabled}
                      onClick={() => applySoundSettings({ ...game.soundSettings, effectsEnabled: !game.soundSettings.effectsEnabled })}
                    >
                      {game.soundSettings.effectsEnabled ? "开" : "关"}
                    </button>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(game.soundSettings.effectsVolume * 100)}
                    disabled={!game.soundSettings.enabled || !game.soundSettings.effectsEnabled}
                    onChange={(event) => applySoundSettings({ ...game.soundSettings, effectsVolume: Number(event.target.value) / 100 })}
                    aria-label="操作音效音量"
                  />
                </label>
                <p>朗读和语音输入时，背景音乐会自动暂停。</p>
                <button
                  className="sound-preview-button"
                  type="button"
                  disabled={!game.soundSettings.enabled || !game.soundSettings.effectsEnabled}
                  onClick={() => playSound("answer-correct")}
                >
                  播放试听音
                </button>
                {androidVersion && (
                  <section className="android-update-entry" aria-label="应用更新">
                    <div>
                      <Download aria-hidden="true" />
                      <span><b>应用更新</b><small>当前版本 {androidVersion}</small></span>
                    </div>
                    <button type="button" onClick={() => window.GuiguAndroid?.checkForUpdates()}>
                      检查更新
                    </button>
                  </section>
                )}
              </section>
            )}
          </div>
          <button className="logout-button" type="button" onClick={logout} aria-label="退出登录" title={`退出 ${student.displayName} 的账号`}>
            <LogOut aria-hidden="true" />
          </button>
        </div>
      </header>
      )}

      <section className="scene-shell">
        {view === "home" && (
          <section className={`scene home-scene ${busy === "sleeping" ? "sleeping-scene" : ""}`}>
            <div className="scene-title">
              <small suppressHydrationWarning>{formatDate()} · 晴</small>
              <h1>今天想和{game.name}做什么？</h1>
            </div>

            {!hideTarget && (
              <button
                className="knowledge-expedition-entry"
                type="button"
                onClick={() => navigateTo("explore")}
                disabled={navigationLocked}
                aria-label="进入知识探险，探索八个兴趣世界"
              >
                <span className="knowledge-expedition-icon"><Compass aria-hidden="true" /><Sparkles aria-hidden="true" /></span>
                <span>
                  <small>兴趣会长出新路线</small>
                  <strong>知识探险</strong>
                  <em>8 个兴趣世界</em>
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            )}

            {!hideTarget && (
              <button
                className="game-park-entry"
                type="button"
                onClick={() => navigateTo("games")}
                disabled={navigationLocked}
                aria-label="进入龟龟乐园玩小游戏"
              >
                <span className="game-park-entry-icon"><Gamepad2 aria-hidden="true" /><Star aria-hidden="true" /></span>
                <span>
                  <small>轻松玩一小会儿</small>
                  <strong>龟龟乐园</strong>
                  <em>10 个小游戏开放啦</em>
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            )}

            <aside className={`daily-task-panel ${dailyTasksExpanded ? "open" : ""}`} aria-label={`今日任务，已完成${dailyCompletedCount}项，共4项`}>
              <button
                className="daily-task-heading"
                type="button"
                aria-expanded={dailyTasksExpanded}
                onClick={() => setDailyTasksOpen((open) => !open)}
              >
                <img src={`${ASSET}/ui/daily-tasks/title.png`} alt="今日任务" />
                <span>{dailyCompletedCount}/4</span>
                <ChevronRight aria-hidden="true" />
              </button>
              <div className="daily-task-body">
                <div className="daily-plan-progress" aria-label={`今日计划完成${dailyCompletedCount * 25}%`}>
                  <span>今日计划</span>
                  <div><i style={{ width: `${dailyCompletedCount * 25}%` }} /></div>
                  <b>{dailyCompletedCount}/4</b>
                </div>
                <div className="daily-task-list">
                  {dailyTaskItems.map((task) => {
                    const progress = Math.min(dailyPlan.progress[task.key], dailyPlan.targets[task.key]);
                    const complete = progress >= dailyPlan.targets[task.key];
                    return (
                      <button
                        className={complete ? "complete" : ""}
                        type="button"
                        key={task.key}
                        onClick={() => openDailyTask(task.key)}
                        aria-label={`${task.label}，${complete ? "已完成" : `进度${progress}/${dailyPlan.targets[task.key]}`}`}
                      >
                        <strong>{task.label}</strong>
                        <span>{complete ? <Check aria-hidden="true" /> : `${progress}/${dailyPlan.targets[task.key]}`}</span>
                      </button>
                    );
                  })}
                </div>
                <div className={`daily-task-reward ${dailyPlan.rewardClaimed ? "claimed" : ""}`}>
                  <img src={`${ASSET}/ui/icons/play-ticket-pixel.png`} alt="" />
                  <span>{dailyPlan.rewardClaimed ? "今日计划完成，3 张游玩票已领取" : "全部完成可得 3 张游玩票"}</span>
                </div>
              </div>
            </aside>

            <aside className="home-status-panel" aria-label="龟龟状态">
              <div className="status-panel-title">
                <img src={`${ASSET}/ui/home-refresh/status/turtle-head.png`} alt="" />
                <strong>龟龟状态</strong>
              </div>
              <div className="status-row">
                <StatusPill icon={`${ASSET}/ui/home-refresh/status/hunger.png`} label="饱腹值" value={game.hunger} reverse />
                <StatusPill icon={`${ASSET}/ui/home-refresh/status/cleanliness.png`} label="清洁值" value={game.cleanliness} />
                <StatusPill icon={`${ASSET}/ui/home-refresh/status/fun.png`} label="有趣值" value={game.boredom} reverse />
                <StatusPill icon={`${ASSET}/ui/home-refresh/status/mood.png`} label="心情值" value={mood} />
              </div>
            </aside>

            {!hideTarget && (
              <>
                <button className="scene-action pond-action" type="button" onClick={startSwim} aria-label="去游泳" title="去游泳" disabled={!!busy}>
                  <img src={`${ASSET}/ui/home-refresh/actions/swim.png`} alt="" />
                </button>
                <button className="scene-action tree-action" type="button" onClick={pickFruitAndOpen} aria-label={`摘果喂食，今天还可以摘${fruitPickingRemaining}个`} title="摘果喂食" disabled={!!busy}>
                  <img src={`${ASSET}/ui/home-refresh/actions/feed.png`} alt="" />
                </button>
                <button className="scene-action hide-action" type="button" onClick={startHideAndSeek} aria-label={`捉迷藏，今天还可以完成${hideGamesRemaining}局`} title={hideGamesRemaining > 0 ? `捉迷藏（今天还可以完成 ${hideGamesRemaining} 局）` : "今天已经完成 5 局捉迷藏"} disabled={!!busy}>
                  <img src={`${ASSET}/ui/home-refresh/actions/hide.png`} alt="" />
                </button>
                <button className="scene-action cave-action" type="button" onClick={startSleep} aria-label="睡一会" title="睡一会" disabled={!!busy}>
                  <img src={`${ASSET}/ui/home-refresh/actions/sleep.png`} alt="" />
                </button>
              </>
            )}
            {hideTarget && (
              <>
                <div className={`hide-countdown ${hideSeconds <= 8 ? "urgent" : ""}`} aria-label={`剩余${hideSeconds}秒`}>
                  {hideSeconds}
                </div>
                <section className={`hide-game-hud ${hideFound ? "round-found" : ""}`} aria-live="polite">
                  <div className="hide-game-topline">
                    <strong>龟龟捉迷藏</strong>
                    <div className="hide-round-pips" aria-label={`第${hideRound}轮，共${HIDE_TOTAL_ROUNDS}轮`}>
                      {Array.from({ length: HIDE_TOTAL_ROUNDS }, (_, index) => (
                        <i key={index} className={index + 1 < hideRound ? "done" : index + 1 === hideRound ? "current" : ""}>{index + 1}</i>
                      ))}
                    </div>
                    <button className="hide-cancel" type="button" onClick={cancelHideAndSeek} aria-label="结束捉迷藏"><X /></button>
                  </div>
                  <p className="hide-game-instruction">仔细看场景，直接点藏起来的龟龟</p>
                  <div className="hide-game-score"><Star /> 5秒内找到：{hideFastRounds} 次 <span>连续找到 5 次奖励 1 颗星 · 今日已完成 {dailyHideAndSeek.completed}/5 局</span></div>
                </section>
                {activeHideHint && !hideFound && (
                  <div className="hide-clue-card" role="status">
                    <Lightbulb />
                    <span>{activeHideHint}</span>
                  </div>
                )}
              </>
            )}

            {hideTarget && (
              <button
                className={`hidden-turtle hidden-${hideTarget} ${hidePlaces.indexOf(hideTarget) >= 4 ? "generated-hide" : ""} ${hideFound ? "is-found" : hideSeconds <= 8 ? "is-peeking" : ""}`}
                type="button"
                onClick={findHiddenTurtle}
                aria-label="找到藏起来的龟龟"
                disabled={!!hideFound}
              >
                <img className="hidden-turtle-art" src={hideSprites[hideTarget]} alt="" />
              </button>
            )}

            {hideFound && <div className="hide-celebration" aria-hidden="true"><Sparkles /><Star /><Sparkles /></div>}

            {!hideTarget && !traveling && (
              <button
                className={`turtle-wrap ${homeTurtleClass} ambient-${busy ? "busy" : turtleAmbientMode} facing-${turtleDirection} ${turtleSpeech ? "has-speech" : ""}`}
                type="button"
                onClick={respondToTurtleTouch}
                aria-label={busy ? `${game.name}正在${busy === "swimming" ? "游泳" : busy === "sleeping" ? "睡觉" : "吃果子"}` : `摸摸${game.name}`}
                title={busy ? undefined : `摸摸${game.name}`}
              >
                {turtleSpeech && <span className="speech-tag" aria-live="polite">{turtleSpeech}</span>}
                <span className="turtle-sprite-stage">
                  <span className="turtle-ground-shadow" aria-hidden="true" />
                  <span className="turtle-step-dust" aria-hidden="true"><i /><i /><i /></span>
                  <img
                    className="turtle-sprite"
                    src={`${ASSET}/characters/turtle/${turtleSprite ?? ambientActionSprite}`}
                    alt=""
                  />
                </span>
              </button>
            )}

            {busy && (
              <div className="action-progress" role="status">
                <span>
                  {busy === "feeding" ? "吃果子" : busy === "swimming" ? "游泳清洁" : "香香睡一觉"}
                </span>
                <div><i style={{ width: `${actionProgress}%` }} /></div>
              </div>
            )}

          </section>
        )}

        {view === "games" && (
          <section className="scene game-park-scene">
            <Suspense fallback={<div className="game-park-loading" role="status">龟龟正在打开乐园…</div>}>
              <GamePark
                turtleName={game.name}
                daily={fruitCatchDaily}
                playTickets={game.playTickets}
                completedGames={game.completedMiniGames}
                onBackHome={() => navigateTo("home")}
                onRoundComplete={completeFruitCatchRound}
                onLearningGameComplete={completeLearningMiniGame}
                onSpendPlayTicket={spendPlayTicket}
                onPlayingChange={setMiniGamePlaying}
                leaderboardVersion={miniGameLeaderboardVersion}
              />
            </Suspense>
          </section>
        )}

        {view === "explore" && (
          <section className="scene explore-scene">
            <main className="explore-shell">
              <header className="explore-heading">
                <div className="explore-heading-copy">
                  <span><Compass aria-hidden="true" /> 龟龟知识探险</span>
                  <h1>{selectedInterestDomainData ? selectedInterestDomainData.title : "从喜欢的一件事，发现更大的世界"}</h1>
                  <p>{selectedInterestDomainData
                    ? selectedInterestDomainData.description
                    : "从微课开始，经过互动检查、实践表达和间隔复习，把喜欢真正变成会用的知识。"}</p>
                </div>
                <button
                  type="button"
                  className="explore-home-button"
                  onClick={() => selectedInterestDomainData ? setSelectedInterestDomain(null) : navigateTo("home")}
                >
                  <ChevronLeft aria-hidden="true" /> {selectedInterestDomainData ? "全部领域" : "回家园"}
                </button>
              </header>

              {explorationLoading && !explorationOverview && (
                <div className="explore-status" role="status"><Sparkles aria-hidden="true" /> 龟龟正在铺开你的知识地图…</div>
              )}

              {explorationError && !explorationLoading && !explorationOverview && (
                <div className="explore-status explore-status-error" role="alert">
                  <span>{explorationError}</span>
                  <button type="button" onClick={() => void loadExploration()}>再试一次</button>
                </div>
              )}

              {explorationOverview && !explorationDomains.length && (
                <div className="explore-status" role="status"><Sparkles aria-hidden="true" /> 龟龟正在展开八条学习路线…</div>
              )}

              {!selectedInterestDomainData && explorationOverview && (
                <>
                  <section className="explore-summary" aria-label="知识探险进度">
                    <div>
                      <strong>{completedExplorationNodes.size}</strong>
                      <span>已完成学习</span>
                    </div>
                    <div>
                      <strong>{masteredExplorationCount}</strong>
                      <span>已经掌握</span>
                    </div>
                    <div>
                      <strong>{dueExplorationNodes.size}</strong>
                      <span>今天待复习</span>
                    </div>
                    <img src={`${ASSET}/characters/turtle/turtle_travel_start.png`} alt="龟龟背着书包准备知识探险" />
                  </section>

                  <section className="explore-recommendations" aria-labelledby="explore-recommendation-title">
                    <header>
                      <span><Sparkles aria-hidden="true" /></span>
                      <div>
                        <h2 id="explore-recommendation-title">龟龟为你发现的路线</h2>
                        <p>根据最近的阅读、学习和兴趣整理；你也可以自由选择其他领域。</p>
                      </div>
                    </header>
                    <div>
                      {explorationOverview.recommended.map((recommendation) => {
                        const domain = explorationDomains.find((item) => item.id === recommendation.domainId);
                        if (!domain) return null;
                        const available = domain.nodes.some((node) => Boolean(node.lesson));
                        return (
                          <button
                            type="button"
                            className={`explore-recommendation-card ${domain.colorClass}`}
                            key={domain.id}
                            onClick={() => setSelectedInterestDomain(domain.id)}
                          >
                            <span><InterestDomainIcon domainId={domain.id} /></span>
                            <div><strong>{domain.title} <small>{available ? "完整路线" : "内容准备中"}</small></strong><p>{recommendation.reason}</p></div>
                            <ChevronRight aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="interest-domain-section" aria-labelledby="interest-domain-title">
                    <header>
                      <div><span>八个兴趣世界</span><h2 id="interest-domain-title">选择今天想走的方向</h2></div>
                      <small>没有标准路线，从任何喜欢的地方开始都可以。</small>
                    </header>
                    <div className="interest-domain-grid">
                      {explorationDomains.map((domain) => {
                        const completedCount = domain.nodes.filter((node) => completedExplorationNodes.has(node.id)).length;
                        const recommendation = explorationOverview.recommended.find((item) => item.domainId === domain.id);
                        const available = domain.nodes.some((node) => Boolean(node.lesson));
                        return (
                          <button
                            type="button"
                            className={`interest-domain-card ${domain.colorClass}`}
                            key={domain.id}
                            onClick={() => setSelectedInterestDomain(domain.id)}
                          >
                            {available
                              ? <b className="interest-recommended-badge ready"><Sparkles aria-hidden="true" /> 完整学习路线</b>
                              : <b className="interest-recommended-badge upcoming">内容准备中</b>}
                            <span className="interest-domain-icon"><InterestDomainIcon domainId={domain.id} /></span>
                            <div className="interest-domain-copy">
                              <h3>{domain.title}</h3>
                              <p>{domain.description}</p>
                            </div>
                            <div className="interest-domain-progress">
                              <span><i style={{ width: `${completedCount / domain.nodes.length * 100}%` }} /></span>
                              <b>{completedCount}/{domain.nodes.length}</b>
                            </div>
                            <em>{available
                              ? completedCount === domain.nodes.length ? "全部掌握" : completedCount ? "继续学习" : "开始学习"
                              : recommendation ? "龟龟已记下你的兴趣" : "即将开放"}<ChevronRight aria-hidden="true" /></em>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </>
              )}

              {selectedInterestDomainData && explorationOverview && (
                <section className={`interest-detail ${selectedInterestDomainData.colorClass}`}>
                  <header className="interest-detail-hero">
                    <span className="interest-detail-icon"><InterestDomainIcon domainId={selectedInterestDomainData.id} /></span>
                    <div>
                      <small>{selectedInterestDomainData.nodes.some((node) => node.lesson)
                        ? `完整学习路线 · ${selectedInterestDomainData.nodes.filter((node) => completedExplorationNodes.has(node.id)).length}/${selectedInterestDomainData.nodes.length} 已完成`
                        : "兴趣入口已保留 · 完整学习内容准备中"}</small>
                      <h2>{selectedInterestDomainData.title}</h2>
                      <p>{selectedInterestDomainData.description}</p>
                    </div>
                    <div className="interest-detail-progress" aria-label={`${selectedInterestDomainData.title}探索进度`}>
                      <span><i style={{ width: `${selectedInterestDomainData.nodes.filter((node) => completedExplorationNodes.has(node.id)).length / selectedInterestDomainData.nodes.length * 100}%` }} /></span>
                      <b>{selectedInterestDomainData.nodes.filter((node) => completedExplorationNodes.has(node.id)).length * 25}%</b>
                    </div>
                  </header>

                  {explorationOverview.recommended.find((item) => item.domainId === selectedInterestDomainData.id) && (
                    <div className="interest-detail-reason"><Sparkles aria-hidden="true" /> {explorationOverview.recommended.find((item) => item.domainId === selectedInterestDomainData.id)?.reason}</div>
                  )}

                  <div className="exploration-route" aria-label={`${selectedInterestDomainData.title}知识路线`}>
                    {selectedInterestDomainData.nodes.map((node, index) => {
                      const completed = completedExplorationNodes.has(node.id);
                      const progress = explorationOverview.nodeProgress[node.id];
                      const mastered = progress?.state === "mastered";
                      const due = dueExplorationNodes.has(node.id);
                      const available = Boolean(node.lesson);
                      const unlocked = available && (index === 0 || completedExplorationNodes.has(selectedInterestDomainData.nodes[index - 1].id));
                      const statusLabel = !available
                        ? "内容准备中"
                        : mastered
                          ? "已掌握"
                          : due
                            ? "该复习啦"
                            : completed
                              ? "查看学习成果"
                              : unlocked
                                ? "开始学习"
                                : "还未解锁";
                      return (
                        <article className={`exploration-node-card ${completed ? "completed" : ""} ${mastered ? "mastered" : ""} ${due ? "review-due" : ""} ${unlocked || completed ? "unlocked" : "locked"}`} key={node.id}>
                          <div className="exploration-route-line" aria-hidden="true"><i /></div>
                          <button
                            type="button"
                            disabled={!unlocked && !completed}
                            onClick={() => openExplorationNode(node)}
                          >
                            <span className="exploration-node-number">{mastered ? <Star aria-hidden="true" /> : due ? <RotateCcw aria-hidden="true" /> : completed ? <Check aria-hidden="true" /> : unlocked ? index + 1 : <Lock aria-hidden="true" />}</span>
                            <div>
                              <small>{available ? `${node.type}学习` : "即将开放"}</small>
                              <h3>{node.title}</h3>
                              <p>{!available
                                ? "龟龟正在把它做成有讲解、有互动、有表达和复习的完整学习任务。"
                                : unlocked || completed
                                  ? node.lesson?.objective
                                  : `先完成“${selectedInterestDomainData.nodes[index - 1].title}”`}</p>
                            </div>
                            <strong>{statusLabel}<ChevronRight aria-hidden="true" /></strong>
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}
            </main>

            {activeExplorationNode && (
              <div className="exploration-modal-backdrop" role="presentation" onMouseDown={(event) => {
                if (event.target === event.currentTarget && !explorationSaving) setActiveExplorationNode(null);
              }}>
                <section className={`exploration-modal ${explorationDomains.find((domain) => domain.id === activeExplorationNode.domainId)?.colorClass || ""}`} role="dialog" aria-modal="true" aria-labelledby="exploration-modal-title">
                  <button className="exploration-modal-close" type="button" aria-label="关闭知识点" onClick={() => setActiveExplorationNode(null)} disabled={explorationSaving}><X /></button>
                  <header>
                    <span><InterestDomainIcon domainId={activeExplorationNode.domainId} /></span>
                    <div><small>{activeExplorationNode.type}学习任务</small><h2 id="exploration-modal-title">{activeExplorationNode.title}</h2></div>
                  </header>
                  <div className="exploration-stepper" aria-label="学习步骤">
                    {(["learn", "quiz", "project", "review"] as const).map((step, index) => {
                      const label = ["学一学", "想一想", "说一说", "再想起"][index];
                      const order = explorationStage === "mastered" ? 3 : explorationStage === "learned" ? 2 : ["learn", "quiz", "project", "review"].indexOf(explorationStage);
                      return <span className={order >= index ? "active" : ""} key={step}><i>{index + 1}</i>{label}</span>;
                    })}
                  </div>

                  {activeExplorationNode.lesson && explorationStage === "learn" && (
                    <div className="exploration-learning-content">
                      <figure className="exploration-lesson-illustration">
                        <img
                          src={`${BASE_PATH}${activeExplorationNode.lesson.illustration}`}
                          alt={activeExplorationNode.lesson.illustrationAlt}
                          decoding="async"
                        />
                        <figcaption><Sparkles aria-hidden="true" /> 先看图找线索，再听龟龟讲一讲</figcaption>
                      </figure>
                      <section className="exploration-hook">
                        <strong><Sparkles aria-hidden="true" /> 先猜一猜</strong>
                        <p>{activeExplorationNode.lesson.hook}</p>
                      </section>
                      <section className="exploration-objective">
                        <Lightbulb aria-hidden="true" />
                        <div><strong>这次要学会</strong><p>{activeExplorationNode.lesson.objective}</p></div>
                      </section>
                      <div className="exploration-lesson-cards">
                        {activeExplorationNode.lesson.learnCards.map((card, index) => (
                          <article key={card.title}>
                            <b>{index + 1}</b>
                            <div><h3>{card.title}</h3><p>{card.body}</p></div>
                          </article>
                        ))}
                      </div>
                      <button className="exploration-complete-button" type="button" onClick={() => {
                        setExplorationStage("quiz");
                        setExplorationFeedback(null);
                        setExplorationQuizOption(null);
                      }}>
                        <Check aria-hidden="true" /> 我学完了，试试互动检查
                      </button>
                    </div>
                  )}

                  {activeExplorationNode.lesson && explorationStage === "quiz" && (
                    <div className="exploration-task-content">
                      <span className="exploration-task-kicker">互动检查 · 先自己想，不怕答错</span>
                      <h3>{activeExplorationNode.lesson.quiz.question}</h3>
                      <div className="exploration-quiz-options">
                        {activeExplorationNode.lesson.quiz.options.map((option, index) => (
                          <button
                            type="button"
                            className={explorationQuizOption === index ? "selected" : ""}
                            key={option}
                            onClick={() => { setExplorationQuizOption(index); setExplorationFeedback(null); }}
                            disabled={explorationSaving || Boolean(explorationFeedback?.correct)}
                          >
                            <i>{String.fromCharCode(65 + index)}</i><span>{option}</span>
                          </button>
                        ))}
                      </div>
                      {explorationFeedback && (
                        <div className={`exploration-feedback ${explorationFeedback.correct ? "correct" : "retry"}`} role="status">
                          {explorationFeedback.correct ? <Check aria-hidden="true" /> : <Lightbulb aria-hidden="true" />}
                          <p>{explorationFeedback.feedback}</p>
                        </div>
                      )}
                      {explorationError && <p className="exploration-modal-error" role="alert">{explorationError}</p>}
                      <button
                        className="exploration-complete-button"
                        type="button"
                        onClick={() => {
                          if (explorationFeedback?.correct) {
                            setExplorationStage("project");
                            setExplorationFeedback(null);
                            setExplorationAnswer("");
                          } else {
                            void submitExplorationQuizAnswer();
                          }
                        }}
                        disabled={explorationSaving || explorationQuizOption === null}
                      >
                        {explorationSaving ? "龟龟正在看…" : explorationFeedback?.correct
                          ? <><ChevronRight aria-hidden="true" /> 继续完成实践表达</>
                          : <><Send aria-hidden="true" /> 发给龟龟看看</>}
                      </button>
                    </div>
                  )}

                  {activeExplorationNode.lesson && explorationStage === "project" && (
                    <div className="exploration-task-content">
                      <span className="exploration-task-kicker">实践表达 · 把知识用起来</span>
                      <h3>{activeExplorationNode.lesson.project.prompt}</h3>
                      <ul className="exploration-criteria">
                        {activeExplorationNode.lesson.project.criteria.map((criterion) => <li key={criterion}><Check aria-hidden="true" /> {criterion}</li>)}
                      </ul>
                      <label className="exploration-answer-field">
                        <span>用自己的话告诉龟龟</span>
                        <textarea
                          value={explorationAnswer}
                          onChange={(event) => { setExplorationAnswer(event.target.value); setExplorationFeedback(null); }}
                          maxLength={800}
                          placeholder={activeExplorationNode.lesson.project.placeholder}
                          disabled={explorationSaving}
                        />
                        <small>{explorationAnswer.length}/800</small>
                      </label>
                      <button className="exploration-voice-button" type="button" onClick={() => void beginVoiceInput("exploration")} disabled={explorationSaving || voicePhase !== "idle"}>
                        <Mic aria-hidden="true" /> 也可以说给龟龟听
                      </button>
                      {explorationFeedback && !explorationFeedback.correct && (
                        <div className="exploration-feedback retry" role="status"><Lightbulb aria-hidden="true" /><p>{explorationFeedback.feedback}</p></div>
                      )}
                      {explorationError && <p className="exploration-modal-error" role="alert">{explorationError}</p>}
                      <button className="exploration-complete-button" type="button" onClick={() => void submitExplorationWrittenAnswer("project")} disabled={explorationSaving || !explorationAnswer.trim()}>
                        {explorationSaving ? "龟龟正在认真看…" : <><Send aria-hidden="true" /> 发给龟龟看看</>}
                      </button>
                    </div>
                  )}

                  {activeExplorationNode.lesson && explorationStage === "review" && (
                    <div className="exploration-task-content exploration-review-content">
                      <span className="exploration-task-kicker"><RotateCcw aria-hidden="true" /> 到复习时间啦</span>
                      <h3>{activeExplorationNode.lesson.review.question}</h3>
                      <p className="exploration-review-tip">先不翻前面的讲解，试着从脑海里把关键联系找回来。</p>
                      <label className="exploration-answer-field">
                        <span>我还记得……</span>
                        <textarea
                          value={explorationAnswer}
                          onChange={(event) => { setExplorationAnswer(event.target.value); setExplorationFeedback(null); }}
                          maxLength={600}
                          placeholder={activeExplorationNode.lesson.review.placeholder}
                          disabled={explorationSaving}
                        />
                      </label>
                      <button className="exploration-voice-button" type="button" onClick={() => void beginVoiceInput("exploration")} disabled={explorationSaving || voicePhase !== "idle"}>
                        <Mic aria-hidden="true" /> 说给龟龟听
                      </button>
                      {explorationFeedback && !explorationFeedback.correct && (
                        <div className="exploration-feedback retry" role="status"><Lightbulb aria-hidden="true" /><p>{explorationFeedback.feedback}</p></div>
                      )}
                      {explorationError && <p className="exploration-modal-error" role="alert">{explorationError}</p>}
                      <button className="exploration-complete-button" type="button" onClick={() => void submitExplorationWrittenAnswer("review")} disabled={explorationSaving || !explorationAnswer.trim()}>
                        {explorationSaving ? "龟龟正在认真想…" : <><Send aria-hidden="true" /> 发给龟龟看看</>}
                      </button>
                    </div>
                  )}

                  {(explorationStage === "learned" || explorationStage === "mastered") && (
                    <div className="exploration-result-content">
                      <div className={`exploration-result-seal ${explorationStage}`}>
                        {explorationStage === "mastered" ? <Star aria-hidden="true" /> : <Check aria-hidden="true" />}
                      </div>
                      <span>{explorationStage === "mastered" ? "已经掌握" : "本次学习完成"}</span>
                      <h3>{explorationStage === "mastered" ? "这片知识已经变成你的本领" : "先让知识休息一下，过一段时间再想起它"}</h3>
                      {explorationFeedback?.correct && <p className="exploration-result-feedback">{explorationFeedback.feedback}</p>}
                      <div className="exploration-takeaway">
                        <BookOpen aria-hidden="true" />
                        <div><h3>你带走的发现</h3><p>{activeExplorationNode.takeaway}</p></div>
                      </div>
                      {explorationStage === "learned" && activeExplorationProgress?.nextReviewAt ? (
                        <p className="exploration-next-review"><RotateCcw aria-hidden="true" /> 下次复习：{new Date(activeExplorationProgress.nextReviewAt).toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}</p>
                      ) : null}
                      <button className="exploration-complete-button" type="button" onClick={() => setActiveExplorationNode(null)}>
                        <ChevronLeft aria-hidden="true" /> 回到学习路线
                      </button>
                    </div>
                  )}
                </section>
              </div>
            )}
          </section>
        )}

        {view === "leaderboard" && (
          <section className="scene leaderboard-scene">
            <main className="leaderboard-panel">
              <header className="leaderboard-heading">
                <div>
                  <span><Trophy aria-hidden="true" /> 本周成长榜</span>
                  <h1>和龟龟一起慢慢变强</h1>
                  <p>{leaderboard?.weekLabel || "本周"}的成长积分会在这里结算。</p>
                </div>
                <button type="button" className="leaderboard-back" onClick={() => navigateTo("home")}>
                  <ChevronLeft aria-hidden="true" /> 回家
                </button>
              </header>

              {leaderboardLoading && !leaderboard && (
                <div className="leaderboard-status" role="status"><Sparkles aria-hidden="true" /> 龟龟正在整理本周的成长足迹…</div>
              )}

              {leaderboardError && !leaderboardLoading && (
                <div className="leaderboard-status leaderboard-error" role="alert">
                  <span>{leaderboardError}</span>
                  <button type="button" onClick={() => void loadLeaderboard()}>再试一次</button>
                </div>
              )}

              {leaderboard && (
                <>
                  <section className="leaderboard-my-card" aria-label="我的本周成长积分">
                    <div>
                      <span>我的名次</span>
                      <strong>第 {leaderboard.me.rank} 名</strong>
                      <small>{leaderboard.participantCount > 0 ? `本周有 ${leaderboard.participantCount} 位小朋友获得了积分` : "本周先和龟龟一起攒下第一分吧"}</small>
                    </div>
                    <div className="leaderboard-total">
                      <span>本周积分</span>
                      <strong>{leaderboard.me.points}</strong>
                      <small>成长积分</small>
                    </div>
                  </section>

                  <section className="leaderboard-top" aria-label="本周前三名">
                    <header>
                      <h2>本周前三名</h2>
                      <small>只展示名次和成长积分</small>
                    </header>
                    <div className="leaderboard-podium">
                      {leaderboard.top.map((entry) => (
                        <article className={`podium-card rank-${entry.rank}`} key={`${entry.rank}-${entry.name}`}>
                          <span className="podium-medal">{entry.rank}</span>
                          <strong>{entry.name}</strong>
                          <b>{entry.points}<small>分</small></b>
                          <span>本周成长积分</span>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="leaderboard-rules" aria-label="积分规则">
                    <header>
                      <h2>积分怎么来？</h2>
                      <p>每一项每天都有上限，认真参与就很棒。</p>
                    </header>
                    <div className="point-rule-grid">
                      {leaderboard.categories.map((category) => (
                        <article key={category.key}>
                          <span className={`rule-icon rule-${category.key}`}><LeaderboardCategoryIcon category={category.key} /></span>
                          <div>
                            <h3>{category.label}</h3>
                            <p>每次 {category.pointPerEvent} 分 · 每日最多 {category.dailyCap} 次 / {category.dailyMaxPoints} 分</p>
                          </div>
                          <b>{leaderboard.me.breakdown[category.key]}<small>分</small></b>
                        </article>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </main>
          </section>
        )}

        {view === "achievements" && (
          <section className="scene achievement-scene">
            <main className="achievement-panel">
              <header className="achievement-heading">
                <div>
                  <span><Sparkles aria-hidden="true" /> 我的成长称号</span>
                  <h1>每一次认真，都值得一枚徽章</h1>
                  <p>读书、改错、旅行、闯关和知识探险，都会在这里留下成长进度。</p>
                </div>
                <button type="button" className="achievement-back" onClick={() => navigateTo("home")}>
                  <ChevronLeft aria-hidden="true" /> 回家
                </button>
              </header>

              {achievementLoading && !achievementOverview && (
                <div className="achievement-status" role="status"><Sparkles aria-hidden="true" /> 龟龟正在擦亮你的徽章…</div>
              )}

              {achievementError && !achievementLoading && (
                <div className="achievement-status achievement-error" role="alert">
                  <span>{achievementError}</span>
                  <button type="button" onClick={() => void loadAchievements()}>再试一次</button>
                </div>
              )}

              {achievementOverview && (
                <>
                  <section className="achievement-current" aria-label="当前佩戴称号">
                    <div className="achievement-current-badge">
                      {selectedAchievement
                        ? <img src={`${BASE_PATH}${selectedAchievement.badgeSrc}`} alt={`${selectedAchievement.title}徽章`} />
                        : <Sparkles aria-hidden="true" />}
                    </div>
                    <div>
                      <span>现在佩戴</span>
                      <h2>{selectedAchievement?.title || "等待第一枚成长徽章"}</h2>
                      <p>{selectedAchievement?.shortDescription || "完成任意一条成长路线的第一个目标，就会解锁称号。"}</p>
                    </div>
                    <strong><b>{achievementOverview.totalUnlocked}</b> / {achievementOverview.totalAchievements}<small>已解锁</small></strong>
                  </section>

                  <div className="achievement-track-list">
                    {achievementTracks.map((track) => {
                      const trackAchievements = achievementCatalog.filter((achievement) => achievement.trackId === track.id);
                      const trackSummary = achievementOverview.tracks.find((item) => item.id === track.id);
                      return (
                        <section className={`achievement-track track-${track.id}`} key={track.id} style={{ "--track-color": track.color } as React.CSSProperties}>
                          <header>
                            <div><span>{track.title}</span><p>{track.subtitle}</p></div>
                            <strong>{trackSummary?.unlocked || 0} / {trackSummary?.total || trackAchievements.length}</strong>
                          </header>
                          <div className="achievement-grid">
                            {trackAchievements.map((achievement) => {
                              const state = achievementStateById.get(achievement.id);
                              const unlocked = Boolean(state?.unlockedAt);
                              const selected = achievementOverview.selectedAchievementId === achievement.id;
                              const current = Math.min(achievement.target, state?.current || 0);
                              const progress = Math.round(current / achievement.target * 100);
                              return (
                                <article className={`achievement-card ${unlocked ? "unlocked" : "locked"} ${selected ? "selected" : ""}`} key={achievement.id}>
                                  <div className="achievement-badge-wrap">
                                    <img src={`${BASE_PATH}${achievement.badgeSrc}`} alt="" loading="lazy" decoding="async" />
                                    {!unlocked && <span><Lock aria-hidden="true" /></span>}
                                    <i>第 {achievement.level} 阶</i>
                                  </div>
                                  <div className="achievement-card-copy">
                                    <h3>{achievement.title}</h3>
                                    <p>{achievement.shortDescription}</p>
                                    <small>{achievement.requirement}</small>
                                    <div className="achievement-progress" aria-label={`${achievement.title}进度 ${current}/${achievement.target}`}>
                                      <i style={{ width: `${progress}%` }} />
                                    </div>
                                    <b>{current} / {achievement.target}</b>
                                  </div>
                                  {unlocked ? (
                                    <button
                                      type="button"
                                      className={selected ? "wearing" : ""}
                                      disabled={selected || achievementSaving}
                                      onClick={() => void selectAchievement(achievement.id)}
                                    >
                                      {selected ? <><Check aria-hidden="true" /> 正在佩戴</> : "佩戴称号"}
                                    </button>
                                  ) : (
                                    <span className="achievement-locked-copy"><Lock aria-hidden="true" /> 继续成长来解锁</span>
                                  )}
                                  {state?.unlockedAt ? (
                                    <time dateTime={new Date(state.unlockedAt).toISOString()}>
                                      {new Date(state.unlockedAt).toLocaleDateString("zh-CN", { month: "long", day: "numeric" })} 获得
                                    </time>
                                  ) : null}
                                </article>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </>
              )}
            </main>
          </section>
        )}

        {view === "library" && (
          <section className={`scene library-scene library-mode-${libraryMode}`}>
            {libraryMode === "shelf" ? (
              <div className="library-shelf-screen">
                <header className="library-shelf-header">
                  <span className="eyebrow"><BookOpen /> 龟龟书房</span>
                  <div>
                    <h1>今天想读哪一本？</h1>
                    <p>先选择年级，再挑一本喜欢的书。阅读进度会自动保存。</p>
                  </div>
                  <span className="library-book-total">共 {availableBooks.length} 本</span>
                </header>

                <nav className="library-grade-tabs" aria-label="按年级选择图书">
                  {gradeLevels.map((grade) => (
                    <button
                      key={grade.value}
                      type="button"
                      className={selectedGrade === grade.value ? "active" : ""}
                      aria-pressed={selectedGrade === grade.value}
                      onClick={() => setSelectedGrade(grade.value)}
                    >
                      <strong>{grade.value}</strong>
                      <span>{grade.label}</span>
                      <small>{gradeBookCounts[grade.value]} 本</small>
                    </button>
                  ))}
                </nav>

                <section className="library-grade-section" aria-labelledby="selected-grade-heading">
                  <div className="library-grade-heading">
                    <div>
                      <span>{selectedGrade}</span>
                      <div><h2 id="selected-grade-heading">{gradeLevels[selectedGrade - 1].label}书架</h2><p>选择书本后，书架会收起来，进入安静的阅读界面。</p></div>
                    </div>
                    <strong>{selectedGradeBooks.length} 本可读</strong>
                  </div>

                  {selectedGradeBooks.length ? (
                    <div className="library-book-grid">
                      {selectedGradeBooks.map((book) => {
                        const savedProgress = readingProgressByBook[book.id];
                        const progressLabel = savedProgress?.completed
                          ? "已读完"
                          : savedProgress
                            ? `继续读 · 第 ${savedProgress.chapter + 1} 章`
                            : "开始阅读";
                        return (
                          <button className="library-book-card" key={book.id} type="button" disabled={Boolean(bookOpening)} onClick={() => chooseBook(book)}>
                            <span className={`book-cover ${book.coverClass}`} aria-hidden="true"><b>{book.coverMark}</b><i>{book.author}</i></span>
                            <span className="library-book-copy">
                              <small>{book.category}</small>
                              <strong>{book.title}</strong>
                              <span>{book.author}</span>
                              <em className={savedProgress?.completed ? "completed" : ""}>{savedProgress?.completed && <Check />} {progressLabel}</em>
                            </span>
                            <ChevronRight className="library-book-arrow" aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="library-empty-grade"><BookOpen /><strong>这个年级的书正在整理</strong><span>管理员导入后会自动出现在这里。</span></div>
                  )}
                </section>
              </div>
            ) : (
              <>
                <header className="library-reader-header reader-top-bar">
                  <div className="reader-top-book">
                    <button type="button" onClick={returnToLibraryShelf}><ChevronLeft /> <span>返回书架</span></button>
                    <div><small>{selectedBook.grade} 年级 · 正在阅读</small><strong>《{selectedBook.title}》</strong></div>
                  </div>
                  {activeChapter && activePage ? (
                    <div className="reader-top-meta">
                      <div className="reader-chapter-summary" aria-label={`当前阅读：${activeChapter.title}，全书进度 ${overallProgressLabel}% ，第 ${selectedChapter + 1} 章，本章第 ${bookPage + 1} 页，共 ${activePages.length} 页`}>
                        <span className="reader-chapter-index">第 {selectedChapter + 1} 章</span>
                        <div className="reader-chapter-copy">
                          <strong title={activeChapter.title}>{activeChapter.title}</strong>
                          <div className="reader-chapter-progress-line">
                            <i className="reader-top-progress" aria-hidden="true"><b style={{ width: `${overallProgress}%` }} /></i>
                            <span>全书 {overallProgressLabel}%</span>
                            <small>本章 {bookPage + 1}/{activePages.length} 页</small>
                          </div>
                        </div>
                      </div>
                      <div className="reading-font-controls" role="group" aria-label="选择原文字号">
                        <span>字号</span>
                        {readingFontOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={game.readingFontSize === option.value}
                            title={option.hint}
                            onClick={() => setGame((current) => ({ ...current, readingFontSize: option.value }))}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : <span className="reader-top-author">{selectedBook.author}</span>}
                  <div className="reader-top-actions">
                    <button
                      className={chapterListOpen ? "active" : ""}
                      type="button"
                      aria-expanded={chapterListOpen}
                      aria-controls="reader-chapter-panel"
                      onClick={() => {
                        setReaderKnowledgeOpen(false);
                        setChapterListOpen((open) => !open);
                      }}
                    >
                      <BookOpen /> 章节
                    </button>
                    <button
                      className={readerKnowledgeOpen ? "active" : ""}
                      type="button"
                      aria-expanded={readerKnowledgeOpen}
                      aria-controls="reader-knowledge-panel"
                      onClick={() => {
                        setChapterListOpen(false);
                        setReaderSideTab("knowledge");
                        setReaderKnowledgeOpen((open) => !open);
                      }}
                    >
                      <Lightbulb /> 补充知识
                    </button>
                  </div>
                </header>

                <div className="reading-workspace complete-reader">
              {bookLoading || activeChapterLoading ? (
                <div className="book-loading-panel" role="status"><BookOpen /><strong>正在装订完整原文…</strong><span>龟龟正在识别章节和分页</span></div>
              ) : bookLoadError ? (
                <div className="book-loading-panel error"><BookOpen /><strong>原文加载失败</strong><span>{bookLoadError}</span><button type="button" onClick={() => setBookLoadError("")}>重新加载</button></div>
              ) : selectedBook.unavailableReason ? (
                <div className="licensed-content-panel">
                  <div className="original-status"><Lock /><span><small>原文区 · 尚未接入</small><h2>《{selectedBook.title}》需要授权原文</h2><p>{selectedBook.unavailableReason}</p></span></div>
                  <section className="separate-supplement" aria-label="独立导读区">
                    <span className="content-type-label supplement">导读与知识补充 · 不属于原文</span>
                    {selectedBook.pages.map((page) => <article key={page.heading}><h3>{page.heading}</h3><p>{page.body}</p></article>)}
                  </section>
                </div>
              ) : activeChapter && activePage ? (
                <>
                  {(chapterListOpen || readerKnowledgeOpen) && (
                    <button
                      className="reader-panel-backdrop"
                      type="button"
                      aria-label="关闭阅读辅助面板"
                      onClick={() => {
                        setChapterListOpen(false);
                        setReaderKnowledgeOpen(false);
                      }}
                    />
                  )}

                  {chapterListOpen && <nav id="reader-chapter-panel" className="chapter-drawer open reader-floating-panel" aria-label="章节目录">
                    <button className="chapter-drawer-toggle" type="button" onClick={() => setChapterListOpen(false)}><BookOpen /> 章节目录 <span>{selectedChapter + 1}/{selectedChapters.length}</span><X /></button>
                    <div className="chapter-list-scroll">
                      {selectedChapters.map((chapter, index) => (
                        <button key={chapter.id} type="button" className={index === selectedChapter ? "active" : ""} onClick={() => chooseChapter(index)}>
                          <span>{String(index + 1).padStart(2, "0")}</span><strong>{chapter.title}</strong><small>{chapter.pageCount ?? chapter.pages.length}页</small>
                        </button>
                      ))}
                    </div>
                  </nav>}

                  <article className={`reading-paper complete-reading-paper reading-font-${game.readingFontSize}`}>
                    {activePage.heading.trim() !== activeChapter.title.trim() && <h2>{activePage.heading}</h2>}
                    <div className="original-book-text" ref={readerTextRef}>
                      {activePage.images?.length ? (
                        <div className="book-inline-illustrations" aria-label="原书插图">
                          {activePage.images.map((illustration, index) => (
                            <figure key={`${illustration.src}-${index}`}>
                              <img src={`${BASE_PATH}${illustration.src}`} alt={illustration.alt} loading="lazy" decoding="async" />
                              <figcaption>原书插图</figcaption>
                            </figure>
                          ))}
                        </div>
                      ) : null}
                      {activePage.body.split("\n\n").map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                    </div>
                    <div className={`book-audio-bar reader-bottom-bar phase-${currentBookAudioPhase}`} aria-label="阅读与朗读控制">
                      <button className="icon-button" type="button" onClick={previousBookPage} disabled={selectedChapter === 0 && bookPage === 0} title="上一页" aria-label="上一页"><ChevronLeft /></button>
                      <div className="reader-bottom-audio">
                        <button
                          className="book-audio-toggle"
                          type="button"
                          onClick={() => void toggleBookAudio()}
                          disabled={currentBookAudioPhase === "loading" || currentBookAudioPhase === "unavailable" || !currentBookAudio}
                        >
                          {currentBookAudioPhase === "playing" ? <Pause /> : <Play />}
                          <span>{currentBookAudioPhase === "playing" ? "暂停朗读" : currentBookAudioPhase === "paused" ? "继续听" : "听这一页"}</span>
                        </button>
                        <span className="book-audio-status">
                          <Volume2 />
                          {currentBookAudioPhase === "loading"
                            ? "正在检查音频…"
                            : currentBookAudioPhase === "unavailable"
                              ? "温柔女声正在生成"
                              : currentBookAudio?.voiceLabel || "温柔女声"}
                        </span>
                        <div className="book-audio-rates" role="group" aria-label="选择朗读速度">
                          {[0.8, 1, 1.2].map((rate) => (
                            <button key={rate} type="button" aria-pressed={bookAudioRate === rate} onClick={() => updateBookAudioRate(rate)}>{rate}×</button>
                          ))}
                        </div>
                      </div>
                      <span className="reader-bottom-status">{currentChapterQuestionAnswered ? "本章思考已完成" : "进度已自动保存"}</span>
                      <button
                        className={`next-button ${bookPage === activePages.length - 1 && currentChapterQuestionAnswered ? "completed" : ""}`}
                        type="button"
                        onClick={nextBookPage}
                      >
                        {bookPage === activePages.length - 1 && currentChapterQuestionAnswered
                          ? completedChapterButtonLabel
                          : selectedChapter === selectedChapters.length - 1 && bookPage === activePages.length - 1
                            ? "读完全书"
                            : bookPage === activePages.length - 1 ? "读完本章" : "下一页"}
                        {bookPage === activePages.length - 1 && currentChapterQuestionAnswered ? <Check /> : <ChevronRight />}
                      </button>
                      {currentBookAudio && (
                        <audio
                          ref={bookAudioRef}
                          src={currentBookAudio.audioUrl}
                          preload="metadata"
                          onEnded={finishBookAudioPage}
                          onTimeUpdate={(event) => {
                            if (currentBookAudioPhase === "playing" && event.currentTarget.currentTime >= bookAudioPageEndRef.current - 0.08) finishBookAudioPage();
                          }}
                          onError={() => setBookAudioPhase("unavailable")}
                        />
                      )}
                    </div>
                  </article>

                  {readerKnowledgeOpen && <aside id="reader-knowledge-panel" className="reader-side-panel open reader-floating-panel" aria-label="伴读和知识补充">
                    <div className="reader-panel-heading"><strong>阅读补充</strong><button type="button" onClick={() => setReaderKnowledgeOpen(false)} aria-label="关闭补充知识"><X /></button></div>
                    <div className="reader-side-tabs" role="tablist">
                      <button type="button" role="tab" aria-selected={readerSideTab === "companion"} onClick={() => setReaderSideTab("companion")}>伴读</button>
                      <button type="button" role="tab" aria-selected={readerSideTab === "knowledge"} onClick={() => setReaderSideTab("knowledge")}>知识补充</button>
                    </div>
                    {readerSideTab === "knowledge" ? (
                      <div className="knowledge-only-panel">
                        <span className="content-type-label supplement">补充内容 · 非原文</span>
                        <h3>《{activeChapter.title}》知识补充</h3>
                        <p>{activeChapterKnowledge}</p>
                        <dl><div><dt>原文版本</dt><dd>{selectedBook.source?.label}</dd></div><div><dt>全书进度</dt><dd>{Math.round(overallProgress)}%</dd></div></dl>
                      </div>
                    ) : (
                      <div className="reading-companion-card embedded">
                        <div className="companion-card-heading"><img src={`${ASSET}/characters/turtle/turtle_reading_question.png`} alt="陪读的龟龟" /><div><small>伴读区 · 非原文</small><strong>{game.name}陪你读</strong></div></div>
                        <div className="companion-reward-rule"><Sparkles /><span>回答正确随机奖励 <strong>2 张旅行票或 2 张游玩票</strong></span></div>
                        <h3>这一章，龟龟陪你留心</h3>
                        {activeChapterPrompt ? <p className="reading-guide"><Lightbulb /> {activeChapterPrompt.guide}</p> : null}
                        {currentChapterQuestionAnswered ? (
                          <p className="answered-note"><Check /> 这一章已经认真想过啦，随机奖励也收好啦。</p>
                        ) : (
                          <p className="quiet-reading-note"><BookOpen /> 慢慢读到本章最后一页，龟龟会带着一个只属于这个故事的问题来找你。</p>
                        )}
                      </div>
                    )}
                  </aside>}
                </>
              ) : null}
                </div>

                <img
                  className="reading-turtle"
                  src={`${ASSET}/characters/turtle/${activePage && bookPage === activePages.length - 1 ? "turtle_reading_question.png" : "turtle_reading.png"}`}
                  alt={`${game.name}正在陪你读书`}
                />
              </>
            )}
          </section>
        )}

        {view === "mistakes" && (
          <section className="scene mistake-scene">
            <header className="mistake-header">
              <div className="mistake-title-art">
                <img src={`${ASSET}/ui/mistakes/title.png`} alt="错题屋，每一次错题，都是通往进步的小台阶" />
                <h1 className="visually-hidden">龟龟错题屋</h1>
              </div>
              <div className="mistake-overview" aria-label={`错题总数${game.mistakes.length}道，已掌握${mistakeStats.mastered}道，待复习${mistakeStats.review}道`}>
                <img className="mistake-overview-frame" src={`${ASSET}/ui/mistakes/stats-panel.png`} alt="" />
                <div className="mistake-stats">
                  <span><strong>{game.mistakes.length}</strong>错题总数</span>
                  <span><strong>{mistakeStats.mastered}</strong>已掌握</span>
                  <span><strong>{mistakeStats.review}</strong>待复习</span>
                </div>
                <button className="add-mistake-button" type="button" onClick={openMistakeForm} aria-label="记一道错题">
                  <img src={`${ASSET}/ui/mistakes/add-button.png`} alt="" />
                </button>
              </div>
            </header>

            <div className="mistake-toolbar">
              <div role="tablist" aria-label="错题状态">
                <button type="button" role="tab" aria-selected={mistakeFilter === "all"} onClick={() => setMistakeFilter("all")}>全部 <b>{game.mistakes.length}</b></button>
                <button type="button" role="tab" aria-selected={mistakeFilter === "review"} onClick={() => setMistakeFilter("review")}>⌛ 待复习 <b>{mistakeStats.review}</b></button>
                <button type="button" role="tab" aria-selected={mistakeFilter === "mastered"} onClick={() => setMistakeFilter("mastered")}><Check size={16} /> 已掌握 <b>{mistakeStats.mastered}</b></button>
              </div>
              <span><Star size={16} fill="currentColor" /> 复习一道错题胜过做 2 道新题</span>
            </div>

            <div className="mistake-content">
              {visibleMistakes.length ? (
                <div className="mistake-grid">
                  {visibleMistakes.map((mistake) => (
                    <article className="mistake-card" key={mistake.id}>
                      <div className="mistake-card-top">
                        <span>{mistake.subject}</span>
                        <strong className={`mistake-status status-${mistake.status}`}>
                          {mistake.status === "new" ? "新收录" : mistake.status === "reviewing" ? "待复习" : "已掌握"}
                        </strong>
                      </div>
                      {mistake.imageData && <img src={mistake.imageData} alt="错题照片" />}
                      <small>{mistake.date} · 复习 {mistake.reviewCount} 次</small>
                      <h2>{mistake.question}</h2>
                      <p><b>卡住原因</b>{mistake.cause}</p>
                      <div className="mistake-card-actions">
                        <button type="button" onClick={() => startMistakeReview(mistake)}><RotateCcw /> {mistake.status === "mastered" ? "再练一次" : "开始复习"}</button>
                        <button type="button" onClick={() => deleteMistake(mistake)} aria-label={`删除${mistake.question}`} title="删除错题"><Trash2 /></button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mistake-empty">
                  <img src={`${ASSET}/ui/mistakes/empty-turtle.png`} alt="正在认真记录的龟龟" />
                  <h2>{game.mistakes.length ? "这里暂时没有对应的错题" : "第一道错题正在等你收进来"}</h2>
                  <p>{game.mistakes.length ? "换一个分类看看吧。" : "错题不是失败，是下一次进步的线索。"}</p>
                  {!game.mistakes.length && (
                    <button type="button" onClick={openMistakeForm} aria-label="记录一道错题">
                      <img src={`${ASSET}/ui/mistakes/add-button.png`} alt="" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {view === "chat" && (
          <section className="scene chat-scene">
            <div className="chat-panel">
              <header className="chat-panel-header">
                <img src={`${ASSET}/characters/turtle/turtle_waving.png`} alt="" />
                <div><small>今日悄悄话 · 我的陪伴伙伴</small><strong>{game.name}</strong></div>
                <span><i /> 在线陪你聊</span>
              </header>
              <div className="prompt-area">
                <small>今天想聊什么？</small>
                <div className="prompt-chips" aria-label="快速话题">
                  <button type="button" onClick={() => setChatInput("今天我学会了…")}><Lightbulb /><span>新发现</span></button>
                  <button type="button" onClick={() => setChatInput("我读了一本书")}><BookOpen /><span>一本好书</span></button>
                  <button type="button" onClick={() => setChatInput("我遇到一道难题")}><Sparkles /><span>有点难</span></button>
                  <button type="button" onClick={() => setChatInput("我和朋友一起玩")}><Users /><span>朋友趣事</span></button>
                </div>
              </div>
              <div className="message-list" aria-live="polite" ref={messageListRef}>
                {game.chatMessages.map((message) => (
                  <div key={message.id} className={`message ${message.role}`}>
                    {message.role === "turtle" && (
                      <img src={`${ASSET}/characters/turtle/turtle_idle_front.png`} alt="" />
                    )}
                    <div className="message-content">
                      {message.role === "turtle" && <small>{game.name}</small>}
                      <p>{message.text}</p>
                    </div>
                  </div>
                ))}
                {chatThinking && (
                  <div className="message turtle thinking-message">
                    <img src={`${ASSET}/characters/turtle/turtle_thinking.png`} alt="" />
                    <div className="message-content"><small>{game.name}正在想</small><p><span /><span /><span /></p></div>
                  </div>
                )}
              </div>
              <div className="chat-composer">
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && void sendChat()}
                  placeholder="想说什么？"
                  aria-label="输入想对龟龟说的话"
                  maxLength={500}
                  disabled={chatThinking}
                />
                <button
                  className={`icon-button ${voicePhase !== "idle" ? "listening" : ""}`}
                  type="button"
                  onClick={() => void beginVoiceInput("chat")}
                  title={voicePhase !== "idle" ? "正在处理语音" : "语音输入"}
                  aria-label={voicePhase !== "idle" ? "正在处理语音" : "语音输入"}
                  disabled={voicePhase !== "idle" || chatThinking}
                >
                  {voicePhase !== "idle" ? <MicOff /> : <Mic />}
                </button>
                <button className="send-button" type="button" onClick={() => void sendChat()} aria-label="发送" disabled={chatThinking || !chatInput.trim()}>
                  <Send />
                </button>
              </div>
            </div>
          </section>
        )}

        {view === "travel" && (
          <section className="scene travel-scene">
            <div className="page-heading travel-heading">
              <span className="eyebrow"><Compass size={16} /> 龟龟旅行地图</span>
              <h1>下一站，去哪里发现新知识？</h1>
            </div>

            {destinations.map((destination) => (
              <button
                key={destination.id}
                className={`map-pin ${destination.position} ${game.stars < destination.requiredStars ? "locked" : ""} ${selectedDestination.id === destination.id ? "selected" : ""}`}
                type="button"
                onClick={() => setSelectedDestination(destination)}
                aria-label={`${game.stars >= destination.requiredStars ? "选择" : "查看锁定地点"}${destination.name}，${destination.requiredStars}颗星解锁`}
              >
                <img src={destination.locationArt} alt="" />
                <span className="pin-name">{destination.name}</span>
                {game.stars < destination.requiredStars && <span className="pin-lock"><Lock size={12} /> {destination.requiredStars}</span>}
              </button>
            ))}

            <aside className="travel-card">
              <img className="destination-art" src={selectedDestination.locationArt} alt={`${selectedDestination.name}地点插画`} />
              <div>
                <small>{selectedDestinationUnlocked ? "本次目的地" : "尚未解锁"}</small>
                <h2>{selectedDestination.name}</h2>
                <p>{selectedDestination.note}</p>
                <dl>
                  <div><dt>旅行时间</dt><dd>{selectedDestination.duration}</dd></div>
                  <div><dt>解锁条件</dt><dd>{selectedDestination.requiredStars} 颗星</dd></div>
                  <div><dt>可能带回</dt><dd>{selectedDestination.reward}（共 {selectedDestination.knowledgeCards.length} 张，优先不重复）</dd></div>
                </dl>
                {!selectedDestinationUnlocked && <p className="unlock-note">再获得 {selectedDestinationMissingStars} 颗星就能出发</p>}
                <button type="button" onClick={startTravel} disabled={!!traveling || !selectedDestinationUnlocked || game.tickets < 1}>
                  {selectedDestinationUnlocked ? <Compass /> : <Lock />}
                  {traveling ? "旅行中…" : !selectedDestinationUnlocked ? `还差 ${selectedDestinationMissingStars} 颗星` : game.tickets < 1 ? "旅行票不足" : "使用 1 张旅行票出发"}
                </button>
              </div>
            </aside>

            {traveling && (
              <div className="traveling-banner" role="status">
                <img src={`${ASSET}/characters/turtle/turtle_travel_start.png`} alt="出发旅行的龟龟" />
                <div>
                  <strong>正在前往{traveling.name}</strong>
                  <span>沿途的新发现正在装进行囊…</span>
                  <div><i style={{ width: `${travelProgress}%` }} /></div>
                </div>
                <b>{Math.max(0, Math.ceil((100 - travelProgress) * 0.08))}s</b>
              </div>
            )}
          </section>
        )}

        {view === "journal" && (
          <section className="scene journal-scene">
            <img className="journal-scene-background" src={`${ASSET}/optimized/ui/journal/background.webp`} alt="" decoding="async" />
            <div
              className="journal-board"
              style={{ "--journal-frame-image": `url("${ASSET}/optimized/ui/journal/knowledge-card-background.webp")` } as React.CSSProperties}
            >
              <header className="journal-header">
                <div className="journal-title">
                  <div className="journal-title-badge">
                    <img src={`${ASSET}/ui/journal/growth-journal-emblem.png`} alt="成长手账徽章" />
                    <strong>成长手账</strong>
                  </div>
                  <h1>我们一起留下的足迹</h1>
                  <img src={`${ASSET}/ui/journal/title-vine.png`} alt="" />
                </div>
                <div className={`record-tabs tab-${recordTab}`} role="tablist" aria-label="手账分类">
                  <img src={`${ASSET}/ui/journal/tabs-${recordTab === "items" ? "items" : recordTab}-active.png`} alt="" />
                  <button type="button" role="tab" aria-selected={recordTab === "travel"} onClick={() => setRecordTab("travel")}>旅行手账</button>
                  <button type="button" role="tab" aria-selected={recordTab === "reading"} onClick={() => setRecordTab("reading")}>阅读记录</button>
                  <button type="button" role="tab" aria-selected={recordTab === "items"} onClick={() => setRecordTab("items")}>小背包</button>
                </div>
              </header>

              <div className="journal-content">
                {recordTab === "travel" && (
                  journalTravelItems.length ? (
                    <div className="journal-travel-layout">
                      <div className="journal-travel-grid">
                        {journalTravelItems.map((record, index) => {
                          const discovery = discoveryForRecord(record);
                          const destination = discovery?.destination;
                          return (
                            <article className="journal-travel-card" key={record.id}>
                              <img className="journal-card-frame" src={`${ASSET}/ui/journal/travel-card-frame.png`} alt="" />
                              <img className="journal-card-pin" src={`${ASSET}/ui/journal/pushpin.png`} alt="" />
                              <img className="journal-card-sticker" src={`${ASSET}/ui/journal/location-sticker.png`} alt="" />
                              {discovery ? (
                                <KnowledgeCardPreview card={discovery.card} className="journal-card-photo" />
                              ) : (
                                <img className="journal-card-photo" src={record.photo} alt={`${record.destination}旅行照片`} loading="lazy" decoding="async" />
                              )}
                              <div className="journal-card-copy">
                                <small>{record.date}</small>
                                <h2>{record.destination}</h2>
                                <p>带回了：{record.reward}</p>
                              </div>
                              <img className="journal-card-stamp" src={`${ASSET}/ui/journal/${destination?.id === "beach" || index % 2 ? "shell" : "leaf"}-stamp.png`} alt="" />
                              {discovery && (
                                <button className="journal-card-action" type="button" onClick={() => setKnowledgeOpen(discovery)}>
                                  <img src={`${ASSET}/ui/journal/card-action-button.png`} alt="" />
                                  <span><Lightbulb /> 查看知识卡</span>
                                </button>
                              )}
                            </article>
                          );
                        })}
                      </div>
                      <img className="journal-dotted-path" src={`${ASSET}/ui/journal/dotted-travel-path.png`} alt="" />
                    </div>
                  ) : (
                    <div className="journal-empty-travel">
                      <img className="journal-empty-path" src={`${ASSET}/ui/journal/travel-path-scene.png`} alt="" />
                      <img className="journal-empty-turtle" src={`${ASSET}/ui/journal/traveler-turtle.png`} alt="背着行囊准备出发的龟龟" />
                      <img className="journal-empty-signpost" src={`${ASSET}/ui/journal/signpost.png`} alt="森林小径和湖畔营地路牌" />
                      <img className="journal-empty-photo" src={`${ASSET}/ui/journal/empty-photo.png`} alt="等待贴上旅行照片的相纸" />
                      <div className="journal-empty-copy">
                        <h2>第一张旅行照片正在等你</h2>
                        <p>挑一个目的地，龟龟会把沿途的新发现带回来。</p>
                        <button type="button" onClick={() => navigateTo("travel")}><span>去旅行</span><ChevronRight /></button>
                      </div>
                    </div>
                  )
                )}

                {recordTab === "reading" && (
                  <div className="journal-reading-list">
                    {game.readingRecords.length ? game.readingRecords.slice(0, 5).map((record) => (
                      <article className="journal-reading-card" key={record.id}>
                        <div className="journal-reading-visual">
                          <img src={journalReadingArtFor(record.title, importedBooks)} alt={`《${record.title}》主题阅读记录书本`} loading="lazy" decoding="async" />
                          <span><Star fill="currentColor" /></span>
                        </div>
                        <div className="journal-reading-copy">
                          <small>{record.date} · 已读完</small>
                          <h2>{record.title}</h2>
                          <p>{record.summary}</p>
                          <blockquote>“{record.answer}”</blockquote>
                        </div>
                      </article>
                    )) : (
                      <div className="journal-empty-reading">
                        <img src={`${ASSET}/ui/journal/reading-record-book.png`} alt="等待记录的故事书" />
                        <div><h2>第一篇阅读小结正在等你</h2><p>选一本喜欢的书，和龟龟一起读完一个故事吧。</p><button type="button" onClick={() => navigateTo("library")}>去书房 <ChevronRight /></button></div>
                      </div>
                    )}
                    {game.readingRecords.length > 0 && <div className="journal-reading-placeholder"><BookOpen /><span>下一次阅读记录会出现在这里</span></div>}
                  </div>
                )}

                {recordTab === "items" && (
                  <>
                    <div className="journal-inventory-heading"><Backpack /><strong>背包</strong><span>{journalUnlockedItems} / 12</span></div>
                    <div className="inventory-grid journal-inventory-grid">
                      <article><div className="item-art"><img src={`${ASSET}/objects/fruit_basket.png`} alt="果篮" /></div><strong>野外果子</strong><span>× {game.fruits}</span></article>
                      <article><div className="item-art star-item"><Star /></div><strong>成长星星</strong><span>× {game.stars}</span></article>
                      <article><div className="item-art ticket-item"><img src={`${ASSET}/legacy/travel/travel_ticket.png`} alt="旅行票" /></div><strong>旅行票</strong><span>× {game.tickets}</span></article>
                      <article><div className="item-art play-ticket-item"><img src={`${ASSET}/ui/icons/play-ticket-pixel.png`} alt="游玩票" /></div><strong>游玩票</strong><span>× {game.playTickets}</span></article>
                      {journalTravelItems.map((record) => {
                        const discovery = discoveryForRecord(record);
                        return discovery ? (
                          <button className="inventory-card" type="button" key={record.id} onClick={() => setKnowledgeOpen(discovery)}>
                            <div className="item-art"><KnowledgeCardPreview card={discovery.card} /></div>
                            <strong>{record.reward}</strong><span>来自{record.destination}</span>
                          </button>
                        ) : null;
                      })}
                      {Array.from({ length: Math.max(0, 12 - journalUnlockedItems) }, (_, index) => (
                        <article className="journal-locked-item" key={`locked-item-${index}`} aria-label="尚未解锁的背包格子">
                          <Lock /><Sparkles />
                          <strong>等待新发现</strong><span>去旅行解锁</span>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        )}
      </section>

      {!immersiveReader && <nav className="bottom-nav" aria-label="主要功能">
        <NavButton active={view === "home"} disabled={navigationLocked && !busy && !hideTarget} label="学习屋" art={`${ASSET}/ui/nav-v2/learning-house.png`} onClick={() => navigateTo("home")} />
        <NavButton active={view === "library"} disabled={navigationLocked} label="书房" art={`${ASSET}/ui/nav-v2/library.png`} onClick={() => navigateTo("library")} />
        <NavButton active={view === "mistakes"} disabled={navigationLocked} label="错题屋" art={`${ASSET}/ui/nav-v2/mistakes.png`} onClick={() => navigateTo("mistakes")} />
        <NavButton active={view === "chat"} disabled={navigationLocked} label="聊天" art={`${ASSET}/ui/nav-v2/chat.png`} onClick={() => navigateTo("chat")} />
        <NavButton active={view === "travel"} disabled={navigationLocked && !traveling} label="旅行" art={`${ASSET}/ui/nav-v2/travel.png`} onClick={() => navigateTo("travel")} />
        <NavButton active={view === "journal"} disabled={navigationLocked} label="手帐" art={`${ASSET}/ui/nav-v2/journal.png`} onClick={() => navigateTo("journal")} />
      </nav>}

      {toast && <div className={`toast ${view === "chat" ? "chat-toast" : ""}`} role="status"><Sparkles /> {toast}</div>}

      {voicePhase !== "idle" && (
        <div className="voice-listening-backdrop" role="presentation">
          <section className="voice-listening-panel" role="dialog" aria-modal="true" aria-labelledby="voice-panel-title">
            <button className="voice-panel-close" type="button" onClick={cancelVoiceInput} aria-label="取消语音输入"><X /></button>
            <img src={`${ASSET}/characters/turtle/turtle_thinking.png`} alt="认真倾听的龟龟" />
            <div className={`voice-orb ${voicePhase}`} style={{ "--voice-level": voiceLevel } as React.CSSProperties}>
              {voicePhase === "recording" ? <Mic /> : <Sparkles />}
            </div>
            <div className="voice-panel-copy">
              <span>{voiceTarget === "chat" ? "说给龟龟听" : voiceTarget === "reading" ? "回答阅读问题" : "完成探险表达"}</span>
              <h2 id="voice-panel-title">{voicePhase === "recording" ? "我在认真听…" : "正在听懂你的话…"}</h2>
              <p>{voicePhase === "recording" ? "说完后点击“完成”，最多录制 30 秒" : "录音已结束，很快就会变成文字"}</p>
            </div>
            <div className="voice-wave" aria-hidden="true">
              {Array.from({ length: 15 }, (_, index) => (
                <i key={index} style={{ height: `${12 + voiceLevel * (index % 3 === 1 ? 48 : index % 3 === 0 ? 30 : 40)}px` }} />
              ))}
            </div>
            <strong className="voice-clock">00:{String(voiceSeconds).padStart(2, "0")}</strong>
            {voicePhase === "recording" && (
              <div className="voice-panel-actions">
                <button type="button" onClick={cancelVoiceInput}><X /> 取消</button>
                <button type="button" onClick={() => void finishVoiceInput()}><Check /> 完成</button>
              </div>
            )}
          </section>
        </div>
      )}

      {chapterQuestionOpen && activeChapter && activeChapterPrompt && (
        <div className="modal-backdrop chapter-question-backdrop" role="presentation">
          <section className="modal question-modal chapter-question-modal" role="dialog" aria-modal="true" aria-labelledby="chapter-question-title">
            <div className="chapter-question-heading">
              <img src={`${ASSET}/characters/turtle/turtle_reading_question.png`} alt="正在提问的龟龟" />
              <div>
                <span className="modal-kicker">读完第 {selectedChapter + 1} 章 · 《{activeChapter.title}》</span>
                <h2 id="chapter-question-title">龟龟的问题</h2>
              </div>
            </div>
            <p className="chapter-question-copy">{activeChapterPrompt.question}</p>

            {!readingFeedback ? (
              <>
                <p className="chapter-question-guide"><Lightbulb /> <span><strong>想一想</strong>{activeChapterPrompt.guide}</span></p>
                <label className="chapter-answer-field">
                  <span>把你的想法告诉龟龟</span>
                  <textarea
                    value={readingAnswer}
                    onChange={(event) => setReadingAnswer(event.target.value)}
                    maxLength={500}
                    placeholder="可以联系故事里的细节，说说你为什么这样想……"
                    disabled={companionLoading}
                    autoFocus
                  />
                </label>
                <div className="modal-actions chapter-question-actions">
                  <button className="think-again-button" type="button" onClick={thinkAgainChapterQuestion} disabled={companionLoading}><BookOpen /> 我再想想</button>
                  <button className="skip-question-button" type="button" onClick={skipChapterQuestion} disabled={companionLoading}>这次先跳过</button>
                  <button className="voice-button" type="button" onClick={() => void beginVoiceInput("reading")} disabled={companionLoading || voicePhase !== "idle"}><Mic /> 语音回答</button>
                  <button className="primary-button" type="button" onClick={() => void submitReadingAnswer()} disabled={companionLoading || !readingAnswer.trim()}><Send /> {companionLoading ? "龟龟正在想…" : "发给龟龟看看"}</button>
                </div>
              </>
            ) : readingEvaluation === "error" ? (
              <>
                <div className="chapter-reading-feedback error" role="alert"><Lightbulb /><p><strong>龟龟暂时没听清</strong>{readingFeedback}</p></div>
                <div className="modal-actions chapter-feedback-actions">
                  <button className="skip-question-button" type="button" onClick={skipChapterQuestion}>这次先跳过</button>
                  <button className="primary-button" type="button" onClick={retryChapterQuestion}><RotateCcw /> 重新发送</button>
                </div>
              </>
            ) : (
              <>
                <div className={`chapter-reading-feedback ${readingEvaluation}`} role="status">
                  {readingEvaluation === "correct" ? <Sparkles /> : <Lightbulb />}
                  <p><strong>{readingEvaluation === "correct" ? "龟龟的称赞" : "龟龟的思考"}</strong>{readingFeedback}</p>
                </div>
                <div className="modal-actions chapter-feedback-actions">
                  {readingEvaluation === "incorrect" && <button className="skip-question-button" type="button" onClick={retryChapterQuestion}><RotateCcw /> 再想一次</button>}
                  <button className="primary-button" type="button" onClick={continueAfterChapterQuestion}>
                    {selectedChapter === selectedChapters.length - 1 ? "收下这份思考，看看阅读小结" : "收下这份思考，进入下一章"}<ChevronRight />
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {fruitPicker && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setFruitPicker(false)}>
          <section className="modal fruit-modal" role="dialog" aria-modal="true" aria-labelledby="fruit-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setFruitPicker(false)} aria-label="关闭"><X /></button>
            <span className="modal-kicker">今日已摘 {dailyFruitPicking.picked}/5 · 果篮还有 {game.fruits} 个</span>
            <h2 id="fruit-title">摘果喂食</h2>
            <p>{game.hunger < 16 ? `${game.name}现在还不太饿，也可以把果子留在篮子里。` : fruitPickingRemaining > 0 ? `这次摘下 1 个，今天还可以再摘 ${fruitPickingRemaining} 个。` : "今天的 5 个果子已经摘完，选一个喂给龟龟吧。"}</p>
            <div className="fruit-options">
              <button type="button" onClick={() => feedFruit("红果子")}><img src={`${ASSET}/objects/fruit_red.png`} alt="红果子" /><span>红果子</span></button>
              <button type="button" onClick={() => feedFruit("橙果子")}><img src={`${ASSET}/objects/fruit_orange.png`} alt="橙果子" /><span>橙果子</span></button>
              <button type="button" onClick={() => feedFruit("蓝果子")}><img src={`${ASSET}/objects/fruit_blue.png`} alt="蓝果子" /><span>蓝果子</span></button>
            </div>
          </section>
        </div>
      )}

      {editingName && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditingName(false)}>
          <section className="modal name-modal" role="dialog" aria-modal="true" aria-labelledby="name-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setEditingName(false)} aria-label="关闭"><X /></button>
            <img src={`${ASSET}/characters/turtle/turtle_waving.png`} alt="挥手的龟龟" />
            <h2 id="name-title">给伙伴起个名字</h2>
            <p>最多输入 8 个字，以后它会用这个名字陪着你。</p>
            <div className="name-entry">
              <input value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={8} autoFocus aria-label="龟龟名字" />
              <button type="button" onClick={saveName}><Check /> 保存名字</button>
            </div>
          </section>
        </div>
      )}

      {mistakeFormOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeMistakeForm}>
          <section className={`modal mistake-form-modal mistake-capture-modal${mistakeDraft ? " has-draft" : ""}`} role="dialog" aria-modal="true" aria-labelledby="mistake-form-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" disabled={mistakeScanning || mistakeSaving} onClick={closeMistakeForm} aria-label="关闭"><X /></button>
            {!mistakeDraft && <img src={`${ASSET}/characters/turtle/turtle_reading_question.png`} alt="帮你整理错题的龟龟" />}
            <span className="modal-kicker">龟龟错题屋</span>
            <h2 id="mistake-form-title">{mistakeDraft ? "和龟龟一起核对一下" : "拍下错题，龟龟来整理"}</h2>
            <p>{mistakeDraft ? "识别结果可以修改。确认无误后，才会收进你的错题本。" : "龟龟会整理题目、原答案、正确思路和可能的错因。"}</p>
            {mistakeScanning ? (
              <div className="mistake-capture-loading" role="status"><Sparkles /><strong>正在读题和整理步骤…</strong><span>等一下还可以亲自核对和修改</span></div>
            ) : mistakeDraft ? (
              <div className="mistake-draft-review">
                <img className="mistake-draft-photo" src={mistakeDraft.imageData} alt="准备收录的错题照片" />
                {mistakeDraft.result.notice && <p className="mistake-draft-notice"><Lightbulb /> <span><strong>这里请你特别核对</strong>{mistakeDraft.result.notice}</span></p>}
                <div className="mistake-draft-fields">
                  <label><span>学科</span><select value={mistakeDraft.result.subject} onChange={(event) => updateMistakeDraft("subject", event.target.value)}>{mistakeSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></label>
                  <label><span>可能的错因</span><select value={mistakeDraft.result.cause} onChange={(event) => updateMistakeDraft("cause", event.target.value)}>{mistakeCauses.map((cause) => <option key={cause} value={cause}>{cause}</option>)}</select></label>
                  <label className="full"><span>题目</span><textarea value={mistakeDraft.result.question} onChange={(event) => updateMistakeDraft("question", event.target.value)} maxLength={600} /></label>
                  <label className="full"><span>上次写的答案</span><textarea value={mistakeDraft.result.wrongAnswer} onChange={(event) => updateMistakeDraft("wrongAnswer", event.target.value)} maxLength={500} placeholder="照片里没有写答案，可以留空" /></label>
                  <label className="full"><span>正确思路和答案</span><textarea value={mistakeDraft.result.correction} onChange={(event) => updateMistakeDraft("correction", event.target.value)} maxLength={800} /></label>
                </div>
                {mistakeScanNotice && mistakeScanNotice !== mistakeDraft.result.notice && <p className="mistake-capture-error" role="alert">{mistakeScanNotice}</p>}
                <div className="mistake-modal-actions">
                  <button type="button" disabled={mistakeSaving} onClick={() => { setMistakeDraft(null); setMistakeScanNotice(""); }}><RotateCcw /> 重新拍照</button>
                  <button type="button" disabled={mistakeSaving} onClick={() => void confirmMistakeDraft()}>{mistakeSaving ? <Sparkles /> : <Check />} {mistakeSaving ? "正在收好…" : "确认收进错题本"}</button>
                </div>
              </div>
            ) : (
              <div className="mistake-capture-actions">
                <label><Camera /><strong>拍照录题</strong><span>打开摄像头拍下错题</span><input type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void attachMistakePhoto(file); }} /></label>
                <label><Upload /><strong>上传图片</strong><span>从相册选择错题照片</span><input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void attachMistakePhoto(file); }} /></label>
              </div>
            )}
            {!mistakeScanning && mistakeScanNotice && <p className="mistake-capture-error" role="alert">{mistakeScanNotice}</p>}
            <small className="mistake-capture-privacy">建议只框住一道题，并避开姓名和学校信息。</small>
          </section>
        </div>
      )}

      {reviewMistake && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal mistake-review-modal" role="dialog" aria-modal="true" aria-labelledby="mistake-review-title">
            <button className="modal-close" type="button" disabled={reviewScanning} onClick={closeMistakeReview} aria-label="关闭"><X /></button>
            <div className="mistake-review-heading">
              <img src={`${ASSET}/characters/turtle/turtle_reading_question.png`} alt="陪你复习的龟龟" />
              <div><span className="modal-kicker">{reviewMistake.subject} · 第 {reviewMistake.reviewCount + (reviewOutcome?.saved ? 0 : 1)} 次挑战</span><h2 id="mistake-review-title">在纸上重新做一遍</h2></div>
            </div>
            {reviewMistake.imageData && <img className="review-question-photo" src={reviewMistake.imageData} alt="错题照片" />}
            <div className="review-question"><small>题目</small><p>{reviewMistake.question}</p></div>
            {!reviewOutcome && !reviewScanning && <div className="mistake-review-instruction"><Camera /><div><strong>写好答案和完整步骤，再拍一张清晰照片</strong><span>请拍全整张纸，避开姓名和学校信息。龟龟会识别步骤并帮你检查。</span></div></div>}
            {reviewPhotoPreview && <img className="review-answer-photo" src={reviewPhotoPreview} alt="这次重新作答的照片" />}
            {reviewScanning ? (
              <div className="mistake-capture-loading" role="status"><Sparkles /><strong>龟龟正在看你的答案和步骤…</strong><span>会独立验算，不只看最后答案</span></div>
            ) : reviewOutcome ? (
              <div className={`mistake-review-result ${reviewOutcome.result.readable ? (reviewOutcome.result.correct ? "correct" : "incorrect") : "unreadable"}`}>
                {!reviewOutcome.result.readable ? (
                  <>
                    <h3><Camera /> 再拍清楚一点</h3>
                    <p>{reviewOutcome.result.notice || reviewScanNotice || "龟龟没有看清答案或完整步骤。"}</p>
                    <button className="review-retry-button" type="button" onClick={resetMistakeReviewPhoto}><RotateCcw /> 重新拍照</button>
                  </>
                ) : (
                  <>
                    <h3>{reviewOutcome.result.correct ? <Star /> : <Lightbulb />} {reviewOutcome.result.correct ? "龟龟的称赞" : "龟龟的思考"}</h3>
                    {reviewOutcome.result.recognizedAnswer && <div className="recognized-answer"><small>龟龟认出的答案</small><p>{reviewOutcome.result.recognizedAnswer}</p></div>}
                    {reviewOutcome.result.recognizedSteps && <div className="recognized-steps"><small>龟龟认出的步骤</small><p>{reviewOutcome.result.recognizedSteps}</p></div>}
                    <div className="review-ai-feedback"><strong>{reviewOutcome.result.correct ? "做得真棒！" : "可以这样修改"}</strong><p>{reviewOutcome.result.feedback}</p></div>
                    {!reviewOutcome.result.correct && <div className="correction-panel"><small>上次卡住：{reviewMistake.cause}</small><strong>参考思路</strong><p>{reviewMistake.correction}</p></div>}
                    {reviewOutcome.result.correct && Boolean(reviewOutcome.review?.rewardStars || reviewOutcome.review?.rewardPlayTickets) && (
                      <p className="mistake-review-reward"><Star fill="currentColor" /> 第一次掌握，获得 {reviewOutcome.review?.rewardStars} 颗成长星星和 {reviewOutcome.review?.rewardPlayTickets} 张游玩票</p>
                    )}
                    <div className="review-result-actions">
                      {!reviewOutcome.result.correct && <button type="button" onClick={resetMistakeReviewPhoto}><RotateCcw /> 重新拍照再试</button>}
                      <button type="button" onClick={closeMistakeReview}><Check /> {reviewOutcome.result.correct ? "完成复习" : "稍后再练"}</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="mistake-review-upload mistake-capture-actions">
                <label><Camera /><strong>拍答案照片</strong><span>拍下手写答案和步骤</span><input type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void attachMistakeReviewPhoto(file); }} /></label>
                <label><Upload /><strong>从相册选择</strong><span>选择刚拍好的作答照片</span><input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void attachMistakeReviewPhoto(file); }} /></label>
              </div>
            )}
            {!reviewScanning && reviewScanNotice && !reviewOutcome && <p className="mistake-capture-error" role="alert">{reviewScanNotice}</p>}
          </section>
        </div>
      )}

      {summaryOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal summary-modal" role="dialog" aria-modal="true" aria-labelledby="summary-title">
            <button className="modal-close" type="button" onClick={resetReading} aria-label="关闭"><X /></button>
            <div className="summary-celebration">
              <img src={`${ASSET}/characters/turtle/turtle_happy_hearts.png`} alt="开心的龟龟" />
              <div><span className="modal-kicker">阅读完成 · +3 星星 · +1 旅行票 · +1 游玩票</span><h2 id="summary-title">今天的阅读小结</h2></div>
            </div>
            <div className="summary-block"><small>今天读了</small><strong>《{selectedBook.title}》</strong></div>
            <div className="summary-block"><small>故事讲了</small><p>{selectedBook.summary}</p></div>
            <div className="summary-block"><small>我学到</small><p>{selectedBook.knowledge}</p></div>
            <div className="turtle-note"><Sparkles /> 你愿意停下来想一想、讲一讲，这就是很棒的阅读！</div>
            <button className="primary-button full-button" type="button" onClick={() => { resetReading(); navigateTo("journal"); setRecordTab("reading"); }}><BookOpen /> 收进成长手账</button>
          </section>
        </div>
      )}

      {travelReward && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal reward-modal" role="dialog" aria-modal="true" aria-labelledby="reward-title">
            <button className="modal-close" type="button" onClick={() => setTravelReward(null)} aria-label="关闭"><X /></button>
            <header className="travel-reward-heading">
              <img className="returning-turtle" src={`${ASSET}/characters/turtle/turtle_travel_return.png`} alt="旅行回来的龟龟" />
              <div>
                <span className="modal-kicker">旅行平安归来 · +4 星星{travelReward.playTicketAwarded ? " · 幸运带回 1 张游玩票" : ""}</span>
                <h2 id="reward-title">从{travelReward.destination.name}带回了新发现</h2>
                <p>龟龟找到了一张新的知识卡，快看看这次带回了什么！</p>
              </div>
            </header>
            <div className="travel-reward-showcase">
              <figure className="travel-reward-card-frame">
                <span><Sparkles aria-hidden="true" /> 本次获得的知识卡</span>
                <img className="travel-reward-card-image" src={travelReward.card.image} alt={`本次获得的${travelReward.card.title}`} decoding="async" />
                <figcaption>{travelReward.card.title}</figcaption>
              </figure>
              <div className="travel-reward-details">
                <small>本次随机收获</small>
                <strong>{travelReward.card.title}</strong>
                <ul>
                  {travelReward.card.facts.map((fact) => <li key={fact}><Star fill="currentColor" aria-hidden="true" /> {fact}</li>)}
                </ul>
                <div className="travel-extra-reward">
                  <img src={`${ASSET}/objects/fruit_orange.png`} alt="" />
                  <span>还带回了 <b>1 个野外果子</b></span>
                </div>
                {travelReward.playTicketAwarded && (
                  <div className="travel-extra-reward play-ticket">
                    <img src={`${ASSET}/ui/icons/play-ticket-pixel.png`} alt="" />
                    <span>随机带回 <b>1 张游玩票</b></span>
                  </div>
                )}
                <button className="knowledge-link" type="button" onClick={() => { playSound("card-unlock"); setKnowledgeOpen(travelReward); }}><img src={`${ASSET}/legacy/icons/knowledge_card.png`} alt="" /> 展开查看知识卡</button>
              </div>
            </div>
            <button className="primary-button full-button" type="button" onClick={() => { setTravelReward(null); navigateTo("journal"); setRecordTab("travel"); }}><Backpack /> 放进旅行手账</button>
          </section>
        </div>
      )}

      {knowledgeOpen && (
        <div className="modal-backdrop knowledge-backdrop" role="presentation" onMouseDown={() => setKnowledgeOpen(null)}>
          <section
            className="modal knowledge-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="knowledge-title"
            style={{ "--knowledge-card-background": `url("${ASSET}/optimized/ui/journal/knowledge-card-background.webp")` } as React.CSSProperties}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="modal-close" type="button" onClick={() => setKnowledgeOpen(null)} aria-label="关闭"><X /></button>
            <div className="knowledge-visual"><KnowledgeArt card={knowledgeOpen.card} /></div>
            <div className="knowledge-copy">
              <span className="modal-kicker">{knowledgeOpen.destination.name} · 旅行知识卡</span>
              <h2 id="knowledge-title">{knowledgeOpen.card.title}</h2>
              {knowledgeOpen.card.facts.map((fact) => <p key={fact}><Star /> {fact}</p>)}
              <div className="turtle-note"><Sparkles /> 下次向别人讲一讲，你会记得更牢。</div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
