/* eslint-disable @next/next/no-img-element -- Reuses the project's canonical turtle sprites. */
"use client";

import { Check, ChevronLeft, Cloud, Heart, MousePointer2, Plane, Play, RotateCcw, Sparkles, Star } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

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
  difficulty: "训练" | "进阶" | "挑战";
  target: number;
  waves: number;
  spawnMs: number;
  speed: number;
};

type FlightRun = {
  phase: "intro" | "playing" | "finished";
  lane: number;
  score: number;
  spawned: number;
  spawnElapsed: number;
  objects: FlightObject[];
  collected: number;
  cloudHits: number;
};

const missions: FlightMission[] = [
  { id: "sunny-training", title: "晴空训练", difficulty: "训练", target: 5, waves: 10, spawnMs: 900, speed: 0.52 },
  { id: "cloud-valley", title: "云谷穿行", difficulty: "进阶", target: 7, waves: 13, spawnMs: 820, speed: 0.61 },
  { id: "wind-corridor", title: "风之走廊", difficulty: "挑战", target: 9, waves: 16, spawnMs: 740, speed: 0.70 },
];

function initialRun(): FlightRun {
  return {
    phase: "intro",
    lane: 1,
    score: 0,
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
    lane: (index * 2 + levelIndex + Math.floor(index / 4)) % 3,
    x: 106,
  };
}

export default function TurtleSkyGame({
  turtleName,
  hearts,
  onBack,
  onMistake,
  onComplete,
}: {
  turtleName: string;
  hearts: number;
  onBack: () => void;
  onMistake: () => void;
  onComplete: (detail: string) => void;
}) {
  const [levelIndex, setLevelIndex] = useState(0);
  const [run, setRun] = useState<FlightRun>(() => initialRun());
  const [allComplete, setAllComplete] = useState(false);
  const [totalStars, setTotalStars] = useState(0);
  const [totalCloudHits, setTotalCloudHits] = useState(0);
  const reportedRef = useRef(false);
  const reportedCloudHitsRef = useRef(0);
  const mission = missions[levelIndex];
  const success = run.phase === "finished" && run.score >= mission.target;

  useEffect(() => {
    if (run.phase !== "playing") return;
    const timer = window.setInterval(() => {
      setRun((current) => {
        if (current.phase !== "playing") return current;
        let score = current.score;
        let collected = current.collected;
        let cloudHits = current.cloudHits;
        const moved: FlightObject[] = [];

        for (const item of current.objects) {
          const next = { ...item, x: item.x - mission.speed };
          const collides = next.x <= 27 && next.x >= 12 && next.lane === current.lane;
          if (collides) {
            if (next.kind === "cloud") {
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

        const finished = spawned >= mission.waves && moved.length === 0;
        return {
          ...current,
          phase: finished ? "finished" : "playing",
          score,
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

  useEffect(() => {
    const newHits = Math.max(0, run.cloudHits - reportedCloudHitsRef.current);
    for (let index = 0; index < newHits; index += 1) onMistake();
    reportedCloudHitsRef.current = run.cloudHits;
  }, [onMistake, run.cloudHits]);

  const startMission = () => {
    reportedCloudHitsRef.current = 0;
    setRun({ ...initialRun(), phase: "playing" });
  };
  const moveLane = (direction: -1 | 1) => {
    setRun((current) => current.phase === "playing"
      ? { ...current, lane: Math.max(0, Math.min(2, current.lane + direction)) }
      : current);
  };
  const moveFromPointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (run.phase !== "playing") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerY = Math.max(0, Math.min(bounds.height - 1, event.clientY - bounds.top));
    const lane = Math.max(0, Math.min(2, Math.floor(pointerY / bounds.height * 3)));
    setRun((current) => current.phase === "playing" ? { ...current, lane } : current);
  };

  const advanceMission = () => {
    if (!success) return;
    setTotalStars((current) => current + run.collected);
    setTotalCloudHits((current) => current + run.cloudHits);
    if (levelIndex < missions.length - 1) {
      setLevelIndex((current) => current + 1);
      reportedCloudHitsRef.current = 0;
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
            aria-label="龟龟飞行游戏区域。移动鼠标或拖动手指控制龟龟，收集星星并避开乌云。"
            onPointerDown={moveFromPointer}
            onPointerMove={moveFromPointer}
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
            <div className="flight-lanes" aria-hidden="true">{[0, 1, 2].map((lane) => <i key={lane} />)}</div>
            {run.objects.map((item) => (
              <span
                className={`flight-object ${item.kind}`}
                key={item.id}
                style={{ left: `${item.x}%`, top: `${18 + item.lane * 32}%` }}
                aria-label={item.kind === "cloud" ? "乌云" : item.kind === "gold-star" ? "金色星星" : "星星"}
              >
                {item.kind === "cloud" ? "☁️" : "⭐"}
              </span>
            ))}
            <div className="flight-player" style={{ top: `${18 + run.lane * 32}%` }} aria-hidden="true">
              <span>✈️</span>
              <img src={TURTLE} alt="" />
            </div>

            {run.phase === "intro" && (
              <div className="flight-overlay">
                <img src={TURTLE} alt={`${turtleName}准备驾驶飞机`} />
              <div><small>{mission.difficulty} · 第 {levelIndex + 1}/{missions.length} 关</small><h2>{mission.title}</h2><p>把鼠标移到想去的航线上，手机用手指拖动龟龟。收集至少 <strong>{mission.target}</strong> 分；普通星星 1 分，金色星星 2 分。</p><button type="button" onClick={startMission}><Play aria-hidden="true" /> 起飞</button></div>
              </div>
            )}

            {run.phase === "finished" && (
              <div className={`flight-overlay result ${success ? "success" : "retry"}`} role="dialog" aria-label="飞行任务结果">
                <img src={`${BASE_PATH}/assets/characters/turtle/${success ? "turtle_happy_hearts.png" : "turtle_thinking.png"}`} alt="" />
                <div>
                  <small>{success ? "飞行任务完成！" : "别着急，再飞一次"}</small>
                  <h2>{run.score} 分 · {hearts} 颗爱心</h2>
                  <p>{success ? "你能快速判断方向，也照顾好了飞行器。" : `这一关需要 ${mission.target} 分，试着直接把鼠标移到星星所在的航线。`}</p>
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
            <p>不用点击方向按钮：鼠标移到哪条航线，龟龟就飞到哪里；手机可以直接拖动。</p>
            <div className="flight-stats" aria-live="polite">
              <span><Star aria-hidden="true" /><b>星光分数</b><strong>{run.score}/{mission.target}</strong></span>
              <span><Heart aria-hidden="true" /><b>飞行爱心</b><strong>{hearts}/3</strong></span>
              <span><Sparkles aria-hidden="true" /><b>已收集</b><strong>{run.collected}</strong></span>
              <span><Cloud aria-hidden="true" /><b>剩余波次</b><strong>{Math.max(0, mission.waves - run.spawned)}</strong></span>
            </div>
            <div className="flight-pointer-guide"><MousePointer2 aria-hidden="true" /><span><strong>鼠标跟随控制</strong><small>直接上下移动鼠标，龟龟会自动跟随。</small></span></div>
            <div className="learning-game-feedback hint"><Sparkles aria-hidden="true" /><p>金色星星值 2 分。碰到乌云会少 1 颗爱心；三颗爱心用完后，再碰一次才会失败。</p></div>
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
