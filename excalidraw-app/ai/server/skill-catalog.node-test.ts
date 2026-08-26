import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSET_ENHANCEMENT_SKILL_ID,
  CORE_ANIMATION_SKILL_ID,
  resolveEnabledSkillIds,
  resolveSkillCatalog,
} from "./skill-catalog.ts";

test("animation stays enabled while optional skills follow user settings", () => {
  const defaults = resolveSkillCatalog();
  assert.equal(
    defaults.every((skill) => skill.enabled),
    true,
  );

  const settings = new Map([
    [CORE_ANIMATION_SKILL_ID, false],
    [ASSET_ENHANCEMENT_SKILL_ID, false],
  ]);
  assert.deepEqual(resolveEnabledSkillIds(settings), [CORE_ANIMATION_SKILL_ID]);
});
