import {
  bounceInPreset,
  fadeInPreset,
  movePathPreset,
  pulsePreset,
  rotatePreset,
  scaleUpPreset,
  shakePreset,
  slideLeftPreset,
  slideRightPreset,
} from "../presets";
import { animationProjectSchema } from "../schema";
import { ANIMATION_SCHEMA_VERSION } from "../types";

import type {
  AnimationEasingPresetName,
  AnimationProperty,
  AnimationProject,
  AnimationTrack,
} from "../types";

export type AnimationInspectorCategory =
  | "entrance"
  | "transform"
  | "color"
  | "motion";

export type AnimationInspectorPresetId =
  | "fade-in"
  | "slide-left"
  | "slide-right"
  | "scale-up"
  | "bounce-in"
  | "pulse"
  | "shake"
  | "rotate"
  | "stroke-color"
  | "background-color"
  | "move-path";

export type AnimationInspectorElement = {
  id: string;
  type: string;
  strokeColor: string;
  backgroundColor: string;
  fillStyle?: "hachure" | "cross-hatch" | "solid" | "zigzag";
};

export type AnimationInspectorConfig = {
  category: AnimationInspectorCategory;
  presetId: AnimationInspectorPresetId;
  duration: number;
  delay: number;
  easing: AnimationEasingPresetName;
};

export type AnimationInspectorPreset = {
  id: AnimationInspectorPresetId;
  category: AnimationInspectorCategory;
  label: string;
  description: string;
  defaultDuration: number;
  defaultEasing: AnimationEasingPresetName;
};

export const ANIMATION_INSPECTOR_CATEGORIES = [
  { id: "entrance", label: "入场" },
  { id: "transform", label: "变换" },
  { id: "color", label: "颜色" },
  { id: "motion", label: "运动" },
] as const;

export const ANIMATION_INSPECTOR_PRESETS: readonly AnimationInspectorPreset[] =
  [
    preset("fade-in", "entrance", "淡入", "让元素逐渐显现。", 600, "ease-out"),
    preset(
      "slide-left",
      "entrance",
      "从左滑入",
      "元素从左侧进入画布。",
      700,
      "ease-out",
    ),
    preset(
      "slide-right",
      "entrance",
      "从右滑入",
      "元素从右侧进入画布。",
      700,
      "ease-out",
    ),
    preset(
      "scale-up",
      "entrance",
      "放大进入",
      "元素由小变为最终尺寸。",
      550,
      "ease-out",
    ),
    preset(
      "bounce-in",
      "entrance",
      "弹跳进入",
      "元素带轻微回弹地放大进入。",
      750,
      "back-out",
    ),
    preset(
      "pulse",
      "transform",
      "脉冲",
      "通过缩放脉冲强调元素。",
      700,
      "ease-in-out",
    ),
    preset(
      "shake",
      "transform",
      "抖动",
      "元素围绕原位水平抖动。",
      600,
      "ease-in-out",
    ),
    preset(
      "rotate",
      "transform",
      "旋转",
      "元素围绕中心旋转一周。",
      1000,
      "linear",
    ),
    preset(
      "stroke-color",
      "color",
      "描边颜色",
      "将轮廓颜色过渡为红色。",
      700,
      "ease-in-out",
    ),
    preset(
      "background-color",
      "color",
      "填充颜色",
      "将填充颜色过渡为蓝色。",
      700,
      "ease-in-out",
    ),
    preset(
      "move-path",
      "motion",
      "向右移动",
      "沿路径向右移动 160 像素。",
      1000,
      "ease-in-out",
    ),
  ];

export const getInspectorPresets = (category: AnimationInspectorCategory) =>
  ANIMATION_INSPECTOR_PRESETS.filter((item) => item.category === category);

export const getInspectorPreset = (presetId: AnimationInspectorPresetId) => {
  const definition = ANIMATION_INSPECTOR_PRESETS.find(
    (item) => item.id === presetId,
  );
  if (!definition) {
    throw new Error(`Unknown animation inspector preset: ${presetId}`);
  }
  return definition;
};

export const defaultInspectorConfig = (
  category: AnimationInspectorCategory = "entrance",
): AnimationInspectorConfig => {
  const definition = getInspectorPresets(category)[0];
  return {
    category,
    presetId: definition.id,
    duration: definition.defaultDuration,
    delay: 0,
    easing: definition.defaultEasing,
  };
};

export const generateInspectorAnimation = (
  element: AnimationInspectorElement,
  config: AnimationInspectorConfig,
): AnimationProject => {
  const common = {
    target: element.id,
    duration: positive(config.duration, "duration"),
    atMs: nonNegative(config.delay, "delay"),
    easing: config.easing,
    projectId: `animation-inspector-${element.id}`,
    trackId: `animation-inspector-track-${element.id}`,
  };
  let project: AnimationProject;

  switch (config.presetId) {
    case "fade-in":
      project = fadeInPreset.generateAnimation(common);
      break;
    case "slide-left":
      project = slideLeftPreset.generateAnimation(common);
      break;
    case "slide-right":
      project = slideRightPreset.generateAnimation(common);
      break;
    case "scale-up":
      project = scaleUpPreset.generateAnimation(common);
      break;
    case "bounce-in":
      project = bounceInPreset.generateAnimation(common);
      break;
    case "pulse":
      project = pulsePreset.generateAnimation(common);
      break;
    case "shake":
      project = shakePreset.generateAnimation(common);
      break;
    case "rotate":
      project = rotatePreset.generateAnimation({ ...common, iterations: 1 });
      break;
    case "move-path":
      project = movePathPreset.generateAnimation({
        ...common,
        path: {
          type: "polyline",
          points: [
            { x: 0, y: 0 },
            { x: 160, y: 0 },
          ],
        },
      });
      break;
    case "stroke-color":
      project = colorProject(
        element,
        config,
        "visual.strokeColor",
        normalizeColor(element.strokeColor, "#1E1E1E"),
        "#E03131",
      );
      break;
    case "background-color":
      project = colorProject(
        element,
        config,
        "visual.backgroundColor",
        normalizeColor(element.backgroundColor, "#00000000"),
        "#A5D8FF",
      );
      break;
  }

  project = materializeInspectorPreset(project, config);
  const definition = getInspectorPreset(config.presetId);
  project.tracks[0] = {
    ...project.tracks[0],
    name: definition.label,
    description: `Animation Inspector preset: ${definition.id}`,
  };
  project.metadata = { source: "user", title: `${definition.label}动画` };
  return animationProjectSchema.parse(project);
};

const materializeInspectorPreset = (
  project: AnimationProject,
  config: AnimationInspectorConfig,
): AnimationProject => {
  const sourceTrack = project.tracks[0];
  if (sourceTrack.properties?.length) {
    return project;
  }
  const easing = { type: "preset" as const, name: config.easing };
  const numeric = (
    property: NumericInspectorProperty,
    values: Array<{ atMs: number; value: number }>,
  ): AnimationProperty => ({
    property,
    keyframes: values.map((keyframe, index) => ({
      ...keyframe,
      ...(index < values.length - 1 ? { easing } : {}),
    })),
  });
  let properties: AnimationProperty[];

  switch (config.presetId) {
    case "fade-in":
      properties = [
        numeric("visual.opacity", [
          { atMs: 0, value: 0 },
          { atMs: config.duration, value: 1 },
        ]),
      ];
      break;
    case "slide-left":
    case "slide-right":
      properties = [
        numeric("transform.x", [
          {
            atMs: 0,
            value: config.presetId === "slide-left" ? -80 : 80,
          },
          { atMs: config.duration, value: 0 },
        ]),
      ];
      break;
    case "scale-up":
      properties = [
        numeric("transform.scale", [
          { atMs: 0, value: 0.75 },
          { atMs: config.duration, value: 1 },
        ]),
      ];
      break;
    case "bounce-in":
      properties = [
        numeric("transform.scale", [
          { atMs: 0, value: 0.45 },
          { atMs: config.duration * 0.72, value: 1.12 },
          { atMs: config.duration, value: 1 },
        ]),
      ];
      break;
    case "pulse":
      properties = [
        numeric("transform.scale", [
          { atMs: 0, value: 1 },
          { atMs: config.duration / 2, value: 1.08 },
          { atMs: config.duration, value: 1 },
        ]),
      ];
      break;
    case "shake": {
      const steps = 8;
      properties = [
        numeric(
          "transform.x",
          Array.from({ length: steps + 1 }, (_, index) => ({
            atMs: (config.duration * index) / steps,
            value: index === 0 || index === steps ? 0 : index % 2 ? -12 : 12,
          })),
        ),
      ];
      break;
    }
    case "rotate":
      properties = [
        numeric("transform.rotate", [
          { atMs: 0, value: 0 },
          { atMs: config.duration, value: 360 },
        ]),
      ];
      break;
    case "move-path":
      properties = [
        {
          property: "advanced.path",
          motionPath: {
            type: "polyline",
            points: [
              { x: 0, y: 0 },
              { x: 160, y: 0 },
            ],
          },
          keyframes: [
            { atMs: 0, value: 0, easing },
            { atMs: config.duration, value: 1 },
          ],
        },
      ];
      break;
    case "stroke-color":
    case "background-color":
      return project;
  }

  const { presets: _presets, loops: _loops, ...track } = sourceTrack;
  return animationProjectSchema.parse({
    ...project,
    tracks: [{ ...track, durationMs: config.duration, properties }],
  });
};

type NumericInspectorProperty =
  | "transform.x"
  | "transform.y"
  | "transform.scale"
  | "transform.rotate"
  | "visual.opacity";

export const readInspectorConfig = (
  track: AnimationTrack | undefined,
): AnimationInspectorConfig | undefined => {
  if (!track?.description?.startsWith("Animation Inspector preset: ")) {
    return undefined;
  }
  const presetId = track.description.replace(
    "Animation Inspector preset: ",
    "",
  ) as AnimationInspectorPresetId;
  const definition = ANIMATION_INSPECTOR_PRESETS.find(
    (item) => item.id === presetId,
  );
  if (!definition) {
    return undefined;
  }
  const content = track.presets?.[0] ?? track.loops?.[0];
  const property = track.properties?.[0];
  return {
    category: definition.category,
    presetId,
    duration:
      content?.durationMs ??
      (property?.keyframes.at(-1)?.atMs || definition.defaultDuration),
    delay: track.startMs ?? 0,
    easing:
      content?.easing?.type === "preset"
        ? content.easing.name
        : property?.keyframes[0]?.easing?.type === "preset"
        ? property.keyframes[0].easing.name
        : definition.defaultEasing,
  };
};

const colorProject = (
  element: AnimationInspectorElement,
  config: AnimationInspectorConfig,
  property: "visual.strokeColor" | "visual.backgroundColor",
  from: string,
  to: string,
): AnimationProject => ({
  schemaVersion: ANIMATION_SCHEMA_VERSION,
  id: `animation-inspector-${element.id}`,
  durationMs: config.delay + config.duration,
  frameRate: 60,
  tracks: [
    {
      id: `animation-inspector-track-${element.id}`,
      target: { type: "element", elementId: element.id },
      startMs: config.delay,
      durationMs: config.duration,
      properties: [
        {
          property,
          keyframes: [
            {
              atMs: 0,
              value: from,
              easing: { type: "preset", name: config.easing },
            },
            { atMs: config.duration, value: to },
          ],
        },
      ],
    },
  ],
});

function preset(
  id: AnimationInspectorPresetId,
  category: AnimationInspectorCategory,
  label: string,
  description: string,
  defaultDuration: number,
  defaultEasing: AnimationEasingPresetName,
): AnimationInspectorPreset {
  return {
    id,
    category,
    label,
    description,
    defaultDuration,
    defaultEasing,
  };
}

const positive = (value: number, name: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be greater than 0.`);
  }
  return value;
};

const nonNegative = (value: number, name: string) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be greater than or equal to 0.`);
  }
  return value;
};

const normalizeColor = (value: string, fallback: string) =>
  /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value) ? value : fallback;
