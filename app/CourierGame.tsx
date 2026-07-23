/* eslint-disable @next/next/no-img-element -- Reuses the project's canonical turtle sprite. */
"use client";

import { Check, ChevronLeft, Lightbulb, PackageCheck, RotateCcw, Route, Undo2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const TURTLE = `${BASE_PATH}/assets/characters/turtle/turtle_idle_standing.png`;

type StopId =
  | "post"
  | "bakery"
  | "school"
  | "museum"
  | "park"
  | "library"
  | "clinic"
  | "fire-station"
  | "station"
  | "harbor"
  | "farm";

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
  difficulty: "入门" | "进阶" | "挑战" | "终极";
  ordered?: boolean;
  returnToPost?: boolean;
};

const stops: Stop[] = [
  { id: "post", label: "快递站", icon: "📦", x: 9, y: 73 },
  { id: "bakery", label: "面包店", icon: "🥐", x: 23, y: 18 },
  { id: "school", label: "学校", icon: "🏫", x: 25, y: 70 },
  { id: "museum", label: "博物馆", icon: "🏛️", x: 42, y: 17 },
  { id: "park", label: "公园", icon: "🌳", x: 46, y: 46 },
  { id: "fire-station", label: "消防站", icon: "🚒", x: 46, y: 80 },
  { id: "library", label: "图书馆", icon: "📚", x: 63, y: 16 },
  { id: "clinic", label: "诊所", icon: "🏥", x: 65, y: 69 },
  { id: "harbor", label: "港口", icon: "⚓", x: 86, y: 17 },
  { id: "station", label: "车站", icon: "🚉", x: 83, y: 44 },
  { id: "farm", label: "农场", icon: "🌾", x: 87, y: 77 },
];

const roads: Road[] = [
  { from: "post", to: "bakery", distance: 2 },
  { from: "post", to: "school", distance: 3 },
  { from: "post", to: "fire-station", distance: 4 },
  { from: "bakery", to: "school", distance: 2 },
  { from: "bakery", to: "museum", distance: 2 },
  { from: "bakery", to: "park", distance: 3 },
  { from: "school", to: "park", distance: 2 },
  { from: "school", to: "fire-station", distance: 2 },
  { from: "museum", to: "park", distance: 2 },
  { from: "museum", to: "library", distance: 3 },
  { from: "park", to: "library", distance: 2 },
  { from: "park", to: "clinic", distance: 2 },
  { from: "park", to: "fire-station", distance: 3 },
  { from: "library", to: "clinic", distance: 3 },
  { from: "library", to: "harbor", distance: 3 },
  { from: "library", to: "station", distance: 3 },
  { from: "clinic", to: "station", distance: 2 },
  { from: "clinic", to: "fire-station", distance: 2 },
  { from: "clinic", to: "farm", distance: 3 },
  { from: "harbor", to: "station", distance: 2 },
  { from: "station", to: "farm", distance: 2 },
  { from: "fire-station", to: "farm", distance: 4 },
];

const missions: Mission[] = [
  {
    id: "school-starter",
    title: "第一份作业本",
    story: "从快递站出发，把作业本送到学校。先熟悉道路上的数字。",
    required: ["school"],
    difficulty: "入门",
  },
  {
    id: "bakery-park",
    title: "早餐与树苗",
    story: "面包店和公园都在等包裹，送达顺序由你决定。",
    required: ["bakery", "park"],
    difficulty: "入门",
  },
  {
    id: "museum-library-clinic",
    title: "城市三连送",
    story: "博物馆、图书馆和诊所各有一份快递，比较不同的送件顺序。",
    required: ["museum", "library", "clinic"],
    difficulty: "进阶",
  },
  {
    id: "school-park-library-order",
    title: "按时接力",
    story: "必须按“学校 → 公园 → 图书馆”的顺序送达，提前路过不算送件。",
    required: ["school", "park", "library"],
    difficulty: "进阶",
    ordered: true,
  },
  {
    id: "four-corners",
    title: "四区派送",
    story: "面包店、博物馆、诊所和车站都要送到，顺序由你规划。",
    required: ["bakery", "museum", "clinic", "station"],
    difficulty: "挑战",
  },
  {
    id: "harbor-chain",
    title: "港口接力单",
    story: "必须依次送到博物馆、图书馆、港口、车站和农场。",
    required: ["museum", "library", "harbor", "station", "farm"],
    difficulty: "挑战",
    ordered: true,
  },
  {
    id: "return-round",
    title: "全城往返",
    story: "学校、消防站、诊所、港口和农场都要送到，最后还要回到快递站。",
    required: ["school", "fire-station", "clinic", "harbor", "farm"],
    difficulty: "终极",
    returnToPost: true,
  },
  {
    id: "grand-route",
    title: "金牌快递路线",
    story: "按指定顺序完成八站派送，最后回快递站：面包店 → 博物馆 → 图书馆 → 港口 → 车站 → 农场 → 消防站 → 学校。",
    required: ["bakery", "museum", "library", "harbor", "station", "farm", "fire-station", "school"],
    difficulty: "终极",
    ordered: true,
    returnToPost: true,
  },
];

const stopById = new Map(stops.map((stop) => [stop.id, stop]));

function roadBetween(from: StopId, to: StopId) {
  return roads.find((road) =>
    (road.from === from && road.to === to) || (road.from === to && road.to === from));
}

function missionOptimalDistance(mission: Mission) {
  const targetBits = new Map(mission.required.map((id, index) => [id, 1 << index]));
  const completedProgress = mission.ordered ? mission.required.length : (1 << mission.required.length) - 1;
  const queue: Array<{ stop: StopId; progress: number; distance: number }> = [{ stop: "post", progress: 0, distance: 0 }];
  const best = new Map<string, number>([["post|0", 0]]);

  while (queue.length) {
    queue.sort((left, right) => left.distance - right.distance);
    const current = queue.shift();
    if (!current) break;
    if (current.progress === completedProgress && (!mission.returnToPost || current.stop === "post")) return current.distance;
    const key = `${current.stop}|${current.progress}`;
    if (current.distance !== best.get(key)) continue;

    for (const road of roads) {
      const next = road.from === current.stop ? road.to : road.to === current.stop ? road.from : null;
      if (!next) continue;
      const nextProgress = mission.ordered
        ? next === mission.required[current.progress] ? current.progress + 1 : current.progress
        : current.progress | (targetBits.get(next) || 0);
      const nextDistance = current.distance + road.distance;
      const nextKey = `${next}|${nextProgress}`;
      if (nextDistance >= (best.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(nextKey, nextDistance);
      queue.push({ stop: next, progress: nextProgress, distance: nextDistance });
    }
  }
  return 0;
}

function deliveredStops(route: StopId[], mission: Mission) {
  if (!mission.ordered) return new Set(mission.required.filter((stop) => route.includes(stop)));
  let nextDelivery = 0;
  for (const stop of route.slice(1)) {
    if (stop === mission.required[nextDelivery]) nextDelivery += 1;
    if (nextDelivery >= mission.required.length) break;
  }
  return new Set(mission.required.slice(0, nextDelivery));
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
  const delivered = deliveredStops(route, mission);
  const deliveredCount = delivered.size;

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
        .filter((id) => !delivered.has(id))
        .map((id) => stopById.get(id)?.label)
        .filter(Boolean)
        .join("、");
      setFeedback(mission.ordered
        ? `还没有按指定顺序送完。接下来应去：${stopById.get(mission.required[deliveredCount])?.label || missing}。`
        : `还有包裹没送到：${missing}。`);
      return;
    }
    if (mission.returnToPost && currentStop.id !== "post") {
      setFeedback("包裹都送到了，但这关还要回到快递站才算完成。");
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
      onComplete(`完成${missions.length}个由易到难的快递任务，用${attempts}次检查找到了全部最短路线`);
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
              const isDelivered = delivered.has(stop.id);
              const adjacent = Boolean(roadBetween(currentStop.id, stop.id));
              return (
                <button
                  type="button"
                  className={`courier-stop ${required ? "required" : ""} ${isVisited ? "visited" : ""} ${adjacent ? "adjacent" : ""}`}
                  key={stop.id}
                  style={{ left: `${stop.x}%`, top: `${stop.y}%` }}
                  onClick={() => selectStop(stop.id)}
                  aria-label={`${stop.label}${required ? "，需要送达" : ""}${isDelivered ? "，已经送达" : isVisited ? "，已经到过" : ""}`}
                >
                  <i>{stop.icon}</i><strong>{stop.label}</strong>
                  {required && <em>{isDelivered ? <Check aria-hidden="true" /> : "待送"}</em>}
                </button>
              );
            })}
            <div className="courier-turtle-marker" style={{ left: `${currentStop.x}%`, top: `${currentStop.y}%` }} aria-hidden="true">
              <img src={TURTLE} alt="" /><span>📦</span>
            </div>
          </section>

          <aside className="courier-task-card">
            <small>{mission.difficulty} · 任务 {missionIndex + 1} / {missions.length}</small>
            <h2>{mission.title}</h2>
            <p>{mission.story}</p>
            <div className="courier-rule-chips">
              <span>{mission.ordered ? "按指定顺序送达" : "送达顺序自由"}</span>
              {mission.returnToPost && <span>送完必须返回快递站</span>}
            </div>
            <div className="courier-deliveries">
              {mission.required.map((id, index) => {
                const stop = stopById.get(id);
                return <span className={delivered.has(id) ? "done" : ""} key={id}>{mission.ordered && <b>{index + 1}</b>}{stop?.icon} {stop?.label}{delivered.has(id) && <Check aria-hidden="true" />}</span>;
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
          <div><small>{missions.length} 条最短路线全部找到</small><h2>{turtleName}成为金牌快递员啦！</h2><p>你已经会比较距离、安排顺序，还能规划送完返回的完整路线。</p><button type="button" onClick={onBack}>返回龟龟乐园</button></div>
        </div>
      )}
    </section>
  );
}
