import type { Static, TSchema } from "@earendil-works/pi-ai";

import type {
  CanvasDraft,
  StoryAnimationDraft,
  StoryDirectorPlan,
} from "../../../../src/ai/story/types.ts";
import type { CanvasDraftState } from "./state.ts";

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
};

export type CanvasToolOptions = {
  state: CanvasDraftState;
  animate?: (
    draft: CanvasDraft,
    directorPlan: StoryDirectorPlan,
    signal?: AbortSignal,
  ) => Promise<StoryAnimationDraft>;
  assetSources?: string[];
  enabledSkillIds?: string[];
  random?: () => number;
};

export const defineTool = <TSchemaType extends TSchema>(tool: {
  name: string;
  label: string;
  description: string;
  parameters: TSchemaType;
  executionMode: "sequential";
  execute: (
    id: string,
    params: Static<TSchemaType>,
    signal?: AbortSignal,
  ) => Promise<ToolResult>;
}) => tool;

export const resultText = (text: string, details?: unknown): ToolResult => ({
  content: [{ type: "text", text }],
  ...(details ? { details } : {}),
});
