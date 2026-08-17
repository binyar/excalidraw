import { useEffect, useState } from "react";
import { LockKeyhole, UserRound } from "lucide-react";

import { authApi } from "./client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <main className="grid min-h-svh place-items-center bg-muted/30 px-4 py-10">
      <section className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-xl text-primary-foreground">
            ⌁
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Powdoo</div>
            <div className="text-xs text-muted-foreground">File Manager</div>
          </div>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">登录到工作台</CardTitle>
            <CardDescription>输入账户信息以继续管理动画画板</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4"
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
              <div className="grid gap-2">
                <Label htmlFor="username">用户名</Label>
                <div className="relative">
                  <UserRound
                    aria-hidden="true"
                    size="1em"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="username"
                    className="pl-9"
                    autoFocus
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="请输入用户名"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">密码</Label>
                <div className="relative">
                  <LockKeyhole
                    aria-hidden="true"
                    size="1em"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="password"
                    type="password"
                    className="pl-9"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="请输入密码"
                    required
                  />
                </div>
              </div>

              {error && (
                <div
                  className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <Button
                className="mt-1 w-full"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "正在登录..." : "登录"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          动画画板与文件由工作区统一管理
        </p>
      </section>
    </main>
  );
};
