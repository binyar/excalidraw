import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import ExcalidrawApp from "./App";
import { authApi } from "./auth/client";
import { LoginPage } from "./auth/LoginPage";
import { WorkspaceManager } from "./workspace/WorkspaceManager";
import { isWorkspaceCanvasPath } from "./workspace/editorRoute";
import "./styles/globals.css";

import type { AuthSession } from "./auth/client";

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);

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
  return isWorkspaceCanvasPath() ? <ExcalidrawApp /> : <WorkspaceManager />;
};

root.render(
  <StrictMode>
    <AuthenticatedApp />
  </StrictMode>,
);
