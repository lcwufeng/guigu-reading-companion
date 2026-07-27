/* eslint-disable @next/next/no-img-element -- Reuses the supplied Guigui brand artwork. */
"use client";

import { ArrowLeft, KeyRound, LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import styles from "./ParentCenter.module.css";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function ParentLoginPanel({ mode, displayName = "" }: { mode: "login" | "reset"; displayName?: string }) {
  const [username, setUsername] = useState(displayName);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${BASE_PATH}/api/parent/auth/${mode === "login" ? "login" : "reset-password"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "login" ? { username, password } : { newPassword, confirmPassword }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "操作没有完成。");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作没有完成。");
      setSubmitting(false);
    }
  }

  async function logout() {
    await fetch(`${BASE_PATH}/api/parent/auth/logout`, { method: "POST" }).catch(() => undefined);
    window.location.reload();
  }

  return (
    <main className={styles.loginPage} style={{ backgroundImage: `linear-gradient(rgba(225, 248, 246,.78), rgba(255, 247, 218, .86)), url("${BASE_PATH}/assets/optimized/ui/login/background.webp")` }}>
      <a className={styles.backToStudent} href={`${BASE_PATH}/`}><ArrowLeft /> 返回学生入口</a>
      <section className={styles.loginCard}>
        <img src={`${BASE_PATH}/assets/ui/supplied/brand/logo-20260715.png`} alt="龟龟伴读" className={styles.loginLogo} />
        <span className={styles.parentBadge}><ShieldCheck /> 家长中心</span>
        <h1>{mode === "reset" ? `欢迎，${displayName}` : "看见孩子的成长"}</h1>
        <p>{mode === "reset" ? "首次登录请设置一个新密码。修改后，初始密码立即失效。" : "了解阅读、错题和最近兴趣，用更合适的方式陪伴。家长中心不展示孩子的聊天原文。"}</p>
        <form onSubmit={submit} className={styles.loginForm}>
          {mode === "login" ? <>
            <label><span>家长账号</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" maxLength={20} autoFocus required /></label>
            <label><span>密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={6} maxLength={64} required /></label>
          </> : <>
            <label><span>新密码</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={64} placeholder="至少 8 位，混合字母、数字或符号" required /></label>
            <label><span>再输入一次</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={64} required /></label>
          </>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" className={styles.primaryButton} disabled={submitting}>
            {mode === "reset" ? <KeyRound /> : <LogIn />}{submitting ? "请稍候…" : mode === "reset" ? "保存新密码" : "登录家长中心"}
          </button>
          {mode === "reset" && <button type="button" className={styles.textButton} onClick={logout}>退出并换一个账号</button>}
        </form>
        <small><LockKeyhole /> 家长账号与学生账号分开，数据只按亲子绑定展示。</small>
      </section>
    </main>
  );
}
