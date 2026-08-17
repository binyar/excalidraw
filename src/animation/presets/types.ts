import type {
  AnimationDirection,
  AnimationEasing,
  AnimationEasingPresetName,
  AnimationProject,
  AnimationTarget,
} from "../types";

export type PresetCategory = "entrance" | "emphasis" | "transform" | "data";

export type PresetTarget = string | AnimationTarget;

export type PresetEasing = AnimationEasingPresetName | AnimationEasing;

export type PresetGenerationBase = {
  target: PresetTarget;
  /** Effect duration in milliseconds. */
  duration: number;
  /** Absolute start time in the generated project, in milliseconds. */
  atMs?: number;
  easing?: PresetEasing;
  projectId?: string;
  trackId?: string;
  frameRate?: number;
};

export type NumberPresetParam = {
  type: "number";
  description: string;
  default?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  unit?: "ms" | "px" | "degrees" | "ratio" | "count" | "value";
  required?: boolean;
};

export type BooleanPresetParam = {
  type: "boolean";
  description: string;
  default?: boolean;
  required?: boolean;
};

export type EasingPresetParam = {
  type: "easing";
  description: string;
  default: AnimationEasingPresetName;
};

export type SelectPresetParam = {
  type: "select";
  description: string;
  options: readonly string[];
  default?: string;
  required?: boolean;
};

export type PathPresetParam = {
  type: "path";
  description: string;
  required: true;
};

export type ObjectPresetParam = {
  type: "object";
  description: string;
  required?: boolean;
};

export type PresetParam =
  | NumberPresetParam
  | BooleanPresetParam
  | EasingPresetParam
  | SelectPresetParam
  | PathPresetParam
  | ObjectPresetParam;

export type PresetParams = Readonly<Record<string, PresetParam>>;

export type AnimationPresetDefinition<
  TName extends string,
  TInput extends PresetGenerationBase,
> = Readonly<{
  name: TName;
  description: string;
  params: PresetParams;
  generateAnimation(input: TInput): AnimationProject;
}>;

export type LoopPresetInput = PresetGenerationBase & {
  iterations?: number;
  delay?: number;
  direction?: AnimationDirection;
};
