import { useEffect, useState } from "react";

import { authApi } from "./client";
import "./login.scss";

const getSafeNextPath = () => {
  const next = new URLSearchParams(window.location.search).get("next");
  return next?.startsWith("/") && !next.startsWith("//") && next !== "/login"
    ? next
    : "/";
};

export const LoginPage = ({ authenticated }: { authenticated: boolean }) => {
  const [username, setUsername] = useState("fanmd");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authenticated) {
      window.location.replace(getSafeNextPath());
    }
  }, [authenticated]);

  return (
    <main className="login-page">
      <header className="login-header">
        <div className="login-brand">
          <span className="login-brand__mark">⌁</span>
          <span>
            <strong>Excalidraw</strong> File Manager
          </span>
        </div>
      </header>

      <section className="login-content">
        <div className="login-decoration" aria-hidden="true">
          <span className="login-decoration__shape login-decoration__shape--one" />
          <span className="login-decoration__shape login-decoration__shape--two" />
          <div className="login-preview">
            <div className="login-preview__toolbar">
              <i />
              <i />
              <i />
              <i />
            </div>
            <svg viewBox="0 0 480 290">
              <rect x="72" y="52" width="110" height="48" rx="8" />
              <rect x="300" y="52" width="110" height="48" rx="8" />
              <path d="M182 76h118" />
              <path d="m290 68 10 8-10 8" />
              <path d="M240 100v52" />
              <path d="m232 142 8 10 8-10" />
              <path d="M240 152 330 215 240 272 150 215Z" />
              <text x="112" y="82">
                创建画板
              </text>
              <text x="336" y="82">
                自动保存
              </text>
              <text x="204" y="220">
                文件管理
              </text>
            </svg>
          </div>
          <h1>专注创作，统一管理</h1>
          <p>你的画板会安全保存到文件管理系统中</p>
        </div>

        <form
          className="login-card"
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitting(true);
            setError("");
            try {
              await authApi.login(username.trim(), password);
              window.location.replace(getSafeNextPath());
            } catch (nextError) {
              setError(
                nextError instanceof Error ? nextError.message : "登录失败",
              );
              setSubmitting(false);
            }
          }}
        >
          <div className="login-card__brand">
            <span className="login-brand__mark login-brand__mark--large">
              ⌁
            </span>
            <h2>
              <strong>Excalidraw</strong> File Manager
            </h2>
          </div>
          <p className="login-card__intro">登录后继续使用文件管理系统</p>

          <label>
            用户名
            <span className="login-input">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
              <input
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="请输入用户名"
                required
              />
            </span>
          </label>

          <label>
            密码
            <span className="login-input">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="10" width="14" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
                required
              />
            </span>
          </label>

          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <button className="login-submit" type="submit" disabled={submitting}>
            {submitting ? "正在登录..." : "登录"}
          </button>
        </form>
      </section>
    </main>
  );
};
