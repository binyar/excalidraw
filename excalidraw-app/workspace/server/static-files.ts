import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";

import type { IncomingMessage, ServerResponse } from "node:http";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

export const serveStaticFile = (
  request: IncomingMessage,
  response: ServerResponse,
  buildDirectory: string,
) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const requested = path
    .normalize(decodeURIComponent(url.pathname))
    .replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(
    buildDirectory,
    requested === "/" ? "index.html" : requested,
  );
  if (
    !filePath.startsWith(buildDirectory) ||
    !existsSync(filePath) ||
    statSync(filePath).isDirectory()
  ) {
    filePath = path.join(buildDirectory, "index.html");
  }
  response.writeHead(200, {
    "content-type":
      CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
};
