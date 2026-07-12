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
  Edit3,
  Lightbulb,
  Lock,
  MapPinned,
  MessageCircle,
  Mic,
  MicOff,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type View = "home" | "library" | "mistakes" | "chat" | "travel" | "journal";
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

type DailyTaskKey = "feed" | "swim" | "reading" | "mistake";
type DailyMistakeMode = "add" | "review";
type DailyTaskValues = Record<DailyTaskKey, number>;
type DailyPlan = {
  dateKey: string;
  mistakeMode: DailyMistakeMode;
  targets: DailyTaskValues;
  progress: DailyTaskValues;
  rewardClaimed: boolean;
};

type GameState = {
  name: string;
  hunger: number;
  cleanliness: number;
  boredom: number;
  fruits: number;
  stars: number;
  tickets: number;
  lastSeen: number;
  readingRecords: ReadingRecord[];
  travelRecords: TravelRecord[];
  chatMessages: ChatMessage[];
  activeTravel: ActiveTravel | null;
  mistakes: MistakeRecord[];
  dailyPlan: DailyPlan;
};

type Book = {
  id: string;
  title: string;
  category: string;
  cover: string;
  pages: { heading: string; body: string }[];
  question: string;
  summary: string;
  knowledge: string;
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
  position: string;
  requiredStars: number;
};

type CompanionPayload = {
  mode: "chat" | "reading";
  name: string;
  message?: string;
  title?: string;
  excerpt?: string;
  question?: string;
  answer?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

type VoiceTarget = "chat" | "reading";
type VoicePhase = "idle" | "recording" | "recognizing";
type VoiceSession = {
  target: VoiceTarget;
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  processor: ScriptProcessorNode;
  silentGain: GainNode;
  chunks: Float32Array[];
  sampleRate: number;
  startedAt: number;
  animationFrame: number;
  clockTimer: number;
  maxTimer: number;
};

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const ASSET = `${BASE_PATH}/assets`;

const initialState: GameState = {
  name: "小乌龟",
  hunger: 30,
  cleanliness: 80,
  boredom: 25,
  fruits: 5,
  stars: 12,
  tickets: 3,
  lastSeen: Date.now(),
  readingRecords: [],
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
    mistakeMode: "add",
    targets: { feed: 1, swim: 1, reading: 1, mistake: 1 },
    progress: { feed: 0, swim: 0, reading: 0, mistake: 0 },
    rewardClaimed: false,
  },
};

const books: Book[] = [
  {
    id: "forest",
    title: "会唱歌的森林",
    category: "童话 · 3分钟",
    cover: `${ASSET}/books/book_forest_story.png`,
    pages: [
      {
        heading: "清晨的声音",
        body: "清晨，小松鼠米米被一阵轻轻的歌声叫醒。风吹过树叶，沙沙地响；小溪绕过石头，叮咚地唱。米米背上小布包，决定去找一找森林里最好听的声音。",
      },
      {
        heading: "每个人的歌",
        body: "啄木鸟敲出清脆的鼓点，黄鹂唱出亮亮的高音，就连慢吞吞的蜗牛，也用触角轻轻敲着露珠。米米忽然发现，森林不是只有一种歌声，每一种声音都很重要。",
      },
      {
        heading: "合唱开始啦",
        body: "傍晚，米米邀请大家来到老橡树下。风声、溪水声和动物们的声音合在一起，变成了一首从没听过的歌。米米明白了：认真听见别人，大家才能唱出最美的歌。",
      },
    ],
    question: "米米为什么觉得每一种声音都很重要呀？",
    summary: "米米寻找森林中最好听的声音，最后发现大家各不相同的声音合在一起才最动听。",
    knowledge: "认真倾听，能让我们发现每个人独特的优点。",
  },
  {
    id: "ocean",
    title: "潮汐的小秘密",
    category: "科普 · 4分钟",
    cover: `${ASSET}/books/book_ocean_note.png`,
    pages: [
      {
        heading: "海水去哪儿了",
        body: "早晨，沙滩上的海水离岸边很远；到了下午，海水又慢慢靠近。海水有规律地涨起来、落下去，这种现象叫作潮汐。涨潮时海面升高，退潮时海面降低。",
      },
      {
        heading: "月亮在帮忙",
        body: "月球虽然离我们很远，却会用引力轻轻拉着地球上的海水。太阳也会产生影响。当地球、月球和太阳的位置变化时，潮水的高低也会跟着变化。",
      },
      {
        heading: "海边的时钟",
        body: "渔民会查看潮汐时间，决定什么时候出海；小螃蟹也会趁退潮寻找食物。潮汐像海边的一座大时钟，提醒着许多生命安排一天的活动。",
      },
    ],
    question: "潮汐为什么像海边的一座大时钟呢？",
    summary: "海水会规律地涨落，月球和太阳的引力会影响潮汐，海边的人和动物也会按潮汐安排活动。",
    knowledge: "月球的引力是形成潮汐的重要原因。",
  },
  {
    id: "dino",
    title: "恐龙脚印侦探",
    category: "探索 · 4分钟",
    cover: `${ASSET}/books/book_dino_knowledge.png`,
    pages: [
      {
        heading: "石头里的脚印",
        body: "小小在博物馆看到一块奇怪的石头，上面留着三个长长的脚趾印。讲解员说，这是恐龙脚印化石。很久以前，恐龙踩过湿软的泥地，脚印被泥沙慢慢盖住。",
      },
      {
        heading: "脚印会说话",
        body: "科学家会测量脚印的大小、深浅和前后距离。脚印又大又深，说明恐龙可能很重；两排脚印靠得很近，说明它可能正慢慢走；距离变大时，它也许跑了起来。",
      },
      {
        heading: "看不见的故事",
        body: "我们没有见过真正的恐龙，但化石留下了线索。科学家把许多小线索放在一起，就能猜想恐龙怎样走路、在哪里生活。发现问题、寻找证据，就是科学侦探的工作。",
      },
    ],
    question: "科学家能从恐龙脚印里知道哪些事情？",
    summary: "恐龙脚印变成化石后保留了许多线索，科学家通过测量和比较，推测恐龙的体重与行动方式。",
    knowledge: "化石是研究古代生命的重要证据。",
  },
];

const destinations: Destination[] = [
  {
    id: "beach",
    name: "星沙海湾",
    note: "去找会发光的贝壳",
    duration: "8秒",
    reward: "潮汐知识卡",
    photo: `${ASSET}/optimized/travel/photos/photo_beach.webp`,
    knowledge: `${ASSET}/optimized/travel/knowledge_cards/knowledge_tide.webp`,
    locationArt: `${ASSET}/legacy/travel/location_beach.png`,
    knowledgeTitle: "潮汐的小秘密",
    knowledgeFacts: ["海水会有规律地涨落。", "月球引力是形成潮汐的重要原因。"],
    position: "destination-beach",
    requiredStars: 10,
  },
  {
    id: "forest",
    name: "森语树屋",
    note: "听一听大树的年轮故事",
    duration: "8秒",
    reward: "树木年轮卡",
    photo: `${ASSET}/optimized/travel/photos/photo_forest.webp`,
    knowledge: `${ASSET}/optimized/travel/knowledge_cards/knowledge_tree_ring.webp`,
    locationArt: `${ASSET}/legacy/travel/location_forest.png`,
    knowledgeTitle: "大树的时间圈",
    knowledgeFacts: ["年轮记录着树木一年的生长。", "科学家会从年轮了解过去的气候。"],
    position: "destination-forest",
    requiredStars: 15,
  },
  {
    id: "museum",
    name: "恐龙博物馆",
    note: "寻找巨大的远古脚印",
    duration: "8秒",
    reward: "恐龙知识卡",
    photo: `${ASSET}/optimized/travel/photos/photo_museum.webp`,
    knowledge: `${ASSET}/optimized/travel/knowledge_cards/knowledge_dinosaur.webp`,
    locationArt: `${ASSET}/legacy/travel/location_museum.png`,
    knowledgeTitle: "脚印里的远古线索",
    knowledgeFacts: ["恐龙脚印也能成为化石。", "大小、深浅和间距能帮助科学家推测恐龙怎样行动。"],
    position: "destination-museum",
    requiredStars: 50,
  },
  {
    id: "space",
    name: "太空站",
    note: "从太空看一看蓝色地球",
    duration: "8秒",
    reward: "太空站知识卡",
    photo: `${ASSET}/legacy/travel/location_space.png`,
    locationArt: `${ASSET}/legacy/travel/location_space.png`,
    knowledgeTitle: "绕着地球旅行",
    knowledgeFacts: ["空间站像一座绕地球飞行的实验室。", "在微重力环境里，航天员和物品会呈现漂浮状态。"],
    position: "destination-space",
    requiredStars: 70,
  },
  {
    id: "ancient",
    name: "古城遗迹",
    note: "沿着石阶寻找古城的故事",
    duration: "8秒",
    reward: "古城建筑知识卡",
    photo: `${ASSET}/legacy/travel/location_ancient_city.png`,
    locationArt: `${ASSET}/legacy/travel/location_ancient_city.png`,
    knowledgeTitle: "石头留下的城市记忆",
    knowledgeFacts: ["遗迹能帮助我们了解过去的人怎样生活。", "保护遗迹时，要尽量保留原有材料和历史信息。"],
    position: "destination-ancient",
    requiredStars: 100,
  },
  {
    id: "future",
    name: "未来车站",
    note: "看看未来的城市怎样出发",
    duration: "8秒",
    reward: "未来交通知识卡",
    photo: `${ASSET}/legacy/travel/location_future_station.png`,
    locationArt: `${ASSET}/legacy/travel/location_future_station.png`,
    knowledgeTitle: "会思考的交通站",
    knowledgeFacts: ["公共交通能让更多人共享一次出行。", "未来交通会更重视安全、节能与无障碍体验。"],
    position: "destination-future",
    requiredStars: 150,
  },
];

const hidePlaces = ["water", "tree", "behind", "lotus"] as const;
type HidePlace = (typeof hidePlaces)[number];
type HomeSpot = "center" | "pond-edge" | "tree-shade" | "cave-door";

const hideLabels: Record<HidePlace, string> = {
  water: "水波里",
  tree: "树梢上",
  behind: "树干后",
  lotus: "荷叶下",
};

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
    const sample = Math.max(-1, Math.min(1, output[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
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

function createDailyPlan(state: Pick<GameState, "mistakes">): DailyPlan {
  const pendingMistakes = state.mistakes.filter((mistake) => mistake.status !== "mastered").length;
  return {
    dateKey: currentDayKey(),
    mistakeMode: pendingMistakes > 0 ? "review" : "add",
    targets: {
      feed: 1,
      swim: 1,
      reading: 1,
      mistake: pendingMistakes > 0 ? Math.min(2, pendingMistakes) : 1,
    },
    progress: { feed: 0, swim: 0, reading: 0, mistake: 0 },
    rewardClaimed: false,
  };
}

function ensureDailyPlan(state: GameState): DailyPlan {
  const saved = state.dailyPlan;
  if (!saved || saved.dateKey !== currentDayKey()) return createDailyPlan(state);
  const mistakeMode = saved.mistakeMode === "review" ? "review" : "add";
  return {
    dateKey: saved.dateKey,
    mistakeMode,
    targets: {
      feed: 1,
      swim: 1,
      reading: 1,
      mistake: Math.max(1, Math.min(2, Number(saved.targets?.mistake) || 1)),
    },
    progress: {
      feed: Math.max(0, Number(saved.progress?.feed) || 0),
      swim: Math.max(0, Number(saved.progress?.swim) || 0),
      reading: Math.max(0, Number(saved.progress?.reading) || 0),
      mistake: Math.max(0, Number(saved.progress?.mistake) || 0),
    },
    rewardClaimed: Boolean(saved.rewardClaimed),
  };
}

function advanceDailyTask(state: GameState, task: DailyTaskKey, mistakeMode?: DailyMistakeMode): GameState {
  const dailyPlan = ensureDailyPlan(state);
  if (task === "mistake" && dailyPlan.mistakeMode !== mistakeMode) return { ...state, dailyPlan };
  const target = dailyPlan.targets[task];
  if (dailyPlan.progress[task] >= target) return { ...state, dailyPlan };

  const progress = {
    ...dailyPlan.progress,
    [task]: Math.min(target, dailyPlan.progress[task] + 1),
  };
  const allComplete = (Object.keys(progress) as DailyTaskKey[]).every((key) => progress[key] >= dailyPlan.targets[key]);
  const earnedReward = allComplete && !dailyPlan.rewardClaimed;
  return {
    ...state,
    stars: state.stars + (earnedReward ? 3 : 0),
    dailyPlan: {
      ...dailyPlan,
      progress,
      rewardClaimed: dailyPlan.rewardClaimed || allComplete,
    },
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
  if (!response.ok) throw new Error("companion unavailable");
  const data = (await response.json()) as { reply?: string };
  if (!data.reply) throw new Error("empty companion reply");
  return data.reply;
}

function destinationForRecord(record: TravelRecord) {
  return destinations.find(
    (destination) =>
      destination.id === record.destinationId ||
      destination.name === record.destination ||
      destination.knowledge === record.knowledge,
  );
}

function KnowledgeArt({ destination }: { destination: Destination }) {
  if (destination.knowledge) {
    return <img src={destination.knowledge} alt={`${destination.knowledgeTitle}知识卡`} />;
  }
  return (
    <div className="space-knowledge-art">
      <img src={destination.locationArt} alt={destination.name} />
      <span>{destination.name}发现</span>
      <strong>{destination.knowledgeTitle}</strong>
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
  maskBackground,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  art: string;
  maskBackground?: boolean;
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
      <img className={`nav-art ${maskBackground ? "nav-art-masked" : ""}`} src={art} alt="" />
      <span>{label}</span>
    </button>
  );
}

export default function HomePage() {
  const [view, setView] = useState<View>("home");
  const [game, setGame] = useState<GameState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [actionProgress, setActionProgress] = useState(0);
  const [turtleSprite, setTurtleSprite] = useState<string | null>(null);
  const [homeSpot, setHomeSpot] = useState<HomeSpot>("center");
  const [toast, setToast] = useState("");
  const [fruitPicker, setFruitPicker] = useState(false);
  const [hideTarget, setHideTarget] = useState<HidePlace | null>(null);
  const [hideTries, setHideTries] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [selectedBook, setSelectedBook] = useState<Book>(books[0]);
  const [bookPage, setBookPage] = useState(0);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [questionAnswered, setQuestionAnswered] = useState(false);
  const [readingAnswer, setReadingAnswer] = useState("");
  const [readingFeedback, setReadingFeedback] = useState("");
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
  const [travelReward, setTravelReward] = useState<Destination | null>(null);
  const [knowledgeOpen, setKnowledgeOpen] = useState<Destination | null>(null);
  const [recordTab, setRecordTab] = useState<RecordTab>("travel");
  const [mistakeFilter, setMistakeFilter] = useState<"all" | "review" | "mastered">("all");
  const [mistakeFormOpen, setMistakeFormOpen] = useState(false);
  const [mistakeScanning, setMistakeScanning] = useState(false);
  const [mistakeScanNotice, setMistakeScanNotice] = useState("");
  const [reviewMistake, setReviewMistake] = useState<MistakeRecord | null>(null);
  const [reviewAnswer, setReviewAnswer] = useState("");
  const [correctionRevealed, setCorrectionRevealed] = useState(false);
  const [dailyTasksOpen, setDailyTasksOpen] = useState(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const autoFinishVoiceRef = useRef<() => void>(() => undefined);
  const voiceAbortRef = useRef<AbortController | null>(null);
  const submitChatRef = useRef<(message: string) => void>(() => undefined);
  const messageListRef = useRef<HTMLDivElement | null>(null);

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
    () => (Object.keys(dailyPlan.progress) as DailyTaskKey[]).filter((key) => dailyPlan.progress[key] >= dailyPlan.targets[key]).length,
    [dailyPlan],
  );

  const ambientSprite = useMemo(() => {
    if (game.hunger > 72) return "turtle_hungry.png";
    if (game.cleanliness < 38) return "turtle_dirty.png";
    if (game.boredom > 70) return "turtle_bored_sitting.png";
    if (mood < 55) return "turtle_low_mood.png";
    if (homeSpot === "pond-edge") return "turtle_idle_standing.png";
    if (homeSpot === "tree-shade") return "turtle_thinking.png";
    if (homeSpot === "cave-door") return "turtle_waving.png";
    return "turtle_idle_front.png";
  }, [game.boredom, game.cleanliness, game.hunger, homeSpot, mood]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3600);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem("guigu-v1-state");
      let restored = initialState;
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Partial<GameState>;
          const hours = Math.min(24, Math.max(0, (Date.now() - (parsed.lastSeen || Date.now())) / 3_600_000));
          restored = {
            ...initialState,
            ...parsed,
            hunger: clamp((parsed.hunger ?? initialState.hunger) + hours * 3),
            cleanliness: clamp((parsed.cleanliness ?? initialState.cleanliness) - hours),
            boredom: clamp((parsed.boredom ?? initialState.boredom) + hours * 2),
            lastSeen: Date.now(),
          };
        } catch {
          restored = initialState;
        }
      }
      setGame({ ...restored, dailyPlan: ensureDailyPlan(restored) });
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      "guigu-v1-state",
      JSON.stringify({ ...game, lastSeen: Date.now() }),
    );
  }, [game, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const syncDay = () => {
      setGame((current) => current.dailyPlan.dateKey === currentDayKey()
        ? current
        : { ...current, dailyPlan: createDailyPlan(current) });
    };
    const interval = window.setInterval(syncDay, 60_000);
    return () => window.clearInterval(interval);
  }, [hydrated]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (view !== "home" || busy || hideTarget || traveling) return;
    const spots: HomeSpot[] = ["center", "pond-edge", "tree-shade", "cave-door"];
    const interval = window.setInterval(() => {
      setHomeSpot((current) => {
        const choices = spots.filter((spot) => spot !== current);
        return choices[Math.floor(Math.random() * choices.length)];
      });
    }, 14_000);
    return () => window.clearInterval(interval);
  }, [busy, hideTarget, traveling, view]);

  const patchGame = useCallback((patch: Partial<GameState>) => {
    setGame((current) => ({ ...current, ...patch }));
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
      const record: TravelRecord = {
        id: now,
        destinationId: traveling.id,
        destination: traveling.name,
        date: formatDate(),
        reward: traveling.reward,
        photo: traveling.photo,
        knowledge: traveling.knowledge,
      };
      setGame((current) => {
        if (current.activeTravel?.startedAt !== active.startedAt) return current;
        return {
          ...current,
          activeTravel: null,
          boredom: clamp(current.boredom - 18),
          hunger: clamp(current.hunger + 6),
          stars: current.stars + 4,
          fruits: current.fruits + 1,
          travelRecords: [record, ...current.travelRecords],
        };
      });
      setTravelProgress(0);
      setTravelReward(traveling);
      showToast(`${game.name}带着新发现回来啦！`);
    }, 100);
    return () => window.clearInterval(interval);
  }, [game.activeTravel, game.name, hydrated, showToast, traveling]);

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

  const feedFruit = (fruit: string) => {
    if (game.fruits < 1) {
      showToast("果篮空啦，读书或旅行可以带回新果子");
      return;
    }
    setFruitPicker(false);
    runTimedAction(
      "feeding",
      1800,
      "turtle_eating_fruit.png",
      () => {
        setGame((current) => advanceDailyTask({
          ...current,
          hunger: clamp(current.hunger - 22),
          boredom: clamp(current.boredom - 3),
          fruits: current.fruits - 1,
        }, "feed"));
        setTurtleSprite("turtle_satisfied.png");
        showToast(`${game.name}吃下${fruit}，肚子满足啦`);
        window.setTimeout(() => setTurtleSprite(null), 1800);
      },
      `${game.name}正在大口吃果子…`,
    );
  };

  const startSwim = () => {
    runTimedAction(
      "swimming",
      5200,
      "turtle_swimming.png",
      () => {
        setGame((current) => advanceDailyTask({ ...current, cleanliness: 100 }, "swim"));
        setTurtleSprite("turtle_clean_sparkle.png");
        showToast("游泳完成，龟壳亮晶晶！");
        window.setTimeout(() => setTurtleSprite(null), 2000);
      },
      `${game.name}扑通一声跳进池塘`,
    );
  };

  const startSleep = () => {
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
        window.setTimeout(() => setTurtleSprite(null), 1800);
      },
      "嘘，做一个香香的梦吧",
    );
  };

  const startHideAndSeek = () => {
    if (busy || traveling) return;
    const target = hidePlaces[Math.floor(Math.random() * hidePlaces.length)];
    setHideTarget(target);
    setHideTries(0);
    showToast(`${game.name}藏好啦！留心看看会动的地方`);
  };

  const guessHidePlace = (place: HidePlace) => {
    if (!hideTarget) return;
    if (place === hideTarget) {
      setHideTarget(null);
      setHideTries(0);
      setTurtleSprite("turtle_excited.png");
      setGame((current) => ({
        ...current,
        boredom: clamp(current.boredom - 24),
        stars: current.stars + 2,
      }));
      showToast(`找到啦！原来藏在${hideLabels[place]}`);
      window.setTimeout(() => setTurtleSprite(null), 2200);
    } else {
      setHideTries((tries) => tries + 1);
      showToast(`这里没有，再找找看${hideTries >= 1 ? "，注意小小的动静" : ""}`);
    }
  };

  const saveName = () => {
    const cleaned = draftName.trim().slice(0, 8);
    if (!cleaned) return;
    patchGame({ name: cleaned });
    setEditingName(false);
    showToast(`以后就叫我“${cleaned}”啦`);
  };

  const chooseBook = (book: Book) => {
    setSelectedBook(book);
    setBookPage(0);
    setReadingAnswer("");
    setReadingFeedback("");
    setQuestionAnswered(false);
    setQuestionOpen(false);
  };

  const nextBookPage = () => {
    if (bookPage === 0 && !questionAnswered) {
      setQuestionOpen(true);
      return;
    }
    if (bookPage < selectedBook.pages.length - 1) {
      setBookPage((page) => page + 1);
    } else {
      finishReading();
    }
  };

  const submitReadingAnswer = async () => {
    if (!readingAnswer.trim()) {
      showToast("先把你的想法告诉龟龟吧");
      return;
    }
    setCompanionLoading(true);
    let feedback: string;
    try {
      feedback = await askCompanion({
        mode: "reading",
        name: game.name,
        title: selectedBook.title,
        excerpt: selectedBook.pages[0].body,
        question: selectedBook.question,
        answer: readingAnswer.trim().slice(0, 500),
      });
    } catch {
      feedback = "我听见你是这样想的。你还可以回到故事里找一句话，看看它能不能支持你的发现。";
    }
    setReadingFeedback(feedback);
    setQuestionAnswered(true);
    setGame((current) => ({
      ...current,
      boredom: clamp(current.boredom - 8),
      stars: current.stars + 1,
    }));
    setCompanionLoading(false);
  };

  const continueAfterAnswer = () => {
    setQuestionOpen(false);
    setBookPage(1);
    showToast("龟龟记住你的想法啦");
  };

  const finishReading = () => {
    const record: ReadingRecord = {
      id: Date.now(),
      title: selectedBook.title,
      date: formatDate(),
      answer: readingAnswer || "今天认真读完了整篇故事。",
      summary: selectedBook.summary,
    };
    setGame((current) => advanceDailyTask({
      ...current,
      boredom: clamp(current.boredom - 12),
      stars: current.stars + 3,
      tickets: current.tickets + 1,
      fruits: current.fruits + 1,
      readingRecords: [record, ...current.readingRecords.filter((item) => item.title !== record.title)],
    }, "reading"));
    setSummaryOpen(true);
  };

  const releaseVoiceSession = useCallback(() => {
    const session = voiceSessionRef.current;
    if (!session) return null;
    window.cancelAnimationFrame(session.animationFrame);
    window.clearInterval(session.clockTimer);
    window.clearTimeout(session.maxTimer);
    session.processor.disconnect();
    session.analyser.disconnect();
    session.source.disconnect();
    session.silentGain.disconnect();
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
    const session = releaseVoiceSession();
    if (!session) return;
    if (Date.now() - session.startedAt < 600 || !session.chunks.length) {
      setVoicePhase("idle");
      showToast("说得太短啦，请再试一次");
      return;
    }

    setVoicePhase("recognizing");
    setVoiceLevel(0.08);
    const controller = new AbortController();
    voiceAbortRef.current = controller;
    try {
      const audio = encodeWav(session.chunks, session.sampleRate);
      const response = await fetch(`${BASE_PATH}/api/speech`, {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: audio,
        signal: controller.signal,
      });
      const data = (await response.json()) as { transcript?: string; error?: string };
      if (!response.ok || !data.transcript) throw new Error(data.error || "speech unavailable");
      if (session.target === "chat") {
        setChatInput("");
        showToast(`听清楚啦，正在发给${game.name}`);
        submitChatRef.current(data.transcript);
      } else {
        setReadingAnswer(data.transcript);
        showToast("听清楚啦，文字已经填好");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        showToast(error instanceof Error && error.message.includes("没有听清楚") ? error.message : "语音识别暂时不可用，可以改用文字输入");
      }
    } finally {
      if (voiceAbortRef.current === controller) {
        voiceAbortRef.current = null;
        setVoicePhase("idle");
        setVoiceSeconds(0);
      }
    }
  }, [game.name, releaseVoiceSession, showToast]);

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
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silentGain = context.createGain();
      const chunks: Float32Array[] = [];
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      silentGain.gain.value = 0;
      processor.onaudioprocess = (event) => chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(context.destination);

      const session: VoiceSession = {
        target,
        stream,
        context,
        source,
        analyser,
        processor,
        silentGain,
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
      reply = await askCompanion({
        mode: "chat",
        name: game.name,
        message: message.slice(0, 500),
        history: game.chatMessages.slice(-8).map((item) => ({
          role: item.role === "turtle" ? "assistant" : "user",
          content: item.text,
        })),
      });
    } catch {
      reply = getLocalReply(message, game.name);
    }
    const turtleMessage: ChatMessage = { id: Date.now() + 1, role: "turtle", text: reply };
    setGame((current) => ({
      ...current,
      chatMessages: [...current.chatMessages, turtleMessage].slice(-16),
    }));
    setChatThinking(false);
  }, [chatInput, chatThinking, game.chatMessages, game.name]);

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
    setMistakeFormOpen(true);
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
      const record: MistakeRecord = {
        id: Date.now(),
        subject: data.result.subject,
        question: data.result.question,
        wrongAnswer: data.result.wrongAnswer,
        correction: data.result.correction,
        cause: data.result.cause,
        imageData,
        status: "new",
        date: formatDate(),
        reviewCount: 0,
      };
      setGame((current) => advanceDailyTask({ ...current, mistakes: [record, ...current.mistakes] }, "mistake", "add"));
      setMistakeFormOpen(false);
      showToast("MiMo 已经整理好错题，之后可以回来挑战它");
    } catch (error) {
      setMistakeScanNotice("这张照片没有读清楚，请重新拍照或换一张图片。" );
      showToast(error instanceof Error ? error.message : "图片读取失败，请换一张试试");
    } finally {
      setMistakeScanning(false);
    }
  };

  const startMistakeReview = (mistake: MistakeRecord) => {
    setGame((current) => ({
      ...current,
      mistakes: current.mistakes.map((item) => item.id === mistake.id && item.status === "new" ? { ...item, status: "reviewing" } : item),
    }));
    setReviewMistake({ ...mistake, status: mistake.status === "new" ? "reviewing" : mistake.status });
    setReviewAnswer("");
    setCorrectionRevealed(false);
  };

  const finishMistakeReview = (mastered: boolean) => {
    if (!reviewMistake) return;
    const firstMastery = mastered && reviewMistake.status !== "mastered";
    setGame((current) => advanceDailyTask({
      ...current,
      stars: current.stars + (firstMastery ? 2 : 0),
      boredom: clamp(current.boredom - (firstMastery ? 5 : 2)),
      mistakes: current.mistakes.map((item) => item.id === reviewMistake.id ? {
        ...item,
        status: mastered ? "mastered" : "reviewing",
        reviewCount: item.reviewCount + 1,
      } : item),
    }, "mistake", "review"));
    setReviewMistake(null);
    setCorrectionRevealed(false);
    showToast(mastered ? `掌握啦！${firstMastery ? "获得 2 颗成长星星" : "这道题依然很稳"}` : "先放回待复习，下次再挑战");
  };

  const deleteMistake = (mistake: MistakeRecord) => {
    if (!window.confirm("确定要删除这道错题吗？删除后不能恢复。")) return;
    setGame((current) => ({ ...current, mistakes: current.mistakes.filter((item) => item.id !== mistake.id) }));
    showToast("这道错题已经删除");
  };

  const startTravel = () => {
    if (traveling || busy) return;
    if (game.stars < selectedDestination.requiredStars) {
      showToast(`还差 ${selectedDestination.requiredStars - game.stars} 颗星才能解锁${selectedDestination.name}`);
      return;
    }
    if (game.tickets < 1) {
      showToast("旅行票不足，读完一本书可以获得 1 张");
      return;
    }
    showToast(`${game.name}背好行囊，出发去${selectedDestination.name}`);
    const startedAt = Date.now();
    setGame((current) => {
      if (current.activeTravel || current.tickets < 1 || current.stars < selectedDestination.requiredStars) return current;
      return {
        ...current,
        tickets: current.tickets - 1,
        activeTravel: {
          destinationId: selectedDestination.id,
          startedAt,
          endsAt: startedAt + 8_000,
        },
      };
    });
  };

  const resetReading = () => {
    setSummaryOpen(false);
    setQuestionAnswered(false);
    setReadingAnswer("");
    setReadingFeedback("");
    setBookPage(0);
  };

  const dailyTaskItems: Array<{ key: DailyTaskKey; label: string; icon: string }> = [
    { key: "feed", label: `给${game.name}喂 1 个果子`, icon: `${ASSET}/ui/daily-tasks/fruit.png` },
    { key: "swim", label: `陪${game.name}游泳清洁`, icon: `${ASSET}/ui/daily-tasks/clean.png` },
    { key: "reading", label: "完成 1 次伴读", icon: `${ASSET}/ui/daily-tasks/reading.png` },
    {
      key: "mistake",
      label: dailyPlan.mistakeMode === "review" ? `复习 ${dailyPlan.targets.mistake} 道错题` : "收录 1 道错题",
      icon: `${ASSET}/ui/daily-tasks/mistake.png`,
    },
  ];

  const openDailyTask = (task: DailyTaskKey) => {
    if (task === "feed") {
      setFruitPicker(true);
      return;
    }
    if (task === "swim") {
      startSwim();
      return;
    }
    if (task === "reading") {
      setView("library");
      return;
    }
    if (dailyPlan.mistakeMode === "add") {
      openMistakeForm();
      return;
    }
    setMistakeFilter("review");
    setView("mistakes");
  };

  const homeTurtleClass = busy === "swimming" ? "in-pond" : busy === "sleeping" ? "in-cave" : `spot-${homeSpot}`;
  const navigationLocked = !!busy || !!hideTarget || !!traveling;
  const selectedDestinationUnlocked = game.stars >= selectedDestination.requiredStars;
  const selectedDestinationMissingStars = Math.max(0, selectedDestination.requiredStars - game.stars);

  return (
    <main
      className={`app view-${view}`}
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
        "--daily-task-row": `url("${ASSET}/ui/daily-tasks/task-row.png")`,
        "--daily-task-counter": `url("${ASSET}/ui/daily-tasks/counter.png")`,
      } as React.CSSProperties}
    >
      <header className="topbar">
        <div className="identity-cluster">
          <img className="brand-logo" src={`${ASSET}/ui/supplied/brand/logo.png`} alt="龟龟伴读" />
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

        <div className="wallet" aria-label={`${game.stars}颗星星，${game.fruits}个果子，${game.tickets}张旅行票`}>
          <span><Star className="wallet-star" fill="currentColor" aria-hidden="true" /> {game.stars}</span>
          <span><img className="wallet-icon" src={`${ASSET}/objects/fruit_orange.png`} alt="" /> {game.fruits}</span>
          <span className="wallet-ticket"><img src={`${ASSET}/legacy/travel/travel_ticket.png`} alt="" /> {game.tickets}</span>
        </div>
      </header>

      <section className="scene-shell">
        {view === "home" && (
          <section className={`scene home-scene ${busy === "sleeping" ? "sleeping-scene" : ""}`}>
            <div className="scene-title">
              <small suppressHydrationWarning>{formatDate()} · 晴</small>
              <h1>今天想和{game.name}做什么？</h1>
            </div>

            <aside className={`daily-task-panel ${dailyTasksOpen ? "open" : ""}`} aria-label={`今日任务，已完成${dailyCompletedCount}项，共4项`}>
              <button
                className="daily-task-heading"
                type="button"
                aria-expanded={dailyTasksOpen}
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
                        <img src={task.icon} alt="" />
                        <strong>{task.label}</strong>
                        <span>{complete ? <Check aria-hidden="true" /> : `${progress}/${dailyPlan.targets[task.key]}`}</span>
                      </button>
                    );
                  })}
                </div>
                <div className={`daily-task-reward ${dailyPlan.rewardClaimed ? "claimed" : ""}`}>
                  <img src={`${ASSET}/ui/daily-tasks/reward-star.png`} alt="" />
                  <span>{dailyPlan.rewardClaimed ? "今日计划完成，奖励已领取" : "全部完成可得 3 颗星星"}</span>
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
                <button className="scene-action tree-action" type="button" onClick={() => setFruitPicker(true)} aria-label="喂果子" title="喂果子" disabled={!!busy}>
                  <img src={`${ASSET}/ui/home-refresh/actions/feed.png`} alt="" />
                </button>
                <button className="scene-action hide-action" type="button" onClick={startHideAndSeek} aria-label="捉迷藏" title="捉迷藏" disabled={!!busy}>
                  <img src={`${ASSET}/ui/home-refresh/actions/hide.png`} alt="" />
                </button>
                <button className="scene-action cave-action" type="button" onClick={startSleep} aria-label="睡一会" title="睡一会" disabled={!!busy}>
                  <img src={`${ASSET}/ui/home-refresh/actions/sleep.png`} alt="" />
                </button>
              </>
            )}
            {hideTarget && (
              <>
                <button className="world-hotspot pond-hotspot" type="button" onClick={() => guessHidePlace("water")} aria-label="找找水里" title="找找水里"><Search /></button>
                <button className="world-hotspot tree-hotspot" type="button" onClick={() => guessHidePlace("tree")} aria-label="找找树梢" title="找找树梢"><Search /></button>
                <button className="world-hotspot trunk-hotspot" type="button" onClick={() => guessHidePlace("behind")} aria-label="找找树干后面" title="找找树干后面"><Search /></button>
                <button className="world-hotspot lotus-hotspot" type="button" onClick={() => guessHidePlace("lotus")} aria-label="找找荷叶下面" title="找找荷叶下面"><Search /></button>
              </>
            )}

            {hideTarget && (
              <img
                className={`hidden-turtle hidden-${hideTarget}`}
                src={`${ASSET}/characters/turtle/${
                  hideTarget === "water"
                    ? "turtle_hide_water.png"
                    : hideTarget === "tree"
                      ? "turtle_hide_tree_top.png"
                      : hideTarget === "behind"
                        ? "turtle_hide_tree_behind.png"
                        : "turtle_hide_lotus.png"
                }`}
                alt="藏起来的龟龟"
              />
            )}

            {!hideTarget && !traveling && (
              <div className={`turtle-wrap ${homeTurtleClass}`}>
                <div className="speech-tag">
                  {busy === "swimming"
                    ? "我在练习划水！"
                    : busy === "sleeping"
                      ? "呼…呼…"
                      : game.hunger > 70
                        ? "肚子咕咕叫啦"
                        : game.boredom > 65
                          ? "陪我玩一会儿吧"
                          : `嗨，我们一起进步吧！`}
                </div>
                <img
                  className="turtle-sprite"
                  src={`${ASSET}/characters/turtle/${turtleSprite ?? ambientSprite}`}
                  alt={`${game.name}正在${busy === "swimming" ? "游泳" : busy === "sleeping" ? "睡觉" : "等你"}`}
                />
              </div>
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

        {view === "library" && (
          <section className="scene library-scene">
            <div className="page-heading light-heading">
              <span className="eyebrow"><BookOpen size={16} /> 龟龟书房</span>
              <h1>一起读点新故事</h1>
              <p>读到一半时，龟龟会认真向你请教一个问题。</p>
            </div>

            <div className="book-picker" aria-label="选择一本书">
              {books.map((book) => (
                <button
                  key={book.id}
                  type="button"
                  className={selectedBook.id === book.id ? "selected" : ""}
                  onClick={() => chooseBook(book)}
                >
                  <img src={book.cover} alt={`${book.title}封面`} />
                  <span><strong>{book.title}</strong><small>{book.category}</small></span>
                  {selectedBook.id === book.id && <Check size={17} />}
                </button>
              ))}
            </div>

            <article className="reading-paper">
              <div className="reading-meta">
                <span>{selectedBook.title}</span>
                <span>第 {bookPage + 1} / {selectedBook.pages.length} 页</span>
              </div>
              <div className="reading-progress"><i style={{ width: `${((bookPage + 1) / selectedBook.pages.length) * 100}%` }} /></div>
              <h2>{selectedBook.pages[bookPage].heading}</h2>
              <p>{selectedBook.pages[bookPage].body}</p>
              <div className="reading-controls">
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setBookPage((page) => Math.max(0, page - 1))}
                  disabled={bookPage === 0}
                  title="上一页"
                  aria-label="上一页"
                >
                  <ChevronLeft />
                </button>
                <span>{questionAnswered ? "龟龟已经听懂你的想法啦" : "慢慢读，读懂比读快更重要"}</span>
                <button className="next-button" type="button" onClick={nextBookPage}>
                  {bookPage === selectedBook.pages.length - 1 ? "完成阅读" : "下一页"}
                  <ChevronRight />
                </button>
              </div>
            </article>

            <img
              className="reading-turtle"
              src={`${ASSET}/characters/turtle/${questionAnswered ? "turtle_reading.png" : "turtle_reading_question.png"}`}
              alt={`${game.name}正在陪你读书`}
            />
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
            <div className="chat-companion">
              <div className="companion-speech">
                <span><MessageCircle size={16} /> 今日悄悄话</span>
                <h1>把今天讲给<br />{game.name}听</h1>
                <p>开心的、好奇的、没想明白的，都可以说给我听。</p>
              </div>
              <img src={`${ASSET}/characters/turtle/turtle_talking.png`} alt="说话的龟龟" />
              <strong className="companion-ready"><i /> 耳朵准备好啦</strong>
            </div>

            <div className="chat-panel">
              <header className="chat-panel-header">
                <img src={`${ASSET}/characters/turtle/turtle_waving.png`} alt="" />
                <div><small>我的陪伴伙伴</small><strong>{game.name}</strong></div>
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
                  <div><dt>可能带回</dt><dd>{selectedDestination.reward}</dd></div>
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
            <div className="journal-header">
              <div>
                <span className="eyebrow"><Backpack size={16} /> 成长手账</span>
                <h1>我们一起留下的足迹</h1>
              </div>
              <div className="record-tabs" role="tablist" aria-label="手账分类">
                <button type="button" role="tab" aria-selected={recordTab === "travel"} onClick={() => setRecordTab("travel")}>旅行手账</button>
                <button type="button" role="tab" aria-selected={recordTab === "reading"} onClick={() => setRecordTab("reading")}>阅读记录</button>
                <button type="button" role="tab" aria-selected={recordTab === "items"} onClick={() => setRecordTab("items")}>小背包</button>
              </div>
            </div>

            <div className="journal-content">
              {recordTab === "travel" && (
                <div className="record-grid">
                  {game.travelRecords.length ? game.travelRecords.map((record) => {
                    const destination = destinationForRecord(record);
                    return (
                      <article className="travel-record" key={record.id}>
                        <img src={record.photo} alt={`${record.destination}照片`} />
                        <div>
                          <small>{record.date}</small>
                          <h2>{record.destination}</h2>
                          <p>带回了：{record.reward}</p>
                          {destination && (
                            <button className="knowledge-link" type="button" onClick={() => setKnowledgeOpen(destination)}>
                              <img src={`${ASSET}/legacy/icons/knowledge_card.png`} alt="" /> 查看知识卡
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  }) : <EmptyRecord type="travel" onAction={() => setView("travel")} />}
                </div>
              )}

              {recordTab === "reading" && (
                <div className="reading-records">
                  {game.readingRecords.length ? game.readingRecords.map((record) => (
                    <article className="reading-record" key={record.id}>
                      <div className="record-icon"><BookOpen /></div>
                      <div>
                        <small>{record.date} · 已读完</small>
                        <h2>{record.title}</h2>
                        <p>{record.summary}</p>
                        <blockquote>“{record.answer}”</blockquote>
                      </div>
                    </article>
                  )) : <EmptyRecord type="reading" onAction={() => setView("library")} />}
                </div>
              )}

              {recordTab === "items" && (
                <div className="inventory-grid">
                  <article><div className="item-art"><img src={`${ASSET}/objects/fruit_basket.png`} alt="果篮" /></div><strong>野外果子</strong><span>× {game.fruits}</span></article>
                  <article><div className="item-art star-item"><Star /></div><strong>成长星星</strong><span>× {game.stars}</span></article>
                  <article><div className="item-art ticket-item"><img src={`${ASSET}/legacy/travel/travel_ticket.png`} alt="旅行票" /></div><strong>旅行票</strong><span>× {game.tickets}</span></article>
                  {game.travelRecords.map((record) => {
                    const destination = destinationForRecord(record);
                    return destination ? (
                      <button className="inventory-card" type="button" key={record.id} onClick={() => setKnowledgeOpen(destination)}>
                        <div className="item-art"><KnowledgeArt destination={destination} /></div>
                        <strong>{record.reward}</strong><span>来自{record.destination}</span>
                      </button>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </section>
        )}
      </section>

      <nav className="bottom-nav" aria-label="主要功能">
        <NavButton active={view === "home"} disabled={navigationLocked && !busy && !hideTarget} label="家园" art={`${ASSET}/ui/supplied/nav/home.png`} onClick={() => setView("home")} />
        <NavButton active={view === "library"} disabled={navigationLocked} label="读书" art={`${ASSET}/ui/supplied/nav/reading-20260713.png`} maskBackground onClick={() => setView("library")} />
        <NavButton active={view === "mistakes"} disabled={navigationLocked} label="错题屋" art={`${ASSET}/ui/supplied/nav/mistakes-20260713.png`} maskBackground onClick={() => setView("mistakes")} />
        <NavButton active={view === "chat"} disabled={navigationLocked} label="聊天" art={`${ASSET}/ui/supplied/nav/chat.png`} onClick={() => setView("chat")} />
        <NavButton active={view === "travel"} disabled={navigationLocked && !traveling} label="旅行" art={`${ASSET}/ui/supplied/nav/travel.png`} onClick={() => setView("travel")} />
        <NavButton active={view === "journal"} disabled={navigationLocked} label="手账" art={`${ASSET}/ui/supplied/nav/journal-20260713.png`} maskBackground onClick={() => setView("journal")} />
      </nav>

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
              <span>{voiceTarget === "chat" ? "说给龟龟听" : "回答阅读问题"}</span>
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

      {fruitPicker && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setFruitPicker(false)}>
          <section className="modal fruit-modal" role="dialog" aria-modal="true" aria-labelledby="fruit-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setFruitPicker(false)} aria-label="关闭"><X /></button>
            <span className="modal-kicker">果篮里还有 {game.fruits} 个</span>
            <h2 id="fruit-title">挑一个新鲜果子吧</h2>
            <p>{game.hunger < 16 ? `${game.name}现在还不太饿，也可以晚点再吃。` : "不同颜色都一样香甜，选你喜欢的就好。"}</p>
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
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !mistakeScanning && setMistakeFormOpen(false)}>
          <section className="modal mistake-form-modal mistake-capture-modal" role="dialog" aria-modal="true" aria-labelledby="mistake-form-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" disabled={mistakeScanning} onClick={() => setMistakeFormOpen(false)} aria-label="关闭"><X /></button>
            <img src={`${ASSET}/characters/turtle/turtle_reading_question.png`} alt="帮你整理错题的龟龟" />
            <span className="modal-kicker">龟龟错题屋</span>
            <h2 id="mistake-form-title">拍下错题，剩下的交给 MiMo</h2>
            <p>学科、题目、原答案、正确思路和错因都会自动整理。</p>
            {mistakeScanning ? (
              <div className="mistake-capture-loading" role="status"><Sparkles /><strong>正在读题和整理步骤…</strong><span>整理完成后会直接收进错题屋</span></div>
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
            <button className="modal-close" type="button" onClick={() => setReviewMistake(null)} aria-label="关闭"><X /></button>
            <div className="mistake-review-heading">
              <img src={`${ASSET}/characters/turtle/turtle_reading_question.png`} alt="陪你复习的龟龟" />
              <div><span className="modal-kicker">{reviewMistake.subject} · 第 {reviewMistake.reviewCount + 1} 次挑战</span><h2 id="mistake-review-title">先自己再想一次</h2></div>
            </div>
            {reviewMistake.imageData && <img className="review-question-photo" src={reviewMistake.imageData} alt="错题照片" />}
            <div className="review-question"><small>题目</small><p>{reviewMistake.question}</p></div>
            <label className="mistake-field"><span>这次我的答案</span><textarea value={reviewAnswer} onChange={(event) => setReviewAnswer(event.target.value)} maxLength={600} placeholder="把这次的想法和步骤写下来…" disabled={correctionRevealed} /></label>
            {!correctionRevealed ? (
              <button className="reveal-correction-button" type="button" onClick={() => setCorrectionRevealed(true)}><Check /> 对照正确思路</button>
            ) : (
              <>
                <div className="correction-panel"><small>上次卡住：{reviewMistake.cause}</small><strong>正确思路</strong><p>{reviewMistake.correction}</p>{reviewMistake.wrongAnswer && <span>上次答案：{reviewMistake.wrongAnswer}</span>}</div>
                <div className="review-result-actions"><button type="button" onClick={() => finishMistakeReview(false)}><RotateCcw /> 还要再练</button><button type="button" onClick={() => finishMistakeReview(true)}><Star /> 我掌握了</button></div>
              </>
            )}
          </section>
        </div>
      )}

      {questionOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal question-modal" role="dialog" aria-modal="true" aria-labelledby="question-title">
            <img src={`${ASSET}/characters/turtle/turtle_reading_question.png`} alt="提问的龟龟" />
            {readingFeedback ? (
              <>
                <span className="modal-kicker">龟龟认真听完了</span>
                <h2 id="question-title">这是我的新发现</h2>
                <div className="reading-feedback"><Sparkles /> <p>{readingFeedback}</p></div>
                <button className="primary-button full-button" type="button" onClick={continueAfterAnswer}><BookOpen /> 带着发现继续读</button>
              </>
            ) : (
              <>
                <span className="modal-kicker">龟龟有点没读懂</span>
                <h2 id="question-title">{selectedBook.question}</h2>
                <p>没有标准答案，把你的想法讲清楚就很棒。</p>
                <textarea value={readingAnswer} onChange={(event) => setReadingAnswer(event.target.value)} placeholder="我觉得…" aria-label="回答龟龟的问题" maxLength={500} disabled={companionLoading} />
                <div className="modal-actions">
                  <button className="voice-button" type="button" onClick={() => void beginVoiceInput("reading")} disabled={companionLoading || voicePhase !== "idle"}><Mic /> 用语音回答</button>
                  <button className="primary-button" type="button" onClick={() => void submitReadingAnswer()} disabled={companionLoading}><Send /> {companionLoading ? "龟龟在想…" : "讲给龟龟听"}</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {summaryOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal summary-modal" role="dialog" aria-modal="true" aria-labelledby="summary-title">
            <button className="modal-close" type="button" onClick={resetReading} aria-label="关闭"><X /></button>
            <div className="summary-celebration">
              <img src={`${ASSET}/characters/turtle/turtle_happy_hearts.png`} alt="开心的龟龟" />
              <div><span className="modal-kicker">阅读完成 · +3 星星 · +1 旅行票</span><h2 id="summary-title">今天的阅读小结</h2></div>
            </div>
            <div className="summary-block"><small>今天读了</small><strong>《{selectedBook.title}》</strong></div>
            <div className="summary-block"><small>故事讲了</small><p>{selectedBook.summary}</p></div>
            <div className="summary-block"><small>我学到</small><p>{selectedBook.knowledge}</p></div>
            <div className="turtle-note"><Sparkles /> 你愿意停下来想一想、讲一讲，这就是很棒的阅读！</div>
            <button className="primary-button full-button" type="button" onClick={() => { resetReading(); setView("journal"); setRecordTab("reading"); }}><BookOpen /> 收进成长手账</button>
          </section>
        </div>
      )}

      {travelReward && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal reward-modal" role="dialog" aria-modal="true" aria-labelledby="reward-title">
            <button className="modal-close" type="button" onClick={() => setTravelReward(null)} aria-label="关闭"><X /></button>
            <img className="returning-turtle" src={`${ASSET}/characters/turtle/turtle_travel_return.png`} alt="旅行回来的龟龟" />
            <span className="modal-kicker">旅行平安归来 · +4 星星</span>
            <h2 id="reward-title">从{travelReward.name}带回了新发现</h2>
            <div className="reward-preview">
              <img src={travelReward.photo} alt={`${travelReward.name}照片`} />
              <div>
                <small>本次收获</small><strong>{travelReward.reward}</strong><span>还有 1 个野外果子</span>
                <button className="knowledge-link" type="button" onClick={() => setKnowledgeOpen(travelReward)}><img src={`${ASSET}/legacy/icons/knowledge_card.png`} alt="" /> 先看看知识卡</button>
              </div>
            </div>
            <button className="primary-button full-button" type="button" onClick={() => { setTravelReward(null); setView("journal"); setRecordTab("travel"); }}><Backpack /> 放进旅行手账</button>
          </section>
        </div>
      )}

      {knowledgeOpen && (
        <div className="modal-backdrop knowledge-backdrop" role="presentation" onMouseDown={() => setKnowledgeOpen(null)}>
          <section className="modal knowledge-modal" role="dialog" aria-modal="true" aria-labelledby="knowledge-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setKnowledgeOpen(null)} aria-label="关闭"><X /></button>
            <div className="knowledge-visual"><KnowledgeArt destination={knowledgeOpen} /></div>
            <div className="knowledge-copy">
              <span className="modal-kicker">{knowledgeOpen.name} · 旅行知识卡</span>
              <h2 id="knowledge-title">{knowledgeOpen.knowledgeTitle}</h2>
              {knowledgeOpen.knowledgeFacts.map((fact) => <p key={fact}><Star /> {fact}</p>)}
              <div className="turtle-note"><Sparkles /> 下次向别人讲一讲，你会记得更牢。</div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function EmptyRecord({ type, onAction }: { type: "travel" | "reading"; onAction: () => void }) {
  const reading = type === "reading";
  return (
    <div className="empty-record">
      {reading ? <BookOpen /> : <MapPinned />}
      <h2>{reading ? "第一篇阅读小结正在等你" : "第一张旅行照片正在等你"}</h2>
      <p>{reading ? "选一本喜欢的短篇，和龟龟一起读完吧。" : "挑一个目的地，龟龟会把沿途的新发现带回来。"}</p>
      <button type="button" onClick={onAction}>{reading ? "去书房" : "去旅行"}<ChevronRight /></button>
    </div>
  );
}
