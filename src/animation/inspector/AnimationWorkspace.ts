import { ElementBindingManager } from "../excalidraw/ElementBindingManager";
import { ExcalidrawRendererAdapter } from "../excalidraw/RendererAdapter";
import {
  DEFAULT_ELEMENT_RUNTIME_STATE,
  RuntimeStateStore,
  type ElementRuntimeState,
} from "../excalidraw/RuntimeStateStore";
import {
  parseAnimationProjectJson,
  serializeAnimationProject,
} from "../export";
import { AnimationRuntime } from "../runtime/AnimationRuntime";
import { animationProjectSchema } from "../schema";
import { ANIMATION_SCHEMA_VERSION } from "../types";
import {
  addKeyframe,
  getNumericPropertyValue,
  getTrackAbsoluteStartMs,
  getTrackContentEndMs,
  POSITION_ANIMATION_PROPERTIES,
  addEditableKeyframe,
  getColorPropertyValue,
  getFillStylePropertyValue,
  removeAnimationProperty,
  setColorKeyframe,
  setDiscreteStyleKeyframe,
  setFillStyleKeyframe,
  setNumericKeyframe,
} from "../ui/animationEditorState";

import { generateInspectorAnimation } from "./inspectorPresets";

import type { EditableAnimationPropertyName } from "../ui/animationEditorState";
import type {
  AnimationRuntimeSnapshot,
  AnimationRuntimeStatus,
} from "../runtime/AnimationRuntime";
import type { AnimationRuntimeObjectValue } from "../runtime/MotionAdapter";
import type {
  AnimationProject,
  AnimationFillStyle,
  AnimationPropertyName,
  AnimationTrack,
  NumericAnimationPropertyName,
} from "../types";
import type {
  AnimationInspectorConfig,
  AnimationInspectorElement,
} from "./inspectorPresets";

export type AnimationWorkspaceStatus =
  | AnimationRuntimeStatus
  | "idle"
  | "loading"
  | "error";

export type AnimationWorkspaceSnapshot = {
  project: AnimationProject;
  status: AnimationWorkspaceStatus;
  timeMs: number;
  values?: AnimationRuntimeSnapshot["values"];
  error?: string;
  activeElementId?: string;
  activeTrackId?: string;
};

type RuntimePort = Pick<
  AnimationRuntime,
  "play" | "pause" | "stop" | "seek" | "subscribe" | "dispose"
>;

export type AnimationWorkspaceOptions = {
  runtimeFactory?: (project: AnimationProject) => Promise<RuntimePort>;
  store?: RuntimeStateStore;
  renderer?: ExcalidrawRendererAdapter;
};

type PendingPropertyValue = {
  value: number;
  baseline: number;
};

type PendingElementTransform = {
  atMs: number;
  properties: Partial<
    Record<NumericAnimationPropertyName, PendingPropertyValue>
  >;
};

type PendingElementBackgroundColor = {
  atMs: number;
  baseline: string;
  value: string;
};
type PendingElementFillStyle = {
  atMs: number;
  baseline: AnimationFillStyle;
  value: AnimationFillStyle;
};

export const DEFAULT_ANIMATION_PROJECT_DURATION_MS = 1000;

const EMPTY_PROJECT: AnimationProject = {
  schemaVersion: ANIMATION_SCHEMA_VERSION,
  id: "excalidraw-animation-project",
  durationMs: DEFAULT_ANIMATION_PROJECT_DURATION_MS,
  frameRate: 60,
  metadata: { source: "user", title: "Excalidraw animations" },
  tracks: [],
};

/**
 * Owns the editor-only Animation DSL and rebuilds the headless runtime whenever
 * that DSL changes. Excalidraw elements and AppState are never mutated.
 */
export class AnimationWorkspace {
  private project: AnimationProject = EMPTY_PROJECT;
  private status: AnimationWorkspaceStatus = "idle";
  private timeMs = 0;
  private error: string | undefined;
  private activeElementId: string | undefined;
  private activeTrackId: string | undefined;
  private values: AnimationRuntimeSnapshot["values"] = {};
  private snapshot: AnimationWorkspaceSnapshot = {
    project: EMPTY_PROJECT,
    status: "idle",
    timeMs: 0,
  };
  private readonly listeners = new Set<() => void>();
  private readonly store: RuntimeStateStore;
  private readonly renderer: ExcalidrawRendererAdapter;
  private readonly bindings: ElementBindingManager;
  private readonly runtimeFactory: (
    project: AnimationProject,
  ) => Promise<RuntimePort>;
  private runtime: RuntimePort | undefined;
  private unsubscribeRuntime: (() => void) | undefined;
  private disconnectRenderer: (() => void) | undefined;
  private generation = 0;
  private readonly pendingElementTransforms = new Map<
    string,
    PendingElementTransform
  >();
  private readonly pendingElementBackgroundColors = new Map<
    string,
    PendingElementBackgroundColor
  >();
  private readonly pendingElementFillStyles = new Map<
    string,
    PendingElementFillStyle
  >();

  constructor(options: AnimationWorkspaceOptions = {}) {
    this.store = options.store ?? new RuntimeStateStore();
    this.renderer =
      options.renderer ?? new ExcalidrawRendererAdapter(this.store);
    this.bindings = new ElementBindingManager(this.store);
    this.runtimeFactory =
      options.runtimeFactory ?? ((project) => AnimationRuntime.create(project));
  }

  getSnapshot = (): AnimationWorkspaceSnapshot => this.snapshot;

  /**
   * Applies synchronous render-only values before an asynchronously-created
   * runtime is ready. AI creation uses this to prevent delayed entrances and
   * line drawing tracks from flashing their final canvas state for one frame.
   */
  primeElementRuntimeStates(
    states: Readonly<Record<string, Partial<ElementRuntimeState>>>,
  ): void {
    this.ensureRendererConnected();
    Object.entries(states).forEach(([elementId, state]) => {
      this.store.set(elementId, {
        ...DEFAULT_ELEMENT_RUNTIME_STATE,
        ...state,
      });
    });
  }

  loadProject(
    project: AnimationProject,
    autoplay = false,
    seekTimeMs = autoplay ? 0 : this.timeMs,
  ): void {
    this.project = animationProjectSchema.parse(project);
    this.emit();
    void this.rebuildRuntime(autoplay, seekTimeMs);
  }

  loadJson(json: string, autoplay = false): void {
    this.loadProject(parseAnimationProjectJson(json), autoplay);
  }

  exportJson(pretty = true): string {
    return serializeAnimationProject(this.project, { pretty });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getElementTrack(elementId: string): AnimationTrack | undefined {
    return this.project.tracks.find(
      (track) =>
        track.target.type === "element" && track.target.elementId === elementId,
    );
  }

  getElementTrackForSelection(
    elementId: string,
    timeMs = this.timeMs,
  ): AnimationTrack | undefined {
    const candidates = this.project.tracks.filter((track) =>
      track.target.type === "element"
        ? track.target.elementId === elementId
        : track.target.type === "group" &&
          resolveWorkspaceGroup(this.project, track.target.groupId).includes(
            elementId,
          ),
    );
    if (!candidates.length) {
      return undefined;
    }
    const activeTrack = candidates.find(
      (track) => track.id === this.activeTrackId,
    );
    if (activeTrack) {
      return activeTrack;
    }
    return [...candidates].sort((left, right) => {
      const score = (track: AnimationTrack) => {
        const startMs = getTrackAbsoluteStartMs(this.project, track);
        const endMs =
          startMs + (track.durationMs ?? getTrackContentEndMs(track));
        const distance =
          timeMs < startMs
            ? startMs - timeMs
            : timeMs > endMs
            ? timeMs - endMs
            : 0;
        return [
          distance,
          track.target.type === "element" ? 0 : 1,
          Math.abs(startMs - timeMs),
        ] as const;
      };
      const leftScore = score(left);
      const rightScore = score(right);
      return (
        leftScore[0] - rightScore[0] ||
        leftScore[1] - rightScore[1] ||
        leftScore[2] - rightScore[2]
      );
    })[0];
  }

  getTrackTargetElementIds(trackId: string): string[] {
    const track = this.project.tracks.find(
      (candidate) => candidate.id === trackId,
    );
    if (track?.target.type === "element") {
      return [track.target.elementId];
    }
    if (track?.target.type === "group") {
      return resolveWorkspaceGroup(this.project, track.target.groupId);
    }
    return [];
  }

  getCameraTrack(): AnimationTrack | undefined {
    return this.project.tracks.find((track) => track.target.type === "camera");
  }

  ensureCameraTrack(initial: {
    centerX: number;
    centerY: number;
    zoom: number;
  }): AnimationTrack {
    const existing = this.getCameraTrack();
    if (existing) {
      return existing;
    }
    const track: AnimationTrack = {
      id: "camera-main-animation",
      name: "主镜头",
      description: "Scene camera framing",
      target: { type: "camera", cameraId: "main" },
      startMs: 0,
      durationMs: this.project.durationMs,
      properties: [
        {
          property: "camera.centerX",
          keyframes: [{ atMs: 0, value: initial.centerX }],
        },
        {
          property: "camera.centerY",
          keyframes: [{ atMs: 0, value: initial.centerY }],
        },
        {
          property: "camera.zoom",
          keyframes: [{ atMs: 0, value: initial.zoom }],
        },
      ],
    };
    this.project = animationProjectSchema.parse({
      ...this.project,
      tracks: [track, ...this.project.tracks],
    });
    this.activeTrackId = track.id;
    this.emit();
    void this.rebuildRuntime(false, this.timeMs);
    return track;
  }

  setActiveTrack(trackId: string | null): void {
    const nextTrackId = trackId ?? undefined;
    const track = nextTrackId
      ? this.project.tracks.find((candidate) => candidate.id === nextTrackId)
      : undefined;
    const nextElementId =
      track?.target.type === "element" ? track.target.elementId : undefined;
    if (
      this.activeTrackId === nextTrackId &&
      this.activeElementId === nextElementId
    ) {
      return;
    }
    this.activeTrackId = nextTrackId;
    this.activeElementId = nextElementId;
    this.emit();
  }

  setCameraKeyframe(
    viewport: { centerX: number; centerY: number; zoom: number },
    timeMs = this.timeMs,
  ): void {
    const track = this.ensureCameraTrack(viewport);
    let project = setNumericKeyframe(
      this.project,
      track.id,
      "camera.centerX",
      timeMs,
      viewport.centerX,
    );
    project = setNumericKeyframe(
      project,
      track.id,
      "camera.centerY",
      timeMs,
      viewport.centerY,
    );
    project = setNumericKeyframe(
      project,
      track.id,
      "camera.zoom",
      timeMs,
      viewport.zoom,
    );
    this.loadProject(project, false, timeMs);
  }

  setActiveElement(elementId: string | null): void {
    const nextElementId = elementId ?? undefined;
    const currentTrack = this.activeTrackId
      ? this.project.tracks.find((track) => track.id === this.activeTrackId)
      : undefined;
    const currentTrackMatches =
      nextElementId !== undefined &&
      (currentTrack?.target.type === "element"
        ? currentTrack.target.elementId === nextElementId
        : currentTrack?.target.type === "group" &&
          resolveWorkspaceGroup(
            this.project,
            currentTrack.target.groupId,
          ).includes(nextElementId));
    const nextTrackId = nextElementId
      ? currentTrackMatches
        ? this.activeTrackId
        : this.getElementTrackForSelection(nextElementId)?.id
      : this.activeTrackId;
    if (
      this.activeElementId === nextElementId &&
      this.activeTrackId === nextTrackId
    ) {
      return;
    }
    this.activeElementId = nextElementId;
    this.activeTrackId = nextTrackId;
    this.emit();
  }

  /**
   * Creates a neutral editor track for a newly selected element. The track is
   * stored only in the Animation DSL; the Excalidraw element remains untouched.
   */
  ensureElementTrack(element: AnimationInspectorElement): AnimationTrack {
    const existingTrack = this.getElementTrack(element.id);
    if (existingTrack) {
      return existingTrack;
    }

    const track: AnimationTrack = {
      id: `element-${element.id}-animation`,
      name: `${element.type} · ${element.id.slice(0, 6)}`,
      description: "Editable animation track",
      target: { type: "element", elementId: element.id },
      startMs: 0,
      durationMs: DEFAULT_ANIMATION_PROJECT_DURATION_MS,
      properties: [],
    };
    const tracks = [...this.project.tracks, track];
    this.project = animationProjectSchema.parse({
      ...this.project,
      durationMs: Math.max(
        this.project.durationMs,
        DEFAULT_ANIMATION_PROJECT_DURATION_MS,
      ),
      tracks,
    });
    if (this.activeElementId === element.id) {
      this.activeTrackId = track.id;
    }
    this.emit();
    void this.rebuildRuntime(false, this.timeMs);
    return track;
  }

  setElementPropertyKeyframe(
    elementId: string,
    property: NumericAnimationPropertyName,
    value: number,
    timeMs = this.timeMs,
  ): void {
    const track = this.getElementTrack(elementId);
    if (!track) {
      return;
    }
    this.pendingElementBackgroundColors.delete(elementId);
    this.loadProject(
      setNumericKeyframe(this.project, track.id, property, timeMs, value),
      false,
      timeMs,
    );
  }

  setElementColorKeyframe(
    elementId: string,
    property: "visual.backgroundColor",
    value: string,
    timeMs = this.timeMs,
  ): void {
    const track = this.getElementTrack(elementId);
    if (!track) {
      return;
    }
    this.loadProject(
      setColorKeyframe(this.project, track.id, property, timeMs, value),
      false,
      timeMs,
    );
  }

  /**
   * Stages a color picked from Excalidraw's canvas properties panel. The
   * persistent element is restored by AppSidebar; only this render state is
   * previewed until the user adds a keyframe at the playhead.
   */
  stageElementBackgroundColor(elementId: string, value: string): boolean {
    const track = this.getElementTrack(elementId);
    if (
      !track?.properties?.some(
        (property) => property.property === "visual.backgroundColor",
      )
    ) {
      return false;
    }
    const relativeTimeMs = Math.max(
      0,
      this.timeMs - getTrackAbsoluteStartMs(this.project, track),
    );
    const hasKeyframeAtPlayhead = track.properties
      .find((property) => property.property === "visual.backgroundColor")
      ?.keyframes.some((keyframe) => keyframe.atMs === relativeTimeMs);
    if (hasKeyframeAtPlayhead) {
      this.setElementColorKeyframe(
        elementId,
        "visual.backgroundColor",
        value,
        this.timeMs,
      );
      return true;
    }
    const runtimeValue = this.values[elementId]?.visual.backgroundColor;
    const baseline =
      this.pendingElementBackgroundColors.get(elementId)?.baseline ??
      runtimeValue ??
      getColorPropertyValue(
        track,
        "visual.backgroundColor",
        this.timeMs,
        this.project,
        "#00000000",
      );
    this.pendingElementBackgroundColors.set(elementId, {
      atMs: this.timeMs,
      baseline,
      value,
    });
    this.store.patch(elementId, { backgroundColor: value });
    return true;
  }

  setElementFillStyleKeyframe(
    elementId: string,
    value: AnimationFillStyle,
    timeMs = this.timeMs,
  ): void {
    const track = this.getElementTrack(elementId);
    if (!track) {
      return;
    }
    this.pendingElementFillStyles.delete(elementId);
    this.loadProject(
      setFillStyleKeyframe(this.project, track.id, timeMs, value),
      false,
      timeMs,
    );
  }

  stageElementFillStyle(elementId: string, value: AnimationFillStyle): boolean {
    const track = this.getElementTrack(elementId);
    const property = track?.properties?.find(
      (candidate) => candidate.property === "visual.fillStyle",
    );
    if (!track || !property) {
      return false;
    }
    const relativeTimeMs = Math.max(
      0,
      this.timeMs - getTrackAbsoluteStartMs(this.project, track),
    );
    if (
      property.keyframes.some((keyframe) => keyframe.atMs === relativeTimeMs)
    ) {
      this.setElementFillStyleKeyframe(elementId, value, this.timeMs);
      return true;
    }
    const baseline =
      this.pendingElementFillStyles.get(elementId)?.baseline ??
      this.values[elementId]?.visual.fillStyle ??
      getFillStylePropertyValue(track, this.timeMs, this.project, "hachure");
    this.pendingElementFillStyles.set(elementId, {
      atMs: this.timeMs,
      baseline,
      value,
    });
    this.store.patch(elementId, { fillStyle: value });
    return true;
  }

  /**
   * Stages direct canvas transforms without touching the Animation DSL.
   * A property is committed only when its diamond is clicked in the timeline.
   */
  stageElementTransform(
    elementId: string,
    changes: {
      xDelta?: number;
      yDelta?: number;
      scaleMultiplier?: number;
      rotationDelta?: number;
    },
  ): boolean {
    const track = this.getElementTrack(elementId);
    if (!track) {
      return false;
    }
    const existing = this.pendingElementTransforms.get(elementId);
    const pending: PendingElementTransform =
      existing?.atMs === this.timeMs
        ? existing
        : { atMs: this.timeMs, properties: {} };
    const runtimeValue = this.values[elementId];
    const currentState = this.store.get(elementId);
    const stage = (
      property: NumericAnimationPropertyName,
      nextValue: (current: number) => number,
    ) => {
      const current =
        pending.properties[property]?.value ??
        (runtimeValue
          ? readRuntimeNumericProperty(runtimeValue, property)
          : getNumericPropertyValue(
              this.project,
              track,
              property,
              this.timeMs,
            ));
      pending.properties[property] = {
        baseline: pending.properties[property]?.baseline ?? current,
        value: nextValue(current),
      };
    };

    if (changes.xDelta) {
      stage("transform.x", (value) => value + changes.xDelta!);
    }
    if (changes.yDelta) {
      stage("transform.y", (value) => value + changes.yDelta!);
    }
    if (
      changes.scaleMultiplier !== undefined &&
      changes.scaleMultiplier !== 1
    ) {
      stage("transform.scale", (value) => value * changes.scaleMultiplier!);
    }
    if (changes.rotationDelta) {
      stage("transform.rotate", (value) => value + changes.rotationDelta!);
    }
    if (Object.keys(pending.properties).length === 0) {
      return false;
    }
    this.pendingElementTransforms.set(elementId, pending);
    this.store.patch(elementId, {
      ...(changes.xDelta
        ? { xOffset: (currentState?.xOffset ?? 0) + changes.xDelta }
        : {}),
      ...(changes.yDelta
        ? { yOffset: (currentState?.yOffset ?? 0) + changes.yDelta }
        : {}),
      ...(changes.scaleMultiplier !== undefined && changes.scaleMultiplier !== 1
        ? { scale: (currentState?.scale ?? 1) * changes.scaleMultiplier }
        : {}),
      ...(changes.rotationDelta
        ? { rotation: (currentState?.rotation ?? 0) + changes.rotationDelta }
        : {}),
    });
    return true;
  }

  addTrackPropertyKeyframe(
    trackId: string,
    property: EditableAnimationPropertyName,
    timeMs = this.timeMs,
    initialValue?: string | number,
  ): void {
    const track = this.project.tracks.find(
      (candidate) => candidate.id === trackId,
    );
    const propertyExists = track?.properties?.some(
      (candidate) => candidate.property === property,
    );
    if (
      property === "transition.color" ||
      property === "visual.strokeColor" ||
      property === "visual.strokeStyle" ||
      property === "visual.roundness" ||
      property === "text.fontFamily" ||
      property === "text.textAlign" ||
      property === "text.verticalAlign"
    ) {
      if (!propertyExists && initialValue !== undefined && track) {
        const nextProject =
          property === "visual.strokeColor" || property === "transition.color"
            ? setColorKeyframe(
                this.project,
                trackId,
                property,
                timeMs,
                String(initialValue),
              )
            : setDiscreteStyleKeyframe(
                this.project,
                trackId,
                property,
                timeMs,
                initialValue as never,
              );
        this.loadProject(nextProject, false, timeMs);
        return;
      }
      this.loadProject(
        addEditableKeyframe(this.project, trackId, property, timeMs),
        false,
        timeMs,
      );
      return;
    }
    if (property === "visual.backgroundColor") {
      const elementId =
        track?.target.type === "element" ? track.target.elementId : undefined;
      const pending = elementId
        ? this.pendingElementBackgroundColors.get(elementId)
        : undefined;
      if (track && pending?.atMs === timeMs) {
        let nextProject = this.project;
        const trackStartMs = getTrackAbsoluteStartMs(this.project, track);
        const propertyExists = track.properties?.some(
          (candidate) => candidate.property === property,
        );
        if (!propertyExists && timeMs > trackStartMs) {
          nextProject = setColorKeyframe(
            nextProject,
            trackId,
            property,
            trackStartMs,
            pending.baseline,
          );
        }
        nextProject = setColorKeyframe(
          nextProject,
          trackId,
          property,
          timeMs,
          pending.value,
        );
        this.pendingElementBackgroundColors.delete(elementId!);
        this.loadProject(nextProject, false, timeMs);
      } else {
        this.loadProject(
          !propertyExists && initialValue !== undefined
            ? setColorKeyframe(
                this.project,
                trackId,
                property,
                timeMs,
                String(initialValue),
              )
            : addEditableKeyframe(this.project, trackId, property, timeMs),
          false,
          timeMs,
        );
      }
      return;
    }
    if (property === "visual.fillStyle") {
      const elementId =
        track?.target.type === "element" ? track.target.elementId : undefined;
      const pending = elementId
        ? this.pendingElementFillStyles.get(elementId)
        : undefined;
      if (track && pending?.atMs === timeMs) {
        let nextProject = this.project;
        const trackStartMs = getTrackAbsoluteStartMs(this.project, track);
        const propertyExists = track.properties?.some(
          (candidate) => candidate.property === property,
        );
        if (!propertyExists && timeMs > trackStartMs) {
          nextProject = setFillStyleKeyframe(
            nextProject,
            trackId,
            trackStartMs,
            pending.baseline,
          );
        }
        nextProject = setFillStyleKeyframe(
          nextProject,
          trackId,
          timeMs,
          pending.value,
        );
        this.pendingElementFillStyles.delete(elementId!);
        this.loadProject(nextProject, false, timeMs);
      } else {
        this.loadProject(
          !propertyExists && initialValue !== undefined
            ? setFillStyleKeyframe(
                this.project,
                trackId,
                timeMs,
                initialValue as AnimationFillStyle,
              )
            : addEditableKeyframe(this.project, trackId, property, timeMs),
          false,
          timeMs,
        );
      }
      return;
    }
    if (property === "element.visibility") {
      this.loadProject(
        addEditableKeyframe(this.project, trackId, property, timeMs),
        false,
        timeMs,
      );
      return;
    }
    const nextProject = this.withTrackPropertyKeyframe(
      this.project,
      trackId,
      property,
      timeMs,
      initialValue,
    );
    if (nextProject !== this.project) {
      this.loadProject(nextProject, false, timeMs);
    }
  }

  addTrackPositionKeyframe(trackId: string, timeMs = this.timeMs): void {
    const nextProject = POSITION_ANIMATION_PROPERTIES.reduce(
      (project, property) =>
        this.withTrackPropertyKeyframe(project, trackId, property, timeMs),
      this.project,
    );
    if (nextProject !== this.project) {
      this.loadProject(nextProject, false, timeMs);
    }
  }

  removeElementProperty(
    elementId: string,
    property: AnimationPropertyName,
  ): void {
    const track = this.getElementTrack(elementId);
    if (!track) {
      return;
    }
    this.loadProject(
      removeAnimationProperty(this.project, track.id, property),
      false,
      this.timeMs,
    );
  }

  setElementAnimation(
    element: AnimationInspectorElement,
    config: AnimationInspectorConfig,
  ): void {
    this.pendingElementTransforms.delete(element.id);
    this.pendingElementBackgroundColors.delete(element.id);
    this.pendingElementFillStyles.delete(element.id);
    const generated = generateInspectorAnimation(element, config);
    const track = generated.tracks[0];
    const tracks = [
      ...this.project.tracks.filter(
        (candidate) =>
          candidate.target.type !== "element" ||
          candidate.target.elementId !== element.id,
      ),
      track,
    ];
    this.project = animationProjectSchema.parse({
      ...this.project,
      durationMs: Math.max(
        DEFAULT_ANIMATION_PROJECT_DURATION_MS,
        getProjectDuration(tracks),
      ),
      tracks,
    });
    this.emit();
    void this.rebuildRuntime(true, 0);
  }

  removeElementAnimation(elementId: string): void {
    this.pendingElementTransforms.delete(elementId);
    this.pendingElementBackgroundColors.delete(elementId);
    this.pendingElementFillStyles.delete(elementId);
    const tracks = this.project.tracks.filter(
      (track) =>
        track.target.type !== "element" || track.target.elementId !== elementId,
    );
    this.project = {
      ...this.project,
      durationMs: Math.max(
        DEFAULT_ANIMATION_PROJECT_DURATION_MS,
        getProjectDuration(tracks),
      ),
      tracks,
    };
    this.store.delete(elementId);
    this.emit();
    void this.rebuildRuntime(false, this.timeMs);
  }

  removeElementAnimations(elementIds: ReadonlySet<string>): void {
    if (elementIds.size === 0) {
      return;
    }
    const removedElementIds = new Set<string>();
    const tracks = this.project.tracks.filter((track) => {
      if (track.target.type !== "element") {
        return true;
      }
      const shouldRemove = elementIds.has(track.target.elementId);
      if (shouldRemove) {
        removedElementIds.add(track.target.elementId);
      }
      return !shouldRemove;
    });
    if (removedElementIds.size === 0) {
      return;
    }
    removedElementIds.forEach((elementId) => {
      this.pendingElementTransforms.delete(elementId);
      this.pendingElementBackgroundColors.delete(elementId);
      this.pendingElementFillStyles.delete(elementId);
      this.store.delete(elementId);
    });
    if (this.activeElementId && removedElementIds.has(this.activeElementId)) {
      this.activeElementId = undefined;
    }
    this.project = animationProjectSchema.parse({
      ...this.project,
      durationMs: Math.max(
        DEFAULT_ANIMATION_PROJECT_DURATION_MS,
        getProjectDuration(tracks),
      ),
      tracks,
    });
    this.emit();
    void this.rebuildRuntime(false, this.timeMs);
  }

  removeObjectAndAnimations(trackId: string): string[] {
    const elementIds = this.getTrackTargetElementIds(trackId);
    const targetElementIds = new Set(elementIds);
    const tracks = this.project.tracks.filter(
      (track) =>
        track.id !== trackId &&
        !(
          track.target.type === "element" &&
          targetElementIds.has(track.target.elementId)
        ),
    );

    elementIds.forEach((elementId) => {
      this.pendingElementTransforms.delete(elementId);
      this.pendingElementBackgroundColors.delete(elementId);
      this.pendingElementFillStyles.delete(elementId);
      this.store.delete(elementId);
    });
    if (this.activeElementId && targetElementIds.has(this.activeElementId)) {
      this.activeElementId = undefined;
    }
    if (this.activeTrackId === trackId) {
      this.activeTrackId = undefined;
    }
    this.project = animationProjectSchema.parse({
      ...this.project,
      durationMs: Math.max(
        DEFAULT_ANIMATION_PROJECT_DURATION_MS,
        getProjectDuration(tracks),
      ),
      tracks,
    });
    this.emit();
    void this.rebuildRuntime(false, this.timeMs);
    return elementIds;
  }

  async preview(): Promise<void> {
    if (!this.runtime) {
      await this.rebuildRuntime(true);
      return;
    }
    this.runtime.stop();
    await this.runtime.play();
  }

  async play(): Promise<boolean | void> {
    if (!this.runtime) {
      await this.rebuildRuntime(true, this.timeMs);
      return;
    }
    return this.runtime.play();
  }

  pause(): void {
    this.runtime?.pause();
  }

  seek(timeMs: number): void {
    const nextTimeMs = clamp(timeMs, 0, this.project.durationMs);
    if (nextTimeMs !== this.timeMs) {
      this.pendingElementTransforms.clear();
      this.pendingElementBackgroundColors.clear();
      this.pendingElementFillStyles.clear();
    }
    this.timeMs = nextTimeMs;
    if (this.runtime) {
      this.runtime.seek(nextTimeMs);
    } else {
      this.emit();
    }
  }

  dispose(): void {
    this.generation++;
    this.cleanupRuntime();
    this.disconnectRenderer?.();
    this.disconnectRenderer = undefined;
    this.store.clear();
    this.pendingElementTransforms.clear();
    this.pendingElementBackgroundColors.clear();
    this.pendingElementFillStyles.clear();
    this.listeners.clear();
  }

  private async rebuildRuntime(
    autoplay: boolean,
    seekTimeMs = this.timeMs,
  ): Promise<void> {
    const generation = ++this.generation;
    const targetTimeMs = clamp(seekTimeMs, 0, this.project.durationMs);
    this.cleanupRuntime(true);
    if (this.project.tracks.length === 0) {
      this.store.clear();
      this.status = "idle";
      this.timeMs = targetTimeMs;
      this.error = undefined;
      this.emit();
      return;
    }

    this.ensureRendererConnected();
    const nextElementIds = new Set(getElementIds(this.project));
    for (const elementId of this.store.keys()) {
      if (!nextElementIds.has(elementId)) {
        this.store.delete(elementId);
      }
    }
    this.status = "loading";
    this.error = undefined;
    this.timeMs = targetTimeMs;
    this.emit();
    try {
      const runtime = await this.runtimeFactory(this.project);
      if (generation !== this.generation) {
        runtime.dispose();
        return;
      }
      this.runtime = runtime;
      for (const elementId of getElementIds(this.project)) {
        this.bindings.bind(elementId, runtime, {
          animatedProperties: getAnimatedProperties(this.project, elementId),
          externallySynchronized: true,
        });
      }
      this.unsubscribeRuntime = runtime.subscribe((snapshot) =>
        this.applyRuntimeSnapshot(snapshot),
      );
      if (autoplay) {
        runtime.seek(targetTimeMs);
        void runtime.play().catch((cause) => this.fail(cause, generation));
      } else {
        runtime.seek(targetTimeMs);
      }
    } catch (cause) {
      this.fail(cause, generation);
    }
  }

  private applyRuntimeSnapshot(snapshot: AnimationRuntimeSnapshot): void {
    // Keep the render-only element state on the exact same observable tick as
    // the transport. If the playhead moved, canvas bindings have already been
    // synchronized before React renders the new timeline position.
    this.bindings.sync(snapshot);
    for (const [elementId, pending] of this.pendingElementTransforms) {
      if (pending.atMs !== snapshot.timeMs) {
        continue;
      }
      const runtimeValue = snapshot.values[elementId];
      const state = this.store.get(elementId);
      if (!runtimeValue || !state) {
        continue;
      }
      const x = pending.properties["transform.x"];
      const y = pending.properties["transform.y"];
      const scale = pending.properties["transform.scale"];
      const rotation = pending.properties["transform.rotate"];
      this.store.patch(elementId, {
        ...(x
          ? {
              xOffset: state.xOffset + (x.value - runtimeValue.transform.x),
            }
          : {}),
        ...(y
          ? {
              yOffset: state.yOffset + (y.value - runtimeValue.transform.y),
            }
          : {}),
        ...(scale ? { scale: scale.value } : {}),
        ...(rotation
          ? {
              rotation:
                state.rotation +
                (rotation.value - runtimeValue.transform.rotate),
            }
          : {}),
      });
    }
    for (const [elementId, pending] of this.pendingElementBackgroundColors) {
      if (pending.atMs === snapshot.timeMs && this.store.get(elementId)) {
        this.store.patch(elementId, { backgroundColor: pending.value });
      }
    }
    for (const [elementId, pending] of this.pendingElementFillStyles) {
      if (pending.atMs === snapshot.timeMs && this.store.get(elementId)) {
        this.store.patch(elementId, { fillStyle: pending.value });
      }
    }
    this.status = snapshot.status;
    this.timeMs = snapshot.timeMs;
    this.values = snapshot.values;
    this.emit();
  }

  private withTrackPropertyKeyframe(
    project: AnimationProject,
    trackId: string,
    property: NumericAnimationPropertyName,
    timeMs: number,
    initialValue?: string | number,
  ): AnimationProject {
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    if (!track) {
      return project;
    }
    const elementId =
      track.target.type === "element" ? track.target.elementId : undefined;
    const pending = elementId
      ? this.pendingElementTransforms.get(elementId)
      : undefined;
    const pendingProperty =
      pending?.atMs === timeMs ? pending.properties[property] : undefined;
    if (!pendingProperty) {
      return !track.properties?.some(
        (candidate) => candidate.property === property,
      ) && typeof initialValue === "number"
        ? setNumericKeyframe(project, trackId, property, timeMs, initialValue)
        : addKeyframe(project, trackId, property, timeMs);
    }

    let nextProject = project;
    const propertyExists = track.properties?.some(
      (candidate) => candidate.property === property,
    );
    if (!propertyExists && timeMs > getTrackAbsoluteStartMs(project, track)) {
      nextProject = setNumericKeyframe(
        nextProject,
        trackId,
        property,
        getTrackAbsoluteStartMs(project, track),
        pendingProperty.baseline,
      );
    }
    nextProject = setNumericKeyframe(
      nextProject,
      trackId,
      property,
      timeMs,
      pendingProperty.value,
    );
    delete pending!.properties[property];
    if (Object.keys(pending!.properties).length === 0) {
      this.pendingElementTransforms.delete(elementId!);
    }
    return nextProject;
  }

  private fail(cause: unknown, generation: number): void {
    if (generation !== this.generation) {
      return;
    }
    this.status = "error";
    this.error = cause instanceof Error ? cause.message : String(cause);
    this.emit();
  }

  private ensureRendererConnected(): void {
    this.disconnectRenderer ??= this.renderer.connect();
  }

  private cleanupRuntime(preserveState = false): void {
    this.unsubscribeRuntime?.();
    this.unsubscribeRuntime = undefined;
    this.bindings.dispose({ preserveState });
    this.runtime?.dispose();
    this.runtime = undefined;
  }

  private emit(): void {
    this.snapshot = {
      project: this.project,
      status: this.status,
      timeMs: this.timeMs,
      values: this.values,
      ...(this.error ? { error: this.error } : {}),
      ...(this.activeElementId
        ? { activeElementId: this.activeElementId }
        : {}),
      ...(this.activeTrackId ? { activeTrackId: this.activeTrackId } : {}),
    };
    this.listeners.forEach((listener) => listener());
  }
}

const getElementIds = (project: AnimationProject) =>
  Array.from(
    new Set(
      project.tracks.flatMap((track) =>
        track.target.type === "element"
          ? [track.target.elementId]
          : track.target.type === "group"
          ? resolveWorkspaceGroup(project, track.target.groupId)
          : [],
      ),
    ),
  );

const getAnimatedProperties = (
  project: AnimationProject,
  elementId: string,
): Set<AnimationPropertyName> =>
  new Set(
    project.tracks.flatMap((track) =>
      (
        track.target.type === "element"
          ? track.target.elementId === elementId
          : track.target.type === "group" &&
            resolveWorkspaceGroup(project, track.target.groupId).includes(
              elementId,
            )
      )
        ? (track.properties ?? []).map((property) => property.property)
        : [],
    ),
  );

const resolveWorkspaceGroup = (
  project: AnimationProject,
  groupId: string,
  ancestry = new Set<string>(),
): string[] => {
  if (ancestry.has(groupId)) {
    return [];
  }
  const group = project.groups?.find((candidate) => candidate.id === groupId);
  if (!group) {
    return [];
  }
  const nextAncestry = new Set(ancestry).add(groupId);
  return group.members.flatMap((member) =>
    member.type === "element"
      ? [member.elementId]
      : resolveWorkspaceGroup(project, member.groupId, nextAncestry),
  );
};

const getProjectDuration = (tracks: AnimationTrack[]) =>
  Math.max(
    1,
    ...tracks.map((track) => {
      const contentEnd = Math.max(
        0,
        ...(track.properties ?? []).flatMap((property) =>
          property.keyframes.map((keyframe) => keyframe.atMs),
        ),
        ...(track.presets ?? []).map(
          (preset) => preset.atMs + preset.durationMs,
        ),
        ...(track.loops ?? []).map((loop) =>
          loop.iterations === "infinite"
            ? track.durationMs ?? loop.durationMs
            : (loop.atMs ?? 0) +
              (loop.durationMs + (loop.delayMs ?? 0)) * loop.iterations,
        ),
      );
      return (track.startMs ?? 0) + (track.durationMs ?? contentEnd);
    }),
  );

const readRuntimeNumericProperty = (
  value: AnimationRuntimeObjectValue,
  property: NumericAnimationPropertyName,
): number => {
  switch (property) {
    case "camera.centerX":
      return value.camera.centerX;
    case "camera.centerY":
      return value.camera.centerY;
    case "camera.zoom":
      return value.camera.zoom;
    case "transform.x":
      return value.transform.x;
    case "transform.y":
      return value.transform.y;
    case "transform.scale":
      return value.transform.scale;
    case "transform.rotate":
      return value.transform.rotate;
    case "visual.opacity":
      return value.visual.opacity;
    case "visual.strokeWidth":
      return value.visual.strokeWidth;
    case "visual.roughness":
      return value.visual.roughness;
    case "text.fontSize":
      return value.text.fontSize;
    case "text.fontFamily":
      return value.text.fontFamily;
    case "advanced.drawProgress":
      return value.advanced.drawProgress;
    case "advanced.blur":
      return value.advanced.blur;
    case "transition.progress":
      return value.transition.progress;
    case "transition.opacity":
      return value.transition.opacity;
    case "transition.blur":
      return value.transition.blur;
    case "transition.scale":
      return value.transition.scale;
  }
};

export const animationWorkspace = new AnimationWorkspace();

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
