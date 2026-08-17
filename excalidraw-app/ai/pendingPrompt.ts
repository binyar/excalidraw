const AI_CREATE_PROMPT_PREFIX = "excalidraw-ai-create:";

type PendingAiCreatePrompt = {
  prompt: string;
  createdAt: number;
  thinkingEnabled?: boolean;
};

const storageKey = (workspaceFileId: string) =>
  `${AI_CREATE_PROMPT_PREFIX}${workspaceFileId}`;
const thinkingStorageKey = (workspaceFileId: string) =>
  `${AI_CREATE_PROMPT_PREFIX}thinking:${workspaceFileId}`;

export const savePendingAiCreatePrompt = (
  workspaceFileId: string,
  prompt: string,
  options?: { thinkingEnabled?: boolean },
) => {
  if (!workspaceFileId || !prompt.trim()) {
    return;
  }
  const value: PendingAiCreatePrompt = {
    prompt: prompt.trim(),
    createdAt: Date.now(),
    thinkingEnabled: options?.thinkingEnabled === true,
  };
  try {
    window.sessionStorage.setItem(
      storageKey(workspaceFileId),
      JSON.stringify(value),
    );
    window.sessionStorage.setItem(
      thinkingStorageKey(workspaceFileId),
      value.thinkingEnabled ? "on" : "off",
    );
  } catch {
    // The editor still opens when storage is unavailable; the user can submit
    // the same prompt manually from the AI panel.
  }
};

export const getPendingAiThinkingEnabled = (workspaceFileId: string) => {
  if (!workspaceFileId) {
    return false;
  }
  try {
    return (
      window.sessionStorage.getItem(thinkingStorageKey(workspaceFileId)) ===
      "on"
    );
  } catch {
    return false;
  }
};

export const hasPendingAiCreatePrompt = (workspaceFileId: string) => {
  try {
    return Boolean(
      workspaceFileId &&
        window.sessionStorage.getItem(storageKey(workspaceFileId)),
    );
  } catch {
    return false;
  }
};

export const consumePendingAiCreatePrompt = (
  workspaceFileId: string,
): string | null => {
  if (!workspaceFileId) {
    return null;
  }
  const key = storageKey(workspaceFileId);
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Reading succeeded, so continue with the in-memory value.
  }
  try {
    const value = JSON.parse(raw) as Partial<PendingAiCreatePrompt>;
    return typeof value.prompt === "string" && value.prompt.trim()
      ? value.prompt.trim()
      : null;
  } catch {
    return null;
  }
};
