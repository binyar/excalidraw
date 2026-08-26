import {
  getSkillDefinition,
  resolveEnabledSkillIds,
  resolveSkillCatalog,
} from "../../ai/server/skill-catalog.ts";

import { HttpError } from "./http.ts";

import type { DatabaseSync } from "node:sqlite";

type SkillSettingRow = {
  skill_id: string;
  enabled: number;
};

export const createSkillService = (
  database: DatabaseSync,
  now: () => string,
) => {
  const getSettings = (username: string) =>
    new Map(
      (
        database
          .prepare(
            "SELECT skill_id, enabled FROM user_skill_settings WHERE username = ?",
          )
          .all(username) as SkillSettingRow[]
      ).map((row) => [row.skill_id, Boolean(row.enabled)]),
    );

  const list = (username: string) => resolveSkillCatalog(getSettings(username));

  const getEnabledIds = (username: string) =>
    resolveEnabledSkillIds(getSettings(username));

  const setInstalled = (
    username: string,
    skillId: string,
    installed: boolean,
  ) => {
    const skill = getSkillDefinition(skillId);
    if (!skill) {
      throw new HttpError(404, "技能不存在");
    }
    if (skill.locked && !installed) {
      throw new HttpError(400, "内置技能不能关闭");
    }
    const enabled = installed || skill.locked;
    database
      .prepare(
        `INSERT INTO user_skill_settings(username, skill_id, enabled, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(username, skill_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
      )
      .run(username, skill.id, enabled ? 1 : 0, now());
    return list(username).find((item) => item.id === skill.id);
  };

  return { getEnabledIds, list, setInstalled };
};

export type SkillService = ReturnType<typeof createSkillService>;
