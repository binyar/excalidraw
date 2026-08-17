import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

export type RuntimeElementRenderAdapter = {
  projectElement<T extends NonDeletedExcalidrawElement>(element: T): T;
  projectElementForHitTest?<T extends NonDeletedExcalidrawElement>(
    element: T,
  ): T;
  unprojectPoint?(
    element: NonDeletedExcalidrawElement,
    point: Readonly<{ x: number; y: number }>,
  ): { x: number; y: number };
  getActiveElementIds?(): Iterable<string>;
  isElementVisible?(element: NonDeletedExcalidrawElement): boolean;
  subscribe(callback: () => void): () => void;
};

type RenderChangeListener = () => void;

let activeAdapter: RuntimeElementRenderAdapter | null = null;
let unsubscribeFromAdapter: (() => void) | null = null;
const listeners = new Set<RenderChangeListener>();

/**
 * Registers a process-local, render-only element projection.
 *
 * The renderer owns no animation state. When no adapter is registered this
 * hook is an identity function, preserving Excalidraw's normal render path.
 */
export const registerRuntimeElementRenderAdapter = (
  adapter: RuntimeElementRenderAdapter,
): (() => void) => {
  unsubscribeFromAdapter?.();
  activeAdapter = adapter;
  unsubscribeFromAdapter = adapter.subscribe(notifyListeners);
  notifyListeners();

  return () => {
    if (activeAdapter !== adapter) {
      return;
    }
    unsubscribeFromAdapter?.();
    unsubscribeFromAdapter = null;
    activeAdapter = null;
    notifyListeners();
  };
};

export const projectRuntimeElementForRender = <
  T extends NonDeletedExcalidrawElement,
>(
  element: T,
): T => activeAdapter?.projectElement(element) ?? element;

/**
 * Returns a stable snapshot for hit testing. Unlike the render projection,
 * this object must be replaced whenever Runtime state changes so collision
 * caches cannot reuse a result from an older animation pose.
 */
export const projectRuntimeElementForHitTest = <
  T extends NonDeletedExcalidrawElement,
>(
  element: T,
): T =>
  activeAdapter?.projectElementForHitTest?.(element) ??
  activeAdapter?.projectElement(element) ??
  element;

/** Runtime-hidden and fully transparent elements are absent from interaction. */
export const isRuntimeElementVisible = (
  element: NonDeletedExcalidrawElement,
): boolean => activeAdapter?.isElementVisible?.(element) ?? element.opacity > 0;

/** Maps a pointer on the rendered animation geometry back to base scene space. */
export const unprojectRuntimePointForElement = (
  element: NonDeletedExcalidrawElement,
  point: Readonly<{ x: number; y: number }>,
): { x: number; y: number } =>
  activeAdapter?.unprojectPoint?.(element, point) ?? point;

/**
 * Projects every animated member while preserving the original map identity
 * when no runtime transform is active. Only active animation ids are visited,
 * so creating a fresh overlay is O(animated elements), not O(scene elements).
 *
 * Do not cache this overlay by Map identity: Excalidraw mutates elements in
 * place while dragging, so a stable scene Map can contain newer element
 * versions on every pointer frame.
 */
export const projectRuntimeElementsMapForRender = <
  TMap extends Map<string, NonDeletedExcalidrawElement>,
>(
  elementsMap: TMap,
): TMap => {
  if (!activeAdapter) {
    return elementsMap;
  }

  const replacements = new Map<string, NonDeletedExcalidrawElement>();
  const hiddenIds = new Set<string>();
  const project = (element: NonDeletedExcalidrawElement, elementId: string) => {
    if (!isRuntimeElementVisible(element)) {
      hiddenIds.add(elementId);
      return;
    }
    const renderedElement = activeAdapter!.projectElement(element);
    if (renderedElement !== element) {
      replacements.set(elementId, renderedElement);
    }
  };
  const activeElementIds = activeAdapter.getActiveElementIds?.();
  if (activeElementIds) {
    for (const elementId of activeElementIds) {
      const element = elementsMap.get(elementId);
      if (element) {
        project(element, elementId);
      }
    }
    // Base opacity is persistent editor state rather than Runtime state, so it
    // is not guaranteed to be present in the adapter's active-id index.
    elementsMap.forEach((element, elementId) => {
      if (element.opacity <= 0) {
        hiddenIds.add(elementId);
      }
    });
  } else {
    elementsMap.forEach(project);
  }
  const result =
    replacements.size > 0 || hiddenIds.size > 0
      ? createProjectedMapOverlay(elementsMap, replacements, hiddenIds)
      : elementsMap;
  return result as TMap;
};

const createProjectedMapOverlay = <
  TMap extends Map<string, NonDeletedExcalidrawElement>,
>(
  source: TMap,
  replacements: ReadonlyMap<string, NonDeletedExcalidrawElement>,
  hiddenIds: ReadonlySet<string>,
): TMap => {
  const valueFor = (element: NonDeletedExcalidrawElement, elementId: string) =>
    replacements.get(elementId) ?? element;
  const overlay = new Proxy(source, {
    get(target, property) {
      if (property === "size") {
        return target.size - hiddenIds.size;
      }
      if (property === "get") {
        return (elementId: string) =>
          hiddenIds.has(elementId)
            ? undefined
            : replacements.get(elementId) ?? target.get(elementId);
      }
      if (property === "has") {
        return (elementId: string) =>
          !hiddenIds.has(elementId) && target.has(elementId);
      }
      if (property === "values") {
        return function* () {
          for (const [elementId, element] of target) {
            if (hiddenIds.has(elementId)) {
              continue;
            }
            yield valueFor(element, elementId);
          }
        };
      }
      if (property === "keys") {
        return function* () {
          for (const elementId of target.keys()) {
            if (!hiddenIds.has(elementId)) {
              yield elementId;
            }
          }
        };
      }
      if (property === "entries" || property === Symbol.iterator) {
        return function* () {
          for (const [elementId, element] of target) {
            if (hiddenIds.has(elementId)) {
              continue;
            }
            yield [elementId, valueFor(element, elementId)] as const;
          }
        };
      }
      if (property === "forEach") {
        return (
          callback: (
            element: NonDeletedExcalidrawElement,
            elementId: string,
            map: TMap,
          ) => void,
          thisArg?: unknown,
        ) =>
          target.forEach((element, elementId) => {
            if (hiddenIds.has(elementId)) {
              return;
            }
            callback.call(
              thisArg,
              valueFor(element, elementId),
              elementId,
              overlay,
            );
          });
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as TMap;
  return overlay;
};

export const projectRuntimeElementsForRender = <
  T extends NonDeletedExcalidrawElement,
>(
  elements: readonly T[],
): readonly T[] => {
  let changed = false;
  const projected: T[] = [];
  elements.forEach((element) => {
    if (!isRuntimeElementVisible(element)) {
      changed = true;
      return;
    }
    const renderedElement = projectRuntimeElementForRender(element);
    if (renderedElement !== element) {
      changed = true;
    }
    projected.push(renderedElement);
  });
  return changed ? projected : elements;
};

export const subscribeToRuntimeElementRenderChanges = (
  listener: RenderChangeListener,
): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notifyListeners = () => {
  listeners.forEach((listener) => listener());
};
