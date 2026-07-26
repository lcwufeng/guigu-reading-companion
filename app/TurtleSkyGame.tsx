/* eslint-disable @next/next/no-img-element -- Reuses the project's canonical turtle sprites. */
"use client";

import { Check, ChevronDown, ChevronLeft, ChevronUp, Cloud, Heart, Plane, Play, RotateCcw, Sparkles, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const TURTLE = `${BASE_PATH}/assets/characters/turtle/turtle_excited.png`;
const TICK_MS = 50;

type FlightObject = {
  id: string;
  kind: "star" | "gold-star" | "cloud";
  lane: number;
  x: number;
};

type FlightMission = {
  id: string;
  title: string;
  difficulty: "训练" | "进阶" | "挑战" | "终极";
  target: number;
  waves: number;
  spawnMs: number;
  speed: number;
};

type FlightRun = {
  phase: "intro" | "playing" | "finished";
  lane: number;
  score: number;
  hearts: number;
  spawned: number;
  spawnElapsed: number;
  objects: FlightObject[];
  collected: number;
  cloudHits: number;
};

const missions: FlightMission[] = [
  { id: "sunny-training", title: "晴空训练", difficulty: "训练", target: 6, waves: 11, spawnMs: 760, speed: 0.72 },
  { id: "cloud-valley", title: "云谷穿行", difficulty: "进阶", target: 9, waves: 15, spawnMs: 650, speed: 0.86 },
  { id: "wind-corridor", title: "风之走廊", difficulty: "挑战", target: 12, waves: 19, spawnMs: 560, speed: 1.02 },
  { id: "starlight-sky", title: "星光天际", difficulty: "终极", target: 16, waves: 24, spawnMs: 480, speed: 1.16 },
];

function initialRun(): FlightRun {
  return {
    phase: "intro",
    lane: 2,
    score: 0,
    hearts: 3,
    spawned: 0,
    spawnElapsed: 0,
    objects: [],
    collected: 0,
    cloudHits: 0,
  };
}

function createFlightObject(index: number, levelIndex: number): FlightObject {
  const kind = index > 0 && index % 7 === 0 ? "gold-star" : index % 3 === 2 ? "cloud" : "star";
  return {
    id: `${levelIndex}-${index}-${Date.now()}`,
    kind,
    lane: (index * 2 + levelIndex + Math.floor(index / 4)) % 5,
    x: 106,
  };
}

export default function TurtleSkyGame({
  turtleName,
  onBack,
  onComplete,
}: {
  turtleName: string;
  onBack: () => void;
  onComplete: (detail: string) => void;
}) {
  const [levelIndex, setLevelIndex] = useState(0);
  const [run, setRun] = useState<FlightRun>(() => initialRun());
  const [allComplete, setAllComplete] = useState(false);
  const [totalStars, setTotalStars] = useState(0);
  const [totalCloudHits, setTotalCloudHits] = useState(0);
  const reportedRef = useRef(false);
  const mission = missions[levelIndex];
  const success = run.phase === "finished" && run.score >= mission.target && run.hearts > 0;

  useEffect(() => {
    if (run.phase !== "playing") return;
    const timer = window.setInterval(() => {
      setRun((current) => {
        if (current.phase !== "playing") return current;
        let score = current.score;
        let hearts = current.hearts;
        let collected = current.collected;
        let cloudHits = current.cloudHits;
        const moved: FlightObject[] = [];

        for (const item of current.objects) {
          const next = { ...item, x: item.x - mission.speed };
          const collides = next.x <= 27 && next.x >= 12 && next.lane === current.lane;
          if (collides) {
            if (next.kind === "cloud") {
              hearts = Math.max(0, hearts - 1);
              cloudHits += 1;
            } else {
              score += next.kind === "gold-star" ? 2 : 1;
              collected += 1;
            }
          } else if (next.x > -8) {
            moved.push(next);
          }
        }

        let spawnElapsed = current.spawnElapsed + TICK_MS;
        let spawned = current.spawned;
        if (spawnElapsed >= mission.spawnMs && spawned < mission.waves) {
          moved.push(createFlightObject(spawned, levelIndex));
          spawned += 1;
          spawnElapsed -= mission.spawnMs;
        }

        const finished = hearts <= 0 || (spawned >= mission.waves && moved.length === 0);
        return {
          ...current,
          phase: finished ? "finished" : "playing",
          score,
          hearts,
          spawned,
          spawnElapsed,
          objects: moved,
          collected,
          cloudHits,
        };
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [levelIndex, mission.spawnMs, mission.speed, mission.waves, run.phase]);

  const startMission = () => setRun({ ...initialRun(), phase: "playing" });
  const moveLane = (direction: -1 | 1) => {
    setRun((current) => current.phase === "playing"
      ? { ...current, lane: Math.max(0, Math.min(4, current.lane + direction)) }
      : current);
  };

  const advanceMission = () => {
    if (!success) return;
    setTotalStars((current) => current + run.collected);
    setTotalCloudHits((current) => current + run.cloudHits);
    if (levelIndex < missions.length - 1) {
      setLevelIndex((current) => current + 1);
      setRun(initialRun());
      return;
    }
    setAllComplete(true);
    if (!reportedRef.current) {
      reportedRef.current = true;
      onComplete(`完成${missions.length}关龟龟飞机大战，收集${totalStars + run.collected}颗星星，碰到乌云${totalCloudHits + run.cloudHits}次，练习了方向判断和快速反应`);
    }
  };

  return (
    <section className="learning-game-panel flight-game-panel">
      <header className="learning-game-heading">
        <div>
          <span><Plane aria-hidden="true" /> 龟龟乐园 · 反应与方向</span>
          <h1>龟龟飞机大战</h1>
        </div>
        <button type="button" onClick={onBack}><ChevronLeft aria-hidden="true" /> 返回乐园</button>
      </header>

      <div className="learning-game-progress" aria-label={`第${levelIndex + 1}关，共${missions.length}关`}>
        {missions.map((item, index) => (
          <span className={index < levelIndex || allComplete ? "done" : index === levelIndex ? "active" : ""} key={item.id}>
            {index < levelIndex || allComplete ? <Check aria-hidden="true" /> : index + 1}
          </span>
        ))}
      </div>

      {!allComplete ? (
        <div className="flight-game-layout">
          <section
            className="flight-sky"
            role="application"
            tabIndex={0}
            aria-label="龟龟飞行游戏区域。按上下方向键变换航线，收集星星并避开乌云。"
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                moveLane(-1);
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveLane(1);
              }
            }}
          >
            <div className="flight-cloud-scenery" aria-hidden="true"><i>☁️</i><i>☁️</i><i>☁️</i></div>
            <div className="flight-lanes" aria-hidden="true">{[0, 1, 2, 3, 4].map((lane) => <i key={lane} />)}</div>
            {run.objects.map((item) => (
              <span
                className={`flight-object ${item.kind}`}
                key={item.id}
                style={{ left: `${item.x}%`, top: `${10 + item.lane * 20}%` }}
                aria-label={item.kind === "cloud" ? "乌云" : item.kind === "gold-star" ? "金色星星" : "星星"}
              >
                {item.kind === "cloud" ? "☁️" : "⭐"}
              </span>
            ))}
            <div className="flight-player" style={{ top: `${10 + run.lane * 20}%` }} aria-hidden="true">
              <span>✈️</span>
              <img src={TURTLE} alt="" />
            </div>

            {run.phase === "intro" && (
              <div className="flight-overlay">
                <img src={TURTLE} alt={`${turtleName}准备驾驶飞机`} />
                <div><small>{mission.difficulty} · 第 {levelIndex + 1}/{missions.length} 关</small><h2>{mission.title}</h2><p>上下移动龟龟飞行器，收集至少 <strong>{mission.target}</strong> 分。普通星星 1 分，金色星星 2 分；要避开乌云。</p><button type="button" onClick={startMission}><Play aria-hidden="true" /> 起飞</button></div>
              </div>
            )}

            {run.phase === "finished" && (
              <div className={`flight-overlay result ${success ? "success" : "retry"}`} role="dialog" aria-label="飞行任务结果">
                <img src={`${BASE_PATH}/assets/characters/turtle/${success ? "turtle_happy_hearts.png" : "turtle_thinking.png"}`} alt="" />
                <div>
                  <small>{success ? "飞行任务完成！" : "别着急，再飞一次"}</small>
                  <h2>{run.score} 分 · {run.hearts} 颗爱心</h2>
                  <p>{success ? "你能快速判断方向，也照顾好了飞行器。" : `这一关需要 ${mission.target} 分并保留爱心，试着提前移动到星星所在的航线。`}</p>
                  <button type="button" onClick={success ? advanceMission : startMission}>
                    {success ? levelIndex < missions.length - 1 ? "飞向下一关" : "完成挑战" : <><RotateCcw aria-hidden="true" /> 再试一次</>}
                  </button>
                </div>
              </div>
            )}
          </section>

          <aside className="flight-dashboard">
            <small>{mission.difficulty} · {mission.title}</small>
            <h2>飞行任务</h2>
            <p>看清星星和乌云所在的横向航线，再提前移动。</p>
            <div className="flight-stats" aria-live="polite">
              <span><Star aria-hidden="true" /><b>星光分数</b><strong>{run.score}/{mission.target}</strong></span>
              <span><Heart aria-hidden="true" /><b>飞行爱心</b><strong>{run.hearts}/3</strong></span>
              <span><Sparkles aria-hidden="true" /><b>已收集</b><strong>{run.collected}</strong></span>
              <span><Cloud aria-hidden="true" /><b>剩余波次</b><strong>{Math.max(0, mission.waves - run.spawned)}</strong></span>
            </div>
            <div className="flight-controls" aria-label="飞行方向控制">
              <button type="button" disabled={run.phase !== "playing" || run.lane === 0} onClick={() => moveLane(-1)}><ChevronUp aria-hidden="true" /> 向上飞</button>
              <button type="button" disabled={run.phase !== "playing" || run.lane === 4} onClick={() => moveLane(1)}><ChevronDown aria-hidden="true" /> 向下飞</button>
            </div>
            <div className="learning-game-feedback hint"><Sparkles aria-hidden="true" /><p>金色星星值 2 分。碰到乌云会少 1 颗爱心，但不会出现攻击或击毁画面。</p></div>
          </aside>
        </div>
      ) : (
        <div className="learning-game-finish">
          <img src={`${BASE_PATH}/assets/characters/turtle/turtle_happy_hearts.png`} alt={`${turtleName}完成飞行挑战`} />
          <div><small>{missions.length} 条航线全部完成</small><h2>{turtleName}和你成为星空小飞行员啦！</h2><p>你会观察目标、判断方向，也能在速度变快时保持专注。</p><button type="button" onClick={onBack}>返回龟龟乐园</button></div>
        </div>
      )}
    </section>
  );
}
