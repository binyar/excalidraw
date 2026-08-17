import { cubicBezier, spring } from "motion";

import { animationProjectSchema } from "../schema";
import { isStateAnimationProperty } from "../types";

import type {
  AnimationColor,
  AnimationEasing,
  AnimationFillStyle,
  AnimationGroup,
  AnimationKeyframe,
  AnimationPath,
  AnimationPoint,
  AnimationPreset,
  AnimationProject,
  AnimationProperty,
  AnimationShadow,
  AnimationTrack,
  LoopAnimation,
} from "../types";

const FILL_STYLES: readonly AnimationFillStyle[] = [
  "hachure",
  "cross-hatch",
  "solid",
  "zigzag",
];

export type MotionRgba = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type MotionSerializableValue =
  | string
  | number
  | boolean
  | null
  | MotionSerializableValue[]
  | { [key: string]: MotionSerializableValue };

export type MotionKeyframeState = {
  id: string;
  value: MotionSerializableValue;
  atMs: number;
  hold?: boolean;
  easing?: AnimationEasing;
};

export type MotionChannelState = {
  path: string[];
  keyframes: MotionKeyframeState[];
};

export type MotionObjectState = {
  elementId: string;
  channels: MotionChannelState[];
};

export type MotionCompiledState = {
  durationMs: number;
  frameRate: number;
  objectsByKey: Record<string, MotionObjectState>;
};

export type MotionObjectConfig = {
  element: {
    visibility: "visible" | "hidden";
  };
  camera: {
    centerX: number;
    centerY: number;
    zoom: number;
  };
  transform: {
    x: number;
    y: number;
    scale: number;
    rotate: number;
  };
  visual: {
    opacity: number;
    strokeColor: unknown;
    backgroundColor: unknown;
    fillStyle: number;
    strokeWidth: number;
    strokeStyle: "solid" | "dashed" | "dotted";
    roughness: number;
    /** Interpolated sharp(0) -> round(1) progress. */
    roundness: number;
  };
  text: {
    fontSize: number;
    fontFamily: number;
    textAlign: "left" | "center" | "right";
    verticalAlign: "top" | "middle" | "bottom";
  };
  advanced: {
    path: number;
    drawProgress: number;
    blur: number;
    shadow: {
      offsetX: number;
      offsetY: number;
      blur: number;
      spread: number;
      color: unknown;
    };
  };
  transition: {
    progress: number;
    opacity: number;
    color: unknown;
    blur: number;
    scale: number;
  };
  data: {
    number: number;
    progress: number;
  };
};

export type AnimationRuntimeObjectValue = {
  element: {
    visibility: "visible" | "hidden";
  };
  camera: {
    centerX: number;
    centerY: number;
    zoom: number;
  };
  transform: {
    x: number;
    y: number;
    scale: number;
    rotate: number;
  };
  visual: {
    opacity: number;
    strokeColor: AnimationColor;
    backgroundColor: AnimationColor;
    fillStyle: AnimationFillStyle;
    strokeWidth: number;
    strokeStyle: "solid" | "dashed" | "dotted";
    roughness: number;
    /** Interpolated sharp(0) -> round(1) progress. */
    roundness: number;
  };
  text: {
    fontSize: number;
    fontFamily: number;
    textAlign: "left" | "center" | "right";
    verticalAlign: "top" | "middle" | "bottom";
  };
  advanced: {
    path: {
      progress: number;
      motionPath?: AnimationPath;
      orientToPath?: boolean;
      anchor?: AnimationPoint;
    };
    drawProgress: number;
    blur: number;
    shadow: AnimationShadow;
  };
  transition: {
    progress: number;
    opacity: number;
    color: AnimationColor;
    blur: number;
    scale: number;
  };
  data: {
    number: number;
    /** Normalized progress in the range 0..1. */
    progress: number;
  };
};

export type MotionObjectBinding = {
  elementId: string;
  objectKey: string;
};

export type MotionAdapterOutput = {
  state: MotionCompiledState;
  objects: MotionObjectBinding[];
};

export type AnimationTween = {
  property: "x" | "y" | "scale" | "rotate" | "opacity" | "blur";
  from: number;
  to: number;
  durationMs: number;
  atMs?: number;
  easing?: AnimationEasing;
};

export class MotionAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MotionAdapterError";
  }
}

type PropertyPath = string[];
type ValueKind = "number" | "color" | "discrete";

type CandidateKeyframe = {
  atMs: number;
  value: unknown;
  easing?: AnimationEasing;
  hold?: boolean;
  precedence: Precedence;
};

type Precedence = {
  priority: number;
  specificity: number;
  sourceRank: number;
  trackIndex: number;
};

type Channel = {
  elementId: string;
  path: PropertyPath;
  kind: ValueKind;
  keyframes: CandidateKeyframe[];
};

type ExpandedTarget = {
  elementId: string;
  offsetMs: number;
};

type PathMetadata = {
  motionPath: AnimationPath;
  orientToPath?: boolean;
  anchor?: AnimationPoint;
  precedence: Precedence;
};

type InternalDataProperty = {
  property: "data.number" | "data.progress";
  fill?: AnimationProperty["fill"];
  keyframes: AnimationKeyframe<number>[];
};

type CompiledAnimationProperty = AnimationProperty | InternalDataProperty;

const defaultObjectValue: AnimationRuntimeObjectValue = {
  element: { visibility: "visible" },
  camera: { centerX: 0, centerY: 0, zoom: 1 },
  transform: { x: 0, y: 0, scale: 1, rotate: 0 },
  visual: {
    opacity: 1,
    strokeColor: "#000000FF",
    backgroundColor: "#00000000",
    fillStyle: "hachure",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    roundness: 0,
  },
  text: {
    fontSize: 20,
    fontFamily: 1,
    textAlign: "left",
    verticalAlign: "top",
  },
  advanced: {
    path: { progress: 0 },
    drawProgress: 1,
    blur: 0,
    shadow: {
      offsetX: 0,
      offsetY: 0,
      blur: 0,
      spread: 0,
      color: "#00000000",
    },
  },
  transition: {
    progress: 0,
    opacity: 0,
    color: "#FFFFFFFF",
    blur: 0,
    scale: 1,
  },
  data: {
    number: 0,
    progress: 0,
  },
};

export class MotionAdapter {
  readonly project: AnimationProject;
  private readonly pathMetadata = new Map<string, PathMetadata>();

  constructor(project: AnimationProject) {
    this.project = animationProjectSchema.parse(project);
  }

  /**
   * Converts a small AI-friendly tween into the canonical DSL property shape.
   * The result can be inserted into `AnimationTrack.properties`.
   */
  static tweenToProperty(tween: AnimationTween): AnimationProperty {
    const propertyByAlias = {
      x: "transform.x",
      y: "transform.y",
      scale: "transform.scale",
      rotate: "transform.rotate",
      opacity: "visual.opacity",
      blur: "advanced.blur",
    } as const;
    const atMs = tween.atMs ?? 0;
    return {
      property: propertyByAlias[tween.property],
      keyframes: [
        { atMs, value: tween.from, easing: tween.easing },
        { atMs: atMs + tween.durationMs, value: tween.to },
      ],
    } as AnimationProperty;
  }

  compile(): MotionAdapterOutput {
    const channels = new Map<string, Channel>();
    const elementIds = new Set<string>();

    this.project.tracks.forEach((track, trackIndex) => {
      if (track.enabled === false) {
        return;
      }
      const targets = this.expandTargets(track);
      targets.forEach(({ elementId, offsetMs }) => {
        elementIds.add(elementId);
        const basePrecedence: Omit<Precedence, "sourceRank"> = {
          priority: track.priority ?? 0,
          specificity: track.target.type === "element" ? 1 : 0,
          trackIndex,
        };
        const trackStart =
          this.getSceneStartMs(track) + (track.startMs ?? 0) + offsetMs;

        for (const preset of track.presets ?? []) {
          for (const property of this.expandPreset(preset)) {
            this.addProperty(channels, elementId, property, track, trackStart, {
              ...basePrecedence,
              sourceRank: 1,
            });
          }
        }

        for (const loop of track.loops ?? []) {
          for (const property of this.expandLoop(loop, trackStart)) {
            this.addProperty(channels, elementId, property, track, trackStart, {
              ...basePrecedence,
              sourceRank: 2,
            });
          }
        }

        for (const property of track.properties ?? []) {
          if (property.enabled === false) {
            continue;
          }
          this.addProperty(channels, elementId, property, track, trackStart, {
            ...basePrecedence,
            sourceRank: 3,
          });
        }
      });
    });

    const objectsByKey: Record<string, MotionObjectState> = {};
    let keyframeCounter = 0;

    for (const channel of channels.values()) {
      const objectKey = objectKeyForElement(channel.elementId);
      const object = (objectsByKey[objectKey] ??= {
        elementId: channel.elementId,
        channels: [],
      });
      const merged = mergeCandidateKeyframes(channel.keyframes);
      const motionKeyframes: MotionKeyframeState[] = [];
      for (const keyframe of merged) {
        motionKeyframes.push({
          id: `dsl-keyframe-${keyframeCounter++}`,
          value: toMotionValue(keyframe.value, channel.kind),
          atMs: keyframe.atMs,
          hold: keyframe.hold,
          easing: keyframe.easing,
        });
      }
      object.channels.push({ path: channel.path, keyframes: motionKeyframes });
    }

    const state: MotionCompiledState = {
      durationMs: this.project.durationMs,
      frameRate: this.project.frameRate,
      objectsByKey,
    };

    return {
      state,
      objects: Array.from(elementIds, (elementId) => ({
        elementId,
        objectKey: objectKeyForElement(elementId),
      })),
    };
  }

  /** Deterministically samples the compiled project at an absolute time. */
  sample(compiled: MotionAdapterOutput, timeMs: number) {
    const values: Record<string, AnimationRuntimeObjectValue> = {};
    for (const { elementId, objectKey } of compiled.objects) {
      const value = this.createObjectConfig();
      const object = compiled.state.objectsByKey[objectKey];
      if (object) {
        for (const channel of object.channels) {
          setAtPath(
            value,
            channel.path,
            sampleKeyframes(channel.keyframes, timeMs),
          );
        }
      }
      const normalized = this.normalizeObjectValue(elementId, value);
      if (
        elementId.startsWith("transition:") &&
        !this.isTransitionRuntimeActive(elementId, timeMs)
      ) {
        normalized.transition.opacity = 0;
      }
      values[elementId] = normalized;
    }
    return values;
  }

  createObjectConfig(): MotionObjectConfig {
    return {
      element: { ...defaultObjectValue.element },
      transform: { ...defaultObjectValue.transform },
      camera: { ...defaultObjectValue.camera },
      visual: {
        opacity: defaultObjectValue.visual.opacity,
        strokeColor: parseAnimationColor(defaultObjectValue.visual.strokeColor),
        backgroundColor: parseAnimationColor(
          defaultObjectValue.visual.backgroundColor,
        ),
        fillStyle: 0,
        strokeWidth: defaultObjectValue.visual.strokeWidth,
        strokeStyle: defaultObjectValue.visual.strokeStyle,
        roughness: defaultObjectValue.visual.roughness,
        roundness: defaultObjectValue.visual.roundness,
      },
      text: { ...defaultObjectValue.text },
      advanced: {
        path: 0,
        drawProgress: 1,
        blur: 0,
        shadow: {
          offsetX: 0,
          offsetY: 0,
          blur: 0,
          spread: 0,
          color: { r: 0, g: 0, b: 0, a: 0 },
        },
      },
      transition: {
        progress: 0,
        opacity: 0,
        color: parseAnimationColor(defaultObjectValue.transition.color),
        blur: 0,
        scale: 1,
      },
      data: {
        number: 0,
        progress: 0,
      },
    };
  }

  normalizeObjectValue(
    elementId: string,
    value: unknown,
  ): AnimationRuntimeObjectValue {
    const input = isRecord(value) ? value : {};
    const element = isRecord(input.element) ? input.element : {};
    const camera = isRecord(input.camera) ? input.camera : {};
    const transform = isRecord(input.transform) ? input.transform : {};
    const visual = isRecord(input.visual) ? input.visual : {};
    const text = isRecord(input.text) ? input.text : {};
    const advanced = isRecord(input.advanced) ? input.advanced : {};
    const transition = isRecord(input.transition) ? input.transition : {};
    const shadow = isRecord(advanced.shadow) ? advanced.shadow : {};
    const data = isRecord(input.data) ? input.data : {};
    const metadata = this.pathMetadata.get(elementId);

    return {
      element: {
        visibility: element.visibility === "hidden" ? "hidden" : "visible",
      },
      camera: {
        centerX: finiteOr(camera.centerX, 0),
        centerY: finiteOr(camera.centerY, 0),
        zoom: Math.max(0.01, finiteOr(camera.zoom, 1)),
      },
      transform: {
        x: finiteOr(transform.x, 0),
        y: finiteOr(transform.y, 0),
        scale: finiteOr(transform.scale, 1),
        rotate: finiteOr(transform.rotate, 0),
      },
      visual: {
        // Spring easings are intentionally allowed to overshoot for spatial
        // properties such as scale, but opacity is a bounded visual channel.
        // Clamp the sampled intermediate value here so Motion's physical
        // overshoot can never escape the adapter's 0..1 runtime contract.
        opacity: clamp(finiteOr(visual.opacity, 1), 0, 1),
        strokeColor: motionColorToHex(visual.strokeColor, "#000000FF"),
        backgroundColor: motionColorToHex(visual.backgroundColor, "#00000000"),
        fillStyle:
          FILL_STYLES[Math.round(finiteOr(visual.fillStyle, 0))] ?? "hachure",
        strokeWidth: Math.max(0, finiteOr(visual.strokeWidth, 1)),
        strokeStyle:
          visual.strokeStyle === "dashed" || visual.strokeStyle === "dotted"
            ? visual.strokeStyle
            : "solid",
        roughness: Math.max(0, Math.min(2, finiteOr(visual.roughness, 1))),
        roundness: clamp(finiteOr(visual.roundness, 0), 0, 1),
      },
      text: {
        fontSize: Math.max(1, finiteOr(text.fontSize, 20)),
        fontFamily: Math.max(1, Math.round(finiteOr(text.fontFamily, 1))),
        textAlign:
          text.textAlign === "center" || text.textAlign === "right"
            ? text.textAlign
            : "left",
        verticalAlign:
          text.verticalAlign === "middle" || text.verticalAlign === "bottom"
            ? text.verticalAlign
            : "top",
      },
      advanced: {
        path: {
          progress: finiteOr(advanced.path, 0),
          ...(metadata
            ? {
                motionPath: metadata.motionPath,
                orientToPath: metadata.orientToPath,
                anchor: metadata.anchor,
              }
            : {}),
        },
        drawProgress: clamp(finiteOr(advanced.drawProgress, 1), 0, 1),
        blur: finiteOr(advanced.blur, 0),
        shadow: {
          offsetX: finiteOr(shadow.offsetX, 0),
          offsetY: finiteOr(shadow.offsetY, 0),
          blur: finiteOr(shadow.blur, 0),
          spread: finiteOr(shadow.spread, 0),
          color: motionColorToHex(shadow.color, "#00000000"),
        },
      },
      transition: {
        progress: clamp(finiteOr(transition.progress, 0), 0, 1),
        opacity: clamp(finiteOr(transition.opacity, 0), 0, 1),
        color: motionColorToHex(transition.color, "#FFFFFFFF"),
        blur: Math.max(0, finiteOr(transition.blur, 0)),
        scale: Math.max(0, finiteOr(transition.scale, 1)),
      },
      data: {
        number: finiteOr(data.number, 0),
        progress: finiteOr(data.progress, 0),
      },
    };
  }

  private addProperty(
    channels: Map<string, Channel>,
    elementId: string,
    property: CompiledAnimationProperty,
    track: AnimationTrack,
    trackStartMs: number,
    precedence: Precedence,
  ) {
    const add = (
      path: PropertyPath,
      kind: ValueKind,
      keyframes: AnimationKeyframe<unknown>[],
    ) => {
      const channelKey = `${elementId}:${JSON.stringify(path)}`;
      const channel = channels.get(channelKey) ?? {
        elementId,
        path,
        kind,
        keyframes: [],
      };
      const trackEnd =
        track.durationMs === undefined
          ? Infinity
          : trackStartMs + track.durationMs;
      keyframes.forEach((keyframe) => {
        const atMs = trackStartMs + keyframe.atMs;
        if (atMs <= trackEnd && atMs <= this.project.durationMs) {
          channel.keyframes.push({
            atMs,
            value: keyframe.value,
            easing: keyframe.easing,
            hold: keyframe.hold,
            precedence,
          });
        }
      });
      channels.set(channelKey, channel);
    };

    const addColor = (
      path: PropertyPath,
      keyframes: AnimationKeyframe<unknown>[],
    ) => {
      for (const component of ["r", "g", "b", "a"] as const) {
        add(
          [...path, component],
          "number",
          keyframes.map((keyframe) => ({
            ...keyframe,
            value: parseAnimationColor(String(keyframe.value))[component],
          })),
        );
      }
    };

    if (property.property === "advanced.shadow") {
      const fields: Array<keyof AnimationShadow> = [
        "offsetX",
        "offsetY",
        "blur",
        "spread",
        "color",
      ];
      fields.forEach((field) => {
        const keyframes = property.keyframes.map((keyframe) => ({
          ...keyframe,
          value: keyframe.value[field],
        }));
        if (field === "color") {
          addColor(["advanced", "shadow", field], keyframes);
        } else {
          add(["advanced", "shadow", field], "number", keyframes);
        }
      });
      return;
    }

    if (property.property === "visual.fillStyle") {
      add(
        ["visual", "fillStyle"],
        "number",
        property.keyframes.map((keyframe) => ({
          ...keyframe,
          value: Math.max(0, FILL_STYLES.indexOf(keyframe.value)),
          hold: true,
        })),
      );
      return;
    }

    if (property.property === "element.visibility") {
      add(
        ["element", "visibility"],
        "discrete",
        property.keyframes.map((keyframe) => ({ ...keyframe, hold: true })),
      );
      return;
    }

    if (property.property === "visual.roundness") {
      add(
        ["visual", "roundness"],
        "number",
        property.keyframes.map((keyframe) => ({
          ...keyframe,
          value:
            typeof keyframe.value === "number"
              ? clamp(keyframe.value, 0, 1)
              : keyframe.value === "round"
              ? 1
              : 0,
          // Older projects wrote string roundness as a discrete hold property.
          // Canonical numeric roundness uses hold to represent an intentionally
          // disconnected timeline segment.
          hold:
            typeof keyframe.value === "string" ? false : keyframe.hold ?? false,
        })),
      );
      return;
    }

    if (isStateAnimationProperty(property.property)) {
      add(
        property.property.split("."),
        "discrete",
        property.keyframes.map((keyframe) => ({ ...keyframe, hold: true })),
      );
      return;
    }

    const path = property.property.split(".");
    const isColor =
      property.property === "visual.strokeColor" ||
      property.property === "visual.backgroundColor" ||
      property.property === "transition.color";
    if (isColor) {
      addColor(path, property.keyframes as AnimationKeyframe<unknown>[]);
    } else {
      add(path, "number", property.keyframes as AnimationKeyframe<unknown>[]);
    }

    if (property.property === "advanced.path") {
      const existing = this.pathMetadata.get(elementId);
      if (
        !existing ||
        comparePrecedence(precedence, existing.precedence) >= 0
      ) {
        this.pathMetadata.set(elementId, {
          motionPath: property.motionPath,
          orientToPath: property.orientToPath,
          anchor: property.anchor,
          precedence,
        });
      }
    }
  }

  private expandTargets(track: AnimationTrack): ExpandedTarget[] {
    if (track.target.type === "element") {
      return [{ elementId: track.target.elementId, offsetMs: 0 }];
    }
    if (track.target.type === "camera") {
      return [{ elementId: `camera:${track.target.cameraId}`, offsetMs: 0 }];
    }
    if (track.target.type === "transition") {
      return [
        {
          elementId: transitionRuntimeId(
            track.target.transitionId,
            track.target.layerId,
          ),
          offsetMs: 0,
        },
      ];
    }
    const members = resolveGroupElements(
      track.target.groupId,
      this.project.groups ?? [],
    );
    if (!track.group || track.group.mode === "together") {
      return members.map(({ elementId }) => ({ elementId, offsetMs: 0 }));
    }
    const group = track.group;
    const ordered = orderGroupMembers(members, group);
    return ordered.map(({ elementId }, index) => ({
      elementId,
      offsetMs: index * group.eachMs,
    }));
  }

  private getSceneStartMs(track: AnimationTrack): number {
    if (!track.sceneId) {
      return 0;
    }
    return (
      this.project.scenes?.find((scene) => scene.id === track.sceneId)
        ?.startMs ?? 0
    );
  }

  private isTransitionRuntimeActive(elementId: string, timeMs: number) {
    return this.project.tracks.some((track) => {
      if (track.target.type !== "transition") {
        return false;
      }
      if (
        transitionRuntimeId(track.target.transitionId, track.target.layerId) !==
        elementId
      ) {
        return false;
      }
      const startMs = this.getSceneStartMs(track) + (track.startMs ?? 0);
      const endMs = startMs + (track.durationMs ?? this.project.durationMs);
      return timeMs >= startMs && timeMs <= endMs;
    });
  }

  private expandPreset(preset: AnimationPreset): CompiledAnimationProperty[] {
    const easing = preset.easing;
    const start = preset.atMs;
    const end = start + preset.durationMs;
    const numeric = (
      property:
        | "transform.x"
        | "transform.y"
        | "transform.scale"
        | "transform.rotate"
        | "visual.opacity"
        | "advanced.path"
        | "data.number"
        | "data.progress",
      from: number,
      to: number,
    ): AnimationProperty =>
      ({
        property,
        fill: preset.fill,
        ...(property === "advanced.path"
          ? {
              motionPath:
                preset.category === "motion" && preset.name === "follow-path"
                  ? preset.path
                  : ({ type: "polyline", points: [] } as AnimationPath),
            }
          : {}),
        keyframes: [
          { atMs: start, value: from, easing },
          { atMs: end, value: to },
        ],
      } as AnimationProperty);
    const withPresetVisibility = (
      properties: CompiledAnimationProperty[],
    ): CompiledAnimationProperty[] => {
      if (preset.category === "entrance") {
        return [
          ...properties,
          {
            property: "element.visibility",
            fill: "forwards",
            keyframes: [
              { atMs: start, value: "hidden", hold: true },
              {
                atMs: Math.min(end, start + 1),
                value: "visible",
                hold: true,
              },
            ],
          },
        ];
      }
      if (preset.category === "exit") {
        return [
          ...properties,
          {
            property: "element.visibility",
            fill: "forwards",
            keyframes: [
              { atMs: start, value: "visible", hold: true },
              { atMs: end, value: "hidden", hold: true },
            ],
          },
        ];
      }
      return properties;
    };

    switch (preset.name) {
      case "fade-in":
        return withPresetVisibility([
          numeric("visual.opacity", preset.fromOpacity ?? 0, 1),
        ]);
      case "fade-out":
        return withPresetVisibility([
          numeric("visual.opacity", 1, preset.toOpacity ?? 0),
        ]);
      case "slide-in": {
        const distance = preset.distance ?? 48;
        const { property, value } = directionalOffset(
          preset.direction,
          distance,
        );
        return withPresetVisibility([
          numeric(property, value, 0),
          numeric("visual.opacity", 0, 1),
        ]);
      }
      case "slide-out": {
        const distance = preset.distance ?? 48;
        const { property, value } = directionalOffset(
          preset.direction,
          distance,
        );
        return withPresetVisibility([numeric(property, 0, value)]);
      }
      case "scale-in":
        return withPresetVisibility([
          numeric("transform.scale", preset.fromScale ?? 0.8, 1),
          numeric("visual.opacity", 0, 1),
        ]);
      case "scale-out":
        return withPresetVisibility([
          numeric("transform.scale", 1, preset.toScale ?? 0.8),
        ]);
      case "pop-in":
        return withPresetVisibility([
          {
            property: "transform.scale",
            fill: preset.fill,
            keyframes: [
              {
                atMs: start,
                value: preset.fromScale ?? 0.6,
                easing,
              },
              {
                atMs: start + preset.durationMs * 0.72,
                value: preset.overshoot ?? 1.08,
                easing: { type: "preset", name: "ease-out" },
              },
              { atMs: end, value: 1 },
            ],
          },
          numeric("visual.opacity", 0, 1),
        ]);
      case "pop-out":
        return withPresetVisibility([
          {
            property: "transform.scale",
            fill: preset.fill,
            keyframes: [
              { atMs: start, value: 1, easing },
              {
                atMs: start + preset.durationMs * 0.28,
                value: preset.overshoot ?? 1.08,
              },
              { atMs: end, value: preset.toScale ?? 0.6 },
            ],
          },
        ]);
      case "pulse": {
        const count = preset.count ?? 1;
        return [
          waveProperty(
            "transform.scale",
            start,
            preset.durationMs / count,
            1,
            preset.scale ?? 1.08,
            count,
            easing,
          ),
        ];
      }
      case "shake": {
        const distance = preset.distance ?? 12;
        const count = preset.count ?? 3;
        const properties: AnimationProperty[] = [];
        if (preset.axis !== "y") {
          properties.push(
            shakeProperty(
              "transform.x",
              start,
              preset.durationMs,
              distance,
              count,
            ),
          );
        }
        if (preset.axis === "y" || preset.axis === "both") {
          properties.push(
            shakeProperty(
              "transform.y",
              start,
              preset.durationMs,
              distance,
              count,
            ),
          );
        }
        return properties;
      }
      case "bounce":
        return [
          waveProperty(
            "transform.y",
            start,
            preset.durationMs,
            0,
            -(preset.distance ?? 24),
            preset.count ?? 1,
            easing,
          ),
        ];
      case "highlight":
        return [
          waveColorProperty(
            start,
            preset.durationMs,
            "#00000000",
            preset.color,
            preset.count ?? 1,
            easing,
          ),
        ];
      case "move-to":
        return [
          numeric("transform.x", preset.from?.x ?? 0, preset.to.x),
          numeric("transform.y", preset.from?.y ?? 0, preset.to.y),
        ];
      case "follow-path":
        return [
          {
            property: "advanced.path",
            motionPath: preset.path,
            orientToPath: preset.orientToPath,
            fill: preset.fill,
            keyframes: [
              { atMs: start, value: 0, easing },
              { atMs: end, value: 1 },
            ],
          },
        ];
      case "orbit": {
        const samples = 16;
        const turns = preset.turns ?? 1;
        const direction = preset.clockwise === false ? -1 : 1;
        const x: AnimationKeyframe<number>[] = [];
        const y: AnimationKeyframe<number>[] = [];
        for (let index = 0; index <= samples; index++) {
          const progress = index / samples;
          const angle = progress * Math.PI * 2 * turns * direction;
          const atMs = start + preset.durationMs * progress;
          x.push({
            atMs,
            value: preset.center.x + Math.cos(angle) * preset.radius,
            easing: { type: "preset", name: "linear" },
          });
          y.push({
            atMs,
            value: preset.center.y + Math.sin(angle) * preset.radius,
            easing: { type: "preset", name: "linear" },
          });
        }
        return [
          { property: "transform.x", keyframes: x },
          { property: "transform.y", keyframes: y },
        ];
      }
      case "count-up":
        return [numeric("data.number", preset.from, preset.to)];
      case "progress": {
        const min = preset.min ?? 0;
        const max = preset.max ?? 100;
        if (max <= min) {
          throw new MotionAdapterError(
            `Data progress preset requires max to be greater than min.`,
          );
        }
        const normalize = (value: number) =>
          clamp((value - min) / (max - min), 0, 1);
        return [
          numeric(
            "data.progress",
            normalize(preset.from ?? min),
            normalize(preset.to),
          ),
        ];
      }
      case "reveal":
        throw new MotionAdapterError(
          `Data preset "${preset.name}" requires a data-binding adapter.`,
        );
    }
  }

  private expandLoop(
    loop: LoopAnimation,
    trackStartMs: number,
  ): AnimationProperty[] {
    const loopStart = loop.atMs ?? 0;
    const available = Math.max(
      0,
      this.project.durationMs - trackStartMs - loopStart,
    );
    const cycleSpan = loop.durationMs + (loop.delayMs ?? 0);
    const iterations =
      loop.iterations === "infinite"
        ? Math.max(1, Math.ceil(available / cycleSpan))
        : loop.iterations;

    switch (loop.type) {
      case "pulse": {
        const properties: AnimationProperty[] = [
          waveProperty(
            "transform.scale",
            loopStart,
            loop.durationMs,
            loop.fromScale ?? 1,
            loop.toScale ?? 1.06,
            iterations,
            loop.easing,
            loop.delayMs,
          ),
        ];
        if (loop.fromOpacity !== undefined || loop.toOpacity !== undefined) {
          properties.push(
            waveProperty(
              "visual.opacity",
              loopStart,
              loop.durationMs,
              loop.fromOpacity ?? 1,
              loop.toOpacity ?? 0.8,
              iterations,
              loop.easing,
              loop.delayMs,
            ),
          );
        }
        return properties;
      }
      case "blink": {
        const keyframes: AnimationKeyframe<number>[] = [];
        const min = loop.minOpacity ?? 0;
        const max = loop.maxOpacity ?? 1;
        const duty = loop.dutyCycle ?? 0.5;
        for (let index = 0; index < iterations; index++) {
          const at = loopStart + index * cycleSpan;
          keyframes.push(
            { atMs: at, value: max, hold: true },
            { atMs: at + loop.durationMs * duty, value: min, hold: true },
            { atMs: at + loop.durationMs, value: max },
          );
        }
        return [{ property: "visual.opacity", keyframes }];
      }
      case "rotate": {
        const keyframes: AnimationKeyframe<number>[] = [];
        let from = loop.fromDegrees ?? 0;
        let to = loop.toDegrees ?? 360;
        if (loop.clockwise === false) {
          [from, to] = [-from, -to];
        }
        for (let index = 0; index < iterations; index++) {
          const at = loopStart + index * cycleSpan;
          const reverse =
            (loop.direction === "alternate" ||
              loop.direction === "alternate-reverse") &&
            index % 2 === 1;
          keyframes.push(
            {
              atMs: at,
              value: reverse ? to : from,
              easing: loop.easing ?? { type: "preset", name: "linear" },
            },
            { atMs: at + loop.durationMs, value: reverse ? from : to },
          );
        }
        return [{ property: "transform.rotate", keyframes }];
      }
    }
  }
}

export const transitionRuntimeId = (transitionId: string, layerId: string) =>
  `transition:${transitionId}:${layerId}`;

const objectKeyForElement = (elementId: string) => {
  const encoded = encodeURIComponent(elementId);
  return `element / ${
    encoded.length <= 64 ? encoded : `id-${stableHash(encoded)}`
  }`;
};

const stableHash = (value: string) => {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index++) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(36);
};

const directionalOffset = (
  direction: "left" | "right" | "up" | "down",
  distance: number,
): { property: "transform.x" | "transform.y"; value: number } => {
  switch (direction) {
    case "left":
      return { property: "transform.x", value: -distance };
    case "right":
      return { property: "transform.x", value: distance };
    case "up":
      return { property: "transform.y", value: -distance };
    case "down":
      return { property: "transform.y", value: distance };
  }
};

const waveProperty = (
  property: "transform.scale" | "transform.y" | "visual.opacity",
  start: number,
  duration: number,
  from: number,
  to: number,
  count: number,
  easing?: AnimationEasing,
  delayMs = 0,
): AnimationProperty => {
  const keyframes: AnimationKeyframe<number>[] = [];
  for (let index = 0; index < count; index++) {
    const at = start + index * (duration + delayMs);
    keyframes.push(
      { atMs: at, value: from, easing },
      { atMs: at + duration / 2, value: to, easing },
      { atMs: at + duration, value: from },
    );
  }
  return { property, keyframes } as AnimationProperty;
};

const shakeProperty = (
  property: "transform.x" | "transform.y",
  start: number,
  duration: number,
  distance: number,
  count: number,
): AnimationProperty => {
  const keyframes: AnimationKeyframe<number>[] = [{ atMs: start, value: 0 }];
  const steps = count * 2;
  for (let index = 1; index <= steps; index++) {
    keyframes.push({
      atMs: start + (duration * index) / (steps + 1),
      value: index % 2 === 0 ? -distance : distance,
      easing: { type: "preset", name: "ease-in-out" },
    });
  }
  keyframes.push({ atMs: start + duration, value: 0 });
  return { property, keyframes };
};

const waveColorProperty = (
  start: number,
  duration: number,
  from: string,
  to: string,
  count: number,
  easing?: AnimationEasing,
): AnimationProperty => {
  const keyframes: AnimationKeyframe<string>[] = [];
  for (let index = 0; index < count; index++) {
    const at = start + index * duration;
    keyframes.push(
      { atMs: at, value: from, easing },
      { atMs: at + duration / 2, value: to, easing },
      { atMs: at + duration, value: from },
    );
  }
  return { property: "visual.backgroundColor", keyframes };
};

const resolveGroupElements = (
  groupId: string,
  groups: AnimationGroup[],
  ancestry: Set<string> = new Set(),
): Array<{ elementId: string; role?: string }> => {
  if (ancestry.has(groupId)) {
    throw new MotionAdapterError(`Cyclic group reference at "${groupId}".`);
  }
  const group = groups.find((candidate) => candidate.id === groupId);
  if (!group) {
    throw new MotionAdapterError(`Unknown group "${groupId}".`);
  }
  const nextAncestry = new Set(ancestry).add(groupId);
  return group.members.flatMap((member) => {
    if (member.type === "element") {
      return [{ elementId: member.elementId, role: member.role }];
    }
    return resolveGroupElements(member.groupId, groups, nextAncestry).map(
      (nested) => ({ ...nested, role: member.role ?? nested.role }),
    );
  });
};

const orderGroupMembers = (
  members: Array<{ elementId: string; role?: string }>,
  options: Extract<AnimationTrack["group"], { mode: "stagger" }>,
) => {
  const ordered = [...members];
  switch (options?.order) {
    case "reverse":
      return ordered.reverse();
    case "random":
      return seededShuffle(ordered, options.seed ?? 0);
    case "by-role": {
      const roleOrder = new Map(
        (options.roleOrder ?? []).map((role, index) => [role, index]),
      );
      return ordered
        .map((member, index) => ({ member, index }))
        .sort((a, b) => {
          const aOrder = a.member.role
            ? roleOrder.get(a.member.role) ?? Number.MAX_SAFE_INTEGER
            : Number.MAX_SAFE_INTEGER;
          const bOrder = b.member.role
            ? roleOrder.get(b.member.role) ?? Number.MAX_SAFE_INTEGER
            : Number.MAX_SAFE_INTEGER;
          return aOrder - bOrder || a.index - b.index;
        })
        .map(({ member }) => member);
    }
    default:
      return ordered;
  }
};

const seededShuffle = <T>(values: T[], seed: number): T[] => {
  const shuffled = [...values];
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let index = shuffled.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
};

const mergeCandidateKeyframes = (keyframes: CandidateKeyframe[]) => {
  const byTime = new Map<number, CandidateKeyframe>();
  keyframes.forEach((candidate) => {
    const existing = byTime.get(candidate.atMs);
    if (
      !existing ||
      comparePrecedence(candidate.precedence, existing.precedence) >= 0
    ) {
      byTime.set(candidate.atMs, candidate);
    }
  });
  return Array.from(byTime.values()).sort((a, b) => a.atMs - b.atMs);
};

const comparePrecedence = (left: Precedence, right: Precedence) =>
  left.priority - right.priority ||
  left.specificity - right.specificity ||
  left.sourceRank - right.sourceRank ||
  left.trackIndex - right.trackIndex;

const toMotionValue = (
  value: unknown,
  kind: ValueKind,
): MotionSerializableValue => {
  if (kind === "color") {
    return parseAnimationColor(String(value));
  }
  if (kind === "discrete") {
    if (
      typeof value === "string" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      return value;
    }
    throw new MotionAdapterError(`Expected a discrete string or number.`);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MotionAdapterError(`Expected a finite numeric keyframe value.`);
  }
  return value;
};

const sampleKeyframes = (
  keyframes: MotionKeyframeState[],
  timeMs: number,
): MotionSerializableValue => {
  if (keyframes.length === 0) {
    return 0;
  }
  if (timeMs <= keyframes[0].atMs) {
    return keyframes[0].value;
  }
  const last = keyframes[keyframes.length - 1];
  if (timeMs >= last.atMs) {
    return last.value;
  }
  const index = keyframes.findIndex((keyframe) => keyframe.atMs > timeMs);
  const left = keyframes[index - 1];
  const right = keyframes[index];
  if (left.hold) {
    return left.value;
  }
  const durationMs = Math.max(1, right.atMs - left.atMs);
  const elapsedMs = timeMs - left.atMs;
  const progress = clamp(elapsedMs / durationMs, 0, 1);
  const eased = sampleEasing(left.easing, progress, elapsedMs);
  return mixValues(left.value, right.value, eased);
};

const sampleEasing = (
  easing: AnimationEasing | undefined,
  progress: number,
  elapsedMs: number,
) => {
  if (easing?.type === "spring") {
    return spring({
      keyframes: [0, 1],
      mass: easing.mass,
      stiffness: easing.stiffness,
      damping: easing.damping,
      velocity: easing.velocity ?? 0,
    }).next(elapsedMs).value;
  }
  if (easing?.type === "steps") {
    const step =
      easing.position === "start"
        ? Math.ceil(progress * easing.count)
        : Math.floor(progress * easing.count);
    return clamp(step / easing.count, 0, 1);
  }
  const bezier = easingToBezier(easing);
  return cubicBezier(...bezier)(progress);
};

const mixValues = (
  from: MotionSerializableValue,
  to: MotionSerializableValue,
  progress: number,
): MotionSerializableValue => {
  if (typeof from === "number" && typeof to === "number") {
    return from + (to - from) * progress;
  }
  return progress < 1 ? from : to;
};

const setAtPath = (
  target: Record<string, unknown>,
  path: string[],
  value: MotionSerializableValue,
) => {
  let cursor = target;
  path.slice(0, -1).forEach((part) => {
    const next = cursor[part];
    if (!isRecord(next)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  });
  cursor[path[path.length - 1]] = value;
};

const easingToBezier = (
  easing?: AnimationEasing,
): [number, number, number, number] => {
  if (!easing) {
    return [0.25, 0.1, 0.25, 1];
  }
  if (easing.type === "cubic-bezier") {
    return [easing.x1, easing.y1, easing.x2, easing.y2];
  }
  if (easing.type === "steps") {
    return [0, 0, 1, 1];
  }
  if (easing.type === "spring") {
    const overshoot = Math.min(2, 1 + easing.stiffness / (easing.damping * 20));
    return [0.34, overshoot, 0.64, 1];
  }
  const values: Record<
    Extract<AnimationEasing, { type: "preset" }>["name"],
    [number, number, number, number]
  > = {
    linear: [0, 0, 1, 1],
    ease: [0.25, 0.1, 0.25, 1],
    "ease-in": [0.42, 0, 1, 1],
    "ease-out": [0, 0, 0.58, 1],
    "ease-in-out": [0.42, 0, 0.58, 1],
    smooth: [0.22, 1, 0.36, 1],
    sharp: [0.4, 0, 0.6, 1],
    bounce: [0.34, 1.56, 0.64, 1],
    "back-in": [0.36, 0, 0.66, -0.56],
    "back-out": [0.34, 1.56, 0.64, 1],
    "back-in-out": [0.68, -0.6, 0.32, 1.6],
  };
  return values[easing.name];
};

export const parseAnimationColor = (color: string): MotionRgba => {
  const value = color.trim();
  const hex = value.match(/^#([\da-f]{3,8})$/i)?.[1];
  if (hex) {
    const expanded =
      hex.length === 3 || hex.length === 4
        ? hex
            .split("")
            .map((part) => `${part}${part}`)
            .join("")
        : hex;
    if (expanded.length === 6 || expanded.length === 8) {
      return {
        r: parseInt(expanded.slice(0, 2), 16) / 255,
        g: parseInt(expanded.slice(2, 4), 16) / 255,
        b: parseInt(expanded.slice(4, 6), 16) / 255,
        a: expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1,
      };
    }
  }

  const rgb = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (rgb) {
    return {
      r: clamp(Number(rgb[1]) / 255, 0, 1),
      g: clamp(Number(rgb[2]) / 255, 0, 1),
      b: clamp(Number(rgb[3]) / 255, 0, 1),
      a: rgb[4] === undefined ? 1 : clamp(Number(rgb[4]), 0, 1),
    };
  }

  throw new MotionAdapterError(
    `Unsupported color "${color}". Use hex, rgb(), or rgba().`,
  );
};

const motionColorToHex = (value: unknown, fallback: string) => {
  if (!isRecord(value)) {
    return fallback;
  }
  const components = [value.r, value.g, value.b, value.a];
  if (components.some((component) => typeof component !== "number")) {
    return fallback;
  }
  return `#${components
    .map((component) =>
      Math.round(clamp(component as number, 0, 1) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
};

const finiteOr = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
