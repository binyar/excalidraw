import { act, render, screen } from "@testing-library/react";

import { appJotaiStore, Provider } from "../app-jotai";
import { isCanvasGeneratingAtom } from "../ai/canvasGenerationState";

import { CanvasGenerationLoading } from "./CanvasGenerationLoading";

describe("CanvasGenerationLoading", () => {
  afterEach(() => {
    act(() => {
      appJotaiStore.set(isCanvasGeneratingAtom, false);
    });
  });

  it("renders the animated dot grid only while AI is creating the canvas", () => {
    const { container } = render(
      <Provider store={appJotaiStore}>
        <CanvasGenerationLoading />
      </Provider>,
    );
    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      appJotaiStore.set(isCanvasGeneratingAtom, true);
    });

    expect(screen.getByRole("status", { name: "正在创建画布" })).not.toBeNull();
    expect(
      container.querySelectorAll(".canvas-generation-loading__grid span"),
    ).toHaveLength(800);
  });
});
