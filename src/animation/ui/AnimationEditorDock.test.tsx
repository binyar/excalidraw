import { fireEvent, render, screen } from "@testing-library/react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  AnimationEditorDock,
  areAnimationPanelPlaybackPropsEqual,
  clearCanvasSelectionForPlayback,
  deleteCanvasElementsForTrack,
  selectCanvasElementsForTrack,
  updateAnimationPanelPlaybackUi,
} from "./AnimationEditorDock";

import type { AnimationPanelProps } from "./AnimationPanel";
import type { AnimationProject } from "../types";

describe("AnimationEditorDock", () => {
  it("skips rebuilding the timeline tree for playback-clock-only updates", () => {
    const project = { durationMs: 1000 } as AnimationProject;
    const base = {
      project,
      currentTimeMs: 100,
      isPlaying: true,
      playback: {},
      onProjectChange: vi.fn(),
    } as unknown as AnimationPanelProps;

    expect(
      areAnimationPanelPlaybackPropsEqual(base, {
        ...base,
        currentTimeMs: 500,
      }),
    ).toBe(true);
    expect(
      areAnimationPanelPlaybackPropsEqual(
        { ...base, isPlaying: false },
        { ...base, isPlaying: false, currentTimeMs: 500 },
      ),
    ).toBe(false);
  });

  it("advances lightweight playback UI without a React timeline render", () => {
    const dock = document.createElement("div");
    dock.innerHTML = `
      <section class="animation-panel">
        <output class="animation-panel__time"><strong></strong></output>
        <div class="animation-panel__ruler">
          <input type="range" max="1000" />
          <output class="animation-panel__ruler-playhead-label"></output>
        </div>
      </section>`;

    updateAnimationPanelPlaybackUi(dock, 625, 1000);

    expect(
      dock
        .querySelector<HTMLElement>(".animation-panel")
        ?.style.getPropertyValue("--animation-panel-playhead-position"),
    ).toBe("62.5%");
    expect(
      dock.querySelector(".animation-panel__time strong"),
    ).toHaveTextContent("00:00.625");
    expect(
      dock.querySelector<HTMLInputElement>(
        '.animation-panel__ruler input[type="range"]',
      )?.value,
    ).toBe("625");
  });
  it("selects a visible Object track target on the canvas", () => {
    const updateScene = vi.fn();
    selectCanvasElementsForTrack(
      {
        getSceneElements: () => [
          {
            id: "visible-object",
            isDeleted: false,
            opacity: 100,
          },
        ],
        updateScene,
      } as unknown as Pick<
        ExcalidrawImperativeAPI,
        "getSceneElements" | "updateScene"
      >,
      {
        id: "visible-track",
        target: { type: "element", elementId: "visible-object" },
      },
    );

    expect(updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        appState: expect.objectContaining({
          selectedElementIds: { "visible-object": true },
        }),
        captureUpdate: "NEVER",
      }),
    );
  });

  it("does not select an Object hidden at the current animation time", () => {
    const updateScene = vi.fn();
    selectCanvasElementsForTrack(
      {
        getSceneElements: () => [
          {
            id: "hidden-object",
            isDeleted: false,
            opacity: 0,
          },
        ],
        updateScene,
      } as unknown as Pick<
        ExcalidrawImperativeAPI,
        "getSceneElements" | "updateScene"
      >,
      {
        id: "hidden-track",
        target: { type: "element", elementId: "hidden-object" },
      },
    );

    expect(updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        appState: expect.objectContaining({ selectedElementIds: {} }),
      }),
    );
  });

  it("selects every visible member represented by a group Object track", () => {
    const updateScene = vi.fn();
    selectCanvasElementsForTrack(
      {
        getSceneElements: () => [
          { id: "member-a", isDeleted: false, opacity: 100 },
          { id: "member-b", isDeleted: false, opacity: 100 },
          { id: "unrelated", isDeleted: false, opacity: 100 },
        ],
        updateScene,
      } as unknown as Pick<
        ExcalidrawImperativeAPI,
        "getSceneElements" | "updateScene"
      >,
      {
        id: "group-track",
        target: { type: "group", groupId: "cards" },
      },
      ["member-a", "member-b"],
    );

    expect(updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        appState: expect.objectContaining({
          selectedElementIds: { "member-a": true, "member-b": true },
        }),
      }),
    );
  });

  it("clears every canvas selection before playback", () => {
    const updateScene = vi.fn();

    clearCanvasSelectionForPlayback({
      updateScene,
    } as unknown as Pick<ExcalidrawImperativeAPI, "updateScene">);

    expect(updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        appState: expect.objectContaining({
          selectedElementIds: {},
          selectedGroupIds: {},
          selectedLinearElement: null,
        }),
      }),
    );
  });

  it("deletes Object targets through the native canvas deletion API", () => {
    const deleteElements = vi.fn();

    deleteCanvasElementsForTrack(
      { deleteElements } as unknown as Pick<
        ExcalidrawImperativeAPI,
        "deleteElements"
      >,
      ["card", "card-label"],
    );

    expect(deleteElements).toHaveBeenCalledWith(["card", "card-label"]);
  });

  it("resizes vertically and clamps the panel between 180px and 700px", () => {
    render(<AnimationEditorDock />);
    const dock = screen.getByTestId("animation-editor-dock");
    const handle = screen.getByRole("separator", {
      name: "调整动画面板高度",
    });

    fireEvent(
      handle,
      new MouseEvent("pointerdown", { bubbles: true, clientY: 500 }),
    );
    fireEvent(
      window,
      new MouseEvent("pointermove", { bubbles: true, clientY: -100 }),
    );
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
    expect(dock).toHaveStyle({ height: "700px" });
    expect(handle).toHaveAttribute("aria-valuenow", "700");

    fireEvent(
      handle,
      new MouseEvent("pointerdown", { bubbles: true, clientY: 100 }),
    );
    fireEvent(
      window,
      new MouseEvent("pointermove", { bubbles: true, clientY: 900 }),
    );
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
    expect(dock).toHaveStyle({ height: "180px" });

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(dock).toHaveStyle({ height: "200px" });
  });

  it("collapses on a handle click and restores the last dragged height", () => {
    render(<AnimationEditorDock />);
    const dock = screen.getByTestId("animation-editor-dock");
    const handle = screen.getByRole("separator", {
      name: "调整动画面板高度",
    });

    fireEvent(
      handle,
      new MouseEvent("pointerdown", { bubbles: true, clientY: 500 }),
    );
    fireEvent(
      window,
      new MouseEvent("pointermove", { bubbles: true, clientY: 400 }),
    );
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
    expect(dock).toHaveStyle({ height: "520px" });

    fireEvent(
      handle,
      new MouseEvent("pointerdown", { bubbles: true, clientY: 400 }),
    );
    fireEvent(
      window,
      new MouseEvent("pointerup", { bubbles: true, clientY: 400 }),
    );
    expect(dock).toHaveStyle({ height: "40px" });
    expect(dock).toHaveAttribute("data-collapsed", "true");

    const expandHandle = screen.getByRole("separator", {
      name: "展开动画面板",
    });
    fireEvent.pointerDown(expandHandle, { clientY: 400 });
    expect(dock).toHaveStyle({ height: "520px" });
    expect(dock).not.toHaveAttribute("data-collapsed");
  });

  it("supports keyboard collapse and expand", () => {
    render(<AnimationEditorDock />);
    const dock = screen.getByTestId("animation-editor-dock");
    const handle = screen.getByRole("separator", {
      name: "调整动画面板高度",
    });

    fireEvent.keyDown(handle, { key: "Enter" });
    expect(dock).toHaveStyle({ height: "40px" });

    fireEvent.keyDown(screen.getByRole("separator", { name: "展开动画面板" }), {
      key: " ",
    });
    expect(dock).toHaveStyle({ height: "420px" });
  });

  it("shows compact playback controls while collapsed", () => {
    render(<AnimationEditorDock />);
    fireEvent.keyDown(
      screen.getByRole("separator", { name: "调整动画面板高度" }),
      { key: "Enter" },
    );

    expect(
      screen.getByRole("button", {
        name: "在折叠面板中播放动画",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("折叠面板动画时间")).toHaveTextContent(
      "00:00",
    );
    const progress = screen.getByRole("slider", {
      name: "动画播放进度",
    });
    expect(progress).toHaveAttribute("min", "0");
    fireEvent.change(progress, { target: { value: "100" } });
  });
});
