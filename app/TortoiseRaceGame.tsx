/* eslint-disable @next/next/no-img-element -- Reuses the project's canonical turtle sprites. */
"use client";

import { ChevronLeft, Clock3, MousePointerClick, Play, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const TURTLE = `${BASE_PATH}/assets/characters/turtle/turtle_idle_standing.png`;
const RACE_TICK_MS = 50;
const RABBIT_STEP = 0.18;

type RaceWinner = "turtle" | "rabbit" | null;

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

export default function TortoiseRaceGame({
  turtleName,
  onBack,
  onComplete,
}: {
  turtleName: string;
  onBack: () => void;
  onComplete: (detail: string) => void;
}) {
  const [run, setRun] = useState<RaceRun>(() => initialRun());
  const reportedRef = useRef(false);
  const turtleWon = run.phase === "finished" && run.winner === "turtle";
  const speedLevel = run.streak >= 12 ? 4 : run.streak >= 8 ? 3 : run.streak >= 4 ? 2 : run.streak > 0 ? 1 : 0;
  const speedLabel = ["等你点击", "开始爬啦", "正在加速", "飞快前进", "超级冲刺"][speedLevel];

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
        const gentleVariation = 1 + Math.sin(elapsedMs / 1_600) * 0.035;
        const rabbitProgress = Math.min(100, current.rabbitProgress + RABBIT_STEP * gentleVariation);
        const streak = Date.now() - current.lastTapAt > 650 ? 0 : current.streak;
        return rabbitProgress >= 100
          ? { ...current, phase: "finished", rabbitProgress: 100, elapsedMs, streak: 0, winner: "rabbit" }
          : { ...current, rabbitProgress, elapsedMs, streak };
      });
    }, RACE_TICK_MS);
    return () => window.clearInterval(timer);
  }, [run.phase]);

  useEffect(() => {
    if (!turtleWon || reportedRef.current) return;
    reportedRef.current = true;
    onComplete(`完成龟兔赛跑，用${run.taps}次点击帮助龟龟在${(run.elapsedMs / 1_000).toFixed(1)}秒内到达终点，最高连续加速${run.bestStreak}次`);
  }, [onComplete, run.bestStreak, run.elapsedMs, run.taps, turtleWon]);

  const prepareRace = () => {
    reportedRef.current = false;
    setRun({ ...initialRun(), phase: "countdown" });
  };

  const tapTurtle = () => {
    setRun((current) => {
      if (current.phase !== "racing") return current;
      const now = Date.now();
      const streak = now - current.lastTapAt <= 430 ? Math.min(15, current.streak + 1) : 1;
      const push = 0.72 + Math.min(streak, 12) * 0.035;
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
          <span><Trophy aria-hidden="true" /> 龟龟乐园 · 手速挑战</span>
          <h1>龟兔赛跑</h1>
        </div>
        <button type="button" onClick={onBack}><ChevronLeft aria-hidden="true" /> 返回乐园</button>
      </header>

      <div className="race-game-layout">
        <section
          className={`race-track race-phase-${run.phase} ${run.tapPulse % 2 ? "tap-odd" : "tap-even"}`}
          aria-label="龟兔赛跑赛道"
        >
          <div className="race-scenery" aria-hidden="true">
            <i>☁️</i><i>☁️</i><span>🌳</span><span>🌼</span><span>🌻</span>
          </div>
          <div className="race-start-line" aria-hidden="true"><b>起点</b></div>
          <div className="race-finish-line" aria-hidden="true"><b>终点</b><span>🏁</span></div>

          <div className="race-lane rabbit-lane">
            <div className="race-lane-label"><span>灰兔</span><strong>{Math.round(run.rabbitProgress)}%</strong></div>
            <div className="rabbit-runner" style={{ left: runnerLeft(run.rabbitProgress) }} aria-label={`灰兔已前进${Math.round(run.rabbitProgress)}%`}>
              <span aria-hidden="true">🐇</span>
              <i aria-hidden="true" />
            </div>
          </div>

          <div className="race-lane turtle-lane">
            <div className="race-lane-label"><span>{turtleName}</span><strong>{Math.round(run.turtleProgress)}%</strong></div>
            <button
              type="button"
              className="turtle-race-runner"
              style={{ left: runnerLeft(run.turtleProgress) }}
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
                <small>龟龟乐园的新比赛</small>
                <h2>点击越快，龟龟爬得越快</h2>
                <p>比赛开始后，灰兔会自己慢慢前进。请直接连续点击赛道上的龟龟，帮助它先到达终点。</p>
                <button type="button" onClick={prepareRace}><Play aria-hidden="true" /> 准备比赛</button>
              </div>
            </div>
          )}

          {run.phase === "countdown" && (
            <div className="race-countdown" role="status" aria-label={`比赛将在${run.countdown}秒后开始`}>
              <strong>{run.countdown}</strong>
              <span>龟龟和灰兔都在起点准备</span>
            </div>
          )}

          {run.phase === "racing" && (
            <div className="race-tap-coach" aria-live="polite"><MousePointerClick aria-hidden="true" /> 不停点击龟龟，加速前进！</div>
          )}

          {run.phase === "finished" && (
            <div className={`race-overlay race-result ${turtleWon ? "success" : "retry"}`} role="dialog" aria-label="比赛结果">
              <img
                src={`${BASE_PATH}/assets/characters/turtle/${turtleWon ? "turtle_happy_hearts.png" : "turtle_thinking.png"}`}
                alt=""
              />
              <div>
                <small>{turtleWon ? "龟龟先到终点！" : "灰兔先到了一步"}</small>
                <h2>{turtleWon ? "坚持点击就是胜利" : "再来一次，一定能追上"}</h2>
                <p>
                  本局点击 {run.taps} 次，最高连续加速 {run.bestStreak} 次，
                  用时 {(run.elapsedMs / 1_000).toFixed(1)} 秒。
                </p>
                <div className="race-result-actions">
                  <button type="button" onClick={prepareRace}><RotateCcw aria-hidden="true" /> 再比一次</button>
                  <button type="button" onClick={onBack}>返回乐园</button>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="race-dashboard">
          <small>玩法说明</small>
          <h2>帮助龟龟赢得比赛</h2>
          <ol>
            <li><b>1</b><span>倒数时，龟龟和灰兔都停在同一个起点。</span></li>
            <li><b>2</b><span>开跑后灰兔会慢慢自动前进。</span></li>
            <li><b>3</b><span>用手指或鼠标不停点击龟龟，连点越快，每一下前进越多。</span></li>
          </ol>
          <div className="race-speed-card" aria-live="polite">
            <div><Sparkles aria-hidden="true" /><span>龟龟速度<strong>{speedLabel}</strong></span></div>
            <div className={`race-speed-meter speed-${speedLevel}`}>{[0, 1, 2, 3].map((item) => <i key={item} />)}</div>
          </div>
          <div className="race-live-stats">
            <span><MousePointerClick aria-hidden="true" /><b>点击次数</b><strong>{run.taps}</strong></span>
            <span><Clock3 aria-hidden="true" /><b>比赛用时</b><strong>{(run.elapsedMs / 1_000).toFixed(1)}秒</strong></span>
          </div>
          <div className="learning-game-feedback hint"><Sparkles aria-hidden="true" /><p>输掉比赛也不用再花游玩票，可以在这一局里直接重新挑战。</p></div>
        </aside>
      </div>
    </section>
  );
}
