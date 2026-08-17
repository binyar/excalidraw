import { createPortal } from "react-dom";

import { transitionRuntimeId } from "../runtime/MotionAdapter";

import type { AnimationRuntimeObjectValue } from "../runtime/MotionAdapter";
import type { AnimationProject, AnimationTransitionDirection } from "../types";

type StageTransitionOverlayProps = {
  project: AnimationProject;
  values?: Readonly<Record<string, AnimationRuntimeObjectValue>>;
};

const percent = (value: number) => `${Math.max(0, Math.min(1, value)) * 100}%`;

const revealClipPath = (
  effect: string,
  direction: AnimationTransitionDirection,
  progress: number,
) => {
  const hidden = percent(1 - progress);
  if (effect === "iris") {
    return `circle(${progress * 72}% at 50% 50%)`;
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

  const layers = project.tracks.flatMap((track, index) => {
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
    const { progress, opacity, color, blur, scale } = value.transition;
    const direction = target.direction ?? "left";
    return [
      <div
        key={track.id}
        className="stage-transition-overlay__layer"
        data-effect={target.effect}
        data-direction={direction}
        data-transition-id={target.transitionId}
        data-layer-id={target.layerId}
        style={{
          zIndex: index + 1,
          opacity,
          backgroundColor: color,
          clipPath:
            target.effect === "fade-through-color" || target.effect === "push"
              ? undefined
              : revealClipPath(target.effect, direction, progress),
          transform:
            target.effect === "push"
              ? pushTransform(direction, progress, scale)
              : `scale(${scale})`,
          backdropFilter: blur > 0 ? `blur(${blur}px)` : undefined,
        }}
      />,
    ];
  });

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
