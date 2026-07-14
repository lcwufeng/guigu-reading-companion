/* eslint-disable @next/next/no-img-element -- The login screen reuses local pixel-art assets. */
"use client";

import { KeyRound, LogIn, ShieldCheck, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function LoginPanel({ mode, displayName = "" }: { mode: "login" | "reset"; displayName?: string }) {
  const [username, setUsername] = useState(displayName);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (mode === "reset" && newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致。请再检查一次。");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${BASE_PATH}/api/auth/${mode === "login" ? "login" : "reset-password"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "login" ? { username, password } : { newPassword, confirmPassword }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "操作没有完成，请稍后再试。");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作没有完成，请稍后再试。");
      setSubmitting(false);
    }
  };

  const logout = async () => {
    await fetch(`${BASE_PATH}/api/auth/logout`, { method: "POST" }).catch(() => undefined);
    window.location.reload();
  };

  return (
    <main className="login-screen" style={{ backgroundImage: `url("${BASE_PATH}/assets/ui/login/background.png")` }}>
      <section className="login-card" aria-labelledby="login-title">
        <img className="login-logo" src={`${BASE_PATH}/assets/ui/supplied/brand/logo-20260715.png`} alt="龟龟伴读" />
        <img className="login-turtle" src={`${BASE_PATH}/assets/characters/turtle/${mode === "reset" ? "turtle_thinking.png" : "turtle_waving.png"}`} alt="欢迎你的龟龟" />
        <div className="login-copy">
          <span><Sparkles aria-hidden="true" /> {mode === "reset" ? `欢迎你，${displayName}` : "内测学习屋"}</span>
          <h1 id="login-title">{mode === "reset" ? "第一次登录，请设置新密码" : "登录后，龟龟才能认出你"}</h1>
          <p>{mode === "reset" ? "新密码设置完成后，你的阅读进度、星星、错题和聊天记忆都会只保存在自己的账户中。" : "请输入自己的内测账号和密码。每位同学的数据都会独立保存，互相看不到。"}</p>
        </div>

        <form className="login-form" onSubmit={submit}>
          {mode === "login" ? (
            <>
              <label>
                <span>账号</span>
                <input value={username} onChange={(event) => setUsername(event.target.value.slice(0, 12))} autoComplete="username" maxLength={12} placeholder="请输入账号" autoFocus required />
              </label>
              <label>
                <span>密码</span>
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={6} maxLength={64} placeholder="请输入密码" required />
              </label>
            </>
          ) : (
            <>
              <label>
                <span>新密码</span>
                <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={6} maxLength={64} placeholder="至少 6 位，不能再用 123456" required />
              </label>
              <label>
                <span>再次输入新密码</span>
                <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} maxLength={64} required />
              </label>
            </>
          )}
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-button" type="submit" disabled={submitting}>
            {mode === "reset" ? <KeyRound aria-hidden="true" /> : <LogIn aria-hidden="true" />}
            {submitting ? "请稍等…" : mode === "reset" ? "保存新密码并进入" : "登录学习屋"}
          </button>
          {mode === "reset" && <button className="login-logout" type="button" onClick={logout}>退出并换一个账号</button>}
        </form>
        <small className="login-privacy"><ShieldCheck aria-hidden="true" /> 密码会加密校验，平台不会保存可直接读取的明文密码。</small>
      </section>
    </main>
  );
}
