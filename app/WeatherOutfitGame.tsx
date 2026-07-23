/* eslint-disable @next/next/no-img-element -- Reuses the project's canonical turtle sprite. */
"use client";

import { Backpack, Check, ChevronLeft, Lightbulb, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { useRef, useState } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const TURTLE = `${BASE_PATH}/assets/characters/turtle/turtle_idle_front.png`;

type OutfitItemId =
  | "sunhat"
  | "cap"
  | "raincoat"
  | "warm-coat"
  | "light-jacket"
  | "scarf"
  | "boots"
  | "water"
  | "sunscreen"
  | "umbrella"
  | "towel"
  | "thermos"
  | "flashlight";

type OutfitItem = {
  id: OutfitItemId;
  label: string;
  icon: string;
  category: "clothes" | "gear";
  wearClass?: string;
};

type WeatherChallenge = {
  id: string;
  title: string;
  destination: string;
  weatherIcon: string;
  temperature: string;
  details: string[];
  required: OutfitItemId[];
  avoid: OutfitItemId[];
  reason: string;
  sceneClass: string;
};

const items: OutfitItem[] = [
  { id: "sunhat", label: "遮阳帽", icon: "👒", category: "clothes", wearClass: "wear-sunhat" },
  { id: "cap", label: "轻便帽", icon: "🧢", category: "clothes", wearClass: "wear-cap" },
  { id: "raincoat", label: "雨衣", icon: "🧥", category: "clothes", wearClass: "wear-raincoat" },
  { id: "warm-coat", label: "厚外套", icon: "🧥", category: "clothes", wearClass: "wear-warm-coat" },
  { id: "light-jacket", label: "轻外套", icon: "🥼", category: "clothes", wearClass: "wear-light-jacket" },
  { id: "scarf", label: "围巾", icon: "🧣", category: "clothes", wearClass: "wear-scarf" },
  { id: "boots", label: "防滑靴", icon: "🥾", category: "clothes", wearClass: "wear-boots" },
  { id: "water", label: "饮用水", icon: "💧", category: "gear" },
  { id: "sunscreen", label: "防晒用品", icon: "🧴", category: "gear" },
  { id: "umbrella", label: "折叠伞", icon: "☂️", category: "gear" },
  { id: "towel", label: "小毛巾", icon: "🧻", category: "gear" },
  { id: "thermos", label: "保温杯", icon: "♨️", category: "gear" },
  { id: "flashlight", label: "小手电", icon: "🔦", category: "gear" },
];

const challenges: WeatherChallenge[] = [
  {
    id: "sunny-park",
    title: "晴热公园行",
    destination: "去湖边公园观察昆虫",
    weatherIcon: "☀️",
    temperature: "31℃",
    details: ["阳光很强", "中午炎热", "户外2小时"],
    required: ["sunhat", "water", "sunscreen"],
    avoid: ["warm-coat", "scarf", "raincoat"],
    reason: "强阳光和高温下要遮阳、防晒并及时补水，不需要厚重保暖衣物。",
    sceneClass: "sunny",
  },
  {
    id: "rainy-library",
    title: "雨天送书",
    destination: "步行去图书馆归还绘本",
    weatherIcon: "🌧️",
    temperature: "18℃",
    details: ["持续小雨", "地面湿滑", "来回40分钟"],
    required: ["raincoat", "boots", "umbrella", "towel"],
    avoid: ["sunhat", "warm-coat"],
    reason: "雨衣和雨伞帮助挡雨，防滑靴照顾湿滑路面，小毛巾可以擦干水珠。",
    sceneClass: "rainy",
  },
  {
    id: "cold-hill",
    title: "寒风山坡行",
    destination: "清晨去山坡看日出",
    weatherIcon: "❄️",
    temperature: "2℃",
    details: ["北风较强", "体感寒冷", "天还没完全亮"],
    required: ["warm-coat", "scarf", "boots", "thermos", "flashlight"],
    avoid: ["sunhat", "raincoat"],
    reason: "低温和大风需要保暖外套、围巾和靴子；保温杯与手电适合清晨寒冷、光线不足的旅程。",
    sceneClass: "cold",
  },
  {
    id: "cloudy-trail",
    title: "多云森林步道",
    destination: "下午去森林走短途步道",
    weatherIcon: "🌦️",
    temperature: "16℃",
    details: ["多云偏凉", "偶有阵雨", "傍晚返回"],
    required: ["cap", "light-jacket", "water", "umbrella", "flashlight"],
    avoid: ["warm-coat", "scarf"],
    reason: "偏凉又可能下雨，轻外套和折叠伞更灵活；水和手电能照顾步行与傍晚返程。",
    sceneClass: "cloudy",
  },
];

const itemById = new Map(items.map((item) => [item.id, item]));

export default function WeatherOutfitGame({
  turtleName,
  onBack,
  onComplete,
}: {
  turtleName: string;
  onBack: () => void;
  onComplete: (detail: string) => void;
}) {
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [selected, setSelected] = useState<OutfitItemId[]>([]);
  const [feedback, setFeedback] = useState("");
  const [solved, setSolved] = useState(false);
  const [allComplete, setAllComplete] = useState(false);
  const [checks, setChecks] = useState(0);
  const reportedRef = useRef(false);
  const challenge = challenges[challengeIndex];
  const selectedSet = new Set(selected);

  const resetSelection = () => {
    setSelected([]);
    setFeedback("");
    setSolved(false);
  };

  const toggleItem = (id: OutfitItemId) => {
    if (solved || allComplete) return;
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setFeedback("");
  };

  const checkOutfit = () => {
    setChecks((current) => current + 1);
    const missing = challenge.required.filter((id) => !selectedSet.has(id));
    const unsuitable = challenge.avoid.filter((id) => selectedSet.has(id));
    if (missing.length) {
      setFeedback(`还要想想：${missing.map((id) => itemById.get(id)?.label).join("、")}能解决天气或行程中的什么问题？`);
      return;
    }
    if (unsuitable.length) {
      setFeedback(`${unsuitable.map((id) => itemById.get(id)?.label).join("、")}不适合这次天气，带得太多也会增加负担。`);
      return;
    }
    setSolved(true);
    setFeedback(challenge.reason);
  };

  const nextChallenge = () => {
    if (challengeIndex < challenges.length - 1) {
      setChallengeIndex((current) => current + 1);
      resetSelection();
      return;
    }
    setAllComplete(true);
    if (!reportedRef.current) {
      reportedRef.current = true;
      onComplete(`完成4次天气穿搭，用${checks}次检查选对了衣服和旅行用品`);
    }
  };

  const selectedClothes = selected.map((id) => itemById.get(id)).filter((item) => item?.category === "clothes");
  const selectedGear = selected.map((id) => itemById.get(id)).filter((item) => item?.category === "gear");

  return (
    <section className="learning-game-panel weather-game-panel">
      <header className="learning-game-heading">
        <div>
          <span><Sparkles aria-hidden="true" /> 龟龟乐园 · 生活判断</span>
          <h1>天气穿搭</h1>
        </div>
        <button type="button" onClick={onBack}><ChevronLeft aria-hidden="true" /> 返回乐园</button>
      </header>

      <div className="learning-game-progress" aria-label={`第${challengeIndex + 1}个天气任务，共${challenges.length}个`}>
        {challenges.map((item, index) => (
          <span className={index < challengeIndex || allComplete ? "done" : index === challengeIndex ? "active" : ""} key={item.id}>
            {index < challengeIndex || allComplete ? <Check aria-hidden="true" /> : index + 1}
          </span>
        ))}
      </div>

      {!allComplete ? (
        <div className="weather-game-layout">
          <section className={`weather-stage ${challenge.sceneClass}`}>
            <div className="weather-forecast">
              <span>{challenge.weatherIcon}</span>
              <div><small>{challenge.title}</small><strong>{challenge.temperature}</strong><p>{challenge.destination}</p></div>
            </div>
            <div className="weather-detail-chips">{challenge.details.map((detail) => <span key={detail}>{detail}</span>)}</div>
            <div className="weather-turtle-dressup" aria-label={`${turtleName}的穿搭预览`}>
              <div className="weather-turtle-glow" />
              <img src={TURTLE} alt={`${turtleName}等待选择衣服`} />
              {selectedClothes.map((item) => (
                <span className={`weather-wear ${item?.wearClass || ""}`} key={item?.id} aria-hidden="true">{item?.icon}</span>
              ))}
              <div className="weather-selected-gear">
                <Backpack aria-hidden="true" />
                {selectedGear.length ? selectedGear.map((item) => <span key={item?.id}>{item?.icon}</span>) : <small>旅行用品放这里</small>}
              </div>
            </div>
          </section>

          <section className="weather-wardrobe">
            <header><div><small>任务 {challengeIndex + 1} / {challenges.length}</small><h2>给龟龟准备什么？</h2></div><p>衣服和旅行用品都要选，合适就好，不是越多越好。</p></header>
            <div className="weather-item-section">
              <h3>衣服与鞋帽</h3>
              <div className="weather-item-grid">
                {items.filter((item) => item.category === "clothes").map((item) => (
                  <button className={selectedSet.has(item.id) ? "selected" : ""} type="button" key={item.id} onClick={() => toggleItem(item.id)}>
                    <i>{item.icon}</i><span>{item.label}</span>{selectedSet.has(item.id) && <Check aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="weather-item-section">
              <h3>旅行用品</h3>
              <div className="weather-item-grid gear">
                {items.filter((item) => item.category === "gear").map((item) => (
                  <button className={selectedSet.has(item.id) ? "selected" : ""} type="button" key={item.id} onClick={() => toggleItem(item.id)}>
                    <i>{item.icon}</i><span>{item.label}</span>{selectedSet.has(item.id) && <Check aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </div>
            {feedback && <div className={`learning-game-feedback ${solved ? "success" : "hint"}`} role="status">
              {solved ? <ShieldCheck aria-hidden="true" /> : <Lightbulb aria-hidden="true" />}<p>{feedback}</p>
            </div>}
            <div className="weather-actions">
              {!solved ? (
                <>
                  <button type="button" onClick={resetSelection}><RotateCcw aria-hidden="true" /> 全部重选</button>
                  <button className="primary" type="button" onClick={checkOutfit} disabled={!selected.length}><Check aria-hidden="true" /> 看看合不合适</button>
                </>
              ) : (
                <button className="primary wide" type="button" onClick={nextChallenge}>
                  {challengeIndex < challenges.length - 1 ? "看看下一种天气" : "完成穿搭挑战"}
                </button>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="learning-game-finish">
          <img src={`${BASE_PATH}/assets/characters/turtle/turtle_happy_hearts.png`} alt={`${turtleName}完成天气穿搭`} />
          <div><small>四种天气全部准备正确</small><h2>{turtleName}会看天气做准备啦！</h2><p>你不只选了衣服，还根据温度、降雨、路面和行程准备了旅行用品。</p><button type="button" onClick={onBack}>返回龟龟乐园</button></div>
        </div>
      )}
    </section>
  );
}
