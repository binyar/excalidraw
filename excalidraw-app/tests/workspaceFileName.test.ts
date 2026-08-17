import { describe, expect, it } from "vitest";

import { getWorkspaceFileDisplayName } from "../workspace/fileName";

describe("workspace file display name", () => {
  it("hides the Excalidraw suffix without changing the stored name", () => {
    expect(getWorkspaceFileDisplayName("产品故事.excalidraw")).toBe("产品故事");
    expect(getWorkspaceFileDisplayName("产品故事.EXCALIDRAW")).toBe("产品故事");
    expect(getWorkspaceFileDisplayName("excalidraw 使用说明")).toBe(
      "excalidraw 使用说明",
    );
  });
});
