import { withDefaultStorySpaces } from "./story-spaces.ts";

import type {
  CanvasDraft,
  StoryAnimationPlan,
  StoryAnimationPlanScene,
  StoryChapterTransitionPlan,
  StoryDirectorContent,
  StoryDirectorPlan,
} from "../../../../src/ai/story/types.ts";

type DirectorDraft = {
  durationMs?: number;
  rationale?: string;
  summary?: string;
  style?: StoryAnimationPlan["style"];
  content: StoryDirectorContent[];
  scenes: StoryAnimationPlanScene[];
};

type CanvasDraftStateOptions = {
  existingDirectorPlan?: StoryDirectorPlan | null;
  requireDirectorPlan?: boolean;
  requireManagedLayout?: boolean;
};

export const createCanvasDraftState = (
  existingCanvas: CanvasDraft | null = null,
  {
    existingDirectorPlan = null,
    requireDirectorPlan = false,
    requireManagedLayout = false,
  }: CanvasDraftStateOptions = {},
) => {
  const directorDraft: DirectorDraft = existingDirectorPlan
    ? {
        durationMs: existingDirectorPlan.durationMs,
        rationale: existingDirectorPlan.rationale,
        summary: existingDirectorPlan.directionSummary,
        style: structuredClone(existingDirectorPlan.style),
        content: structuredClone(existingDirectorPlan.content),
        scenes: structuredClone(existingDirectorPlan.scenes),
      }
    : { content: [], scenes: [] };

  const existingPageTransitions: Record<string, StoryChapterTransitionPlan> =
    Object.fromEntries(
      (existingDirectorPlan?.scenes || [])
        .filter(
          (scene) => scene.transition && scene.transition.effect !== "camera",
        )
        .map((scene) => [scene.id, structuredClone(scene.transition!)]),
    );

  return {
    story: existingCanvas
      ? {
          id: existingCanvas.id,
          title: existingCanvas.title,
          summary: existingCanvas.summary,
          beats: withDefaultStorySpaces(existingCanvas.beats || []),
        }
      : null,
    elements: structuredClone(existingCanvas?.elements || []),
    libraryAssets: structuredClone(existingCanvas?.libraryAssets || []),
    connectors: structuredClone(existingCanvas?.connectors || []),
    spaceLayouts: structuredClone(existingCanvas?.spaceLayouts || []),
    sections: structuredClone(existingCanvas?.sections || []),
    layoutNeedsMaterialization: false,
    requireManagedLayout: requireManagedLayout && !existingCanvas,
    storySpacesDefined: Boolean(existingCanvas),
    requireDirectorPlan,
    directorPlan: structuredClone(existingDirectorPlan),
    existingPageTransitions,
    directorDraft,
    directorFrozen: false,
    frozen: false,
    editing: Boolean(existingCanvas),
  };
};

export type CanvasDraftState = ReturnType<typeof createCanvasDraftState>;
