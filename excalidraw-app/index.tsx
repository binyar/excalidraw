import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import "../excalidraw-app/sentry";

import ExcalidrawApp from "./App";
import { authApi } from "./auth/client";
import { LoginPage } from "./auth/LoginPage";
import { WorkspaceManager } from "./workspace/WorkspaceManager";

import type { AuthSession } from "./auth/client";

window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;
const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
registerSW();

export const AuthenticatedApp = () => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const isLoginPage = window.location.pathname === "/login";

  useEffect(() => {
    authApi
      .session()
      .then(setSession)
      .catch(() => setSession({ authenticated: false }));
  }, []);

  useEffect(() => {
    if (session && !session.authenticated && !isLoginPage) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [isLoginPage, session]);

  if (!session) {
    return <div className="login-page login-loading">正在加载...</div>;
  }
  if (isLoginPage) {
    return <LoginPage authenticated={session.authenticated} />;
  }
  if (!session.authenticated) {
    return <div className="login-page login-loading">正在跳转登录...</div>;
  }
  return window.location.pathname === "/editor" ? (
    <ExcalidrawApp />
  ) : (
    <WorkspaceManager />
  );
};

root.render(
  <StrictMode>
    <AuthenticatedApp />
  </StrictMode>,
);
