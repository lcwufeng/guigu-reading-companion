/* eslint-disable @next/next/no-img-element -- The game reuses the project's local pixel-art assets. */
"use client";

import { ChevronLeft, ChevronRight, Clock3, Gamepad2, Lock, Sparkles, Star, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

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
  onBackHome,
  onRoundComplete,
  onPlayingChange,
}: {
  turtleName: string;
  daily: FruitCatchDailyState;
  onBackHome: () => void;
  onRoundComplete: (result: FruitCatchResult) => void;
  onPlayingChange: (playing: boolean) => void;
}) {
  const [activeGame, setActiveGame] = useState<"fruit-catch" | null>(null);
  const [run, setRun] = useState<FruitCatchRun>(() => initialRun());
  const [earnedRewardThisRound, setEarnedRewardThisRound] = useState(false);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const reportedResultRef = useRef(false);

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
    onPlayingChange(run.phase === "playing");
    return () => onPlayingChange(false);
  }, [onPlayingChange, run.phase]);

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

  if (!activeGame) {
    return (
      <section className="game-park-panel">
        <header className="game-park-heading">
          <div>
            <span><Gamepad2 aria-hidden="true" /> 龟龟乐园</span>
            <h1>和{turtleName}痛痛快快玩一局</h1>
            <p>每局只有几分钟，动动手、动动脑，再带着好心情去学习。</p>
          </div>
          <button type="button" onClick={onBackHome}><ChevronLeft aria-hidden="true" /> 回家园</button>
        </header>

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
              onClick={() => {
                setRun(initialRun());
                setActiveGame("fruit-catch");
              }}
            >
              开始接果子 <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </section>

        <section className="game-park-coming" aria-label="正在准备的小游戏">
          <header><Sparkles aria-hidden="true" /><div><h2>更多游戏正在准备</h2><p>以后可以在同一个乐园里选择不同玩法。</p></div></header>
          <div>
            <article><Lock aria-hidden="true" /><strong>贝壳翻翻乐</strong><span>练一练观察和记忆</span></article>
            <article><Lock aria-hidden="true" /><strong>荷叶跳跳</strong><span>帮龟龟找到正确路线</span></article>
            <article><Lock aria-hidden="true" /><strong>故事拼拼看</strong><span>把故事情节排好顺序</span></article>
          </div>
        </section>
      </section>
    );
  }

  return (
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
                <button type="button" onClick={startRound}>再玩一局</button>
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
    </section>
  );
}
