/* eslint-disable @next/next/no-img-element -- Parent mistake photos are private authenticated resources. */
"use client";

import {
  BookHeart,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Download,
  Eraser,
  FileQuestion,
  HeartHandshake,
  Link2,
  LockKeyhole,
  LogOut,
  MessageCircleOff,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { ParentDashboard } from "../../db/parent-center";
import styles from "./ParentCenter.module.css";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
export type ParentSection = "binding" | "overview" | "reading" | "mistakes" | "data";

const navigation: Array<{ key: ParentSection; label: string; path: string; icon: ReactNode }> = [
  { key: "binding", label: "亲子绑定", path: "binding", icon: <Link2 /> },
  { key: "overview", label: "本周概览", path: "", icon: <Sparkles /> },
  { key: "reading", label: "阅读报告", path: "reading", icon: <BookHeart /> },
  { key: "mistakes", label: "错题报告", path: "mistakes", icon: <FileQuestion /> },
  { key: "data", label: "记忆与数据", path: "data", icon: <ShieldCheck /> },
];

function date(value: number | null | undefined, withTime = false) {
  if (!value) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", withTime ? { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" } : { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(value));
}

function Empty({ children }: { children: ReactNode }) {
  return <div className={styles.empty}><BookOpenCheck /> <p>{children}</p></div>;
}

export default function ParentCenter({ initialSection }: { initialSection: ParentSection }) {
  const [dashboard, setDashboard] = useState<ParentDashboard | null>(null);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [factType, setFactType] = useState<"learned" | "interest">("learned");
  const [newFact, setNewFact] = useState("");

  const load = useCallback(async (childId = selectedChildId) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${BASE_PATH}/api/parent/dashboard?days=7&childId=${encodeURIComponent(childId)}`, { cache: "no-store" });
      const data = await response.json() as { dashboard?: ParentDashboard; error?: string };
      if (!response.ok || !data.dashboard) throw new Error(data.error || "报告读取失败。");
      setDashboard(data.dashboard);
      setSelectedChildId(data.dashboard.selectedChild.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "报告读取失败。");
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("childId") || "";
    const timer = window.setTimeout(() => void load(requested), 0);
    return () => window.clearTimeout(timer);
    // Initial loading happens once; subsequent child changes call load directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(action: string, extra: Record<string, unknown> = {}, confirmation = "") {
    if (!dashboard) return;
    if (confirmation && !window.confirm(confirmation)) return;
    setMessage("");
    setError("");
    try {
      const response = await fetch(`${BASE_PATH}/api/parent/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, childId: dashboard.selectedChild.id, ...extra }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "操作没有完成。");
      setMessage("已保存");
      await load(dashboard.selectedChild.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作没有完成。");
    }
  }

  async function addFact(event: FormEvent) {
    event.preventDefault();
    if (!newFact.trim()) return;
    await act("add-memory", { factType, value: newFact });
    setNewFact("");
  }

  async function logout() {
    await fetch(`${BASE_PATH}/api/parent/auth/logout`, { method: "POST" }).catch(() => undefined);
    window.location.href = `${BASE_PATH}/parent`;
  }

  const companionSuggestion = useMemo(() => {
    if (!dashboard) return "这周可以问问孩子：“最想和龟龟一起做什么？”";
    if (dashboard.overview.reading.books.length) return `晚上可以请${dashboard.selectedChild.displayName}讲讲最近读到的一个人物，不必考记忆，多问“你为什么这样想”。`;
    return `可以和${dashboard.selectedChild.displayName}一起选一章短故事，由孩子决定从哪本开始。`;
  }, [dashboard]);

  if (loading && !dashboard) return <main className={styles.loadingPage}><RefreshCw className={styles.spin} /><p>正在整理孩子的成长记录…</p></main>;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/parent" className={styles.brand}>
          <img src={`${BASE_PATH}/assets/ui/supplied/brand/logo-20260715.png`} alt="龟龟伴读" />
          <span>家长中心</span>
        </Link>
        <div className={styles.childPicker}>
          <UserRound />
          <label htmlFor="parent-child">正在查看</label>
          <select id="parent-child" value={selectedChildId} onChange={(event) => void load(event.target.value)} disabled={!dashboard}>
            {dashboard?.children.map((child) => <option value={child.id} key={child.id}>{child.displayName}</option>)}
          </select>
        </div>
        <button className={styles.logout} onClick={logout} aria-label="退出家长中心"><LogOut /></button>
      </header>

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.parentIdentity}><div><UserRound /></div><span>家长账号</span><strong>{dashboard?.parent.displayName || "家长"}</strong></div>
          <nav>
            {navigation.map((item) => (
              <Link key={item.key} className={initialSection === item.key ? styles.activeNav : ""} href={`/parent/${item.path}${selectedChildId ? `?childId=${encodeURIComponent(selectedChildId)}` : ""}`}>
                {item.icon}<span>{item.label}</span><ChevronRight />
              </Link>
            ))}
          </nav>
          <p className={styles.privacyNote}><LockKeyhole />这里不展示孩子的聊天原文，只保留对陪伴有用的提炼信息。</p>
        </aside>

        <section className={styles.content}>
          {(message || error) && <div className={error ? styles.toastError : styles.toast}>{error || message}</div>}
          {!dashboard ? <Empty>{error || "暂时没有可显示的数据。"}</Empty> : <>
            {initialSection === "overview" && <Overview dashboard={dashboard} suggestion={companionSuggestion} />}
            {initialSection === "binding" && <Binding dashboard={dashboard} />}
            {initialSection === "reading" && <Reading dashboard={dashboard} />}
            {initialSection === "mistakes" && <Mistakes dashboard={dashboard} act={act} />}
            {initialSection === "data" && <Data dashboard={dashboard} act={act} factType={factType} setFactType={setFactType} newFact={newFact} setNewFact={setNewFact} addFact={addFact} />}
          </>}
        </section>
      </div>
    </main>
  );
}

function PageTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <div className={styles.pageTitle}><span>{eyebrow}</span><h1>{title}</h1><p>{children}</p></div>;
}

function Overview({ dashboard, suggestion }: { dashboard: ParentDashboard; suggestion: string }) {
  const status = dashboard.overview.mistakes.currentByStatus;
  return <>
    <PageTitle eyebrow="本周概览" title={`${dashboard.selectedChild.displayName}的一周成长`}>看趋势，不做排名；找到一个适合今天的陪伴动作就好。</PageTitle>
    <div className={styles.metricGrid}>
      <article><BookHeart /><span>阅读书籍</span><strong>{dashboard.overview.reading.books.length}</strong><small>本周打开过</small></article>
      <article><CheckCircle2 /><span>完成任务</span><strong>{dashboard.overview.dailyTasks.fullyCompletedDays}</strong><small>{dashboard.overview.dailyTasks.activeDays} 天有学习记录</small></article>
      <article><FileQuestion /><span>错题练习</span><strong>{dashboard.overview.mistakes.photoAnswerAttempts}</strong><small>通过拍照重新作答</small></article>
      <article><Star /><span>成长星星</span><strong>{dashboard.overview.currentResources.stars}</strong><small>当前已拥有</small></article>
    </div>
    <div className={styles.twoColumns}>
      <article className={styles.paperCard}>
        <h2><Sparkles /> 本周亮点</h2>
        {dashboard.overview.reading.books.length ? <p>主动打开了 <strong>{dashboard.overview.reading.books.length}</strong> 本书，完成了 <strong>{dashboard.overview.reading.answerAttempts}</strong> 次章节思考。</p> : <p>这周还在蓄力，可以从一篇短故事开始。</p>}
        <div className={styles.softStats}><span>新错题 {status.new || 0}</span><span>练习中 {status.reviewing || 0}</span><span>已掌握 {status.mastered || 0}</span></div>
      </article>
      <article className={styles.suggestionCard}>
        <h2><HeartHandshake /> 今天可以这样陪</h2><p>{suggestion}</p>
        <small>建议只是提醒，不是对孩子的评价。</small>
      </article>
    </div>
    <article className={styles.paperCard}>
      <h2><Sparkles /> 最近一起做了什么</h2>
      {dashboard.overview.recentActivities.length ? <ul className={styles.timeline}>{dashboard.overview.recentActivities.slice(0, 8).map((item, index) => <li key={`${item.happenedAt}-${index}`}><span>{item.activity}</span><p>{item.detail || "完成了一次活动"}</p><time>{date(item.happenedAt, true)}</time></li>)}</ul> : <Empty>新的活动记录会出现在这里。</Empty>}
    </article>
  </>;
}

function Binding({ dashboard }: { dashboard: ParentDashboard }) {
  return <>
    <PageTitle eyebrow="亲子绑定" title="谁可以看到这些数据">家长中心使用独立账号。一位家长可绑定多个孩子，一个孩子也可以有多位家长。</PageTitle>
    <article className={styles.paperCard}>
      <h2><UserRound /> 家长账号</h2>
      <div className={styles.accountRow}><div><strong>{dashboard.parent.displayName}</strong><span>已验证登录</span></div><ShieldCheck /></div>
    </article>
    <h2 className={styles.sectionHeading}>已绑定的孩子</h2>
    <div className={styles.bindingGrid}>{dashboard.children.map((child) => <article key={child.id} className={styles.bindingCard}><div className={styles.avatar}>{child.displayName.slice(-1)}</div><div><strong>{child.displayName}</strong><span>{child.relationship} · 绑定于 {date(child.linkedAt)}</span></div><CheckCircle2 /></article>)}</div>
    <article className={styles.infoCard}><LockKeyhole /><div><strong>内测期绑定规则</strong><p>当前由平台创建家长账号并确认亲子关系，不开放自助添加，避免输入学生姓名就能看到数据。</p></div></article>
  </>;
}

function Reading({ dashboard }: { dashboard: ParentDashboard }) {
  return <>
    <PageTitle eyebrow="阅读报告" title="阅读轨迹与思考">这里展示读到哪一章、最近阅读时间和章节回答，不用单一正确率给孩子贴标签。</PageTitle>
    <div className={styles.readingGrid}>
      {dashboard.reading.books.length ? dashboard.reading.books.map((book) => <article key={book.bookId} className={styles.bookProgress}>
        <div className={styles.bookCover}>{book.title.slice(0, 1)}</div>
        <div><span>{book.completed ? "已读完" : "阅读中"}</span><h2>{book.title}</h2><p>已读到第 {book.chapterIndex + 1} 章 · 第 {book.pageIndex + 1} 页</p><small>最近阅读：{date(book.lastReadAt, true)}</small></div>
      </article>) : <Empty>还没有阅读进度，第一次打开书籍后会自动记录。</Empty>}
    </div>
    <h2 className={styles.sectionHeading}>章节思考记录</h2>
    {dashboard.reading.answers.length ? <div className={styles.answerList}>{dashboard.reading.answers.map((answer) => <article key={answer.attemptId}>
      <header><div><span>{answer.bookTitle}</span><strong>{answer.chapterTitle}</strong></div><em className={answer.correct ? styles.good : styles.thinking}>{answer.correct ? "结合了原文" : "还需要一点提示"}</em></header>
      <p className={styles.question}>龟龟问：{answer.question}</p><blockquote>{answer.answer}</blockquote><p className={styles.feedback}>龟龟的反馈：{answer.feedback}</p><time>{date(answer.createdAt, true)}</time>
    </article>)}</div> : <Empty>完成一个章节的伴读问题后，思考记录会出现在这里。</Empty>}
  </>;
}

function Mistakes({ dashboard, act }: { dashboard: ParentDashboard; act: (action: string, extra?: Record<string, unknown>, confirmation?: string) => Promise<void> }) {
  function imageUrl(id: string) { return `${BASE_PATH}/api/parent/mistake-image?childId=${encodeURIComponent(dashboard.selectedChild.id)}&id=${encodeURIComponent(id)}`; }
  return <>
    <PageTitle eyebrow="错题报告" title="从错题看见学习过程">家长可以查看和整理照片，但不能直接替孩子标记“已掌握”。</PageTitle>
    {dashboard.mistakes.length ? <div className={styles.mistakeList}>{dashboard.mistakes.map((mistake) => <article key={mistake.mistakeId} className={styles.mistakeCard}>
      <header><div><span>{mistake.subject}</span><strong>{mistake.question}</strong></div><em className={mistake.status === "mastered" ? styles.good : styles.thinking}>{mistake.status === "mastered" ? "已通过重新作答" : mistake.status === "reviewing" ? "正在练习" : "待复习"}</em></header>
      <div className={styles.mistakeBody}>
        <div className={styles.mistakePhoto}>{mistake.imageId ? <img src={imageUrl(mistake.imageId)} alt="学生上传的错题" /> : <span><FileQuestion />原照片已删除</span>}</div>
        <div><dl><div><dt>原回答</dt><dd>{mistake.wrongAnswer || "未识别到"}</dd></div><div><dt>参考思路</dt><dd>{mistake.correction}</dd></div><div><dt>可能原因</dt><dd>{mistake.cause}</dd></div></dl></div>
      </div>
      {mistake.attempts.length > 0 && <div className={styles.attempts}><h3>重新作答</h3>{mistake.attempts.map((attempt) => <div key={attempt.attemptId} className={styles.attemptRow}>
        {attempt.imageId ? <img src={imageUrl(attempt.imageId)} alt="重新作答照片" /> : <span className={styles.deletedPhoto}>照片已删除</span>}
        <div><strong>{attempt.correct ? "思路通过" : "还需要修改"}</strong><p>{attempt.feedback}</p><small>{date(attempt.createdAt, true)}</small></div>
        {attempt.imageId && <button onClick={() => void act("delete-attempt-photo", { attemptId: attempt.attemptId }, "只删除这次重新作答的照片？识别结果和反馈会保留。")}><Eraser />删照片</button>}
      </div>)}</div>}
      <footer><span>{mistake.date} · 练习 {mistake.reviewCount} 次</span><div>{mistake.imageId && <button onClick={() => void act("delete-mistake-photo", { mistakeId: mistake.mistakeId }, "删除原错题照片？错题文字和分析会保留。")}><Eraser />删照片</button>}<button className={styles.dangerButton} onClick={() => void act("delete-mistake", { mistakeId: mistake.mistakeId }, "确定删除这道错题、所有作答记录和照片吗？此操作不能撤销。")}><Trash2 />删整题</button></div></footer>
    </article>)}</div> : <Empty>目前没有错题记录。</Empty>}
  </>;
}

function Data({ dashboard, act, factType, setFactType, newFact, setNewFact, addFact }: {
  dashboard: ParentDashboard;
  act: (action: string, extra?: Record<string, unknown>, confirmation?: string) => Promise<void>;
  factType: "learned" | "interest";
  setFactType: (value: "learned" | "interest") => void;
  newFact: string;
  setNewFact: (value: string) => void;
  addFact: (event: FormEvent) => Promise<void>;
}) {
  const memoryGroups = [
    { title: "最近学会", kind: "learned" as const, values: dashboard.memory.learned },
    { title: "可能感兴趣", kind: "interest" as const, values: dashboard.memory.interests },
    { title: "最近阅读", kind: "book" as const, values: dashboard.memory.books.map((book) => book.title) },
  ];
  return <>
    <PageTitle eyebrow="记忆与数据" title="让龟龟记住有用的，忘掉不必要的">长期只保留提炼后的学习、兴趣和活动记忆；家长可查看、删除或暂停新的提炼。</PageTitle>
    <div className={styles.memoryGrid}>{memoryGroups.map((group) => <article className={styles.paperCard} key={group.kind}><h2>{group.title}</h2>{group.values.length ? <div className={styles.chips}>{group.values.map((value) => <span key={value}>{value}<button aria-label={`删除${value}`} onClick={() => void act("delete-memory", { kind: group.kind, value }, `不再让龟龟记住“${value}”？`)}><Trash2 /></button></span>)}</div> : <p className={styles.muted}>还没有这类记忆。</p>}</article>)}</div>
    <article className={styles.paperCard}><h2><Plus /> 家长补充一条有用记忆</h2><form className={styles.factForm} onSubmit={(event) => void addFact(event)}><select value={factType} onChange={(event) => setFactType(event.target.value as "learned" | "interest")}><option value="learned">学会的内容</option><option value="interest">感兴趣的主题</option></select><input value={newFact} onChange={(event) => setNewFact(event.target.value)} maxLength={140} placeholder="例如：最近对太空和行星很好奇" required /><button><Plus />添加</button></form></article>
    <h2 className={styles.sectionHeading}>隐私与保留设置</h2>
    <article className={styles.controlCard}>
      <label><div><strong>从对话中提炼学生记忆</strong><p>关闭后，新对话不再提取姓名和兴趣；已提炼记忆可以在上方单独删除。</p></div><input type="checkbox" checked={dashboard.controls.chatMemoryEnabled} onChange={(event) => void act("update-controls", { chatMemoryEnabled: event.target.checked })} /></label>
      <label><div><strong>兴趣偏好分析</strong><p>关闭后，对话中不再新增兴趣主题。</p></div><input type="checkbox" checked={dashboard.controls.interestAnalysisEnabled} onChange={(event) => void act("update-controls", { interestAnalysisEnabled: event.target.checked })} /></label>
      <label><div><strong>错题照片建议保留期</strong><p>家长仍可以在错题报告中提前删除单张照片。</p></div><select value={dashboard.controls.mistakePhotoRetentionDays} onChange={(event) => void act("update-controls", { mistakePhotoRetentionDays: Number(event.target.value) })}><option value={30}>30 天</option><option value={90}>90 天</option><option value={180}>180 天</option><option value={365}>1 年</option></select></label>
    </article>
    <div className={styles.dataActions}>
      <a href={`${BASE_PATH}/api/parent/export?childId=${encodeURIComponent(dashboard.selectedChild.id)}`}><Download />导出学习数据<small>不包含聊天原文、密码和照片文件</small></a>
      <button onClick={() => void act("clear-chat", {}, "确定清空该学生的短期聊天记录吗？已提炼的长期记忆不会自动删除。")}><MessageCircleOff />清空短期聊天<small>家长中心本来就不展示聊天原文</small></button>
    </div>
    <article className={styles.dangerZone}><CircleAlert /><div><strong>学生账号删除申请</strong><p>为避免误删，申请只记录请求，不会立即删除数据；平台确认身份后再处理。</p></div>{dashboard.deletionRequest?.status === "pending" ? <button onClick={() => void act("cancel-deletion")}>撤销申请</button> : <button onClick={() => void act("request-deletion", {}, "要提交删除学生账号和学习数据的申请吗？提交后不会立即删除。")}>提交删除申请</button>}</article>
  </>;
}
