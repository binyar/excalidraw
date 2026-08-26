import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};
const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;

export class AiHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const sendJson = (
  response: ServerResponse,
  status: number,
  value: unknown,
) => {
  response.writeHead(status, JSON_HEADERS);
  response.end(JSON.stringify(value));
};

export const readJson = async (
  request: IncomingMessage,
): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const rawChunk of request) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) {
      throw new AiHttpError("消息内容过大", 413);
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AiHttpError("请求内容格式无效", 400);
  }
  return parsed as Record<string, unknown>;
};

type UiMessage = {
  role?: unknown;
  content?: unknown;
  parts?: unknown;
};

const textFromUiMessage = (message: UiMessage): string =>
  Array.isArray(message.parts)
    ? message.parts
        .flatMap((part) =>
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          part.type === "text" &&
          "text" in part
            ? [String(part.text)]
            : [],
        )
        .join("\n")
        .trim()
    : String(message.content || "").trim();

export const getLastUserText = (messages: unknown): string => {
  if (!Array.isArray(messages)) {
    return "";
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      typeof message === "object" &&
      message !== null &&
      "role" in message &&
      message.role === "user"
    ) {
      return textFromUiMessage(message);
    }
  }
  return "";
};

export const safeTranscript = (value: unknown): AgentMessage[] => {
  try {
    const parsed: unknown = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? (parsed as AgentMessage[]) : [];
  } catch {
    return [];
  }
};
