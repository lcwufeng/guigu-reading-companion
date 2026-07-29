/* eslint-disable @next/next/no-img-element -- Reuses the project's canonical turtle sprites. */
"use client";

import { ChevronLeft, Clock3, MousePointerClick, Play, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const TURTLE = `${BASE_PATH}/assets/characters/turtle/turtle_idle_standing.png`;
const RACE_TICK_MS = 50;
const RABBIT_STEP = 0.13;

type RaceWinner = "turtle" | "rabbit" | null;

type RaceLevel = {
  id: string;
  name: string;
  subtitle: string;
  difficulty: string;
  rabbitStep: number;
  turtlePush: number;
  route: number[];
  scenery: string[];
};

const RACE_LEVELS: RaceLevel[] = [
  {
    id: "flower-meadow",
    name: "花田直道",
    subtitle: "先在平坦花田里熟悉连续点击",
    difficulty: "热身",
    rabbitStep: RABBIT_STEP,
    turtlePush: 0.88,
    route: [56, 56, 56, 56, 56],
    scenery: ["☁️", "🌳", "🌼", "🌻", "🌷", "🪧"],
  },
  {
    id: "pond-bridge",
    name: "荷塘木桥",
    subtitle: "沿着拱起的木桥越过荷塘",
    difficulty: "简单",
    rabbitStep: RABBIT_STEP + 0.02,
    turtlePush: 0.85,
    route: [64, 50, 35, 43, 64],
    scenery: ["☁️", "🪷", "🌊", "🪵", "🐟", "🌿"],
  },
  {
    id: "orchard-bends",
    name: "果园弯道",
    subtitle: "弯弯果园路，需要保持点击节奏",
    difficulty: "进阶",
    rabbitStep: RABBIT_STEP + 0.04,
    turtlePush: 0.82,
    route: [58, 35, 69, 34, 58],
    scenery: ["🍎", "🌳", "🍊", "🧺", "🍐", "🌻"],
  },
  {
    id: "hill-switchback",
    name: "山坡折返",
    subtitle: "上坡下坡连续变化，灰兔也更快了",
    difficulty: "挑战",
    rabbitStep: RABBIT_STEP + 0.06,
    turtlePush: 0.8,
    route: [70, 34, 67, 29, 57],
    scenery: ["⛰️", "🌲", "🪨", "🌤️", "🌲", "🏕️"],
  },
  {
    id: "firefly-forest",
    name: "萤火森林",
    subtitle: "跟着萤火虫穿过起伏的夜路",
    difficulty: "困难",
    rabbitStep: RABBIT_STEP + 0.08,
    turtlePush: 0.78,
    route: [52, 69, 34, 66, 39, 56],
    scenery: ["🌙", "🌲", "✨", "🍄", "🌳", "🦉"],
  },
  {
    id: "rainbow-cloud",
    name: "彩虹云径",
    subtitle: "最终赛道像彩虹一样高低起伏",
    difficulty: "冠军",
    rabbitStep: RABBIT_STEP + 0.1,
    turtlePush: 0.76,
    route: [69, 40, 25, 57, 34, 58],
    scenery: ["🌈", "☁️", "⭐", "☁️", "🏰", "🏆"],
  },
];

type RaceRun = {
  phase: "intro" | "countdown" | "racing" | "finished";
  countdown: number;
  turtleProgress: number;
  rabbitProgress: number;
  taps: number;
  streak: number;
  bestStreak: number;
  lastTapAt: number;
  elapsedMs: number;
  winner: RaceWinner;
  tapPulse: number;
};

type RaceCampaign = {
  totalTaps: number;
  totalElapsedMs: number;
  bestStreak: number;
};

function initialRun(): RaceRun {
  return {
    phase: "intro",
    countdown: 3,
    turtleProgress: 0,
    rabbitProgress: 0,
    taps: 0,
    streak: 0,
    bestStreak: 0,
    lastTapAt: 0,
    elapsedMs: 0,
    winner: null,
    tapPulse: 0,
  };
}

function runnerLeft(progress: number) {
  return `${6 + Math.min(100, progress) * 0.85}%`;
}

function routeY(level: RaceLevel, progress: number) {
  const boundedProgress = Math.max(0, Math.min(100, progress));
  const scaled = boundedProgress / 100 * (level.route.length - 1);
  const index = Math.min(level.route.length - 2, Math.floor(scaled));
  const fraction = scaled - index;
  return level.route[index] + (level.route[index + 1] - level.route[index]) * fraction;
}

function routePoints(level: RaceLevel) {
  return level.route
    .map((point, index) => `${index / (level.route.length - 1) * 100},${point}`)
    .join(" ");
}

export default function TortoiseRaceGame({
  turtleName,
  onBack,
  onComplete,
}: {
  turtleName: string;
  onBack: () => void;
  onComplete: (detail: string) => void;
}) {
  const [levelIndex, setLevelIndex] = useState(0);
  const [run, setRun] = useState<RaceRun>(() => initialRun());
  const [campaign, setCampaign] = useState<RaceCampaign>({ totalTaps: 0, totalElapsedMs: 0, bestStreak: 0 });
  const reportedLevelRef = useRef(false);
  const reportedCampaignRef = useRef(false);
  const level = RACE_LEVELS[levelIndex];
  const finalLevel = levelIndex === RACE_LEVELS.length - 1;
  const turtleWon = run.phase === "finished" && run.winner === "turtle";
  const speedLevel = run.streak >= 12 ? 4 : run.streak >= 8 ? 3 : run.streak >= 4 ? 2 : run.streak > 0 ? 1 : 0;
  const speedLabel = ["等你点击", "开始爬啦", "正在加速", "飞快前进", "超级冲刺"][speedLevel];
  const campaignElapsed = campaign.totalElapsedMs + (run.phase === "finished" && turtleWon ? 0 : run.elapsedMs);

  useEffect(() => {
    if (run.phase !== "countdown") return;
    const timer = window.setTimeout(() => {
      setRun((current) => current.phase !== "countdown"
        ? current
        : current.countdown > 1
          ? { ...current, countdown: current.countdown - 1 }
          : { ...current, phase: "racing", countdown: 0 });
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [run.countdown, run.phase]);

  useEffect(() => {
    if (run.phase !== "racing") return;
    const timer = window.setInterval(() => {
      setRun((current) => {
        if (current.phase !== "racing") return current;
        const elapsedMs = current.elapsedMs + RACE_TICK_MS;
        const routeRhythm = 1 + Math.sin(elapsedMs / (1_550 - levelIndex * 90)) * (0.025 + levelIndex * 0.004);
        const rabbitProgress = Math.min(100, current.rabbitProgress + level.rabbitStep * routeRhythm);
        const streak = Date.now() - current.lastTapAt > 650 ? 0 : current.streak;
        return rabbitProgress >= 100
          ? { ...current, phase: "finished", rabbitProgress: 100, elapsedMs, streak: 0, winner: "rabbit" }
          : { ...current, rabbitProgress, elapsedMs, streak };
      });
    }, RACE_TICK_MS);
    return () => window.clearInterval(timer);
  }, [level.rabbitStep, levelIndex, run.phase]);

  useEffect(() => {
    if (!turtleWon || reportedLevelRef.current) return;
    reportedLevelRef.current = true;
    const totals = {
      totalTaps: campaign.totalTaps + run.taps,
      totalElapsedMs: campaign.totalElapsedMs + run.elapsedMs,
      bestStreak: Math.max(campaign.bestStreak, run.bestStreak),
    };
    setCampaign(totals);
    if (finalLevel && !reportedCampaignRef.current) {
      reportedCampaignRef.current = true;
      onComplete(
        `完成龟兔赛跑六关赛程，用${totals.totalTaps}次点击帮助龟龟依次跑过${RACE_LEVELS.map((item) => item.name).join("、")}，总用时${(totals.totalElapsedMs / 1_000).toFixed(1)}秒，最高连续加速${totals.bestStreak}次`,
      );
    }
  }, [
    campaign.bestStreak,
    campaign.totalElapsedMs,
    campaign.totalTaps,
    finalLevel,
    onComplete,
    run.bestStreak,
    run.elapsedMs,
    run.taps,
    turtleWon,
  ]);

  const prepareRace = () => {
    reportedLevelRef.current = false;
    setRun({ ...initialRun(), phase: "countdown" });
  };

  const advanceLevel = () => {
    if (finalLevel) {
      onBack();
      return;
    }
    reportedLevelRef.current = false;
    setLevelIndex((current) => current + 1);
    setRun({ ...initialRun(), phase: "countdown" });
  };

  const tapTurtle = () => {
    setRun((current) => {
      if (current.phase !== "racing") return current;
      const now = Date.now();
      const streak = now - current.lastTapAt <= 430 ? Math.min(15, current.streak + 1) : 1;
      const push = level.turtlePush + Math.min(streak, 12) * 0.032;
      const turtleProgress = Math.min(100, current.turtleProgress + push);
      return turtleProgress >= 100
        ? {
            ...current,
            phase: "finished",
            turtleProgress: 100,
            taps: current.taps + 1,
            streak,
            bestStreak: Math.max(current.bestStreak, streak),
            lastTapAt: now,
            winner: "turtle",
            tapPulse: current.tapPulse + 1,
          }
        : {
            ...current,
            turtleProgress,
            taps: current.taps + 1,
            streak,
            bestStreak: Math.max(current.bestStreak, streak),
            lastTapAt: now,
            tapPulse: current.tapPulse + 1,
          };
    });
  };

  return (
    <section className="learning-game-panel race-game-panel">
      <header className="learning-game-heading">
        <div>
          <span><Trophy aria-hidden="true" /> 龟龟乐园 · 六关手速赛</span>
          <h1>龟兔赛跑</h1>
        </div>
        <button type="button" onClick={onBack}><ChevronLeft aria-hidden="true" /> 返回乐园</button>
      </header>

      <nav className="race-level-progress" aria-label={`龟兔赛跑第${levelIndex + 1}关，共${RACE_LEVELS.length}关`}>
        {RACE_LEVELS.map((item, index) => (
          <span
            className={index < levelIndex ? "complete" : index === levelIndex ? "current" : "upcoming"}
            key={item.id}
          >
            <i>{index < levelIndex ? "✓" : index + 1}</i>
            <b>{item.name}</b>
          </span>
        ))}
      </nav>

      <div className="race-game-layout">
        <section
          className={`race-track route-${level.id} race-phase-${run.phase} ${run.tapPulse % 2 ? "tap-odd" : "tap-even"}`}
          aria-label={`龟兔赛跑第${levelIndex + 1}关，${level.name}`}
        >
          <div className="race-route-badge">
            <span>第 {levelIndex + 1} / {RACE_LEVELS.length} 关</span>
            <strong>{level.name}</strong>
            <em>{level.difficulty}</em>
          </div>
          <div className="race-scenery" aria-hidden="true">
            {level.scenery.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}
          </div>
          <div className="race-start-line" aria-hidden="true"><b>起点</b></div>
          <div className="race-finish-line" aria-hidden="true"><b>终点</b><span>🏁</span></div>

          <div className="race-lane rabbit-lane">
            <svg className="race-route-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={routePoints(level)} />
            </svg>
            <div className="race-lane-label"><span>灰兔</span><strong>{Math.round(run.rabbitProgress)}%</strong></div>
            <div
              className="rabbit-runner"
              style={{ left: runnerLeft(run.rabbitProgress), top: `${routeY(level, run.rabbitProgress)}%` }}
              aria-label={`灰兔已前进${Math.round(run.rabbitProgress)}%`}
            >
              <span aria-hidden="true">🐇</span>
              <i aria-hidden="true" />
            </div>
          </div>

          <div className="race-lane turtle-lane">
            <svg className="race-route-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={routePoints(level)} />
            </svg>
            <div className="race-lane-label"><span>{turtleName}</span><strong>{Math.round(run.turtleProgress)}%</strong></div>
            <button
              type="button"
              className="turtle-race-runner"
              style={{ left: runnerLeft(run.turtleProgress), top: `${routeY(level, run.turtleProgress)}%` }}
              disabled={run.phase !== "racing"}
              onClick={tapTurtle}
              aria-label={`点击${turtleName}加速，已前进${Math.round(run.turtleProgress)}%`}
            >
              <img src={TURTLE} alt="" />
              {run.phase === "racing" && <span>点我！</span>}
              {run.streak >= 4 && <i>×{run.streak}</i>}
            </button>
          </div>

          {run.phase === "intro" && (
            <div className="race-overlay race-intro">
              <div className="race-intro-runners" aria-hidden="true">
                <img src={TURTLE} alt="" />
                <span>🐇</span>
              </div>
              <div>
                <small>一张游玩票 · 连闯六条路线</small>
                <h2>点击越快，龟龟爬得越快</h2>
                <p>从花田直道出发，每过一关才能进入下一条路线。赛道会越来越弯，灰兔也会逐关加速。</p>
                <button type="button" onClick={prepareRace}><Play aria-hidden="true" /> 开始第一关</button>
              </div>
            </div>
          )}

          {run.phase === "countdown" && (
            <div className="race-countdown" role="status" aria-label={`比赛将在${run.countdown}秒后开始`}>
              <strong>{run.countdown}</strong>
              <span>{level.name} · 龟龟和灰兔都在起点准备</span>
            </div>
          )}

          {run.phase === "racing" && (
            <div className="race-tap-coach" aria-live="polite"><MousePointerClick aria-hidden="true" /> 跟着弯弯赛道不停点击龟龟！</div>
          )}

          {run.phase === "finished" && (
            <div className={`race-overlay race-result ${turtleWon ? "success" : "retry"}`} role="dialog" aria-label="比赛结果">
              <img
                src={`${BASE_PATH}/assets/characters/turtle/${turtleWon ? "turtle_happy_hearts.png" : "turtle_thinking.png"}`}
                alt=""
              />
              <div>
                <small>{turtleWon ? `${level.name}通过！` : "灰兔先到了一步"}</small>
                <h2>
                  {turtleWon
                    ? finalLevel
                      ? "六条路线全部通关，龟龟是冠军！"
                      : `下一关：${RACE_LEVELS[levelIndex + 1].name}`
                    : "调整节奏，再挑战这一关"}
                </h2>
                <p>
                  本关点击 {run.taps} 次，最高连续加速 {run.bestStreak} 次，
                  用时 {(run.elapsedMs / 1_000).toFixed(1)} 秒。
                </p>
                <div className="race-result-actions">
                  {turtleWon ? (
                    <button type="button" onClick={advanceLevel}>
                      {finalLevel ? <Trophy aria-hidden="true" /> : <Play aria-hidden="true" />}
                      {finalLevel ? "完成冠军赛" : "前往下一关"}
                    </button>
                  ) : (
                    <button type="button" onClick={prepareRace}><RotateCcw aria-hidden="true" /> 再试本关</button>
                  )}
                  <button type="button" onClick={onBack}>返回乐园</button>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="race-dashboard">
          <small>当前路线 · {level.difficulty}</small>
          <h2>{level.name}</h2>
          <p className="race-level-description">{level.subtitle}</p>
          <ol>
            <li><b>1</b><span>双方每关都会重新回到同一个起点。</span></li>
            <li><b>2</b><span>跟着不同曲线前进，灰兔会一关比一关快。</span></li>
            <li><b>3</b><span>用手指或鼠标连点龟龟，保持节奏就能持续加速。</span></li>
          </ol>
          <div className="race-speed-card" aria-live="polite">
            <div><Sparkles aria-hidden="true" /><span>龟龟速度<strong>{speedLabel}</strong></span></div>
            <div className={`race-speed-meter speed-${speedLevel}`}>{[0, 1, 2, 3].map((item) => <i key={item} />)}</div>
          </div>
          <div className="race-live-stats">
            <span><MousePointerClick aria-hidden="true" /><b>本关点击</b><strong>{run.taps}</strong></span>
            <span><Clock3 aria-hidden="true" /><b>赛程用时</b><strong>{(campaignElapsed / 1_000).toFixed(1)}秒</strong></span>
          </div>
          <div className="learning-game-feedback hint"><Sparkles aria-hidden="true" /><p>没有跑赢时可以直接重试当前关，不会重复消耗游玩票。</p></div>
        </aside>
      </div>
    </section>
  );
}
