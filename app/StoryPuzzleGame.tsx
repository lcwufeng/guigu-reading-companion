/* eslint-disable @next/next/no-img-element -- Reuses the project's canonical turtle sprites. */
"use client";

import { BookOpen, Check, ChevronLeft, Lightbulb, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import { useRef, useState } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const TURTLE = `${BASE_PATH}/assets/characters/turtle/actions/turtle-companion-reading-hd.webp`;

type StoryCard = {
  id: string;
  icon: string;
  text: string;
};

type StoryLevel = {
  id: string;
  title: string;
  difficulty: "入门" | "进阶" | "挑战";
  introduction: string;
  lesson: string;
  order: string[];
  cards: StoryCard[];
};

const levels: StoryLevel[] = [
  {
    id: "seed-wakes",
    title: "小种子醒来了",
    difficulty: "入门",
    introduction: "想一想，一颗种子要怎样变成小苗？",
    lesson: "故事有先后顺序：先播种，再浇水，最后才会发芽。",
    order: ["seed", "water", "sprout"],
    cards: [
      { id: "sprout", icon: "🌱", text: "几天后，泥土里钻出了一棵嫩绿的小苗。" },
      { id: "seed", icon: "🫘", text: "龟龟把一颗小种子轻轻埋进松软的泥土。" },
      { id: "water", icon: "💧", text: "龟龟每天给花盆浇一点水，还把它放到阳光下。" },
    ],
  },
  {
    id: "rainy-umbrella",
    title: "雨伞下的新朋友",
    difficulty: "入门",
    introduction: "根据人物的行动，把这个温暖的小故事排完整。",
    lesson: "留意“发现困难—想办法—结果”这条故事线。",
    order: ["rain", "meet", "share", "home"],
    cards: [
      { id: "share", icon: "☂️", text: "龟龟把雨伞往小兔那边挪了挪，两个人一起走。" },
      { id: "home", icon: "🏠", text: "他们平安到家，也约好晴天再一起玩。" },
      { id: "rain", icon: "🌧️", text: "放学时突然下起大雨，龟龟撑开了自己的小伞。" },
      { id: "meet", icon: "🐰", text: "路边的小兔没有带伞，正着急地望着天空。" },
    ],
  },
  {
    id: "lost-bookmark",
    title: "书签去哪儿了",
    difficulty: "进阶",
    introduction: "这是一段寻找线索的故事，哪一步应该先发生？",
    lesson: "解决问题时，可以按“发现—观察—推理—验证”的顺序思考。",
    order: ["discover", "clue", "remember", "find"],
    cards: [
      { id: "remember", icon: "💭", text: "它想起刚才在窗边看书时，一阵风吹动了书页。" },
      { id: "find", icon: "🔖", text: "龟龟沿着风吹的方向寻找，终于在花盆后找到了书签。" },
      { id: "discover", icon: "📖", text: "龟龟重新打开故事书，发现最喜欢的叶子书签不见了。" },
      { id: "clue", icon: "🔍", text: "它没有慌张，先看看桌面和地面有没有线索。" },
    ],
  },
  {
    id: "forest-rescue",
    title: "森林里的小桥",
    difficulty: "进阶",
    introduction: "把准备、行动和合作的过程排列清楚。",
    lesson: "一个完整故事不只有结果，还要交代准备和解决困难的过程。",
    order: ["problem", "plan", "build", "cross", "thank"],
    cards: [
      { id: "cross", icon: "🦔", text: "小刺猬扶着栏杆，稳稳地走过了新桥。" },
      { id: "problem", icon: "🌊", text: "雨水冲坏了小木桥，小刺猬没法回到河对岸的家。" },
      { id: "thank", icon: "💛", text: "小刺猬向大家道谢，还送来一篮香甜的果子。" },
      { id: "plan", icon: "📝", text: "龟龟叫来伙伴，大家先量宽度，再画出修桥的办法。" },
      { id: "build", icon: "🪵", text: "大家搬来结实的木板，一起搭好桥面和栏杆。" },
    ],
  },
  {
    id: "starlight-post",
    title: "星光邮局的约定",
    difficulty: "挑战",
    introduction: "终极故事有六个情节，注意原因、转折和结局。",
    lesson: "读长故事时，可以找出起因、经过、转折和结果。",
    order: ["letter", "promise", "storm", "idea", "deliver", "reply"],
    cards: [
      { id: "deliver", icon: "📬", text: "天亮后，龟龟沿着发光的路标，把信准时送到了山顶。" },
      { id: "letter", icon: "✉️", text: "星光邮局收到一封信，山脚的小鹿想把生日祝福送给奶奶。" },
      { id: "storm", icon: "⛈️", text: "夜里风雨突然变大，熟悉的小路被浓雾遮住了。" },
      { id: "reply", icon: "🌟", text: "傍晚，奶奶寄回一颗纸星星，感谢龟龟守住了约定。" },
      { id: "promise", icon: "🤝", text: "龟龟接下任务，答应第二天早晨以前把信送到。" },
      { id: "idea", icon: "🏮", text: "龟龟请萤火虫排成一列，为前方的道路照明。" },
    ],
  },
];

export default function StoryPuzzleGame({
  turtleName,
  onBack,
  onMistake,
  onComplete,
}: {
  turtleName: string;
  onBack: () => void;
  onMistake: () => void;
  onComplete: (detail: string) => void;
}) {
  const [levelIndex, setLevelIndex] = useState(0);
  const [chosenIds, setChosenIds] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintedId, setHintedId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [allComplete, setAllComplete] = useState(false);
  const reportedRef = useRef(false);
  const level = levels[levelIndex];
  const levelComplete = chosenIds.length === level.order.length;

  const chooseCard = (card: StoryCard) => {
    if (levelComplete || chosenIds.includes(card.id)) return;
    const expectedId = level.order[chosenIds.length];
    if (card.id !== expectedId) {
      onMistake();
      setMistakes((current) => current + 1);
      setFeedback("这个情节还没有发生。先找一找：故事此刻最需要发生什么？");
      return;
    }
    const nextChosen = [...chosenIds, card.id];
    setChosenIds(nextChosen);
    setHintedId("");
    setFeedback(nextChosen.length === level.order.length
      ? `故事拼完整啦！${level.lesson}`
      : `顺序正确！接着选择第 ${nextChosen.length + 1} 个情节。`);
  };

  const resetLevel = () => {
    setChosenIds([]);
    setHintedId("");
    setFeedback("");
  };

  const undoLast = () => {
    setChosenIds((current) => current.slice(0, -1));
    setHintedId("");
    setFeedback("已经退回一步，再想想接下来会发生什么。");
  };

  const showHint = () => {
    const expectedId = level.order[chosenIds.length];
    setHintedId(expectedId);
    setHintsUsed((current) => current + 1);
    setFeedback("龟龟把下一张情节卡轻轻点亮了，读一读它为什么应该排在这里。");
  };

  const nextLevel = () => {
    if (levelIndex < levels.length - 1) {
      setLevelIndex((current) => current + 1);
      resetLevel();
      return;
    }
    setAllComplete(true);
    if (!reportedRef.current) {
      reportedRef.current = true;
      onComplete(`完成${levels.length}关拼故事，能按起因、经过、转折和结果整理故事，尝试调整${mistakes}次，使用提示${hintsUsed}次`);
    }
  };

  return (
    <section className="learning-game-panel story-game-panel">
      <header className="learning-game-heading">
        <div>
          <span><BookOpen aria-hidden="true" /> 龟龟乐园 · 阅读表达</span>
          <h1>拼故事</h1>
        </div>
        <button type="button" onClick={onBack}><ChevronLeft aria-hidden="true" /> 返回乐园</button>
      </header>

      <div className="learning-game-progress" aria-label={`第${levelIndex + 1}关，共${levels.length}关`}>
        {levels.map((item, index) => (
          <span className={index < levelIndex || allComplete ? "done" : index === levelIndex ? "active" : ""} key={item.id}>
            {index < levelIndex || allComplete ? <Check aria-hidden="true" /> : index + 1}
          </span>
        ))}
      </div>

      {!allComplete ? (
        <div className="story-game-layout">
          <section className="story-board">
            <header>
              <div><small>{level.difficulty} · 第 {levelIndex + 1}/{levels.length} 关</small><h2>{level.title}</h2><p>{level.introduction}</p></div>
              <img src={TURTLE} alt={`${turtleName}正在读故事`} />
            </header>
            <div className="story-timeline" aria-label="已经排好的故事情节">
              {level.order.map((id, index) => {
                const chosen = chosenIds.includes(id);
                const card = level.cards.find((item) => item.id === id);
                return (
                  <div className={chosen ? "filled" : ""} key={id}>
                    <b>{index + 1}</b>
                    {chosen && card ? <><span>{card.icon}</span><p>{card.text}</p></> : <em>等待选择</em>}
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="story-card-tray">
            <header><small>情节卡片</small><h2>下一步会发生什么？</h2><p>仔细读完每张卡，再按故事顺序点击。</p></header>
            <div className="story-card-grid">
              {level.cards.map((card) => {
                const selectedIndex = chosenIds.indexOf(card.id);
                return (
                  <button
                    type="button"
                    className={`${selectedIndex >= 0 ? "selected" : ""} ${hintedId === card.id ? "hinted" : ""}`}
                    key={card.id}
                    disabled={selectedIndex >= 0 || levelComplete}
                    onClick={() => chooseCard(card)}
                  >
                    <span>{card.icon}</span>
                    <p>{card.text}</p>
                    {selectedIndex >= 0 && <b><Check aria-hidden="true" /> 第 {selectedIndex + 1} 步</b>}
                  </button>
                );
              })}
            </div>
            {feedback && <div className={`learning-game-feedback ${levelComplete ? "success" : "hint"}`} role="status"><Sparkles aria-hidden="true" /><p>{feedback}</p></div>}
            <div className="story-actions">
              {!levelComplete ? (
                <>
                  <button type="button" onClick={showHint}><Lightbulb aria-hidden="true" /> 龟龟提示</button>
                  <button type="button" disabled={!chosenIds.length} onClick={undoLast}><Undo2 aria-hidden="true" /> 退回一步</button>
                  <button type="button" onClick={resetLevel}><RotateCcw aria-hidden="true" /> 重新排列</button>
                </>
              ) : (
                <button className="primary" type="button" onClick={nextLevel}>{levelIndex < levels.length - 1 ? "拼下一个故事" : "完成挑战"}</button>
              )}
            </div>
          </aside>
        </div>
      ) : (
        <div className="learning-game-finish">
          <img src={`${BASE_PATH}/assets/characters/turtle/actions/turtle-companion-celebrating-hd.webp`} alt={`${turtleName}完成拼故事`} />
          <div><small>{levels.length} 个故事全部拼完整</small><h2>{turtleName}和你成为故事小导演啦！</h2><p>你会根据前因后果整理情节，也知道一个完整故事需要起因、经过和结果。</p><button type="button" onClick={onBack}>返回龟龟乐园</button></div>
        </div>
      )}
    </section>
  );
}
