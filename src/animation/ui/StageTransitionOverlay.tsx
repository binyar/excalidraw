import { createPortal } from "react-dom";

import { transitionRuntimeId } from "../runtime/MotionAdapter";

import type { AnimationRuntimeObjectValue } from "../runtime/MotionAdapter";
import type {
  AnimationProject,
  AnimationTransitionDirection,
  AnimationTransitionEffect,
  AnimationTransitionOrigin,
} from "../types";

type StageTransitionOverlayProps = {
  project: AnimationProject;
  values?: Readonly<Record<string, AnimationRuntimeObjectValue>>;
};

export type StageTransitionLayer = {
  id: string;
  effect: Exclude<AnimationTransitionEffect, "camera">;
  direction: AnimationTransitionDirection;
  origin: AnimationTransitionOrigin;
  progress: number;
  opacity: number;
  color: string;
  blur: number;
  scale: number;
  transitionId: string;
  layerId: string;
};

export const getStageTransitionLayers = (
  project: AnimationProject,
  values?: Readonly<Record<string, AnimationRuntimeObjectValue>>,
): StageTransitionLayer[] =>
  project.tracks.flatMap((track) => {
    if (track.enabled === false || track.target.type !== "transition") {
      return [];
    }
    const target = track.target;
    const value =
      values?.[transitionRuntimeId(target.transitionId, target.layerId)];
    if (
      !value ||
      target.effect === "camera" ||
      value.transition.opacity <= 0.001
    ) {
      return [];
    }
    return [
      {
        id: track.id,
        effect: target.effect,
        direction: target.direction ?? "left",
        origin: target.origin ?? "center",
        progress: value.transition.progress,
        opacity: value.transition.opacity,
        color: value.transition.color,
        blur: value.transition.blur,
        scale: value.transition.scale,
        transitionId: target.transitionId,
        layerId: target.layerId,
      },
    ];
  });

const percent = (value: number) => `${Math.max(0, Math.min(1, value)) * 100}%`;

export const getTransitionRevealClipPath = (
  effect: string,
  direction: AnimationTransitionDirection,
  progress: number,
  origin: AnimationTransitionOrigin,
  scale: number,
) => {
  const hidden = percent(1 - progress);
  if (effect === "iris") {
    const positions: Record<AnimationTransitionOrigin, string> = {
      center: "50% 50%",
      "top-left": "0% 0%",
      "top-right": "100% 0%",
      "bottom-left": "0% 100%",
      "bottom-right": "100% 100%",
    };
    const maximumRadius = origin === "center" ? 72 : 145;
    return `circle(${progress * maximumRadius * scale}% at ${
      positions[origin]
    })`;
  }
  switch (direction) {
    case "right":
      return `inset(0 0 0 ${hidden})`;
    case "up":
      return `inset(${hidden} 0 0 0)`;
    case "down":
      return `inset(0 0 ${hidden} 0)`;
    case "left":
    default:
      return `inset(0 ${hidden} 0 0)`;
  }
};

const pushTransform = (
  direction: AnimationTransitionDirection,
  progress: number,
  scale: number,
) => {
  const remaining = (1 - progress) * 100;
  const translation =
    direction === "right"
      ? `translateX(-${remaining}%)`
      : direction === "up"
      ? `translateY(${remaining}%)`
      : direction === "down"
      ? `translateY(-${remaining}%)`
      : `translateX(${remaining}%)`;
  return `${translation} scale(${scale})`;
};

/** Runtime-only overlay for persisted transition tracks. */
export const StageTransitionOverlay = ({
  project,
  values,
}: StageTransitionOverlayProps) => {
  if (typeof document === "undefined") {
    return null;
  }
  const host = document.querySelector<HTMLElement>(".editor-shell__canvas");
  if (!host) {
    return null;
  }

  const layers = getStageTransitionLayers(project, values)
    .map((layer, index) => {
      const {
        effect,
        direction,
        origin,
        progress,
        opacity,
        color,
        blur,
        scale,
      } = layer;
      return [
        <div
          key={layer.id}
          className="stage-transition-overlay__layer"
          data-effect={effect}
          data-direction={direction}
          data-transition-id={layer.transitionId}
          data-layer-id={layer.layerId}
          style={{
            zIndex: index + 1,
            opacity,
            backgroundColor: color,
            clipPath:
              effect === "fade-through-color" || effect === "push"
                ? undefined
                : getTransitionRevealClipPath(
                    effect,
                    direction,
                    progress,
                    origin,
                    scale,
                  ),
            transform:
              effect === "push"
                ? pushTransform(direction, progress, scale)
                : effect === "iris"
                ? undefined
                : `scale(${scale})`,
            backdropFilter: blur > 0 ? `blur(${blur}px)` : undefined,
          }}
        />,
      ];
    })
    .flat();

  if (layers.length === 0) {
    return null;
  }
  return createPortal(
    <div className="stage-transition-overlay" aria-hidden="true">
      {layers}
    </div>,
    host,
  );
};
