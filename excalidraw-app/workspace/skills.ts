export type AgentSkill = {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: "animation" | "assets";
  builtIn: boolean;
  locked: boolean;
  enabled: boolean;
};

const API_ROOT = "/api/workspace/skills";

const request = async <T>(path = "", options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_ROOT}${path}`, options);
  if (response.status === 401) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    throw new Error("登录状态已失效，请重新登录");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `请求失败 (${response.status})`);
  }
  return response.json() as Promise<T>;
};

export const skillApi = {
  list: () => request<{ skills: AgentSkill[]; enabledCount: number }>(),
  enable: (id: string) =>
    request<AgentSkill>(`/${encodeURIComponent(id)}/install`, {
      method: "POST",
    }),
  disable: (id: string) =>
    request<AgentSkill>(`/${encodeURIComponent(id)}/install`, {
      method: "DELETE",
    }),
};

export const isSkillLibraryPath = (pathname = window.location.pathname) =>
  pathname === "/skills" || pathname === "/skills/";
