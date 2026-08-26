import type { IncomingMessage, ServerResponse } from "node:http";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
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

export const readBody = async (
  request: IncomingMessage,
  limit = 25 * 1024 * 1024,
) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) {
      throw new HttpError(413, "文件不能超过 25 MB");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

export const readJson = async <T = Record<string, unknown>>(
  request: IncomingMessage,
): Promise<T> => {
  const body = await readBody(request, 1024 * 1024);
  return body.length ? JSON.parse(body.toString("utf8")) : ({} as T);
};
