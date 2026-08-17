/**
 * Engine-agnostic animation description language.
 *
 * The types in this file must remain JSON serializable. They intentionally do
 * not expose or import any timeline-engine or canvas-editor APIs.
 */

export const ANIMATION_SCHEMA_VERSION = "1.0" as const;

export type AnimationSchemaVersion = typeof ANIMATION_SCHEMA_VERSION;

export type AnimationProjectId = string;
export type AnimationTrackId = string;
export type AnimationGroupId = string;
export type AnimationPresetId = string;
export type AnimationPropertyId = string;
export type AnimationElementId = string;
export type AnimationCameraId = "main";
export type AnimationTransitionEffect =
  | "camera"
  | "color-wipe"
  | "directional-wipe"
  | "fade-through-color"
  | "push"
  | "iris";
export type AnimationTransitionDirection = "left" | "right" | "up" | "down";

export type AnimationFillMode = "none" | "forwards" | "backwards" | "both";

export type AnimationDirection =
  | "normal"
  | "reverse"
  | "alternate"
  | "alternate-reverse";

export type AnimationIterationCount = number | "infinite";

export type AnimationPoint = {
  x: number;
  y: number;
};

/** CSS-compatible color string. Canonical authoring form is #RRGGBB or #RRGGBBAA. */
export type AnimationColor = string;
export type AnimationFillStyle = "hachure" | "cross-hatch" | "solid" | "zigzag";
export type AnimationStrokeStyle = "solid" | "dashed" | "dotted";
/** Canonical radius progress is 0..1; string values are legacy input only. */
export type AnimationRoundness = number | "sharp" | "round";
export type AnimationTextAlign = "left" | "center" | "right";
export type AnimationVerticalAlign = "top" | "middle" | "bottom";
/** Discrete runtime presence. Hidden elements remain in the base scene. */
export type ElementVisibility = "visible" | "hidden";

export type AnimationShadow = {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: AnimationColor;
};

export type AnimationPath =
  | {
      type: "polyline";
      points: AnimationPoint[];
      closed?: boolean;
    }
  | {
      type: "svg";
      d: string;
    }
  | {
      /** AI-friendly cubic Bezier path that does not require SVG parsing. */
      type: "bezier";
      start: AnimationPoint;
      segments: Array<{
        control1: AnimationPoint;
        control2: AnimationPoint;
        to: AnimationPoint;
      }>;
      closed?: boolean;
    };

export type AnimationEasingPresetName =
  | "linear"
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "smooth"
  | "sharp"
  | "bounce"
  | "back-in"
  | "back-out"
  | "back-in-out";

export type AnimationEasing =
  | {
      type: "preset";
      name: AnimationEasingPresetName;
    }
  | {
      type: "cubic-bezier";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | {
      type: "steps";
      count: number;
      position: "start" | "end";
    }
  | {
      type: "spring";
      mass: number;
      stiffness: number;
      damping: number;
      velocity?: number;
    };

/**
 * `easing` controls the segment from this keyframe to the next keyframe.
 * Times are relative to the owning track and expressed in milliseconds.
 */
export type AnimationKeyframe<T> = {
  atMs: number;
  value: T;
  easing?: AnimationEasing;
  hold?: boolean;
  label?: string;
};

export type TransformAnimationPropertyName =
  | "transform.x"
  | "transform.y"
  | "transform.scale"
  | "transform.rotate";

export type CameraAnimationPropertyName =
  | "camera.centerX"
  | "camera.centerY"
  | "camera.zoom";

export type VisualAnimationPropertyName =
  | "visual.opacity"
  | "visual.strokeColor"
  | "visual.backgroundColor"
  | "visual.fillStyle"
  | "visual.strokeWidth"
  | "visual.strokeStyle"
  | "visual.roughness"
  | "visual.roundness";

export type TextAnimationPropertyName =
  | "text.fontSize"
  | "text.fontFamily"
  | "text.textAlign"
  | "text.verticalAlign";

export type ElementStateAnimationPropertyName = "element.visibility";

export type AdvancedAnimationPropertyName =
  | "advanced.path"
  | "advanced.drawProgress"
  | "advanced.blur"
  | "advanced.shadow";

export type TransitionAnimationPropertyName =
  | "transition.progress"
  | "transition.opacity"
  | "transition.color"
  | "transition.blur"
  | "transition.scale";

export type AnimationPropertyName =
  | TransformAnimationPropertyName
  | CameraAnimationPropertyName
  | VisualAnimationPropertyName
  | TextAnimationPropertyName
  | ElementStateAnimationPropertyName
  | AdvancedAnimationPropertyName
  | TransitionAnimationPropertyName;

/**
 * State properties jump at their keyframe and never own an interpolated
 * timeline segment. Everything else is sampled continuously; colors use
 * component-wise interpolation and roundness maps its UI endpoints to 0..1.
 */
export const STATE_ANIMATION_PROPERTIES: readonly AnimationPropertyName[] = [
  "element.visibility",
  "visual.fillStyle",
  "visual.strokeStyle",
  "visual.roughness",
  "text.fontFamily",
  "text.textAlign",
  "text.verticalAlign",
];

const STATE_ANIMATION_PROPERTY_SET = new Set<AnimationPropertyName>(
  STATE_ANIMATION_PROPERTIES,
);

export const isStateAnimationProperty = (property: string): boolean =>
  STATE_ANIMATION_PROPERTY_SET.has(property as AnimationPropertyName);

export type NumericAnimationPropertyName =
  | TransformAnimationPropertyName
  | CameraAnimationPropertyName
  | "visual.opacity"
  | "visual.strokeWidth"
  // Number-valued enum for editor compatibility; behavior is state-only.
  | "visual.roughness"
  | "text.fontSize"
  | "text.fontFamily"
  | "advanced.drawProgress"
  | "advanced.blur"
  | "transition.progress"
  | "transition.opacity"
  | "transition.blur"
  | "transition.scale";

export type ColorAnimationPropertyName =
  | "visual.strokeColor"
  | "visual.backgroundColor"
  | "transition.color";

export type AnimationValueByProperty = {
  "transform.x": number;
  "transform.y": number;
  "transform.scale": number;
  /** Rotation in degrees. */
  "transform.rotate": number;
  /** Camera center in scene coordinates. */
  "camera.centerX": number;
  /** Camera center in scene coordinates. */
  "camera.centerY": number;
  /** Camera magnification where 1 is 100%. */
  "camera.zoom": number;
  /** Opacity normalized to the range 0..1. */
  "visual.opacity": number;
  "visual.strokeColor": AnimationColor;
  "visual.backgroundColor": AnimationColor;
  "visual.fillStyle": AnimationFillStyle;
  "visual.strokeWidth": number;
  "visual.strokeStyle": AnimationStrokeStyle;
  "visual.roughness": number;
  "visual.roundness": AnimationRoundness;
  "text.fontSize": number;
  "text.fontFamily": number;
  "text.textAlign": AnimationTextAlign;
  "text.verticalAlign": AnimationVerticalAlign;
  /** Step-valued state; it is never interpolated. */
  "element.visibility": ElementVisibility;
  /** Progress along `motionPath`, normalized to the range 0..1. */
  "advanced.path": number;
  /** Visible fraction of a line, arrow, or free-draw stroke. */
  "advanced.drawProgress": number;
  /** Blur radius in CSS pixels/canvas units. */
  "advanced.blur": number;
  "advanced.shadow": AnimationShadow;
  /** Normalized reveal progress for the virtual stage transition layer. */
  "transition.progress": number;
  "transition.opacity": number;
  "transition.color": AnimationColor;
  "transition.blur": number;
  "transition.scale": number;
};

export type AnimationPropertyBase<
  TName extends AnimationPropertyName,
  TValue,
> = {
  id?: AnimationPropertyId;
  property: TName;
  enabled?: boolean;
  fill?: AnimationFillMode;
  keyframes: AnimationKeyframe<TValue>[];
};

export type NumericAnimationProperty = {
  [TName in NumericAnimationPropertyName]: AnimationPropertyBase<
    TName,
    AnimationValueByProperty[TName]
  >;
}[NumericAnimationPropertyName];

export type ColorAnimationProperty = {
  [TName in ColorAnimationPropertyName]: AnimationPropertyBase<
    TName,
    AnimationValueByProperty[TName]
  >;
}[ColorAnimationPropertyName];

export type FillStyleAnimationProperty = AnimationPropertyBase<
  "visual.fillStyle",
  AnimationFillStyle
>;

export type VisibilityAnimationProperty = AnimationPropertyBase<
  "element.visibility",
  ElementVisibility
>;

export type DiscreteStyleAnimationProperty = {
  [TName in
    | "visual.strokeStyle"
    | "visual.roughness"
    | "text.fontFamily"
    | "text.textAlign"
    | "text.verticalAlign"]: AnimationPropertyBase<
    TName,
    AnimationValueByProperty[TName]
  >;
}[
  | "visual.strokeStyle"
  | "visual.roughness"
  | "text.fontFamily"
  | "text.textAlign"
  | "text.verticalAlign"];

export type RoundnessAnimationProperty = AnimationPropertyBase<
  "visual.roundness",
  AnimationRoundness
>;

export type PathAnimationProperty = AnimationPropertyBase<
  "advanced.path",
  number
> & {
  motionPath: AnimationPath;
  orientToPath?: boolean;
  /** Anchor in normalized element coordinates, for example {x: 0.5, y: 0.5}. */
  anchor?: AnimationPoint;
};

export type DrawAnimationProperty = AnimationPropertyBase<
  "advanced.drawProgress",
  number
>;

export type ShadowAnimationProperty = AnimationPropertyBase<
  "advanced.shadow",
  AnimationShadow
>;

export type AnimationProperty =
  | NumericAnimationProperty
  | ColorAnimationProperty
  | FillStyleAnimationProperty
  | VisibilityAnimationProperty
  | DiscreteStyleAnimationProperty
  | RoundnessAnimationProperty
  | PathAnimationProperty
  | DrawAnimationProperty
  | ShadowAnimationProperty;

export type AnimationTarget =
  | {
      type: "element";
      elementId: AnimationElementId;
    }
  | {
      type: "group";
      groupId: AnimationGroupId;
    }
  | {
      /** Scene-level viewport controller; not an Excalidraw element. */
      type: "camera";
      cameraId: AnimationCameraId;
    }
  | {
      /** Runtime-only stage layer; never materialized as an Excalidraw element. */
      type: "transition";
      transitionId: string;
      layerId: string;
      fromSceneId: string;
      toSceneId: string;
      effect: AnimationTransitionEffect;
      direction?: AnimationTransitionDirection;
      role?: "exit" | "bridge" | "enter";
    };

export type GroupMember =
  | {
      type: "element";
      elementId: AnimationElementId;
      /** Semantic role such as background, title, or icon. */
      role?: string;
    }
  | {
      type: "group";
      groupId: AnimationGroupId;
      role?: string;
    };

export type AnimationGroup = {
  id: AnimationGroupId;
  name?: string;
  description?: string;
  members: GroupMember[];
};

export type GroupAnimationOptions =
  | {
      mode: "together";
    }
  | {
      mode: "stagger";
      eachMs: number;
      order?: "forward" | "reverse" | "random" | "by-role";
      /** Required for deterministic random order. */
      seed?: number;
      /** Used when order is `by-role`; unlisted roles follow in source order. */
      roleOrder?: string[];
    };

type AnimationPresetBase<
  TCategory extends AnimationPresetCategory,
  TName extends string,
> = {
  id?: AnimationPresetId;
  category: TCategory;
  name: TName;
  atMs: number;
  durationMs: number;
  easing?: AnimationEasing;
  fill?: AnimationFillMode;
};

export type AnimationPresetCategory =
  | "entrance"
  | "exit"
  | "emphasis"
  | "motion"
  | "data";

export type EntranceAnimationPreset =
  | (AnimationPresetBase<"entrance", "fade-in"> & {
      fromOpacity?: number;
    })
  | (AnimationPresetBase<"entrance", "slide-in"> & {
      direction: "left" | "right" | "up" | "down";
      distance?: number;
    })
  | (AnimationPresetBase<"entrance", "scale-in"> & {
      fromScale?: number;
    })
  | (AnimationPresetBase<"entrance", "pop-in"> & {
      fromScale?: number;
      overshoot?: number;
    });

export type ExitAnimationPreset =
  | (AnimationPresetBase<"exit", "fade-out"> & {
      toOpacity?: number;
    })
  | (AnimationPresetBase<"exit", "slide-out"> & {
      direction: "left" | "right" | "up" | "down";
      distance?: number;
    })
  | (AnimationPresetBase<"exit", "scale-out"> & {
      toScale?: number;
    })
  | (AnimationPresetBase<"exit", "pop-out"> & {
      toScale?: number;
      overshoot?: number;
    });

export type EmphasisAnimationPreset =
  | (AnimationPresetBase<"emphasis", "pulse"> & {
      scale?: number;
      count?: number;
    })
  | (AnimationPresetBase<"emphasis", "shake"> & {
      distance?: number;
      count?: number;
      axis?: "x" | "y" | "both";
    })
  | (AnimationPresetBase<"emphasis", "bounce"> & {
      distance?: number;
      count?: number;
    })
  | (AnimationPresetBase<"emphasis", "highlight"> & {
      color: AnimationColor;
      count?: number;
    });

export type MotionAnimationPreset =
  | (AnimationPresetBase<"motion", "move-to"> & {
      to: AnimationPoint;
      from?: AnimationPoint;
    })
  | (AnimationPresetBase<"motion", "follow-path"> & {
      path: AnimationPath;
      orientToPath?: boolean;
    })
  | (AnimationPresetBase<"motion", "orbit"> & {
      center: AnimationPoint;
      radius: number;
      turns?: number;
      clockwise?: boolean;
    });

export type DataNumberFormat = {
  decimals?: number;
  prefix?: string;
  suffix?: string;
  useGrouping?: boolean;
};

export type DataAnimationPreset =
  | (AnimationPresetBase<"data", "count-up"> & {
      from: number;
      to: number;
      format?: DataNumberFormat;
    })
  | (AnimationPresetBase<"data", "progress"> & {
      from?: number;
      to: number;
      min?: number;
      max?: number;
    })
  | (AnimationPresetBase<"data", "reveal"> & {
      direction?: "left-to-right" | "right-to-left" | "top-to-bottom";
    });

export type AnimationPreset =
  | EntranceAnimationPreset
  | ExitAnimationPreset
  | EmphasisAnimationPreset
  | MotionAnimationPreset
  | DataAnimationPreset;

type LoopAnimationBase<TType extends string> = {
  id?: string;
  type: TType;
  atMs?: number;
  durationMs: number;
  iterations: AnimationIterationCount;
  direction?: AnimationDirection;
  delayMs?: number;
  easing?: AnimationEasing;
};

export type PulseLoopAnimation = LoopAnimationBase<"pulse"> & {
  fromScale?: number;
  toScale?: number;
  fromOpacity?: number;
  toOpacity?: number;
};

export type BlinkLoopAnimation = LoopAnimationBase<"blink"> & {
  minOpacity?: number;
  maxOpacity?: number;
  dutyCycle?: number;
};

export type RotateLoopAnimation = LoopAnimationBase<"rotate"> & {
  fromDegrees?: number;
  toDegrees?: number;
  clockwise?: boolean;
};

export type LoopAnimation =
  | PulseLoopAnimation
  | BlinkLoopAnimation
  | RotateLoopAnimation;

export type AnimationTrack = {
  id: AnimationTrackId;
  target: AnimationTarget;
  /** When set, startMs is relative to the referenced scene. */
  sceneId?: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  /** Higher priority wins when multiple expanded tracks write one property. */
  priority?: number;
  /** Track offset from project time zero. Defaults to 0. */
  startMs?: number;
  /** Optional clipping duration. Content outside this range is not evaluated. */
  durationMs?: number;
  fill?: AnimationFillMode;
  properties?: AnimationProperty[];
  presets?: AnimationPreset[];
  loops?: LoopAnimation[];
  /** Only valid when target.type is `group`. */
  group?: GroupAnimationOptions;
};

export type AnimationPlayback = {
  autoplay?: boolean;
  rate?: number;
  direction?: AnimationDirection;
  iterations?: AnimationIterationCount;
};

export type AnimationProjectMetadata = {
  title?: string;
  description?: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  source?: "ai" | "user" | "imported" | "mixed";
  prompt?: string;
};

/** A named interval in the master timeline. Track startMs is scene-relative. */
export type AnimationScene = {
  id: string;
  name?: string;
  description?: string;
  startMs: number;
  durationMs: number;
};

export type AnimationProject = {
  schemaVersion: AnimationSchemaVersion;
  id: AnimationProjectId;
  /** Total timeline duration in milliseconds. */
  durationMs: number;
  /** Authoring and deterministic export frame rate. */
  frameRate: number;
  playback?: AnimationPlayback;
  metadata?: AnimationProjectMetadata;
  /** Optional scene lanes for dashboard pages and presentation chapters. */
  scenes?: AnimationScene[];
  groups?: AnimationGroup[];
  tracks: AnimationTrack[];
};
