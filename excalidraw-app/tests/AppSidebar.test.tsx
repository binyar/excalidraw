import {
  Excalidraw,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import { CaptureUpdateAction, newElementWith } from "@excalidraw/element";

import { projectRuntimeElementForRender } from "@excalidraw/excalidraw/renderer/runtimeElementRenderHook";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@excalidraw/excalidraw/tests/test-utils";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { API } from "../../packages/excalidraw/tests/helpers/api";
import { Pointer } from "../../packages/excalidraw/tests/helpers/ui";
import { animationWorkspace } from "../../src/animation/inspector";
import { AppSidebar } from "../components/AppSidebar";

const SidebarHost = () => {
  const excalidrawAPI = useExcalidrawAPI();
  return excalidrawAPI ? <AppSidebar /> : null;
};

describe("AppSidebar", () => {
  it("opens the AI panel from the bot trigger", async () => {
    await render(
      <ExcalidrawAPIProvider>
        <Excalidraw UIOptions={{ defaultSidebar: false }}>
          <SidebarHost />
        </Excalidraw>
      </ExcalidrawAPIProvider>,
    );

    const trigger = screen.getByRole("button", { name: "AI 对话" });
    expect(trigger.querySelector(".ai-chatbot-bot-icon")).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-header")).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(
      await screen.findByRole("heading", { name: "故事画布" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".ai-agent-mark.is-normal")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "AI 对话" })).toBeNull();
  });

  it("removes the animation object when the selected canvas element is deleted", async () => {
    const element = API.createElement({
      type: "rectangle",
      id: "deleted-animation-object",
      x: 20,
      y: 20,
      width: 120,
      height: 80,
    });

    await render(
      <ExcalidrawAPIProvider>
        <Excalidraw
          initialData={{
            elements: [element],
            appState: { selectedElementIds: { [element.id]: true } },
          }}
        >
          <SidebarHost />
        </Excalidraw>
      </ExcalidrawAPIProvider>,
    );
    await waitFor(() =>
      expect(animationWorkspace.getElementTrack(element.id)).toBeDefined(),
    );

    API.updateScene({ elements: [] });

    await waitFor(() =>
      expect(animationWorkspace.getElementTrack(element.id)).toBeUndefined(),
    );
  });

  it("creates an animation track for the selected element", async () => {
    const element = API.createElement({
      type: "rectangle",
      id: "animated-rectangle",
      x: 20,
      y: 20,
      width: 120,
      height: 80,
    });

    await render(
      <ExcalidrawAPIProvider>
        <Excalidraw
          initialData={{
            elements: [element],
            appState: {
              selectedElementIds: { [element.id]: true },
            },
          }}
        >
          <SidebarHost />
        </Excalidraw>
      </ExcalidrawAPIProvider>,
    );

    await waitFor(() =>
      expect(animationWorkspace.getElementTrack(element.id)).toBeDefined(),
    );
    await waitFor(() =>
      expect(animationWorkspace.getSnapshot()).toMatchObject({
        activeElementId: element.id,
        activeTrackId: animationWorkspace.getElementTrack(element.id)?.id,
      }),
    );
  });

  it("uses a canvas background selection as the pending animation color", async () => {
    const element = API.createElement({
      type: "rectangle",
      id: "canvas-background-animation",
      x: 20,
      y: 20,
      width: 120,
      height: 80,
      backgroundColor: "transparent",
    });
    await render(
      <ExcalidrawAPIProvider>
        <Excalidraw
          initialData={{
            elements: [element],
            appState: { selectedElementIds: { [element.id]: true } },
          }}
        >
          <SidebarHost />
        </Excalidraw>
      </ExcalidrawAPIProvider>,
    );
    await waitFor(() =>
      expect(animationWorkspace.getElementTrack(element.id)).toBeDefined(),
    );
    act(() => {
      animationWorkspace.setElementColorKeyframe(
        element.id,
        "visual.backgroundColor",
        "#00000000",
        0,
      );
    });
    await waitFor(() =>
      expect(animationWorkspace.getSnapshot().status).not.toBe("loading"),
    );
    act(() => animationWorkspace.seek(1000));

    API.updateScene({
      elements: [
        newElementWith(window.h.elements[0], { backgroundColor: "#ffec99" }),
      ],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    await waitFor(() =>
      expect(window.h.elements[0].backgroundColor).toBe("transparent"),
    );
    expect(
      projectRuntimeElementForRender(
        window.h.elements[0] as NonDeletedExcalidrawElement,
      ).backgroundColor,
    ).toBe("#ffec99");

    const track = animationWorkspace.getElementTrack(element.id)!;
    act(() =>
      animationWorkspace.addTrackPropertyKeyframe(
        track.id,
        "visual.backgroundColor",
        1000,
      ),
    );
    expect(
      animationWorkspace
        .getElementTrack(element.id)
        ?.properties?.find(
          (property) => property.property === "visual.backgroundColor",
        )
        ?.keyframes.at(-1),
    ).toEqual({ atMs: 1000, value: "#ffec99" });
  });

  it("uses a canvas fill selection as the pending background fill style", async () => {
    const element = API.createElement({
      type: "rectangle",
      id: "canvas-fill-style-animation",
      x: 20,
      y: 20,
      width: 120,
      height: 80,
      backgroundColor: "#ffec99",
      fillStyle: "hachure",
    });
    await render(
      <ExcalidrawAPIProvider>
        <Excalidraw
          initialData={{
            elements: [element],
            appState: { selectedElementIds: { [element.id]: true } },
          }}
        >
          <SidebarHost />
        </Excalidraw>
      </ExcalidrawAPIProvider>,
    );
    await waitFor(() =>
      expect(animationWorkspace.getElementTrack(element.id)).toBeDefined(),
    );
    act(() => {
      animationWorkspace.setElementFillStyleKeyframe(element.id, "hachure", 0);
    });
    await waitFor(() =>
      expect(animationWorkspace.getSnapshot().status).not.toBe("loading"),
    );
    act(() => animationWorkspace.seek(1000));

    API.updateScene({
      elements: [newElementWith(window.h.elements[0], { fillStyle: "solid" })],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    await waitFor(() =>
      expect(
        projectRuntimeElementForRender(
          window.h.elements[0] as NonDeletedExcalidrawElement,
        ).fillStyle,
      ).toBe("solid"),
    );
    await waitFor(() => expect(window.h.elements[0].fillStyle).toBe("hachure"));

    const track = animationWorkspace.getElementTrack(element.id)!;
    act(() =>
      animationWorkspace.addTrackPropertyKeyframe(
        track.id,
        "visual.fillStyle",
        1000,
      ),
    );
    expect(
      animationWorkspace
        .getElementTrack(element.id)
        ?.properties?.find(
          (property) => property.property === "visual.fillStyle",
        )
        ?.keyframes.at(-1),
    ).toEqual({ atMs: 1000, value: "solid", hold: true });
  });

  it("keeps canvas transforms pending until a property keyframe is added", async () => {
    const element = API.createElement({
      type: "rectangle",
      id: "auto-keyframe-rectangle",
      x: 20,
      y: 20,
      width: 120,
      height: 80,
    });
    await render(
      <ExcalidrawAPIProvider>
        <Excalidraw
          initialData={{
            elements: [element],
            appState: {
              selectedElementIds: { [element.id]: true },
            },
          }}
        >
          <SidebarHost />
        </Excalidraw>
      </ExcalidrawAPIProvider>,
    );
    await waitFor(() =>
      expect(animationWorkspace.getElementTrack(element.id)).toBeDefined(),
    );
    await waitFor(() =>
      expect(animationWorkspace.getSnapshot().status).not.toBe("loading"),
    );
    act(() => animationWorkspace.seek(1000));

    const pointer = new Pointer("mouse");
    pointer.downAt(60, 60);
    pointer.moveTo(160, 100);
    pointer.upAt(160, 100);

    expect(animationWorkspace.getElementTrack(element.id)?.properties).toEqual(
      [],
    );
    expect(window.h.elements[0].x).toBe(20);
    expect(window.h.elements[0].y).toBe(20);

    const track = animationWorkspace.getElementTrack(element.id)!;
    act(() => animationWorkspace.addTrackPositionKeyframe(track.id, 1000));
    expect(
      animationWorkspace
        .getElementTrack(element.id)
        ?.properties?.find((property) => property.property === "transform.x")
        ?.keyframes,
    ).toEqual([
      { atMs: 0, value: 0 },
      { atMs: 1000, value: 100 },
    ]);
    expect(
      animationWorkspace
        .getElementTrack(element.id)
        ?.properties?.find((property) => property.property === "transform.y")
        ?.keyframes,
    ).toEqual([
      { atMs: 0, value: 0 },
      { atMs: 1000, value: 40 },
    ]);

    await waitFor(() =>
      expect(animationWorkspace.getSnapshot().status).not.toBe("loading"),
    );
    act(() => animationWorkspace.seek(1000));
    pointer.clickAt(500, 500);
    expect(window.h.state.selectedElementIds[element.id]).not.toBe(true);

    pointer.clickAt(120, 100);
    expect(window.h.state.selectedElementIds[element.id]).toBe(true);

    pointer.downAt(120, 100);
    pointer.moveTo(170, 100);
    pointer.upAt(170, 100);
    expect(window.h.elements[0].x).toBe(20);
    expect(projectRuntimeElementForRender(element).x).toBe(170);
  });

  it("selects and drags an element rendered from one non-zero path keyframe", async () => {
    const element = API.createElement({
      type: "rectangle",
      id: "single-path-keyframe-rectangle",
      x: 20,
      y: 20,
      width: 120,
      height: 80,
    });
    await render(
      <ExcalidrawAPIProvider>
        <Excalidraw
          initialData={{
            elements: [element],
            appState: {
              selectedElementIds: { [element.id]: true },
            },
          }}
        >
          <SidebarHost />
        </Excalidraw>
      </ExcalidrawAPIProvider>,
    );
    await waitFor(() =>
      expect(animationWorkspace.getElementTrack(element.id)).toBeDefined(),
    );
    await waitFor(() =>
      expect(animationWorkspace.getSnapshot().status).not.toBe("loading"),
    );
    act(() => animationWorkspace.seek(0));

    const pointer = new Pointer("mouse");
    pointer.downAt(60, 20);
    pointer.moveTo(160, 60);
    pointer.upAt(160, 60);
    const track = animationWorkspace.getElementTrack(element.id)!;
    act(() => animationWorkspace.addTrackPositionKeyframe(track.id, 0));
    await waitFor(() =>
      expect(animationWorkspace.getSnapshot().status).not.toBe("loading"),
    );

    pointer.clickAt(500, 500);
    expect(window.h.state.selectedElementIds[element.id]).not.toBe(true);
    pointer.clickAt(120, 100);
    expect(window.h.state.selectedElementIds[element.id]).toBe(true);

    pointer.downAt(120, 100);
    pointer.moveTo(170, 100);
    pointer.upAt(170, 100);
    expect(window.h.elements[0].x).toBe(20);
    expect(projectRuntimeElementForRender(element).x).toBe(170);
  });
});
