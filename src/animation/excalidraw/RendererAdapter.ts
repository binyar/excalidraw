import { degreesToRadians } from "@excalidraw/math";
import { DEFAULT_ADAPTIVE_RADIUS, ROUNDNESS } from "@excalidraw/common";
import { isUsingAdaptiveRadius } from "@excalidraw/element";
import { registerRuntimeElementRenderAdapter } from "@excalidraw/excalidraw/renderer/runtimeElementRenderHook";

import type {
  ExcalidrawFreeDrawElement,
  ExcalidrawLinearElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import type { RuntimeElementRenderAdapter } from "@excalidraw/excalidraw/renderer/runtimeElementRenderHook";

import type { Degrees } from "@excalidraw/math";

import type {
  ElementRuntimeState,
  RuntimeStateStore,
} from "./RuntimeStateStore";

const DEFAULT_RENDER_STATE = {
  visibility: "visible" as const,
  xOffset: 0,
  yOffset: 0,
  scale: 1,
  opacity: 1,
  rotation: 0,
  drawProgress: 1,
};

type ProjectionCacheEntry<T extends NonDeletedExcalidrawElement> = {
  element: T;
  version: T["version"];
  versionNonce: T["versionNonce"];
  state: ReturnType<RuntimeStateStore["get"]>;
  projected: T;
  hitProjected: T;
  sourceShapeSnapshot: Record<string, unknown>;
  preservesCanvasCache: boolean;
};

/** Combines a base element with ephemeral runtime state for canvas rendering. */
export class ExcalidrawRendererAdapter implements RuntimeElementRenderAdapter {
  private readonly cache = new Map<
    string,
    ProjectionCacheEntry<NonDeletedExcalidrawElement>
  >();

  constructor(readonly store: RuntimeStateStore) {}

  projectElement<T extends NonDeletedExcalidrawElement>(element: T): T {
    const ownState = this.store.get(element.id);
    const containerState = this.getContainerState(element);
    if (!ownState && !containerState) {
      this.cache.delete(element.id);
      return element;
    }
    const state: ElementRuntimeState = containerState
      ? {
          ...(ownState ?? DEFAULT_RENDER_STATE),
          opacity:
            (ownState?.opacity ?? 1) *
            containerState.opacity *
            (containerState.drawProgress ?? 1),
          visibility:
            ownState?.visibility === "hidden" ||
            containerState.visibility === "hidden"
              ? ("hidden" as const)
              : ("visible" as const),
        }
      : ownState!;
    if (isIdentityState(state)) {
      this.cache.delete(element.id);
      return element;
    }

    const cached = this.cache.get(element.id);
    if (
      cached?.element === element &&
      cached.version === element.version &&
      cached.versionNonce === element.versionNonce &&
      cached.state === state
    ) {
      return cached.projected as T;
    }

    const width = element.width * state.scale;
    const height = element.height * state.scale;
    let projected = {
      ...element,
      x: element.x + state.xOffset + (element.width - width) / 2,
      y: element.y + state.yOffset + (element.height - height) / 2,
      width,
      height,
      angle: element.angle + degreesToRadians(state.rotation as Degrees),
      opacity: clamp(element.opacity * state.opacity, 0, 100),
      ...(state.strokeColor ? { strokeColor: state.strokeColor } : {}),
      ...(state.backgroundColor
        ? { backgroundColor: state.backgroundColor }
        : {}),
      ...(state.fillStyle ? { fillStyle: state.fillStyle } : {}),
      ...(state.strokeWidth !== undefined
        ? { strokeWidth: state.strokeWidth }
        : {}),
      ...(state.strokeStyle ? { strokeStyle: state.strokeStyle } : {}),
      ...(state.roughness !== undefined ? { roughness: state.roughness } : {}),
      ...(state.roundness !== undefined
        ? {
            roundness:
              state.roundness <= 0
                ? null
                : isUsingAdaptiveRadius(element.type)
                ? {
                    type: ROUNDNESS.ADAPTIVE_RADIUS,
                    value: DEFAULT_ADAPTIVE_RADIUS * state.roundness,
                  }
                : {
                    type: ROUNDNESS.PROPORTIONAL_RADIUS,
                    // Proportional elements interpret value as a 0..1 radius
                    // multiplier. Persistent elements without value keep the
                    // editor's full default radius.
                    value: state.roundness,
                  },
          }
        : {}),
      ...(element.type === "text" && state.fontSize !== undefined
        ? { fontSize: state.fontSize }
        : {}),
      ...(element.type === "text" && state.fontFamily !== undefined
        ? { fontFamily: state.fontFamily }
        : {}),
      ...(element.type === "text" && state.textAlign
        ? { textAlign: state.textAlign }
        : {}),
      ...(element.type === "text" && state.verticalAlign
        ? { verticalAlign: state.verticalAlign }
        : {}),
    } as T;
    projected = projectDrawProgress(projected, state.drawProgress ?? 1);

    const preservesCanvasCache = isCanvasCachePreservingState(state);
    const canReuseProjection =
      cached?.preservesCanvasCache &&
      preservesCanvasCache &&
      hasSameSourceShape(element, cached.sourceShapeSnapshot);
    if (canReuseProjection) {
      // Excalidraw intentionally keeps its element object stable during drag,
      // and its expensive RoughJS/canvas caches are keyed by object identity.
      // Keep the projected object stable as well when only x/y/rotation or
      // opacity changed. Otherwise every pointer frame regenerates the shape.
      Object.assign(cached.projected, projected);
      projected = cached.projected as T;
    }

    this.cache.set(element.id, {
      element,
      version: element.version,
      versionNonce: element.versionNonce,
      state,
      projected,
      hitProjected: { ...projected },
      sourceShapeSnapshot: canReuseProjection
        ? cached.sourceShapeSnapshot
        : captureSourceShape(element),
      preservesCanvasCache,
    });
    return projected;
  }

  projectElementForHitTest<T extends NonDeletedExcalidrawElement>(
    element: T,
  ): T {
    this.projectElement(element);
    return (
      (this.cache.get(element.id)?.hitProjected as T | undefined) ?? element
    );
  }

  isElementVisible(element: NonDeletedExcalidrawElement): boolean {
    const ownState = this.store.get(element.id);
    const containerState = this.getContainerState(element);
    if (
      ownState?.visibility === "hidden" ||
      containerState?.visibility === "hidden"
    ) {
      return false;
    }
    const runtimeOpacity =
      (ownState?.opacity ?? 1) *
      (containerState?.opacity ?? 1) *
      (containerState?.drawProgress ?? 1);
    return element.opacity * runtimeOpacity > 0;
  }

  subscribe(callback: () => void): () => void {
    return this.store.subscribeInvalidation(callback);
  }

  getActiveElementIds(): Iterable<string> {
    return this.store.keys();
  }

  unprojectPoint(
    element: NonDeletedExcalidrawElement,
    point: Readonly<{ x: number; y: number }>,
  ): { x: number; y: number } {
    const state = this.store.get(element.id);
    if (!state || isIdentityState(state) || state.scale === 0) {
      return { x: point.x, y: point.y };
    }
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    const renderedCenterX = centerX + state.xOffset;
    const renderedCenterY = centerY + state.yOffset;
    const radians = degreesToRadians(state.rotation as Degrees);
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const dx = (point.x - renderedCenterX) / state.scale;
    const dy = (point.y - renderedCenterY) / state.scale;
    return {
      x: centerX + dx * cosine + dy * sine,
      y: centerY - dx * sine + dy * cosine,
    };
  }

  /** Connects this adapter to the live canvas renderer. */
  connect(): () => void {
    return registerRuntimeElementRenderAdapter(this);
  }

  private getContainerState(element: NonDeletedExcalidrawElement) {
    return element.type === "text" && element.containerId
      ? this.store.get(element.containerId)
      : undefined;
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const isIdentityState = (
  state: NonNullable<ReturnType<RuntimeStateStore["get"]>>,
) =>
  state.xOffset === 0 &&
  state.yOffset === 0 &&
  state.scale === 1 &&
  state.opacity === 1 &&
  state.visibility === "visible" &&
  state.rotation === 0 &&
  (state.drawProgress ?? 1) === 1 &&
  !state.strokeColor &&
  !state.backgroundColor &&
  !state.fillStyle &&
  state.strokeWidth === undefined &&
  !state.strokeStyle &&
  state.roughness === undefined &&
  state.roundness === undefined &&
  state.fontSize === undefined &&
  state.fontFamily === undefined &&
  !state.textAlign &&
  !state.verticalAlign;

const isCanvasCachePreservingState = (
  state: NonNullable<ReturnType<RuntimeStateStore["get"]>>,
) =>
  state.scale === 1 &&
  (state.drawProgress ?? 1) === 1 &&
  !state.strokeColor &&
  !state.backgroundColor &&
  !state.fillStyle &&
  state.strokeWidth === undefined &&
  !state.strokeStyle &&
  state.roughness === undefined &&
  state.roundness === undefined &&
  state.fontSize === undefined &&
  state.fontFamily === undefined &&
  !state.textAlign &&
  !state.verticalAlign;

const SOURCE_TRANSFORM_KEYS = new Set([
  "x",
  "y",
  "angle",
  "opacity",
  "version",
  "versionNonce",
  "updated",
]);

const captureSourceShape = (
  element: NonDeletedExcalidrawElement,
): Record<string, unknown> => {
  const snapshot: Record<string, unknown> = {};
  const source = element as unknown as Record<string, unknown>;
  Object.keys(source).forEach((key) => {
    if (!SOURCE_TRANSFORM_KEYS.has(key)) {
      snapshot[key] = source[key];
    }
  });
  return snapshot;
};

const hasSameSourceShape = (
  element: NonDeletedExcalidrawElement,
  snapshot: Readonly<Record<string, unknown>>,
): boolean => {
  const source = element as unknown as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (!SOURCE_TRANSFORM_KEYS.has(key) && snapshot[key] !== source[key]) {
      return false;
    }
  }
  return true;
};

const projectDrawProgress = <T extends NonDeletedExcalidrawElement>(
  element: T,
  progress: number,
): T => {
  if (
    progress >= 1 ||
    (element.type !== "line" &&
      element.type !== "arrow" &&
      element.type !== "freedraw")
  ) {
    return element;
  }
  const points = projectPoints(element.points, progress);
  if (element.type === "freedraw") {
    const source = element as T & ExcalidrawFreeDrawElement;
    return {
      ...source,
      points,
      pressures: source.pressures.slice(0, points.length),
    } as T;
  }
  const source = element as T & ExcalidrawLinearElement;
  return {
    ...source,
    points: points.length === 1 ? [points[0], points[0]] : points,
    endBinding: null,
  } as T;
};

const projectPoints = <TPoint extends readonly [number, number]>(
  points: readonly TPoint[],
  progress: number,
): TPoint[] => {
  if (points.length < 2) {
    return [...points];
  }
  const lengths = points
    .slice(1)
    .map((point, index) =>
      Math.hypot(point[0] - points[index][0], point[1] - points[index][1]),
    );
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * progress;
  const visible: TPoint[] = [points[0]];
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index];
    const next = points[index + 1];
    if (remaining >= length) {
      visible.push(next);
      remaining -= length;
      if (remaining <= Number.EPSILON) {
        break;
      }
      continue;
    }
    const start = points[index];
    const ratio = length === 0 ? 0 : remaining / length;
    visible.push([
      start[0] + (next[0] - start[0]) * ratio,
      start[1] + (next[1] - start[1]) * ratio,
    ] as unknown as TPoint);
    break;
  }
  return visible;
};
