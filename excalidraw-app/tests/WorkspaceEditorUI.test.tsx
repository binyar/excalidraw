import { Excalidraw } from "@excalidraw/excalidraw";
import {
  fireEvent,
  queryByTestId,
  render,
} from "@excalidraw/excalidraw/tests/test-utils";
import { vi } from "vitest";

import { AppMainMenu } from "../components/AppMainMenu";

describe("workspace editor UI", () => {
  it("keeps core drawing actions and removes local/cloud shortcuts", async () => {
    const onSave = vi.fn();
    const onBackToWorkspace = vi.fn();
    const onExportVideo = vi.fn();
    const { container } = await render(
      <Excalidraw
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            export: false,
            toggleTheme: false,
          },
          tools: {
            image: true,
            extraTools: false,
          },
        }}
      >
        <AppMainMenu
          onSave={onSave}
          onBackToWorkspace={onBackToWorkspace}
          onExportVideo={onExportVideo}
        />
      </Excalidraw>,
    );

    fireEvent.click(queryByTestId(container, "main-menu-trigger")!);

    expect(queryByTestId(container, "workspace-save-button")).not.toBeNull();
    expect(queryByTestId(container, "back-to-workspace-button")).not.toBeNull();
    expect(queryByTestId(container, "video-export-button")).not.toBeNull();
    expect(queryByTestId(container, "image-export-button")).toBeNull();
    expect(queryByTestId(container, "search-menu-button")).toBeNull();
    expect(queryByTestId(container, "clear-canvas-button")).not.toBeNull();
    expect(queryByTestId(container, "load-button")).toBeNull();
    expect(queryByTestId(container, "save-button")).toBeNull();
    expect(queryByTestId(container, "json-export-button")).toBeNull();
    expect(queryByTestId(container, "help-menu-item")).toBeNull();
    expect(queryByTestId(container, "command-palette-button")).toBeNull();
    expect(
      container.querySelector(".App-toolbar__extra-tools-trigger"),
    ).toBeNull();
    expect(container.querySelectorAll(".App-toolbar__divider")).toHaveLength(1);

    fireEvent.click(queryByTestId(container, "workspace-save-button")!);
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(queryByTestId(container, "main-menu-trigger")!);
    fireEvent.click(queryByTestId(container, "video-export-button")!);
    expect(onExportVideo).toHaveBeenCalledTimes(1);
    fireEvent.click(queryByTestId(container, "main-menu-trigger")!);
    fireEvent.click(queryByTestId(container, "back-to-workspace-button")!);
    expect(onBackToWorkspace).toHaveBeenCalledTimes(1);
  });

  it("keeps an empty canvas free of welcome guidance", async () => {
    const { container } = await render(<Excalidraw />);

    expect(container.textContent).not.toContain("选择工具开始绘制");
    expect(container.textContent).not.toContain("内容会自动保存到文件管理系统");
    expect(
      queryByTestId(container, "welcome-screen-menu-item-load-scene"),
    ).toBeNull();
  });

  it("keeps native shape properties hidden while drawing timeline objects", async () => {
    const { container, getByToolName } = await render(
      <Excalidraw UIOptions={{ selectedShapeActions: false }} />,
    );

    fireEvent.click(getByToolName("ellipse"));
    expect(container.querySelector(".selected-shape-actions")).toBeNull();

    const canvas = container.querySelector("canvas.interactive")!;
    fireEvent.pointerDown(canvas, { clientX: 30, clientY: 20 });
    fireEvent.pointerMove(canvas, { clientX: 90, clientY: 80 });
    fireEvent.pointerUp(canvas);

    expect(container.querySelector(".selected-shape-actions")).toBeNull();
  });
});
