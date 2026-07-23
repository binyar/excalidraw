export type AuthSession =
  | { authenticated: true; username: string }
  | { authenticated: false };

const authRequest = async <T>(path: string, options?: RequestInit) => {
  const response = await fetch(`/api/auth${path}`, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `请求失败 (${response.status})`);
  }
  return payload as T;
};

export const authApi = {
  session: () => authRequest<AuthSession>("/session"),
  login: (username: string, password: string) =>
    authRequest<{ authenticated: true; username: string }>("/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  logout: () =>
    authRequest<{ authenticated: false }>("/logout", { method: "POST" }),
};
