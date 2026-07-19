/* eslint-disable @next/next/no-img-element -- Supplied brand artwork is rendered at its intrinsic ratio. */
"use client";

import { FormEvent, useState } from "react";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import styles from "./AdminCenter.module.css";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function AdminLoginPanel({ mode, displayName = "" }: { mode: "login" | "reset"; displayName?: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${BASE_PATH}/api/admin/auth/${mode === "login" ? "login" : "reset-password"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "login" ? { username, password } : { newPassword: password, confirmPassword }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "操作失败。");
      window.location.href = `${BASE_PATH}/admin`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.loginPage} style={{ backgroundImage: `linear-gradient(rgba(235,248,243,.83), rgba(250,245,226,.88)), url("${BASE_PATH}/assets/ui/login/background.png")` }}>
    <Link href="/" className={styles.backLink}>返回学习屋</Link>
    <section className={styles.loginCard}>
      <img src={`${BASE_PATH}/assets/ui/supplied/brand/logo-20260715.png`} alt="龟龟伴读" />
      <div className={styles.loginBadge}><ShieldCheck /> 平台管理后台</div>
      <h1>{mode === "login" ? "管理员登录" : "首次登录请设置新密码"}</h1>
      <p>{mode === "login" ? "管理学生、家长和平台运行数据。" : `${displayName}，新密码至少 10 位，并同时包含字母和数字。`}</p>
      <form onSubmit={submit}>
        {mode === "login" && <label><span>管理员账号</span><div><ShieldCheck /><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></div></label>}
        <label><span>{mode === "login" ? "密码" : "新密码"}</span><div><LockKeyhole /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 10 : 10} required /></div></label>
        {mode === "reset" && <label><span>再次输入新密码</span><div><KeyRound /><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={10} required /></div></label>}
        {error && <div className={styles.loginError}>{error}</div>}
        <button disabled={busy}>{busy ? "正在处理…" : mode === "login" ? "进入管理后台" : "保存新密码"}</button>
      </form>
      <small>后台不会展示孩子的聊天原文，所有重要操作都会记录。</small>
    </section>
  </main>;
}
