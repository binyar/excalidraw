import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import ExcalidrawApp from "./App";
import { AssetAdminPage } from "./admin/AssetAdminPage";
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
  const isAdminPage = window.location.pathname === "/admin/assets";

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
  if (isAdminPage) {
    return session.isAdmin ? (
      <AssetAdminPage />
    ) : (
      <main className="grid min-h-svh place-items-center bg-muted/30 px-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold">无后台管理权限</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            当前账户不能访问素材管理后台。
          </p>
        </div>
      </main>
    );
  }
  return isWorkspaceCanvasPath() ? <ExcalidrawApp /> : <WorkspaceManager />;
};

root.render(
  <StrictMode>
    <AuthenticatedApp />
  </StrictMode>,
);
