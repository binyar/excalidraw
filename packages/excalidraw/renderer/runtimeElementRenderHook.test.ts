import rough from "roughjs/bin/rough";

import {
  getCornerRadius,
  ShapeCache,
  mutateElement,
} from "@excalidraw/element";

import type { NonDeletedSceneElementsMap } from "@excalidraw/element/types";

import { getDefaultAppState } from "../appState";
import { API } from "../tests/helpers/api";

import { ExcalidrawRendererAdapter } from "../../../src/animation/excalidraw/RendererAdapter";
import { RuntimeStateStore } from "../../../src/animation/excalidraw/RuntimeStateStore";
import { AnimationWorkspace } from "../../../src/animation/inspector/AnimationWorkspace";

import { renderStaticScene } from "./staticScene";
import {
  isRuntimeElementVisible,
  projectRuntimeElementsForRender,
  projectRuntimeElementsMapForRender,
} from "./runtimeElementRenderHook";

import type { RenderableElementsMap } from "../scene/types";
import type { StaticCanvasAppState } from "../types";

describe("runtime element canvas rendering", () => {
  it("removes hidden and fully transparent elements from render projections", () => {
    const hidden = API.createElement({
      id: "hidden-rectangle",
      type: "rectangle",
    });
    const transparent = API.createElement({
      id: "transparent-rectangle",
      type: "rectangle",
      opacity: 0,
    });
    const visible = API.createElement({
      id: "visible-rectangle",
      type: "rectangle",
    });
    const source = new Map([
      [hidden.id, hidden],
      [transparent.id, transparent],
      [visible.id, visible],
    ]);
    const store = new RuntimeStateStore();
    const disconnect = new ExcalidrawRendererAdapter(store).connect();
    store.patch(hidden.id, { visibility: "hidden" });

    expect(isRuntimeElementVisible(hidden)).toBe(false);
    expect(isRuntimeElementVisible(transparent)).toBe(false);
    expect(projectRuntimeElementsForRender([...source.values()])).toEqual([
      visible,
    ]);
    const projectedMap = projectRuntimeElementsMapForRender(source);
    expect(projectedMap.size).toBe(1);
    expect(projectedMap.has(hidden.id)).toBe(false);
    expect(projectedMap.get(hidden.id)).toBeUndefined();
    expect([...projectedMap.keys()]).toEqual([visible.id]);
    disconnect();
  });

  it("overlays only active runtime elements without cloning the scene map", () => {
    const element = API.createElement({
      id: "mapped-rectangle",
      type: "rectangle",
      x: 20,
      y: 30,
      width: 100,
      height: 60,
    });
    const source = new Map([[element.id, element]]);
    for (let index = 0; index < 100; index++) {
      const inertElement = API.createElement({
        id: `inert-${index}`,
        type: "rectangle",
        x: index * 10,
        y: 200,
        width: 10,
        height: 10,
      });
      source.set(inertElement.id, inertElement);
    }
    const store = new RuntimeStateStore();
    const renderer = new ExcalidrawRendererAdapter(store);
    const projectElement = vi.spyOn(renderer, "projectElement");
    const disconnect = renderer.connect();
    store.patch(element.id, { xOffset: 80 });

    const projected = projectRuntimeElementsMapForRender(source);

    expect(projectElement).toHaveBeenCalledTimes(1);
    expect(projected).not.toBe(source);
    expect(projected.size).toBe(source.size);
    expect(projected.get(element.id)?.x).toBe(100);
    expect([...projected.values()][0].x).toBe(100);
    expect(source.get(element.id)?.x).toBe(20);
    const projectedElementBeforeDrag = projected.get(element.id);

    // Excalidraw updates the same element object during pointer drag. The
    // render projection must follow its incremented version immediately.
    mutateElement(element, source, { x: 45 }, { isDragging: true });
    projectElement.mockClear();
    const projectedAfterDrag = projectRuntimeElementsMapForRender(source);

    expect(projectElement).toHaveBeenCalledTimes(1);
    expect(projectedAfterDrag.get(element.id)?.x).toBe(125);
    expect(projectedAfterDrag.get(element.id)).toBe(projectedElementBeforeDrag);
    disconnect();
  });

  it("moves the final canvas blit when runtime x changes", () => {
    const element = API.createElement({
      id: "animated-rectangle",
      type: "rectangle",
      x: 20,
      y: 30,
      width: 100,
      height: 60,
    });
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D & {
      __getEvents(): Array<{ type: string; props: Record<string, number> }>;
    };
    const elementsMap = new Map([[element.id, element]]);
    const store = new RuntimeStateStore();
    const disconnect = new ExcalidrawRendererAdapter(store).connect();
    const render = () =>
      renderStaticScene({
        canvas,
        rc: rough.canvas(canvas),
        elementsMap: elementsMap as RenderableElementsMap,
        allElementsMap: elementsMap as NonDeletedSceneElementsMap,
        visibleElements: [element],
        scale: 1,
        appState: {
          ...getDefaultAppState(),
          width: 800,
          height: 600,
        } as unknown as StaticCanvasAppState,
        renderConfig: {
          imageCache: new Map(),
          isExporting: false,
          renderGrid: false,
          renderLinks: false,
          canvasBackgroundColor: "#ffffff",
          embedsValidationStatus: new Map(),
          elementsPendingErasure: new Set(),
          pendingFlowchartNodes: null,
          theme: "light",
        },
      });

    render();
    const originalDrawX = context
      .__getEvents()
      .find((event) => event.type === "drawImage")?.props.dx;
    store.set(element.id, {
      visibility: "visible",
      xOffset: 120,
      yOffset: 0,
      scale: 1,
      opacity: 1,
      rotation: 0,
      drawProgress: 1,
    });
    render();
    const animatedDrawX = context
      .__getEvents()
      .filter((event) => event.type === "drawImage")
      .at(-1)?.props.dx;

    expect(animatedDrawX).toBe((originalDrawX ?? 0) + 120);
    disconnect();
  });

  it("regenerates the painted shape with the runtime background color and fill style", () => {
    const element = API.createElement({
      id: "animated-background-rectangle",
      type: "rectangle",
      x: 20,
      y: 30,
      width: 100,
      height: 60,
      backgroundColor: "transparent",
    });
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const elementsMap = new Map([[element.id, element]]);
    const store = new RuntimeStateStore();
    const disconnect = new ExcalidrawRendererAdapter(store).connect();
    const generateShape = vi.spyOn(ShapeCache, "generateElementShape");
    store.patch(element.id, {
      backgroundColor: "#ffec99",
      fillStyle: "solid",
    });

    renderStaticScene({
      canvas,
      rc: rough.canvas(canvas),
      elementsMap: elementsMap as RenderableElementsMap,
      allElementsMap: elementsMap as NonDeletedSceneElementsMap,
      visibleElements: [element],
      scale: 1,
      appState: {
        ...getDefaultAppState(),
        width: 800,
        height: 600,
      } as unknown as StaticCanvasAppState,
      renderConfig: {
        imageCache: new Map(),
        isExporting: false,
        renderGrid: false,
        renderLinks: false,
        canvasBackgroundColor: "#ffffff",
        embedsValidationStatus: new Map(),
        elementsPendingErasure: new Set(),
        pendingFlowchartNodes: null,
        theme: "light",
      },
    });

    expect(
      generateShape.mock.calls.some(
        ([renderedElement]) =>
          renderedElement.id === element.id &&
          renderedElement.backgroundColor === "#ffec99" &&
          renderedElement.fillStyle === "solid",
      ),
    ).toBe(true);
    generateShape.mockRestore();
    disconnect();
  });

  it("renders interpolated and discrete appearance keyframes from the workspace", async () => {
    const element = API.createElement({
      id: "animated-style-rectangle",
      type: "rectangle",
      x: 20,
      y: 30,
      width: 100,
      height: 60,
      backgroundColor: "#ff0000",
      fillStyle: "hachure",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      roundness: null,
    });
    const workspace = new AnimationWorkspace();
    workspace.loadProject({
      schemaVersion: "1.0",
      id: "canvas-style-test",
      durationMs: 1000,
      frameRate: 60,
      tracks: [
        {
          id: "rectangle-style",
          target: { type: "element", elementId: element.id },
          durationMs: 1000,
          properties: [
            {
              property: "visual.backgroundColor",
              keyframes: [
                {
                  atMs: 0,
                  value: "#FF0000FF",
                  easing: { type: "preset", name: "linear" },
                },
                { atMs: 1000, value: "#0000FFFF" },
              ],
            },
            {
              property: "visual.strokeWidth",
              keyframes: [
                {
                  atMs: 0,
                  value: 1,
                  easing: { type: "preset", name: "linear" },
                },
                { atMs: 1000, value: 5 },
              ],
            },
            {
              property: "visual.fillStyle",
              keyframes: [
                { atMs: 0, value: "hachure", hold: true },
                { atMs: 1000, value: "solid", hold: true },
              ],
            },
            {
              property: "visual.strokeStyle",
              keyframes: [
                { atMs: 0, value: "solid", hold: true },
                { atMs: 1000, value: "dotted", hold: true },
              ],
            },
            {
              property: "visual.roundness",
              keyframes: [
                {
                  atMs: 0,
                  value: "sharp",
                  hold: true,
                  easing: { type: "preset", name: "linear" },
                },
                { atMs: 1000, value: "round", hold: true },
              ],
            },
          ],
        },
      ],
    });
    await vi.waitFor(() =>
      expect(workspace.getSnapshot().status).not.toBe("loading"),
    );

    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const elementsMap = new Map([[element.id, element]]);
    const generateShape = vi.spyOn(ShapeCache, "generateElementShape");
    const render = () =>
      renderStaticScene({
        canvas,
        rc: rough.canvas(canvas),
        elementsMap: elementsMap as RenderableElementsMap,
        allElementsMap: elementsMap as NonDeletedSceneElementsMap,
        visibleElements: [element],
        scale: 1,
        appState: {
          ...getDefaultAppState(),
          width: 800,
          height: 600,
        } as unknown as StaticCanvasAppState,
        renderConfig: {
          imageCache: new Map(),
          isExporting: false,
          renderGrid: false,
          renderLinks: false,
          canvasBackgroundColor: "#ffffff",
          embedsValidationStatus: new Map(),
          elementsPendingErasure: new Set(),
          pendingFlowchartNodes: null,
          theme: "light",
        },
      });

    workspace.seek(250);
    render();
    const quarterFrame = generateShape.mock.calls
      .map(([renderedElement]) => renderedElement)
      .findLast((renderedElement) => renderedElement.id === element.id)!;
    expect(quarterFrame.strokeWidth).toBeCloseTo(2);
    expect(quarterFrame.backgroundColor).not.toBe("#FF0000FF");
    expect(quarterFrame.backgroundColor).not.toBe("#0000FFFF");
    expect(quarterFrame.fillStyle).toBe("hachure");
    expect(quarterFrame.strokeStyle).toBe("solid");
    expect(quarterFrame.roundness).toMatchObject({
      type: 3,
      value: 8,
    });
    expect(
      getCornerRadius(
        Math.min(quarterFrame.width, quarterFrame.height),
        quarterFrame,
      ),
    ).toBeCloseTo(8);
    const quarterShape = JSON.stringify(
      generateShape.mock.results.findLast((result) => result.value)?.value,
    );

    generateShape.mockClear();
    workspace.seek(1000);
    render();
    const endpoint = generateShape.mock.calls
      .map(([renderedElement]) => renderedElement)
      .findLast((renderedElement) => renderedElement.id === element.id)!;
    expect(endpoint).toMatchObject({
      backgroundColor: "#0000FFFF",
      strokeWidth: 5,
      fillStyle: "solid",
      strokeStyle: "dotted",
      roundness: { type: expect.any(Number) },
    });
    expect(
      getCornerRadius(Math.min(endpoint.width, endpoint.height), endpoint),
    ).toBeCloseTo(15);
    expect(
      JSON.stringify(
        generateShape.mock.results.findLast((result) => result.value)?.value,
      ),
    ).not.toBe(quarterShape);

    generateShape.mockRestore();
    workspace.dispose();
  });

  it("moves the final canvas blit when the editor scrubs runtime time", async () => {
    const element = API.createElement({
      id: "scrubbed-rectangle",
      type: "rectangle",
      x: 20,
      y: 30,
      width: 100,
      height: 60,
    });
    const workspace = new AnimationWorkspace();
    workspace.loadProject({
      schemaVersion: "1.0",
      id: "canvas-scrub-test",
      durationMs: 1000,
      frameRate: 60,
      tracks: [
        {
          id: "rectangle-x",
          target: { type: "element", elementId: element.id },
          durationMs: 1000,
          properties: [
            {
              property: "transform.x",
              keyframes: [
                { atMs: 0, value: 0 },
                { atMs: 1000, value: 120 },
              ],
            },
          ],
        },
      ],
    });
    await vi.waitFor(() =>
      expect(workspace.getSnapshot().status).not.toBe("loading"),
    );

    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D & {
      __getEvents(): Array<{ type: string; props: Record<string, number> }>;
    };
    const elementsMap = new Map([[element.id, element]]);
    const render = () =>
      renderStaticScene({
        canvas,
        rc: rough.canvas(canvas),
        elementsMap: elementsMap as RenderableElementsMap,
        allElementsMap: elementsMap as NonDeletedSceneElementsMap,
        visibleElements: [element],
        scale: 1,
        appState: {
          ...getDefaultAppState(),
          width: 800,
          height: 600,
        } as unknown as StaticCanvasAppState,
        renderConfig: {
          imageCache: new Map(),
          isExporting: false,
          renderGrid: false,
          renderLinks: false,
          canvasBackgroundColor: "#ffffff",
          embedsValidationStatus: new Map(),
          elementsPendingErasure: new Set(),
          pendingFlowchartNodes: null,
          theme: "light",
        },
      });

    workspace.seek(0);
    render();
    const startX = context
      .__getEvents()
      .filter((event) => event.type === "drawImage")
      .at(-1)?.props.dx;
    workspace.seek(1000);
    render();
    const endX = context
      .__getEvents()
      .filter((event) => event.type === "drawImage")
      .at(-1)?.props.dx;

    expect(endX).toBe((startX ?? 0) + 120);
    workspace.dispose();
  });
});
