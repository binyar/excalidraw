import { Excalidraw } from "@excalidraw/excalidraw";
import {
  fireEvent,
  queryByTestId,
  render,
} from "@excalidraw/excalidraw/tests/test-utils";
import { vi } from "vitest";

import { AppMainMenu } from "../components/AppMainMenu";
import { AppWelcomeScreen } from "../components/AppWelcomeScreen";

describe("workspace editor UI", () => {
  it("keeps core drawing actions and removes local/cloud shortcuts", async () => {
    const onSave = vi.fn();
    const { container } = await render(
      <Excalidraw
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            export: false,
          },
        }}
      >
        <AppMainMenu onSave={onSave} theme="light" />
        <AppWelcomeScreen />
      </Excalidraw>,
    );

    fireEvent.click(queryByTestId(container, "main-menu-trigger")!);

    expect(queryByTestId(container, "workspace-save-button")).not.toBeNull();
    expect(queryByTestId(container, "image-export-button")).not.toBeNull();
    expect(queryByTestId(container, "search-menu-button")).not.toBeNull();
    expect(queryByTestId(container, "clear-canvas-button")).not.toBeNull();
    expect(queryByTestId(container, "load-button")).toBeNull();
    expect(queryByTestId(container, "save-button")).toBeNull();
    expect(queryByTestId(container, "json-export-button")).toBeNull();
    expect(queryByTestId(container, "help-menu-item")).toBeNull();
    expect(queryByTestId(container, "command-palette-button")).toBeNull();

    fireEvent.click(queryByTestId(container, "workspace-save-button")!);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("shows only the workspace drawing guidance on the welcome screen", async () => {
    const { container } = await render(
      <Excalidraw>
        <AppWelcomeScreen />
      </Excalidraw>,
    );

    expect(container.textContent).toContain("内容会自动保存到文件管理系统");
    expect(
      queryByTestId(container, "welcome-screen-menu-item-load-scene"),
    ).toBeNull();
  });
});
