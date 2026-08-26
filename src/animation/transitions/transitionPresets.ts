import type {
  AnimationColor,
  AnimationEasing,
  AnimationTrack,
  AnimationTransitionDirection,
  AnimationTransitionEffect,
  AnimationTransitionOrigin,
} from "../types";

export type ChapterTransitionPreset = AnimationTransitionEffect;

export type ChapterTransitionInput = {
  id: string;
  fromSceneId: string;
  toSceneId: string;
  startMs: number;
  durationMs: number;
  preset: ChapterTransitionPreset;
  direction?: AnimationTransitionDirection;
  origin?: AnimationTransitionOrigin;
  color?: AnimationColor;
  backgroundColor?: AnimationColor;
};

const SMOOTH: AnimationEasing = { type: "preset", name: "smooth" };

const layerTrack = (
  input: ChapterTransitionInput,
  layerId: string,
  name: string,
  role: "exit" | "bridge" | "enter",
  properties: NonNullable<AnimationTrack["properties"]>,
  effect = input.preset,
): AnimationTrack => ({
  id: `transition-${input.id}-${layerId}`,
  name,
  description: `${input.fromSceneId} → ${input.toSceneId}`,
  target: {
    type: "transition",
    transitionId: input.id,
    layerId,
    fromSceneId: input.fromSceneId,
    toSceneId: input.toSceneId,
    effect,
    direction: input.direction ?? "left",
    ...(input.origin ? { origin: input.origin } : {}),
    role,
  },
  startMs: input.startMs,
  durationMs: input.durationMs,
  fill: "none",
  properties,
});

const progress = (durationMs: number, from = 0, to = 1) => ({
  property: "transition.progress" as const,
  keyframes: [
    { atMs: 0, value: from, easing: SMOOTH },
    {
      atMs: Math.round(durationMs * 0.58),
      value: from + (to - from) * 0.44,
      easing: SMOOTH,
    },
    { atMs: durationMs, value: to },
  ],
});

const opacity = (
  keyframes: Array<{
    atMs: number;
    value: number;
    easing?: AnimationEasing;
    hold?: boolean;
  }>,
) => ({ property: "transition.opacity" as const, keyframes });

const color = (value: AnimationColor) => ({
  property: "transition.color" as const,
  keyframes: [{ atMs: 0, value, hold: true }],
});

/**
 * Expands a named transition into ordinary, persisted tracks and keyframes.
 * The preset name is authoring sugar only; playback never depends on a hidden
 * preset implementation, so every generated value remains user-editable.
 */
export const materializeChapterTransition = (
  input: ChapterTransitionInput,
): AnimationTrack[] => {
  const duration = Math.max(1, Math.round(input.durationMs));
  const primary = input.color ?? "#EF4444FF";
  const background = input.backgroundColor ?? "#FFFFFFFF";

  if (input.preset === "camera") {
    return [
      layerTrack(input, "camera", "镜头漫游转场", "bridge", [
        progress(duration),
        opacity([
          { atMs: 0, value: 0, hold: true },
          { atMs: duration, value: 0 },
        ]),
      ]),
    ];
  }

  if (input.preset === "color-wipe") {
    const overlap = Math.round(duration * 0.18);
    const firstDuration = Math.round(duration * 0.64);
    return [
      layerTrack(input, "color", "颜色扫过 · 主色", "exit", [
        progress(firstDuration),
        opacity([
          { atMs: 0, value: 1, hold: true },
          { atMs: firstDuration + overlap, value: 1, easing: SMOOTH },
          { atMs: duration, value: 0 },
        ]),
        color(primary),
      ]),
      layerTrack(input, "background", "颜色扫过 · 背景色", "enter", [
        {
          property: "transition.progress",
          keyframes: [
            { atMs: firstDuration - overlap, value: 0, easing: SMOOTH },
            { atMs: duration, value: 1 },
          ],
        },
        opacity([
          { atMs: 0, value: 0, hold: true },
          { atMs: firstDuration - overlap, value: 1, easing: SMOOTH },
          { atMs: duration, value: 1 },
        ]),
        color(background),
      ]),
    ];
  }

  if (input.preset === "fade-through-color") {
    const midpoint = Math.round(duration / 2);
    return [
      layerTrack(input, "fade", "淡入淡出转场", "bridge", [
        opacity([
          { atMs: 0, value: 0, easing: SMOOTH },
          { atMs: midpoint, value: 1, easing: SMOOTH },
          { atMs: duration, value: 0 },
        ]),
        progress(duration),
        color(primary),
      ]),
    ];
  }

  const labelByPreset: Record<
    Exclude<
      ChapterTransitionPreset,
      "camera" | "color-wipe" | "fade-through-color"
    >,
    string
  > = {
    "directional-wipe": "方向擦除转场",
    push: "画布推移转场",
    iris: "圆形开合转场",
  };

  return [
    layerTrack(input, "main", labelByPreset[input.preset], "bridge", [
      progress(duration),
      opacity([
        { atMs: 0, value: 1, hold: true },
        { atMs: duration, value: 1 },
      ]),
      color(primary),
      ...(input.preset === "iris"
        ? [
            {
              property: "transition.scale" as const,
              keyframes: [
                { atMs: 0, value: 0.96, easing: SMOOTH },
                {
                  atMs: Math.round(duration * 0.72),
                  value: 1.06,
                  easing: {
                    type: "spring" as const,
                    mass: 1,
                    stiffness: 170,
                    damping: 18,
                  },
                },
                { atMs: duration, value: 1, easing: SMOOTH },
              ],
            },
          ]
        : []),
      ...(input.preset === "push"
        ? [
            {
              property: "transition.scale" as const,
              keyframes: [
                { atMs: 0, value: 1, easing: SMOOTH },
                {
                  atMs: Math.round(duration * 0.68),
                  value: 1.04,
                  easing: {
                    type: "spring" as const,
                    mass: 1,
                    stiffness: 150,
                    damping: 20,
                  },
                },
                { atMs: duration, value: 1, easing: SMOOTH },
              ],
            },
          ]
        : []),
    ]),
  ];
};
