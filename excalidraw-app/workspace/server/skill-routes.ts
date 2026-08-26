import { sendJson } from "./http.ts";

import type { IncomingMessage, ServerResponse } from "node:http";
import type { SkillService } from "./skill-service.ts";

type SkillRoute = {
  resource?: string;
  id?: string;
  action?: string;
};

export const handleSkillRequest = (
  request: IncomingMessage,
  response: ServerResponse,
  route: SkillRoute,
  username: string,
  skills: SkillService,
) => {
  if (route.resource !== "skills") {
    return false;
  }

  if (request.method === "GET" && !route.id) {
    const catalog = skills.list(username);
    sendJson(response, 200, {
      skills: catalog,
      enabledCount: catalog.filter((skill) => skill.enabled).length,
    });
    return true;
  }

  if (
    route.id &&
    route.action === "install" &&
    (request.method === "POST" || request.method === "DELETE")
  ) {
    sendJson(
      response,
      200,
      skills.setInstalled(username, route.id, request.method === "POST"),
    );
    return true;
  }

  sendJson(response, 404, { error: "接口不存在" });
  return true;
};
