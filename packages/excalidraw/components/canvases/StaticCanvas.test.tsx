import { render } from "@testing-library/react";

import StaticCanvas from "./StaticCanvas";

import type { ComponentProps } from "react";

const mocks = vi.hoisted(() => ({
  renderStaticScene: vi.fn(),
  runtimeListener: undefined as (() => void) | undefined,
}));

vi.mock("../../reactUtils", () => ({
  isRenderThrottlingEnabled: () => false,
}));

vi.mock("../../renderer/staticScene", () => ({
  renderStaticScene: mocks.renderStaticScene,
}));

vi.mock("../../renderer/runtimeElementRenderHook", () => ({
  subscribeToRuntimeElementRenderChanges: (listener: () => void) => {
    mocks.runtimeListener = listener;
    return () => {
      mocks.runtimeListener = undefined;
    };
  },
}));

describe("StaticCanvas runtime rendering", () => {
  it("repaints the real canvas immediately when runtime state changes", () => {
    const canvas = document.createElement("canvas");
    const props = {
      canvas,
      rc: {},
      elementsMap: new Map(),
      allElementsMap: new Map(),
      visibleElements: [],
      canvasNonce: "scene",
      selectionNonce: undefined,
      scale: 1,
      appState: { width: 800, height: 600 },
      renderConfig: {},
    };

    render(
      <StaticCanvas
        {...(props as unknown as ComponentProps<typeof StaticCanvas>)}
      />,
    );
    mocks.renderStaticScene.mockClear();

    mocks.runtimeListener?.();

    expect(mocks.renderStaticScene).toHaveBeenCalledTimes(1);
    expect(mocks.renderStaticScene).toHaveBeenCalledWith(
      expect.objectContaining({ canvas }),
      false,
    );
  });
});
