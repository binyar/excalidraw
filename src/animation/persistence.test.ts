import {
  LOCAL_ANIMATION_PROJECT_STORAGE_KEY,
  attachAnimationProjectToSceneJson,
  loadLocalAnimationProject,
  readAnimationProjectFromSceneJson,
  saveLocalAnimationProject,
} from "./persistence";

import type { AnimationProject } from "./types";

const project: AnimationProject = {
  schemaVersion: "1.0",
  id: "persisted-animation",
  durationMs: 5000,
  frameRate: 60,
  tracks: [],
};

describe("animation persistence", () => {
  it("embeds and restores the Animation DSL without changing scene fields", () => {
    const serialized = attachAnimationProjectToSceneJson(
      JSON.stringify({ type: "excalidraw", elements: [{ id: "shape" }] }),
      project,
    );

    expect(JSON.parse(serialized)).toMatchObject({
      type: "excalidraw",
      elements: [{ id: "shape" }],
      animation: project,
    });
    expect(readAnimationProjectFromSceneJson(serialized)).toEqual(project);
  });

  it("saves and restores the local Animation DSL", () => {
    saveLocalAnimationProject(project);
    expect(loadLocalAnimationProject()).toEqual(project);
    expect(localStorage.getItem(LOCAL_ANIMATION_PROJECT_STORAGE_KEY)).toBe(
      JSON.stringify(project),
    );
  });
});
