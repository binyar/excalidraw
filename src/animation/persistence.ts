import { animationProjectSchema } from "./schema";

import type { AnimationProject } from "./types";

export const LOCAL_ANIMATION_PROJECT_STORAGE_KEY =
  "excalidraw-animation-project";

export const attachAnimationProjectToSceneJson = (
  sceneJson: string,
  project: AnimationProject,
): string => {
  const scene = JSON.parse(sceneJson) as Record<string, unknown>;
  return JSON.stringify({ ...scene, animation: project }, null, 2);
};

export const readAnimationProjectFromSceneJson = (
  sceneJson: string,
): AnimationProject | undefined => {
  const scene = JSON.parse(sceneJson) as { animation?: unknown };
  if (scene.animation === undefined) {
    return undefined;
  }
  return animationProjectSchema.parse(scene.animation);
};

export const loadLocalAnimationProject = (): AnimationProject | undefined => {
  try {
    const serialized = localStorage.getItem(
      LOCAL_ANIMATION_PROJECT_STORAGE_KEY,
    );
    return serialized
      ? animationProjectSchema.parse(JSON.parse(serialized))
      : undefined;
  } catch (error) {
    console.error("无法读取本地动画数据", error);
    return undefined;
  }
};

export const saveLocalAnimationProject = (project: AnimationProject): void => {
  try {
    localStorage.setItem(
      LOCAL_ANIMATION_PROJECT_STORAGE_KEY,
      JSON.stringify(project),
    );
  } catch (error) {
    console.error("无法保存本地动画数据", error);
  }
};
