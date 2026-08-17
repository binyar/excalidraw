export type ElementRuntimeState = Readonly<{
  /** Runtime-only presence; never mutates Excalidraw's persistent isDeleted. */
  visibility: "visible" | "hidden";
  xOffset: number;
  yOffset: number;
  scale: number;
  /** Opacity multiplier in the range 0..1. */
  opacity: number;
  /** Additive rotation in degrees. */
  rotation: number;
  /** Visible fraction of line/arrow/free-draw geometry, in the range 0..1. */
  drawProgress?: number;
  /** Render-only stroke override. Omitted when stroke color is not animated. */
  strokeColor?: string;
  /** Render-only fill override. Omitted when fill color is not animated. */
  backgroundColor?: string;
  /** Render-only Excalidraw fill pattern override. */
  fillStyle?: "hachure" | "cross-hatch" | "solid" | "zigzag";
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roughness?: number;
  /** Interpolated sharp(0) -> round(1) progress. */
  roundness?: number;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
}>;

export type RuntimeStateSnapshot = Readonly<
  Record<string, ElementRuntimeState>
>;

export type RuntimeStateListener = (
  elementId: string,
  state: ElementRuntimeState | undefined,
) => void;

export const DEFAULT_ELEMENT_RUNTIME_STATE: ElementRuntimeState = Object.freeze(
  {
    xOffset: 0,
    yOffset: 0,
    scale: 1,
    opacity: 1,
    visibility: "visible",
    rotation: 0,
    drawProgress: 1,
  },
);

/**
 * Ephemeral animation state. This store is deliberately independent from
 * Excalidraw Scene/AppState so updates cannot enter history or persistence.
 */
export class RuntimeStateStore {
  private readonly states = new Map<string, ElementRuntimeState>();
  private readonly listeners = new Set<RuntimeStateListener>();
  private readonly invalidationListeners = new Set<() => void>();
  private batchDepth = 0;
  private readonly pendingChanges = new Map<
    string,
    ElementRuntimeState | undefined
  >();

  get(elementId: string): ElementRuntimeState | undefined {
    return this.states.get(elementId);
  }

  keys(): IterableIterator<string> {
    return this.states.keys();
  }

  set(elementId: string, state: ElementRuntimeState): void {
    assertElementId(elementId);
    const normalized = normalizeState(state);
    const previous = this.states.get(elementId);
    if (previous && statesEqual(previous, normalized)) {
      return;
    }
    this.states.set(elementId, normalized);
    this.emit(elementId, normalized);
  }

  patch(elementId: string, patch: Partial<ElementRuntimeState>): void {
    this.set(elementId, {
      ...(this.states.get(elementId) ?? DEFAULT_ELEMENT_RUNTIME_STATE),
      ...patch,
    });
  }

  delete(elementId: string): boolean {
    const deleted = this.states.delete(elementId);
    if (deleted) {
      this.emit(elementId, undefined);
    }
    return deleted;
  }

  clear(): void {
    if (this.states.size === 0) {
      return;
    }
    const elementIds = Array.from(this.states.keys());
    this.states.clear();
    this.batch(() => {
      elementIds.forEach((elementId) => this.emit(elementId, undefined));
    });
  }

  batch<T>(update: () => T): T {
    this.batchDepth += 1;
    try {
      return update();
    } finally {
      this.batchDepth -= 1;
      if (this.batchDepth === 0) {
        this.flushPendingChanges();
      }
    }
  }

  snapshot(): RuntimeStateSnapshot {
    return Object.freeze(Object.fromEntries(this.states));
  }

  subscribe(listener: RuntimeStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeInvalidation(listener: () => void): () => void {
    this.invalidationListeners.add(listener);
    return () => {
      this.invalidationListeners.delete(listener);
    };
  }

  private emit(
    elementId: string,
    state: ElementRuntimeState | undefined,
  ): void {
    if (this.batchDepth > 0) {
      this.pendingChanges.set(elementId, state);
      return;
    }
    this.listeners.forEach((listener) => listener(elementId, state));
    this.invalidationListeners.forEach((listener) => listener());
  }

  private flushPendingChanges(): void {
    if (this.pendingChanges.size === 0) {
      return;
    }
    const changes = Array.from(this.pendingChanges);
    this.pendingChanges.clear();
    changes.forEach(([elementId, state]) => {
      this.listeners.forEach((listener) => listener(elementId, state));
    });
    this.invalidationListeners.forEach((listener) => listener());
  }
}

const normalizeState = (state: ElementRuntimeState): ElementRuntimeState => {
  const xOffset = finite(state.xOffset, "xOffset");
  const yOffset = finite(state.yOffset, "yOffset");
  const scale = finite(state.scale, "scale");
  const opacity = finite(state.opacity, "opacity");
  const visibility = state.visibility ?? "visible";
  const rotation = finite(state.rotation, "rotation");
  const drawProgress = finite(state.drawProgress ?? 1, "drawProgress");
  const strokeColor = optionalColor(state.strokeColor, "strokeColor");
  const backgroundColor = optionalColor(
    state.backgroundColor,
    "backgroundColor",
  );
  const fillStyle = optionalFillStyle(state.fillStyle);
  const strokeWidth = optionalFinite(state.strokeWidth, "strokeWidth");
  const roughness = optionalFinite(state.roughness, "roughness");
  const roundness = optionalFinite(state.roundness, "roundness");
  const fontSize = optionalFinite(state.fontSize, "fontSize");
  const fontFamily = optionalFinite(state.fontFamily, "fontFamily");

  if (scale < 0) {
    throw new RangeError("Runtime scale must be greater than or equal to 0.");
  }
  if (opacity < 0 || opacity > 1) {
    throw new RangeError("Runtime opacity must be in the range 0..1.");
  }
  if (drawProgress < 0 || drawProgress > 1) {
    throw new RangeError("Runtime drawProgress must be in the range 0..1.");
  }
  if (roundness !== undefined && (roundness < 0 || roundness > 1)) {
    throw new RangeError("Runtime roundness must be in the range 0..1.");
  }
  if (visibility !== "visible" && visibility !== "hidden") {
    throw new TypeError(`Unsupported runtime visibility "${visibility}".`);
  }

  return Object.freeze({
    xOffset,
    yOffset,
    scale,
    opacity,
    visibility,
    rotation,
    drawProgress,
    ...(strokeColor ? { strokeColor } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(fillStyle ? { fillStyle } : {}),
    ...(strokeWidth !== undefined ? { strokeWidth } : {}),
    ...(state.strokeStyle ? { strokeStyle: state.strokeStyle } : {}),
    ...(roughness !== undefined ? { roughness } : {}),
    ...(roundness !== undefined ? { roundness } : {}),
    ...(fontSize !== undefined ? { fontSize } : {}),
    ...(fontFamily !== undefined ? { fontFamily } : {}),
    ...(state.textAlign ? { textAlign: state.textAlign } : {}),
    ...(state.verticalAlign ? { verticalAlign: state.verticalAlign } : {}),
  });
};

const optionalColor = (value: string | undefined, property: string) => {
  if (value === undefined) {
    return undefined;
  }
  if (!value.trim()) {
    throw new TypeError(`Runtime ${property} must be a non-empty color.`);
  }
  return value;
};

const finite = (value: number, property: string) => {
  if (!Number.isFinite(value)) {
    throw new TypeError(`Runtime ${property} must be a finite number.`);
  }
  return value;
};

const statesEqual = (left: ElementRuntimeState, right: ElementRuntimeState) =>
  left.xOffset === right.xOffset &&
  left.yOffset === right.yOffset &&
  left.scale === right.scale &&
  left.opacity === right.opacity &&
  left.visibility === right.visibility &&
  left.rotation === right.rotation &&
  (left.drawProgress ?? 1) === (right.drawProgress ?? 1) &&
  left.strokeColor === right.strokeColor &&
  left.backgroundColor === right.backgroundColor &&
  left.fillStyle === right.fillStyle &&
  left.strokeWidth === right.strokeWidth &&
  left.strokeStyle === right.strokeStyle &&
  left.roughness === right.roughness &&
  left.roundness === right.roundness &&
  left.fontSize === right.fontSize &&
  left.fontFamily === right.fontFamily &&
  left.textAlign === right.textAlign &&
  left.verticalAlign === right.verticalAlign;

const optionalFinite = (value: number | undefined, property: string) =>
  value === undefined ? undefined : finite(value, property);

const optionalFillStyle = (value: ElementRuntimeState["fillStyle"]) => {
  if (value === undefined) {
    return undefined;
  }
  if (
    value !== "hachure" &&
    value !== "cross-hatch" &&
    value !== "solid" &&
    value !== "zigzag"
  ) {
    throw new TypeError(`Unsupported runtime fillStyle "${value}".`);
  }
  return value;
};

const assertElementId = (elementId: string) => {
  if (!elementId.trim()) {
    throw new TypeError("Runtime elementId must be a non-empty string.");
  }
};
