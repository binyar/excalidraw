import type { RuntimeStateStore } from "./RuntimeStateStore";
import type {
  AnimationRuntimeSnapshot,
  AnimationRuntimeSubscriber,
} from "../runtime/AnimationRuntime";
import type { AnimationRuntimeObjectValue } from "../runtime/MotionAdapter";
import type {
  AnimationPath,
  AnimationPoint,
  AnimationPropertyName,
} from "../types";

export type ElementAnimation = {
  subscribe(callback: AnimationRuntimeSubscriber): () => void;
};

type Binding = {
  animation: ElementAnimation;
  animatedProperties: ReadonlySet<AnimationPropertyName>;
  unsubscribe: () => void;
};

export type ElementBindingOptions = {
  animatedProperties?: Iterable<AnimationPropertyName>;
  externallySynchronized?: boolean;
};

type UnbindOptions = {
  preserveState?: boolean;
};

/** Maps runtime object values to render-only Excalidraw element transforms. */
export class ElementBindingManager {
  private readonly bindings = new Map<string, Binding>();

  constructor(readonly store: RuntimeStateStore) {}

  bind(
    elementId: string,
    animation: ElementAnimation,
    options: ElementBindingOptions = {},
  ): void {
    // Runtime rebuilds replace the subscription, but the last projected state
    // must remain visible until the new runtime publishes its first snapshot.
    this.unbind(elementId, { preserveState: true });

    const binding: Binding = {
      animation,
      animatedProperties: new Set(options.animatedProperties),
      unsubscribe: () => undefined,
    };
    this.bindings.set(elementId, binding);
    if (!options.externallySynchronized) {
      binding.unsubscribe = animation.subscribe((snapshot) => {
        if (this.bindings.get(elementId) !== binding) {
          return;
        }
        this.applySnapshot(elementId, snapshot, binding.animatedProperties);
      });
    }
  }

  unbind(elementId: string, options: UnbindOptions = {}): void {
    const binding = this.bindings.get(elementId);
    if (!binding) {
      if (!options.preserveState) {
        this.store.delete(elementId);
      }
      return;
    }
    this.bindings.delete(elementId);
    binding.unsubscribe();
    if (!options.preserveState) {
      this.store.delete(elementId);
    }
  }

  isBound(elementId: string): boolean {
    return this.bindings.has(elementId);
  }

  /**
   * Applies one shared runtime snapshot to every bound element.
   *
   * AnimationWorkspace uses this in the same callback that updates its
   * playhead. This guarantees the canvas state and the visible timeline can
   * never advance independently, even if an engine-specific object listener
   * is coalesced by the underlying RAF driver.
   */
  sync(snapshot: AnimationRuntimeSnapshot): void {
    this.store.batch(() => {
      this.bindings.forEach((binding, elementId) => {
        this.applySnapshot(elementId, snapshot, binding.animatedProperties);
      });
    });
  }

  dispose(options: UnbindOptions = {}): void {
    Array.from(this.bindings.keys()).forEach((elementId) =>
      this.unbind(elementId, options),
    );
  }

  private applySnapshot(
    elementId: string,
    snapshot: AnimationRuntimeSnapshot,
    animatedProperties: ReadonlySet<AnimationPropertyName>,
  ): void {
    const value = snapshot.values[elementId];
    if (!value) {
      this.store.delete(elementId);
      return;
    }
    this.store.set(
      elementId,
      runtimeValueToElementState(value, animatedProperties),
    );
  }
}

const runtimeValueToElementState = (
  value: AnimationRuntimeObjectValue,
  animatedProperties: ReadonlySet<AnimationPropertyName>,
) => {
  const pathTransform = sampleMotionPath(value.advanced.path);
  return {
    visibility: value.element?.visibility ?? "visible",
    xOffset: value.transform.x + pathTransform.x,
    yOffset: value.transform.y + pathTransform.y,
    scale: value.transform.scale,
    opacity: value.visual.opacity,
    rotation: value.transform.rotate + pathTransform.rotation,
    drawProgress: value.advanced.drawProgress,
    ...(animatedProperties.has("visual.strokeColor")
      ? { strokeColor: value.visual.strokeColor }
      : {}),
    ...(animatedProperties.has("visual.backgroundColor")
      ? { backgroundColor: value.visual.backgroundColor }
      : {}),
    ...(animatedProperties.has("visual.fillStyle")
      ? { fillStyle: value.visual.fillStyle }
      : {}),
    ...(animatedProperties.has("visual.strokeWidth")
      ? { strokeWidth: value.visual.strokeWidth }
      : {}),
    ...(animatedProperties.has("visual.strokeStyle")
      ? { strokeStyle: value.visual.strokeStyle }
      : {}),
    ...(animatedProperties.has("visual.roughness")
      ? { roughness: value.visual.roughness }
      : {}),
    ...(animatedProperties.has("visual.roundness")
      ? { roundness: value.visual.roundness }
      : {}),
    ...(animatedProperties.has("text.fontSize")
      ? { fontSize: value.text.fontSize }
      : {}),
    ...(animatedProperties.has("text.fontFamily")
      ? { fontFamily: value.text.fontFamily }
      : {}),
    ...(animatedProperties.has("text.textAlign")
      ? { textAlign: value.text.textAlign }
      : {}),
    ...(animatedProperties.has("text.verticalAlign")
      ? { verticalAlign: value.text.verticalAlign }
      : {}),
  };
};

type MotionPathValue = AnimationRuntimeObjectValue["advanced"]["path"];

export const sampleMotionPath = (
  pathValue: MotionPathValue,
): { x: number; y: number; rotation: number } => {
  const path = pathValue.motionPath;
  if (!path) {
    return { x: 0, y: 0, rotation: 0 };
  }
  const progress = Math.max(0, Math.min(1, pathValue.progress));
  const sample =
    path.type === "polyline"
      ? samplePolyline(path, progress)
      : path.type === "bezier"
      ? sampleBezierPath(path, progress)
      : sampleSvgPath(path.d, progress);
  return {
    x: sample.x,
    y: sample.y,
    rotation: pathValue.orientToPath ? sample.rotation : 0,
  };
};

const sampleBezierPath = (
  path: Extract<AnimationPath, { type: "bezier" }>,
  progress: number,
) => {
  const samples: AnimationPoint[] = [path.start];
  let start = path.start;
  for (const segment of path.segments) {
    for (let step = 1; step <= 24; step++) {
      const t = step / 24;
      const inverse = 1 - t;
      samples.push({
        x:
          inverse ** 3 * start.x +
          3 * inverse ** 2 * t * segment.control1.x +
          3 * inverse * t ** 2 * segment.control2.x +
          t ** 3 * segment.to.x,
        y:
          inverse ** 3 * start.y +
          3 * inverse ** 2 * t * segment.control1.y +
          3 * inverse * t ** 2 * segment.control2.y +
          t ** 3 * segment.to.y,
      });
    }
    start = segment.to;
  }
  if (path.closed) {
    samples.push(path.start);
  }
  return samplePolyline({ type: "polyline", points: samples }, progress);
};

const samplePolyline = (
  path: Extract<AnimationPath, { type: "polyline" }>,
  progress: number,
) => {
  const points = path.closed
    ? [...path.points, path.points[0]].filter(
        (point): point is AnimationPoint => point !== undefined,
      )
    : path.points;
  if (points.length < 2) {
    return { x: points[0]?.x ?? 0, y: points[0]?.y ?? 0, rotation: 0 };
  }
  const segments = points.slice(1).map((point, index) => {
    const start = points[index];
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    return { start, end: point, dx, dy, length: Math.hypot(dx, dy) };
  });
  const totalLength = segments.reduce(
    (sum, segment) => sum + segment.length,
    0,
  );
  let distance = progress * totalLength;
  const segment =
    segments.find((candidate) => {
      if (distance <= candidate.length) {
        return true;
      }
      distance -= candidate.length;
      return false;
    }) ?? segments[segments.length - 1];
  const ratio = segment.length === 0 ? 0 : distance / segment.length;
  return {
    x: segment.start.x + segment.dx * ratio,
    y: segment.start.y + segment.dy * ratio,
    rotation: (Math.atan2(segment.dy, segment.dx) * 180) / Math.PI,
  };
};

const sampleSvgPath = (d: string, progress: number) => {
  if (typeof document === "undefined") {
    return { x: 0, y: 0, rotation: 0 };
  }
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  if (typeof path.getTotalLength !== "function") {
    return { x: 0, y: 0, rotation: 0 };
  }
  const length = path.getTotalLength();
  const distance = length * progress;
  const point = path.getPointAtLength(distance);
  const next = path.getPointAtLength(Math.min(length, distance + 0.1));
  return {
    x: point.x,
    y: point.y,
    rotation: (Math.atan2(next.y - point.y, next.x - point.x) * 180) / Math.PI,
  };
};
