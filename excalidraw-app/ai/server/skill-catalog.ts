export const CORE_ANIMATION_SKILL_ID = "core-animation";
export const ASSET_ENHANCEMENT_SKILL_ID = "asset-enhancement";

export const SKILL_CATALOG = Object.freeze([
  Object.freeze({
    id: CORE_ANIMATION_SKILL_ID,
    name: "动画编排",
    version: "1.0.0",
    description: "规划故事场景、对象动画、镜头运动和页面转场。",
    icon: "animation",
    builtIn: true,
    locked: true,
    defaultEnabled: true,
  }),
  Object.freeze({
    id: ASSET_ENHANCEMENT_SKILL_ID,
    name: "素材增强",
    version: "1.0.0",
    description: "允许 Agent 搜索并使用你已添加的素材包。",
    icon: "assets",
    builtIn: false,
    locked: false,
    defaultEnabled: true,
  }),
]);

export const getSkillDefinition = (skillId: string) =>
  SKILL_CATALOG.find((skill) => skill.id === skillId) || null;

export const resolveSkillCatalog = (settings = new Map()) =>
  SKILL_CATALOG.map((skill) => ({
    ...skill,
    enabled: skill.locked
      ? true
      : settings.has(skill.id)
      ? settings.get(skill.id) === true
      : skill.defaultEnabled,
  }));

export const resolveEnabledSkillIds = (settings = new Map()) =>
  resolveSkillCatalog(settings)
    .filter((skill) => skill.enabled)
    .map((skill) => skill.id);
