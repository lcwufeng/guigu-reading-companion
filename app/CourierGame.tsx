/* eslint-disable @next/next/no-img-element -- Reuses the project's canonical turtle sprite. */
"use client";

import { Check, ChevronLeft, Lightbulb, PackageCheck, RotateCcw, Route, Undo2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const TURTLE = `${BASE_PATH}/assets/characters/turtle/turtle_idle_standing.png`;

type StopId = "post" | "bakery" | "school" | "park" | "library" | "clinic" | "station";

type Stop = {
  id: StopId;
  label: string;
  icon: string;
  x: number;
  y: number;
};

type Road = {
  from: StopId;
  to: StopId;
  distance: number;
};

type Mission = {
  id: string;
  title: string;
  story: string;
  required: StopId[];
};

const stops: Stop[] = [
  { id: "post", label: "快递站", icon: "📦", x: 12, y: 72 },
  { id: "bakery", label: "面包店", icon: "🥐", x: 28, y: 25 },
  { id: "school", label: "学校", icon: "🏫", x: 31, y: 75 },
  { id: "park", label: "公园", icon: "🌳", x: 51, y: 48 },
  { id: "library", label: "图书馆", icon: "📚", x: 69, y: 21 },
  { id: "clinic", label: "诊所", icon: "🏥", x: 69, y: 74 },
  { id: "station", label: "车站", icon: "🚉", x: 89, y: 47 },
];

const roads: Road[] = [
  { from: "post", to: "bakery", distance: 2 },
  { from: "post", to: "school", distance: 3 },
  { from: "bakery", to: "school", distance: 2 },
  { from: "bakery", to: "park", distance: 2 },
  { from: "bakery", to: "library", distance: 4 },
  { from: "school", to: "park", distance: 2 },
  { from: "school", to: "clinic", distance: 3 },
  { from: "park", to: "library", distance: 2 },
  { from: "park", to: "clinic", distance: 2 },
  { from: "library", to: "station", distance: 3 },
  { from: "clinic", to: "station", distance: 2 },
];

const missions: Mission[] = [
  {
    id: "school-clinic",
    title: "上午急送",
    story: "先后都可以：把作业本送到学校，把药品送到诊所。",
    required: ["school", "clinic"],
  },
  {
    id: "bakery-library",
    title: "书香午后",
    story: "把点心送到面包店，再把新书送到图书馆。",
    required: ["bakery", "library"],
  },
  {
    id: "park-station-library",
    title: "傍晚三连送",
    story: "公园、图书馆和车站各有一个包裹，路线顺序由你决定。",
    required: ["park", "library", "station"],
  },
];

const stopById = new Map(stops.map((stop) => [stop.id, stop]));

function roadBetween(from: StopId, to: StopId) {
  return roads.find((road) =>
    (road.from === from && road.to === to) || (road.from === to && road.to === from));
}

function missionOptimalDistance(mission: Mission) {
  const targetBits = new Map(mission.required.map((id, index) => [id, 1 << index]));
  const allVisited = (1 << mission.required.length) - 1;
  const queue: Array<{ stop: StopId; visited: number; distance: number }> = [{ stop: "post", visited: 0, distance: 0 }];
  const best = new Map<string, number>([["post|0", 0]]);

  while (queue.length) {
    queue.sort((left, right) => left.distance - right.distance);
    const current = queue.shift();
    if (!current) break;
    if (current.visited === allVisited) return current.distance;
    const key = `${current.stop}|${current.visited}`;
    if (current.distance !== best.get(key)) continue;

    for (const road of roads) {
      const next = road.from === current.stop ? road.to : road.to === current.stop ? road.from : null;
      if (!next) continue;
      const nextVisited = current.visited | (targetBits.get(next) || 0);
      const nextDistance = current.distance + road.distance;
      const nextKey = `${next}|${nextVisited}`;
      if (nextDistance >= (best.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(nextKey, nextDistance);
      queue.push({ stop: next, visited: nextVisited, distance: nextDistance });
    }
  }
  return 0;
}

function roadStyle(road: Road) {
  const from = stopById.get(road.from);
  const to = stopById.get(road.to);
  if (!from || !to) return {};
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return {
    left: `${from.x}%`,
    top: `${from.y}%`,
    width: `${Math.hypot(dx, dy)}%`,
    transform: `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`,
  };
}

export default function CourierGame({
  turtleName,
  onBack,
  onComplete,
}: {
  turtleName: string;
  onBack: () => void;
  onComplete: (detail: string) => void;
}) {
  const [missionIndex, setMissionIndex] = useState(0);
  const [route, setRoute] = useState<StopId[]>(["post"]);
  const [distance, setDistance] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [solved, setSolved] = useState(false);
  const [allComplete, setAllComplete] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const reportedRef = useRef(false);
  const mission = missions[missionIndex];
  const optimalDistance = useMemo(() => missionOptimalDistance(mission), [mission]);
  const currentStop = stopById.get(route.at(-1) || "post") || stops[0];
  const visited = new Set(route);
  const deliveredCount = mission.required.filter((stop) => visited.has(stop)).length;

  const resetRoute = () => {
    setRoute(["post"]);
    setDistance(0);
    setFeedback("");
    setSolved(false);
  };

  const selectStop = (stopId: StopId) => {
    if (solved || allComplete || stopId === currentStop.id) return;
    const road = roadBetween(currentStop.id, stopId);
    if (!road) {
      setFeedback("这里没有直达道路，请选择有道路相连的地点。");
      return;
    }
    setRoute((current) => [...current, stopId]);
    setDistance((current) => current + road.distance);
    setFeedback("");
  };

  const undoStep = () => {
    if (route.length <= 1 || solved) return;
    const from = route.at(-2);
    const to = route.at(-1);
    const road = from && to ? roadBetween(from, to) : null;
    setRoute((current) => current.slice(0, -1));
    setDistance((current) => Math.max(0, current - (road?.distance || 0)));
    setFeedback("");
  };

  const checkRoute = () => {
    setAttempts((current) => current + 1);
    if (deliveredCount < mission.required.length) {
      const missing = mission.required
        .filter((id) => !visited.has(id))
        .map((id) => stopById.get(id)?.label)
        .filter(Boolean)
        .join("、");
      setFeedback(`还有包裹没送到：${missing}。`);
      return;
    }
    if (distance !== optimalDistance) {
      setFeedback(`包裹都送到了，不过走了 ${distance} 格；最短只要 ${optimalDistance} 格。试试换个顺序。`);
      return;
    }
    setSolved(true);
    setFeedback(`路线正确！正好是最短的 ${optimalDistance} 格。`);
  };

  const nextMission = () => {
    if (missionIndex < missions.length - 1) {
      setMissionIndex((current) => current + 1);
      resetRoute();
      return;
    }
    setAllComplete(true);
    if (!reportedRef.current) {
      reportedRef.current = true;
      onComplete(`完成3个快递任务，用${attempts}次检查找到了全部最短路线`);
    }
  };

  return (
    <section className="learning-game-panel courier-game-panel">
      <header className="learning-game-heading">
        <div>
          <span><PackageCheck aria-hidden="true" /> 龟龟乐园 · 路线规划</span>
          <h1>乌龟快递员</h1>
        </div>
        <button type="button" onClick={onBack}><ChevronLeft aria-hidden="true" /> 返回乐园</button>
      </header>

      <div className="learning-game-progress" aria-label={`第${missionIndex + 1}个任务，共${missions.length}个`}>
        {missions.map((item, index) => (
          <span className={index < missionIndex || allComplete ? "done" : index === missionIndex ? "active" : ""} key={item.id}>
            {index < missionIndex || allComplete ? <Check aria-hidden="true" /> : index + 1}
          </span>
        ))}
      </div>

      {!allComplete ? (
        <div className="courier-game-layout">
          <section className="courier-map" aria-label="龟龟快递地图">
            <div className="courier-map-scenery" aria-hidden="true"><i /><i /><i /></div>
            {roads.map((road) => (
              <span className="courier-road" key={`${road.from}-${road.to}`} style={roadStyle(road)}>
                <b>{road.distance}</b>
              </span>
            ))}
            {stops.map((stop) => {
              const required = mission.required.includes(stop.id);
              const isVisited = visited.has(stop.id);
              const adjacent = Boolean(roadBetween(currentStop.id, stop.id));
              return (
                <button
                  type="button"
                  className={`courier-stop ${required ? "required" : ""} ${isVisited ? "visited" : ""} ${adjacent ? "adjacent" : ""}`}
                  key={stop.id}
                  style={{ left: `${stop.x}%`, top: `${stop.y}%` }}
                  onClick={() => selectStop(stop.id)}
                  aria-label={`${stop.label}${required ? "，需要送达" : ""}${isVisited ? "，已经到过" : ""}`}
                >
                  <i>{stop.icon}</i><strong>{stop.label}</strong>
                  {required && <em>{isVisited ? <Check aria-hidden="true" /> : "待送"}</em>}
                </button>
              );
            })}
            <div className="courier-turtle-marker" style={{ left: `${currentStop.x}%`, top: `${currentStop.y}%` }} aria-hidden="true">
              <img src={TURTLE} alt="" /><span>📦</span>
            </div>
          </section>

          <aside className="courier-task-card">
            <small>任务 {missionIndex + 1} / {missions.length}</small>
            <h2>{mission.title}</h2>
            <p>{mission.story}</p>
            <div className="courier-deliveries">
              {mission.required.map((id) => {
                const stop = stopById.get(id);
                return <span className={visited.has(id) ? "done" : ""} key={id}>{stop?.icon} {stop?.label}{visited.has(id) && <Check aria-hidden="true" />}</span>;
              })}
            </div>
            <div className="courier-distance">
              <span>已经走了<strong>{distance} 格</strong></span>
              <span>完成送达<strong>{deliveredCount}/{mission.required.length}</strong></span>
            </div>
            <p className="courier-route-copy" aria-live="polite">{route.map((id) => stopById.get(id)?.label).join(" → ")}</p>
            {feedback && <div className={`learning-game-feedback ${solved ? "success" : "hint"}`} role="status"><Lightbulb aria-hidden="true" /><p>{feedback}</p></div>}
            <div className="courier-actions">
              {!solved ? (
                <>
                  <button type="button" onClick={undoStep} disabled={route.length <= 1}><Undo2 aria-hidden="true" /> 撤回一步</button>
                  <button type="button" onClick={resetRoute}><RotateCcw aria-hidden="true" /> 重新规划</button>
                  <button className="primary" type="button" onClick={checkRoute}><Route aria-hidden="true" /> 检查路线</button>
                </>
              ) : (
                <button className="primary wide" type="button" onClick={nextMission}>
                  {missionIndex < missions.length - 1 ? "下一件快递" : "完成所有任务"}
                </button>
              )}
            </div>
          </aside>
        </div>
      ) : (
        <div className="learning-game-finish">
          <img src={`${BASE_PATH}/assets/characters/turtle/turtle_happy_hearts.png`} alt={`${turtleName}完成快递任务`} />
          <div><small>最短路线全部找到</small><h2>{turtleName}成为路线规划小能手啦！</h2><p>你先看道路，再比较顺序，帮助每一个包裹更快到达。</p><button type="button" onClick={onBack}>返回龟龟乐园</button></div>
        </div>
      )}
    </section>
  );
}
