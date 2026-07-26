/* eslint-disable @next/next/no-img-element -- The game reuses the project's local pixel-art assets. */
"use client";

import { BookOpen, ChevronLeft, ChevronRight, Clock3, CloudSun, Gamepad2, Heart, Lock, Map, Plane, Search, Sparkles, Star, Trophy, Waves, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import CourierGame from "./CourierGame";
import LotusJumpGame from "./LotusJumpGame";
import SpotDifferenceGame from "./SpotDifferenceGame";
import StoryPuzzleGame from "./StoryPuzzleGame";
import TortoiseRaceGame from "./TortoiseRaceGame";
import TurtleSkyGame from "./TurtleSkyGame";
import WeatherOutfitGame from "./WeatherOutfitGame";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const ASSET = `${BASE_PATH}/assets`;
const ROUND_DURATION_MS = 30_000;
const TICK_MS = 50;
const SPAWN_INTERVAL_MS = 620;
export const FRUIT_CATCH_TARGET_SCORE = 12;

export type FruitCatchDailyState = {
  dateKey: string;
  plays: number;
  rewarded: boolean;
  bestScore: number;
  totalCaught: number;
};

export type FruitCatchResult = {
  score: number;
  caught: number;
  missed: number;
  bestCombo: number;
  success: boolean;
};

export type LearningMiniGameResult = {
  game: "turtle-courier" | "weather-outfit" | "lotus-jump" | "spot-difference" | "story-puzzle" | "turtle-sky" | "tortoise-race";
  detail: string;
};

export type GameParkGameId = "fruit-catch" | LearningMiniGameResult["game"];

export const GAME_PARK_ORDER: GameParkGameId[] = [
  "fruit-catch",
  "turtle-courier",
  "weather-outfit",
  "lotus-jump",
  "spot-difference",
  "story-puzzle",
  "turtle-sky",
  "tortoise-race",
];

const GAME_NAMES: Record<GameParkGameId, string> = {
  "fruit-catch": "龟龟接果子",
  "turtle-courier": "乌龟快递员",
  "weather-outfit": "天气穿搭",
  "lotus-jump": "荷叶跳跳",
  "spot-difference": "龟龟找不同",
  "story-puzzle": "拼故事",
  "turtle-sky": "龟龟飞机大战",
  "tortoise-race": "龟兔赛跑",
};

type FruitKind = "orange" | "red" | "blue";
type FruitDrop = {
  id: string;
  kind: FruitKind;
  x: number;
  y: number;
  speed: number;
  spin: number;
};
type FruitCatchRun = {
  phase: "intro" | "playing" | "finished";
  elapsedMs: number;
  spawnMs: number;
  playerX: number;
  score: number;
  caught: number;
  missed: number;
  combo: number;
  bestCombo: number;
  catchPulse: number;
  drops: FruitDrop[];
};

const fruitDetails: Record<FruitKind, { src: string; label: string; points: number }> = {
  orange: { src: `${ASSET}/objects/fruit_orange.png`, label: "橙色果子", points: 1 },
  red: { src: `${ASSET}/objects/fruit_red.png`, label: "红色果子", points: 1 },
  blue: { src: `${ASSET}/objects/fruit_blue.png`, label: "蓝色惊喜果", points: 2 },
};

function initialRun(): FruitCatchRun {
  return {
    phase: "intro",
    elapsedMs: 0,
    spawnMs: 0,
    playerX: 50,
    score: 0,
    caught: 0,
    missed: 0,
    combo: 0,
    bestCombo: 0,
    catchPulse: 0,
    drops: [],
  };
}

function randomDrop(): FruitDrop {
  const roll = Math.random();
  const kind: FruitKind = roll > 0.84 ? "blue" : roll > 0.43 ? "red" : "orange";
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind,
    x: 8 + Math.random() * 84,
    y: -10,
    speed: 0.67 + Math.random() * 0.34,
    spin: -18 + Math.random() * 36,
  };
}

function clampPlayerX(value: number) {
  return Math.max(8, Math.min(92, value));
}

export default function GamePark({
  turtleName,
  daily,
  playTickets,
  completedGames,
  onBackHome,
  onRoundComplete,
  onLearningGameComplete,
  onSpendPlayTicket,
  onPlayingChange,
}: {
  turtleName: string;
  daily: FruitCatchDailyState;
  playTickets: number;
  completedGames: GameParkGameId[];
  onBackHome: () => void;
  onRoundComplete: (result: FruitCatchResult) => void;
  onLearningGameComplete: (result: LearningMiniGameResult) => void;
  onSpendPlayTicket: (game: GameParkGameId) => void;
  onPlayingChange: (playing: boolean) => void;
}) {
  const [activeGame, setActiveGame] = useState<GameParkGameId | null>(null);
  const [run, setRun] = useState<FruitCatchRun>(() => initialRun());
  const [earnedRewardThisRound, setEarnedRewardThisRound] = useState(false);
  const [ticketNotice, setTicketNotice] = useState("");
  const [challengeHearts, setChallengeHearts] = useState(3);
  const [challengeFailed, setChallengeFailed] = useState(false);
  const [challengeRunKey, setChallengeRunKey] = useState(0);
  const [heartNotice, setHeartNotice] = useState("");
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const reportedResultRef = useRef(false);
  const challengeHeartsRef = useRef(3);

  const completedSet = useMemo(() => new Set(completedGames), [completedGames]);
  const unlockedCount = GAME_PARK_ORDER.filter((gameId, index) => index === 0 || completedSet.has(GAME_PARK_ORDER[index - 1])).length;
  const isGameUnlocked = (gameId: GameParkGameId) => {
    const index = GAME_PARK_ORDER.indexOf(gameId);
    return index <= 0 || completedSet.has(GAME_PARK_ORDER[index - 1]);
  };
  const previousGameName = (gameId: GameParkGameId) => {
    const index = GAME_PARK_ORDER.indexOf(gameId);
    return index > 0 ? GAME_NAMES[GAME_PARK_ORDER[index - 1]] : "";
  };
  const gameButtonLabel = (gameId: GameParkGameId) => {
    if (!isGameUnlocked(gameId)) return `先通关${previousGameName(gameId)}`;
    if (playTickets < 1) return "需要 1 张游玩票";
    return completedSet.has(gameId) ? "使用 1 张票再玩" : "使用 1 张游玩票开始";
  };

  const resetChallenge = () => {
    challengeHeartsRef.current = 3;
    setChallengeHearts(3);
    setChallengeFailed(false);
    setHeartNotice("");
  };

  const registerMistake = () => {
    if (challengeHeartsRef.current > 0) {
      const next = challengeHeartsRef.current - 1;
      challengeHeartsRef.current = next;
      setChallengeHearts(next);
      setHeartNotice(next > 0 ? `选错了，少掉 1 颗爱心，还剩 ${next} 颗` : "爱心用完啦，再选错一次挑战就会失败");
      return;
    }
    setHeartNotice("");
    setChallengeFailed(true);
  };

  const secondsLeft = Math.max(0, Math.ceil((ROUND_DURATION_MS - run.elapsedMs) / 1000));
  const progress = Math.min(100, (run.score / FRUIT_CATCH_TARGET_SCORE) * 100);
  const result = useMemo<FruitCatchResult>(() => ({
    score: run.score,
    caught: run.caught,
    missed: run.missed,
    bestCombo: run.bestCombo,
    success: run.score >= FRUIT_CATCH_TARGET_SCORE,
  }), [run.bestCombo, run.caught, run.missed, run.score]);

  useEffect(() => {
    onPlayingChange(activeGame === "fruit-catch" ? run.phase === "playing" : activeGame !== null);
    return () => onPlayingChange(false);
  }, [activeGame, onPlayingChange, run.phase]);

  useEffect(() => {
    if (!heartNotice) return;
    const timer = window.setTimeout(() => setHeartNotice(""), 2_200);
    return () => window.clearTimeout(timer);
  }, [heartNotice]);

  useEffect(() => {
    if (run.phase !== "playing") return;
    const timer = window.setInterval(() => {
      setRun((current) => {
        if (current.phase !== "playing") return current;
        const elapsedMs = Math.min(ROUND_DURATION_MS, current.elapsedMs + TICK_MS);
        let score = current.score;
        let caught = current.caught;
        let missed = current.missed;
        let combo = current.combo;
        let bestCombo = current.bestCombo;
        let catchPulse = current.catchPulse;
        const drops: FruitDrop[] = [];

        for (const drop of current.drops) {
          const nextDrop = { ...drop, y: drop.y + drop.speed };
          const inCatchZone = nextDrop.y >= 76 && nextDrop.y <= 91;
          if (inCatchZone && Math.abs(nextDrop.x - current.playerX) <= 10) {
            const points = fruitDetails[nextDrop.kind].points;
            score += points;
            caught += 1;
            combo += 1;
            bestCombo = Math.max(bestCombo, combo);
            catchPulse += 1;
          } else if (nextDrop.y > 101) {
            missed += 1;
            combo = 0;
          } else {
            drops.push(nextDrop);
          }
        }

        let spawnMs = current.spawnMs + TICK_MS;
        if (spawnMs >= SPAWN_INTERVAL_MS && elapsedMs < ROUND_DURATION_MS - 900) {
          drops.push(randomDrop());
          spawnMs -= SPAWN_INTERVAL_MS;
        }

        return {
          ...current,
          phase: elapsedMs >= ROUND_DURATION_MS ? "finished" : "playing",
          elapsedMs,
          spawnMs,
          score,
          caught,
          missed,
          combo,
          bestCombo,
          catchPulse,
          drops: elapsedMs >= ROUND_DURATION_MS ? [] : drops,
        };
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [run.phase]);

  useEffect(() => {
    if (run.phase !== "finished" || reportedResultRef.current) return;
    reportedResultRef.current = true;
    setEarnedRewardThisRound(result.success && !daily.rewarded);
    onRoundComplete(result);
  }, [daily.rewarded, onRoundComplete, result, run.phase]);

  const startRound = () => {
    reportedResultRef.current = false;
    setEarnedRewardThisRound(false);
    setRun({
      ...initialRun(),
      phase: "playing",
      drops: [randomDrop()],
    });
  };

  const movePlayer = (nextX: number) => {
    setRun((current) => current.phase === "playing" ? { ...current, playerX: clampPlayerX(nextX) } : current);
  };

  const moveFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (run.phase !== "playing") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    movePlayer(((event.clientX - bounds.left) / bounds.width) * 100);
  };

  const leaveRound = () => {
    setRun(initialRun());
    setActiveGame(null);
  };

  const openTicketedGame = (game: GameParkGameId) => {
    if (!isGameUnlocked(game)) {
      setTicketNotice(`先通关“${previousGameName(game)}”，就能解锁“${GAME_NAMES[game]}”。`);
      return;
    }
    if (playTickets < 1) {
      setTicketNotice("游玩票用完啦。完成阅读、旅行或错题复习，就能获得新的游玩票。");
      return;
    }
    onSpendPlayTicket(game);
    setTicketNotice("");
    resetChallenge();
    setChallengeRunKey((current) => current + 1);
    if (game === "fruit-catch") setRun(initialRun());
    setActiveGame(game);
  };

  const replayFruitCatch = () => {
    if (playTickets < 1) return;
    onSpendPlayTicket("fruit-catch");
    resetChallenge();
    startRound();
  };

  const retryFailedChallenge = () => {
    if (!activeGame || playTickets < 1) {
      setTicketNotice("游玩票用完啦。返回乐园完成阅读、旅行或错题复习，就能获得新的游玩票。");
      return;
    }
    onSpendPlayTicket(activeGame);
    resetChallenge();
    setChallengeRunKey((current) => current + 1);
  };

  const leaveChallenge = () => {
    resetChallenge();
    setActiveGame(null);
  };

  const challengeFrame = (content: ReactNode) => (
    <div className="game-challenge-shell">
      <div className={`game-challenge-health ${challengeHearts === 0 ? "empty" : ""}`} aria-live="polite">
        <span><Heart aria-hidden="true" /> 1 张游玩票的生命</span>
        <strong aria-label={`还剩${challengeHearts}颗爱心`}>
          {[0, 1, 2].map((index) => <Heart key={index} className={index < challengeHearts ? "filled" : ""} aria-hidden="true" />)}
        </strong>
        <small>{challengeHearts > 0 ? "选错一次少 1 颗" : "再选错一次会失败"}</small>
      </div>
      {heartNotice && !challengeFailed && <div className="game-heart-notice" role="status">{heartNotice}</div>}
      {!challengeFailed && content}
      {challengeFailed && (
        <section className="game-challenge-failed" role="dialog" aria-label="本次挑战失败">
          <img src={`${ASSET}/characters/turtle/turtle_thinking.png`} alt={`${turtleName}准备重新挑战`} />
          <div>
            <small>本次挑战结束</small>
            <h2>爱心用完后又选错了一次</h2>
            <p>没关系，刚才的尝试已经帮助你发现容易出错的地方。再使用 1 张游玩票，就会重新得到 3 颗爱心。</p>
            <div>
              <button type="button" disabled={playTickets < 1} onClick={retryFailedChallenge}>
                {playTickets < 1 ? "游玩票不足" : "使用 1 张票重新挑战"}
              </button>
              <button type="button" onClick={leaveChallenge}>返回乐园</button>
            </div>
            {ticketNotice && <p className="game-park-ticket-notice"><Lock aria-hidden="true" /> {ticketNotice}</p>}
          </div>
        </section>
      )}
    </div>
  );

  if (!activeGame) {
    return (
      <section className="game-park-panel">
        <header className="game-park-heading">
          <div>
            <span><Gamepad2 aria-hidden="true" /> 龟龟乐园</span>
            <h1>和{turtleName}一起玩，也一起动脑</h1>
            <p>从第一个游戏开始逐个通关；完成前一项，下一项就会自动解锁。</p>
          </div>
          <button type="button" onClick={onBackHome}><ChevronLeft aria-hidden="true" /> 回家园</button>
        </header>

        <div className={`game-park-ticket-balance ${playTickets < 1 ? "empty" : ""}`} role="status">
          <img src={`${ASSET}/ui/icons/play-ticket-pixel.png`} alt="" />
          <div><strong>游玩票 × {playTickets}</strong><span>每进入一个游戏消耗 1 张；阅读、旅行和错题复习都能获得。</span></div>
        </div>
        <div className="game-unlock-progress" aria-label={`已通关${completedSet.size}个游戏，已解锁${unlockedCount}个游戏`}>
          <Trophy aria-hidden="true" />
          <span>闯关进度<strong>{Math.min(completedSet.size, GAME_PARK_ORDER.length)} / {GAME_PARK_ORDER.length}</strong></span>
          <i><b style={{ width: `${Math.min(100, completedSet.size / GAME_PARK_ORDER.length * 100)}%` }} /></i>
          <em>已解锁 {unlockedCount} 个</em>
        </div>
        {ticketNotice && <p className="game-park-ticket-notice"><Lock aria-hidden="true" /> {ticketNotice}</p>}

        <section className="game-park-featured" aria-label="可以玩的小游戏">
          <div className="game-park-hero-art" aria-hidden="true">
            <span className="fruit-orbit fruit-orbit-one"><img src={`${ASSET}/objects/fruit_red.png`} alt="" /></span>
            <span className="fruit-orbit fruit-orbit-two"><img src={`${ASSET}/objects/fruit_blue.png`} alt="" /></span>
            <img className="game-park-turtle" src={`${ASSET}/characters/turtle/turtle_excited.png`} alt="" />
            <img className="game-park-basket" src={`${ASSET}/objects/fruit_basket.png`} alt="" />
          </div>
          <div className="game-park-featured-copy">
            <small>今日推荐 · 反应力游戏</small>
            <h2>龟龟接果子</h2>
            <p>移动龟龟接住从树上落下的果子，蓝色惊喜果一次可以得到 2 分！</p>
            <div className="game-park-rule-chips">
              <span><Clock3 aria-hidden="true" /> 30 秒一局</span>
              <span><Trophy aria-hidden="true" /> {FRUIT_CATCH_TARGET_SCORE} 分过关</span>
              <span className={daily.rewarded ? "claimed" : ""}><Star aria-hidden="true" /> {daily.rewarded ? "今日星星已领" : "今日首胜送 1 星"}</span>
            </div>
            <div className="game-park-daily-stats" aria-label={`今天玩了${daily.plays}局，最好成绩${daily.bestScore}分`}>
              <span>今日局数<strong>{daily.plays}</strong></span>
              <span>最好成绩<strong>{daily.bestScore}</strong></span>
              <span>累计接到<strong>{daily.totalCaught}</strong></span>
            </div>
            <button
              className="game-park-start"
              type="button"
              disabled={playTickets < 1}
              onClick={() => openTicketedGame("fruit-catch")}
            >
              {gameButtonLabel("fruit-catch")} <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </section>

        <section className="game-park-open-games" aria-label="动脑小游戏">
          <header><Sparkles aria-hidden="true" /><div><h2>沿着游戏路线继续闯关</h2><p>灰色项目还没有解锁；先完成它前面的游戏吧。</p></div></header>
          <div className="game-park-open-grid">
            <article className={`game-park-choice courier ${isGameUnlocked("turtle-courier") ? "" : "locked"}`}>
              <div className="game-park-choice-art" aria-hidden="true">
                <Map />
                <span>📦</span><span>🏫</span><span>🏥</span>
                <img src={`${ASSET}/characters/turtle/turtle_travel_start.png`} alt="" />
              </div>
              <div>
                <small>路线规划游戏</small>
                <h3>乌龟快递员</h3>
                <p>看清道路和距离，安排送件顺序，帮助龟龟找到真正的最短路线。</p>
                <ul><li>点击相邻地点前进</li><li>送完所有包裹</li><li>和最短距离比一比</li></ul>
                <button type="button" disabled={playTickets < 1 || !isGameUnlocked("turtle-courier")} onClick={() => openTicketedGame("turtle-courier")}>
                  {gameButtonLabel("turtle-courier")} {isGameUnlocked("turtle-courier") ? <ChevronRight aria-hidden="true" /> : <Lock aria-hidden="true" />}
                </button>
              </div>
            </article>
            <article className={`game-park-choice weather ${isGameUnlocked("weather-outfit") ? "" : "locked"}`}>
              <div className="game-park-choice-art" aria-hidden="true">
                <CloudSun />
                <span>☀️</span><span>🌧️</span><span>❄️</span>
                <img src={`${ASSET}/characters/turtle/turtle_idle_front.png`} alt="" />
              </div>
              <div>
                <small>生活判断游戏</small>
                <h3>天气穿搭</h3>
                <p>根据温度、降雨、风力和行程，为龟龟选择衣服与旅行用品。</p>
                <ul><li>先读天气任务</li><li>衣服用品都要选</li><li>合适就好，不是越多越好</li></ul>
                <button type="button" disabled={playTickets < 1 || !isGameUnlocked("weather-outfit")} onClick={() => openTicketedGame("weather-outfit")}>
                  {gameButtonLabel("weather-outfit")} {isGameUnlocked("weather-outfit") ? <ChevronRight aria-hidden="true" /> : <Lock aria-hidden="true" />}
                </button>
              </div>
            </article>
            <article className={`game-park-choice lotus ${isGameUnlocked("lotus-jump") ? "" : "locked"}`}>
              <div className="game-park-choice-art" aria-hidden="true">
                <Waves />
                <span>1</span><span>3</span><span>5</span>
                <img src={`${ASSET}/characters/turtle/turtle_idle_standing.png`} alt="" />
              </div>
              <div>
                <small>数字规律游戏</small>
                <h3>荷叶跳跳</h3>
                <p>观察数字和算式的规律，带龟龟按正确顺序跳过六片池塘。</p>
                <ul><li>数字顺序与奇偶</li><li>倍数和算式</li><li>递推规律挑战</li></ul>
                <button type="button" disabled={playTickets < 1 || !isGameUnlocked("lotus-jump")} onClick={() => openTicketedGame("lotus-jump")}>
                  {gameButtonLabel("lotus-jump")} {isGameUnlocked("lotus-jump") ? <ChevronRight aria-hidden="true" /> : <Lock aria-hidden="true" />}
                </button>
              </div>
            </article>
            <article className={`game-park-choice difference ${isGameUnlocked("spot-difference") ? "" : "locked"}`}>
              <div className="game-park-choice-art" aria-hidden="true">
                <Search />
                <span>🌸</span><span>🌼</span><span>🔎</span>
                <img src={`${ASSET}/characters/turtle/turtle_idle_front.png`} alt="" />
              </div>
              <div>
                <small>观察比较游戏</small>
                <h3>龟龟找不同</h3>
                <p>比较两幅龟龟场景，找出颜色、数量、形状和位置的变化。</p>
                <ul><li>四幅不同场景</li><li>每关逐步加难</li><li>找不到可请龟龟提示</li></ul>
                <button type="button" disabled={playTickets < 1 || !isGameUnlocked("spot-difference")} onClick={() => openTicketedGame("spot-difference")}>
                  {gameButtonLabel("spot-difference")} {isGameUnlocked("spot-difference") ? <ChevronRight aria-hidden="true" /> : <Lock aria-hidden="true" />}
                </button>
              </div>
            </article>
            <article className={`game-park-choice story ${isGameUnlocked("story-puzzle") ? "" : "locked"}`}>
              <div className="game-park-choice-art" aria-hidden="true">
                <BookOpen />
                <span>①</span><span>②</span><span>③</span>
                <img src={`${ASSET}/characters/turtle/turtle_reading.png`} alt="" />
              </div>
              <div>
                <small>阅读表达游戏</small>
                <h3>拼故事</h3>
                <p>读懂每张情节卡，按前因后果把故事拼完整，成为小小故事导演。</p>
                <ul><li>五个原创小故事</li><li>由三步增加到六步</li><li>理解起因、经过和结果</li></ul>
                <button type="button" disabled={playTickets < 1 || !isGameUnlocked("story-puzzle")} onClick={() => openTicketedGame("story-puzzle")}>
                  {gameButtonLabel("story-puzzle")} {isGameUnlocked("story-puzzle") ? <ChevronRight aria-hidden="true" /> : <Lock aria-hidden="true" />}
                </button>
              </div>
            </article>
            <article className={`game-park-choice flight ${isGameUnlocked("turtle-sky") ? "" : "locked"}`}>
              <div className="game-park-choice-art" aria-hidden="true">
                <Plane />
                <span>⭐</span><span>☁️</span><span>💛</span>
                <img src={`${ASSET}/characters/turtle/turtle_excited.png`} alt="" />
              </div>
              <div>
                <small>反应与方向游戏</small>
                <h3>龟龟飞机大战</h3>
                <p>移动鼠标或拖动手指驾驶龟龟飞行器，收集星星、轻松避开乌云。</p>
                <ul><li>鼠标跟随控制</li><li>三关缓慢加速</li><li>儿童友好的星光挑战</li></ul>
                <button type="button" disabled={playTickets < 1 || !isGameUnlocked("turtle-sky")} onClick={() => openTicketedGame("turtle-sky")}>
                  {gameButtonLabel("turtle-sky")} {isGameUnlocked("turtle-sky") ? <ChevronRight aria-hidden="true" /> : <Lock aria-hidden="true" />}
                </button>
              </div>
            </article>
            <article className={`game-park-choice race ${isGameUnlocked("tortoise-race") ? "" : "locked"}`}>
              <div className="game-park-choice-art" aria-hidden="true">
                <Trophy />
                <span>🏁</span><span>🐇</span><span>加速！</span>
                <img src={`${ASSET}/characters/turtle/turtle_idle_standing.png`} alt="" />
              </div>
              <div>
                <small>手速与坚持游戏</small>
                <h3>龟兔赛跑</h3>
                <p>灰兔会慢慢向前跑，直接连续点击龟龟；点得越快，龟龟爬得越快。</p>
                <ul><li>双方同时从起点出发</li><li>连点形成加速</li><li>本局重赛不重复扣票</li></ul>
                <button type="button" disabled={playTickets < 1 || !isGameUnlocked("tortoise-race")} onClick={() => openTicketedGame("tortoise-race")}>
                  {gameButtonLabel("tortoise-race")} {isGameUnlocked("tortoise-race") ? <ChevronRight aria-hidden="true" /> : <Lock aria-hidden="true" />}
                </button>
              </div>
            </article>
          </div>
        </section>

        <section className="game-park-coming" aria-label="正在准备的小游戏">
          <header><Sparkles aria-hidden="true" /><div><h2>更多游戏正在准备</h2><p>以后可以在同一个乐园里选择不同玩法。</p></div></header>
          <div>
            <article><Lock aria-hidden="true" /><strong>贝壳翻翻乐</strong><span>练一练观察和记忆</span></article>
            <article><Lock aria-hidden="true" /><strong>云朵配对</strong><span>把有关联的图案连起来</span></article>
          </div>
        </section>
      </section>
    );
  }

  if (activeGame === "turtle-courier") {
    return challengeFrame(
      <CourierGame
        key={challengeRunKey}
        turtleName={turtleName}
        onBack={leaveChallenge}
        onMistake={registerMistake}
        onComplete={(detail) => onLearningGameComplete({ game: "turtle-courier", detail })}
      />
    );
  }

  if (activeGame === "weather-outfit") {
    return challengeFrame(
      <WeatherOutfitGame
        key={challengeRunKey}
        turtleName={turtleName}
        onBack={leaveChallenge}
        onMistake={registerMistake}
        onComplete={(detail) => onLearningGameComplete({ game: "weather-outfit", detail })}
      />
    );
  }

  if (activeGame === "lotus-jump") {
    return challengeFrame(
      <LotusJumpGame
        key={challengeRunKey}
        turtleName={turtleName}
        onBack={leaveChallenge}
        onMistake={registerMistake}
        onComplete={(detail) => onLearningGameComplete({ game: "lotus-jump", detail })}
      />
    );
  }

  if (activeGame === "spot-difference") {
    return challengeFrame(
      <SpotDifferenceGame
        key={challengeRunKey}
        turtleName={turtleName}
        onBack={leaveChallenge}
        onMistake={registerMistake}
        onComplete={(detail) => onLearningGameComplete({ game: "spot-difference", detail })}
      />
    );
  }

  if (activeGame === "story-puzzle") {
    return challengeFrame(
      <StoryPuzzleGame
        key={challengeRunKey}
        turtleName={turtleName}
        onBack={leaveChallenge}
        onMistake={registerMistake}
        onComplete={(detail) => onLearningGameComplete({ game: "story-puzzle", detail })}
      />
    );
  }

  if (activeGame === "turtle-sky") {
    return challengeFrame(
      <TurtleSkyGame
        key={challengeRunKey}
        turtleName={turtleName}
        hearts={challengeHearts}
        onBack={leaveChallenge}
        onMistake={registerMistake}
        onComplete={(detail) => onLearningGameComplete({ game: "turtle-sky", detail })}
      />
    );
  }

  if (activeGame === "tortoise-race") {
    return challengeFrame(
      <TortoiseRaceGame
        key={challengeRunKey}
        turtleName={turtleName}
        onBack={leaveChallenge}
        onComplete={(detail) => onLearningGameComplete({ game: "tortoise-race", detail })}
      />
    );
  }

  return challengeFrame(
    <section className="fruit-catch-panel">
      <header className="fruit-catch-heading">
        <div>
          <span><Gamepad2 aria-hidden="true" /> 龟龟乐园</span>
          <h1>龟龟接果子</h1>
        </div>
        <button type="button" onClick={leaveRound} aria-label={run.phase === "playing" ? "结束本局" : "返回龟龟乐园"}>
          {run.phase === "playing" ? <X aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
          {run.phase === "playing" ? "结束本局" : "返回乐园"}
        </button>
      </header>

      <div className="fruit-catch-hud" aria-live="polite">
        <div><small>剩余时间</small><strong><Clock3 aria-hidden="true" /> {secondsLeft}</strong></div>
        <div className="fruit-catch-target">
          <small>本局得分</small>
          <strong>{run.score}<i>/ {FRUIT_CATCH_TARGET_SCORE}</i></strong>
          <span><i style={{ width: `${progress}%` }} /></span>
        </div>
        <div><small>连续接到</small><strong><Sparkles aria-hidden="true" /> {run.combo}</strong></div>
      </div>

      <div
        ref={fieldRef}
        className={`fruit-catch-field ${run.phase === "playing" ? "is-playing" : ""} ${run.catchPulse % 2 ? "caught-odd" : "caught-even"}`}
        role="application"
        aria-label="接果子游戏区域。可以移动鼠标、拖动手指或按左右方向键控制龟龟。"
        tabIndex={0}
        onPointerDown={moveFromPointer}
        onPointerMove={moveFromPointer}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            movePlayer(run.playerX - 8);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            movePlayer(run.playerX + 8);
          }
        }}
      >
        <div className="fruit-catch-tree-crown" aria-hidden="true" />
        {run.drops.map((drop) => {
          const detail = fruitDetails[drop.kind];
          return (
            <img
              className={`falling-fruit fruit-${drop.kind}`}
              key={drop.id}
              src={detail.src}
              alt={detail.label}
              style={{ left: `${drop.x}%`, top: `${drop.y}%`, transform: `translate(-50%, -50%) rotate(${drop.y * drop.spin * 0.08}deg)` }}
            />
          );
        })}

        <div className="fruit-catch-player" style={{ left: `${run.playerX}%` }} aria-hidden="true">
          <img className="fruit-catch-turtle" src={`${ASSET}/characters/turtle/turtle_idle_standing.png`} alt="" />
          <img className="fruit-catch-basket" src={`${ASSET}/objects/fruit_basket.png`} alt="" />
          {run.combo >= 3 && <span>连击 × {run.combo}</span>}
        </div>

        {run.phase === "intro" && (
          <div className="fruit-catch-overlay fruit-catch-intro">
            <img src={`${ASSET}/characters/turtle/turtle_excited.png`} alt={`${turtleName}准备接果子`} />
            <div>
              <small>准备好了吗？</small>
              <h2>接到 {FRUIT_CATCH_TARGET_SCORE} 分就过关</h2>
              <p>在画面里移动鼠标或手指，电脑也可以按左右方向键。</p>
              <div className="fruit-score-guide">
                <span><img src={`${ASSET}/objects/fruit_red.png`} alt="" /> 普通果子 +1</span>
                <span><img src={`${ASSET}/objects/fruit_blue.png`} alt="" /> 蓝色惊喜果 +2</span>
              </div>
              <button type="button" onClick={startRound}>开始！</button>
            </div>
          </div>
        )}

        {run.phase === "finished" && (
          <div className={`fruit-catch-overlay fruit-catch-result ${result.success ? "success" : "retry"}`} role="dialog" aria-label="本局游戏结果">
            <img
              src={`${ASSET}/characters/turtle/${result.success ? "turtle_happy_hearts.png" : "turtle_thinking.png"}`}
              alt={result.success ? `${turtleName}开心庆祝` : `${turtleName}准备再试一次`}
            />
            <div>
              <small>{result.success ? "过关啦！" : "差一点就成功啦"}</small>
              <h2>本局得到 {result.score} 分</h2>
              <p>接到 {result.caught} 个果子，最高连续接到 {result.bestCombo} 个。</p>
              <div className="fruit-catch-reward">
                <Star fill="currentColor" aria-hidden="true" />
                {result.success
                  ? earnedRewardThisRound ? "今天首次过关，获得 1 颗星星" : "今天的星星奖励已经领取过啦"
                  : `再得到 ${Math.max(0, FRUIT_CATCH_TARGET_SCORE - result.score)} 分就能过关`}
              </div>
              <div className="fruit-catch-result-actions">
                <button type="button" disabled={playTickets < 1} onClick={replayFruitCatch}>
                  {playTickets < 1 ? "游玩票不足" : "使用 1 张票再玩"}
                </button>
                <button type="button" onClick={leaveRound}>返回乐园</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="fruit-catch-controls" aria-label="移动龟龟">
        <button type="button" onPointerDown={() => movePlayer(run.playerX - 10)} disabled={run.phase !== "playing"}><ChevronLeft aria-hidden="true" /> 向左</button>
        <p>跟着果子移动，让果篮接住它</p>
        <button type="button" onPointerDown={() => movePlayer(run.playerX + 10)} disabled={run.phase !== "playing"}>向右 <ChevronRight aria-hidden="true" /></button>
      </div>
    </section>,
  );
}
