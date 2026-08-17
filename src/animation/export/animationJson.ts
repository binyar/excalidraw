import { animationProjectSchema } from "../schema";

import type { AnimationProject } from "../types";

export const ANIMATION_EXPORT_FILENAME = "animation.json";

export const serializeAnimationProject = (
  project: AnimationProject,
  options: { pretty?: boolean } = { pretty: true },
): string =>
  JSON.stringify(
    animationProjectSchema.parse(project),
    null,
    options.pretty === false ? undefined : 2,
  );

export const parseAnimationProjectJson = (json: string): AnimationProject =>
  animationProjectSchema.parse(JSON.parse(json));

export const downloadAnimationProject = (
  project: AnimationProject,
  filename = ANIMATION_EXPORT_FILENAME,
): void => {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("Animation download requires a browser environment.");
  }
  const url = URL.createObjectURL(
    new Blob([serializeAnimationProject(project)], {
      type: "application/json",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
