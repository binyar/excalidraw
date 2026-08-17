import {
  effectDuration,
  generatePresetProject,
  nonNegativeFinite,
  normalizeEasing,
  numberInRange,
  positiveInteger,
} from "./helpers";

import type { AnimationPath, DataNumberFormat } from "../types";
import type {
  AnimationPresetDefinition,
  LoopPresetInput,
  PresetGenerationBase,
} from "./types";

export type FadeInPresetInput = PresetGenerationBase & {
  fromOpacity?: number;
};

export const fadeInPreset: AnimationPresetDefinition<
  "fade-in",
  FadeInPresetInput
> = {
  name: "fade-in",
  description: "元素从透明逐渐显现。",
  params: {
    duration: durationParam(600),
    fromOpacity: ratioParam("初始透明度。", 0),
    easing: easingParam("ease-out"),
  },
  generateAnimation: (input) =>
    generatePresetProject("fade-in", input, {
      preset: {
        category: "entrance",
        name: "fade-in",
        atMs: 0,
        durationMs: input.duration,
        fromOpacity: numberInRange(input.fromOpacity ?? 0, 0, 1, "fromOpacity"),
        easing: normalizeEasing(input.easing, "ease-out"),
      },
    }),
};

export type SlidePresetInput = PresetGenerationBase & {
  distance?: number;
};

const createSlidePreset = (
  name: "slide-left" | "slide-right",
  direction: "left" | "right",
  description: string,
): AnimationPresetDefinition<typeof name, SlidePresetInput> => ({
  name,
  description,
  params: {
    duration: durationParam(700),
    distance: distanceParam(80),
    easing: easingParam("ease-out"),
  },
  generateAnimation: (input) =>
    generatePresetProject(name, input, {
      preset: {
        category: "entrance",
        name: "slide-in",
        direction,
        distance: nonNegativeFinite(input.distance ?? 80, "distance"),
        atMs: 0,
        durationMs: input.duration,
        easing: normalizeEasing(input.easing, "ease-out"),
      },
    }),
});

export const slideLeftPreset = createSlidePreset(
  "slide-left",
  "left",
  "元素从左侧滑入当前位置。",
);

export const slideRightPreset = createSlidePreset(
  "slide-right",
  "right",
  "元素从右侧滑入当前位置。",
);

export type ScaleUpPresetInput = PresetGenerationBase & {
  fromScale?: number;
};

export const scaleUpPreset: AnimationPresetDefinition<
  "scale-up",
  ScaleUpPresetInput
> = {
  name: "scale-up",
  description: "元素从较小比例放大到原始尺寸。",
  params: {
    duration: durationParam(550),
    fromScale: ratioParam("起始缩放比例。", 0.75),
    easing: easingParam("ease-out"),
  },
  generateAnimation: (input) =>
    generatePresetProject("scale-up", input, {
      preset: {
        category: "entrance",
        name: "scale-in",
        atMs: 0,
        durationMs: input.duration,
        fromScale: nonNegativeFinite(input.fromScale ?? 0.75, "fromScale"),
        easing: normalizeEasing(input.easing, "ease-out"),
      },
    }),
};

export type BounceInPresetInput = PresetGenerationBase & {
  fromScale?: number;
  overshoot?: number;
};

export const bounceInPreset: AnimationPresetDefinition<
  "bounce-in",
  BounceInPresetInput
> = {
  name: "bounce-in",
  description: "元素放大入场并越过目标尺寸后回弹。",
  params: {
    duration: durationParam(750),
    fromScale: ratioParam("起始缩放比例。", 0.45),
    overshoot: ratioParam("回弹峰值比例。", 1.12),
    easing: easingParam("back-out"),
  },
  generateAnimation: (input) =>
    generatePresetProject("bounce-in", input, {
      preset: {
        category: "entrance",
        name: "pop-in",
        atMs: 0,
        durationMs: input.duration,
        fromScale: nonNegativeFinite(input.fromScale ?? 0.45, "fromScale"),
        overshoot: nonNegativeFinite(input.overshoot ?? 1.12, "overshoot"),
        easing: normalizeEasing(input.easing, "back-out"),
      },
    }),
};

export type PulsePresetInput = PresetGenerationBase & {
  scale?: number;
  count?: number;
};

export const pulsePreset: AnimationPresetDefinition<"pulse", PulsePresetInput> =
  {
    name: "pulse",
    description: "元素按指定次数轻微放大并恢复，用于强调。",
    params: {
      duration: durationParam(700),
      scale: ratioParam("脉冲峰值比例。", 1.08),
      count: countParam("脉冲次数。", 1),
      easing: easingParam("ease-in-out"),
    },
    generateAnimation: (input) =>
      generatePresetProject("pulse", input, {
        preset: {
          category: "emphasis",
          name: "pulse",
          atMs: 0,
          durationMs: input.duration,
          scale: nonNegativeFinite(input.scale ?? 1.08, "scale"),
          count: positiveInteger(input.count ?? 1, "count"),
          easing: normalizeEasing(input.easing, "ease-in-out"),
        },
      }),
  };

export type BlinkPresetInput = LoopPresetInput & {
  minOpacity?: number;
  maxOpacity?: number;
  dutyCycle?: number;
};

export const blinkPreset: AnimationPresetDefinition<"blink", BlinkPresetInput> =
  {
    name: "blink",
    description: "元素在最大与最小透明度之间闪烁。",
    params: {
      duration: durationParam(400),
      iterations: countParam("闪烁次数。", 3),
      minOpacity: ratioParam("最低透明度。", 0),
      maxOpacity: ratioParam("最高透明度。", 1),
      dutyCycle: ratioParam("每次循环保持高透明度的比例。", 0.5),
      easing: easingParam("linear"),
    },
    generateAnimation: (input) => {
      const iterations = positiveInteger(input.iterations ?? 3, "iterations");
      const delay = nonNegativeFinite(input.delay ?? 0, "delay");
      const minOpacity = numberInRange(
        input.minOpacity ?? 0,
        0,
        1,
        "minOpacity",
      );
      const maxOpacity = numberInRange(
        input.maxOpacity ?? 1,
        0,
        1,
        "maxOpacity",
      );
      if (maxOpacity < minOpacity) {
        throw new RangeError("maxOpacity must be greater than minOpacity.");
      }
      return generatePresetProject("blink", input, {
        loop: {
          type: "blink",
          durationMs: input.duration,
          iterations,
          delayMs: delay,
          ...(input.direction ? { direction: input.direction } : {}),
          minOpacity,
          maxOpacity,
          dutyCycle: numberInRange(input.dutyCycle ?? 0.5, 0, 1, "dutyCycle"),
          easing: normalizeEasing(input.easing, "linear"),
        },
        totalDuration: effectDuration(input.duration, iterations, delay),
      });
    },
  };

export type ShakePresetInput = PresetGenerationBase & {
  distance?: number;
  count?: number;
  axis?: "x" | "y" | "both";
};

export const shakePreset: AnimationPresetDefinition<"shake", ShakePresetInput> =
  {
    name: "shake",
    description: "元素沿指定轴快速往复移动。",
    params: {
      duration: durationParam(600),
      distance: distanceParam(12),
      count: countParam("往复次数。", 3),
      axis: {
        type: "select",
        description: "抖动轴。",
        options: ["x", "y", "both"],
        default: "x",
      },
      easing: easingParam("ease-in-out"),
    },
    generateAnimation: (input) =>
      generatePresetProject("shake", input, {
        preset: {
          category: "emphasis",
          name: "shake",
          atMs: 0,
          durationMs: input.duration,
          distance: nonNegativeFinite(input.distance ?? 12, "distance"),
          count: positiveInteger(input.count ?? 3, "count"),
          axis: input.axis ?? "x",
          easing: normalizeEasing(input.easing, "ease-in-out"),
        },
      }),
  };

export type MovePathPresetInput = PresetGenerationBase & {
  path: AnimationPath;
  orientToPath?: boolean;
};

export const movePathPreset: AnimationPresetDefinition<
  "move-path",
  MovePathPresetInput
> = {
  name: "move-path",
  description: "元素沿折线或 SVG 路径移动。",
  params: {
    duration: durationParam(1500),
    path: {
      type: "path",
      description: "折线或 SVG motion path。",
      required: true,
    },
    orientToPath: {
      type: "boolean",
      description: "是否让元素方向跟随路径切线。",
      default: false,
    },
    easing: easingParam("ease-in-out"),
  },
  generateAnimation: (input) =>
    generatePresetProject("move-path", input, {
      preset: {
        category: "motion",
        name: "follow-path",
        atMs: 0,
        durationMs: input.duration,
        path: input.path,
        orientToPath: input.orientToPath ?? false,
        easing: normalizeEasing(input.easing, "ease-in-out"),
      },
    }),
};

export type RotatePresetInput = LoopPresetInput & {
  fromDegrees?: number;
  toDegrees?: number;
  clockwise?: boolean;
};

export const rotatePreset: AnimationPresetDefinition<
  "rotate",
  RotatePresetInput
> = {
  name: "rotate",
  description: "元素在指定角度范围内旋转。",
  params: {
    duration: durationParam(1000),
    fromDegrees: degreesParam("起始角度。", 0),
    toDegrees: degreesParam("结束角度。", 360),
    clockwise: {
      type: "boolean",
      description: "是否顺时针旋转。",
      default: true,
    },
    iterations: countParam("旋转次数。", 1),
    easing: easingParam("linear"),
  },
  generateAnimation: (input) => {
    const iterations = positiveInteger(input.iterations ?? 1, "iterations");
    const delay = nonNegativeFinite(input.delay ?? 0, "delay");
    return generatePresetProject("rotate", input, {
      loop: {
        type: "rotate",
        durationMs: input.duration,
        iterations,
        delayMs: delay,
        ...(input.direction ? { direction: input.direction } : {}),
        fromDegrees: finite(input.fromDegrees ?? 0, "fromDegrees"),
        toDegrees: finite(input.toDegrees ?? 360, "toDegrees"),
        clockwise: input.clockwise ?? true,
        easing: normalizeEasing(input.easing, "linear"),
      },
      totalDuration: effectDuration(input.duration, iterations, delay),
    });
  },
};

export type NumberCountPresetInput = PresetGenerationBase & {
  from: number;
  to: number;
  format?: DataNumberFormat;
};

export const numberCountPreset: AnimationPresetDefinition<
  "number-count",
  NumberCountPresetInput
> = {
  name: "number-count",
  description: "数值从起始值平滑增长或递减到目标值。",
  params: {
    duration: durationParam(1200),
    from: valueParam("起始数值。", true),
    to: valueParam("目标数值。", true),
    format: {
      type: "object",
      description: "小数位、前后缀和千分位格式。",
    },
    easing: easingParam("ease-out"),
  },
  generateAnimation: (input) =>
    generatePresetProject("number-count", input, {
      preset: {
        category: "data",
        name: "count-up",
        atMs: 0,
        durationMs: input.duration,
        from: finite(input.from, "from"),
        to: finite(input.to, "to"),
        ...(input.format ? { format: input.format } : {}),
        easing: normalizeEasing(input.easing, "ease-out"),
      },
    }),
};

export type ProgressGrowPresetInput = PresetGenerationBase & {
  from?: number;
  to: number;
  min?: number;
  max?: number;
};

export const progressGrowPreset: AnimationPresetDefinition<
  "progress-grow",
  ProgressGrowPresetInput
> = {
  name: "progress-grow",
  description: "进度值在给定范围内增长，并输出归一化进度。",
  params: {
    duration: durationParam(1000),
    from: valueParam("起始进度值。"),
    to: valueParam("目标进度值。", true),
    min: valueParam("进度范围最小值。", false, 0),
    max: valueParam("进度范围最大值。", false, 100),
    easing: easingParam("ease-out"),
  },
  generateAnimation: (input) =>
    generatePresetProject("progress-grow", input, {
      preset: {
        category: "data",
        name: "progress",
        atMs: 0,
        durationMs: input.duration,
        ...(input.from === undefined
          ? {}
          : { from: finite(input.from, "from") }),
        to: finite(input.to, "to"),
        min: input.min ?? 0,
        max: input.max ?? 100,
        easing: normalizeEasing(input.easing, "ease-out"),
      },
    }),
};

export const entrancePresets = [
  fadeInPreset,
  slideLeftPreset,
  slideRightPreset,
  scaleUpPreset,
  bounceInPreset,
] as const;

export const emphasisPresets = [pulsePreset, blinkPreset, shakePreset] as const;

export const transformPresets = [movePathPreset, rotatePreset] as const;

export const dataPresets = [numberCountPreset, progressGrowPreset] as const;

function durationParam(defaultValue: number) {
  return {
    type: "number" as const,
    description: "动画持续时间。",
    default: defaultValue,
    min: 1,
    unit: "ms" as const,
    required: true,
  };
}

function distanceParam(defaultValue: number) {
  return {
    type: "number" as const,
    description: "位移距离。",
    default: defaultValue,
    min: 0,
    unit: "px" as const,
  };
}

function ratioParam(description: string, defaultValue: number) {
  return {
    type: "number" as const,
    description,
    default: defaultValue,
    min: 0,
    unit: "ratio" as const,
  };
}

function countParam(description: string, defaultValue: number) {
  return {
    type: "number" as const,
    description,
    default: defaultValue,
    min: 1,
    integer: true,
    unit: "count" as const,
  };
}

function degreesParam(description: string, defaultValue: number) {
  return {
    type: "number" as const,
    description,
    default: defaultValue,
    unit: "degrees" as const,
  };
}

function valueParam(
  description: string,
  required = false,
  defaultValue?: number,
) {
  return {
    type: "number" as const,
    description,
    required,
    default: defaultValue,
    unit: "value" as const,
  };
}

function easingParam(
  defaultValue: "ease-out" | "ease-in-out" | "back-out" | "linear",
) {
  return {
    type: "easing" as const,
    description: "时间缓动。",
    default: defaultValue,
  };
}

function finite(value: number, name: string) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  return value;
}
