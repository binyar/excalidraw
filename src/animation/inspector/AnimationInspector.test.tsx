import { fireEvent, render, screen } from "@testing-library/react";

import { animationProjectSchema } from "../schema";

import { AnimationInspector } from "./AnimationInspector";
import {
  ANIMATION_INSPECTOR_PRESETS,
  generateInspectorAnimation,
  readInspectorConfig,
} from "./inspectorPresets";

import type { AnimationInspectorController } from "./AnimationInspector";
import type {
  AnimationInspectorConfig,
  AnimationInspectorElement,
} from "./inspectorPresets";

const element: AnimationInspectorElement = {
  id: "rectangle-1",
  type: "rectangle",
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
};

describe("Animation Inspector presets", () => {
  it("generates schema-valid DSL for every inspector category", () => {
    for (const preset of ANIMATION_INSPECTOR_PRESETS) {
      const config: AnimationInspectorConfig = {
        category: preset.category,
        presetId: preset.id,
        duration: 840,
        delay: 120,
        easing: "ease-in-out",
      };
      const project = generateInspectorAnimation(element, config);

      expect(animationProjectSchema.safeParse(project).success).toBe(true);
      expect(project.tracks[0].startMs).toBe(120);
      expect(readInspectorConfig(project.tracks[0])).toEqual(config);
    }
  });
});

describe("AnimationInspector", () => {
  it("edits semantic controls and sends only DSL authoring requests", () => {
    const setElementAnimation = vi.fn();
    const setElementPropertyKeyframe = vi.fn();
    const setElementColorKeyframe = vi.fn();
    const setElementFillStyleKeyframe = vi.fn();
    const snapshot = {
      project: {
        schemaVersion: "1.0" as const,
        id: "test",
        durationMs: 1,
        frameRate: 60,
        tracks: [],
      },
      status: "idle" as const,
      timeMs: 0,
    };
    const controller: AnimationInspectorController = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      getElementTrack: () => undefined,
      setElementAnimation,
      removeElementAnimation: vi.fn(),
      setElementPropertyKeyframe,
      setElementColorKeyframe,
      setElementFillStyleKeyframe,
      removeElementProperty: vi.fn(),
      preview: vi.fn(async () => undefined),
    };
    render(<AnimationInspector element={element} controller={controller} />);

    fireEvent.click(screen.getByRole("button", { name: "启用水平位置动画" }));
    expect(setElementPropertyKeyframe).toHaveBeenLastCalledWith(
      element.id,
      "transform.x",
      0,
      0,
    );

    fireEvent.change(screen.getByLabelText("水平位置"), {
      target: { value: "120" },
    });
    expect(setElementPropertyKeyframe).toHaveBeenLastCalledWith(
      element.id,
      "transform.x",
      120,
      0,
    );

    fireEvent.change(screen.getByLabelText("不透明度"), {
      target: { value: "35" },
    });
    expect(setElementPropertyKeyframe).toHaveBeenLastCalledWith(
      element.id,
      "visual.opacity",
      0.35,
      0,
    );

    fireEvent.change(screen.getByLabelText("背景颜色"), {
      target: { value: "#a5d8ff" },
    });
    expect(setElementColorKeyframe).toHaveBeenLastCalledWith(
      element.id,
      "visual.backgroundColor",
      "#A5D8FFFF",
      0,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "将动画填充样式设置为纯色",
      }),
    );
    expect(setElementFillStyleKeyframe).toHaveBeenLastCalledWith(
      element.id,
      "solid",
      0,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "将动画背景设置为绿色",
      }),
    );
    expect(setElementColorKeyframe).toHaveBeenLastCalledWith(
      element.id,
      "visual.backgroundColor",
      "#B2F2BBFF",
      0,
    );
    expect(screen.queryByText("绘制进度")).not.toBeInTheDocument();
    expect(screen.queryByText("模糊")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "变换" }));
    expect(setElementAnimation).toHaveBeenLastCalledWith(
      element,
      expect.objectContaining({ category: "transform", presetId: "pulse" }),
    );

    fireEvent.change(screen.getByLabelText("预设"), {
      target: { value: "rotate" },
    });
    expect(setElementAnimation).toHaveBeenLastCalledWith(
      element,
      expect.objectContaining({ presetId: "rotate", duration: 1000 }),
    );

    fireEvent.change(screen.getByLabelText("缓动"), {
      target: { value: "linear" },
    });
    expect(setElementAnimation).toHaveBeenLastCalledWith(
      element,
      expect.objectContaining({ presetId: "rotate", easing: "linear" }),
    );
  });

  it("shows an explicit empty state when selection is not singular", () => {
    const snapshot = {
      project: {
        schemaVersion: "1.0" as const,
        id: "test",
        durationMs: 1,
        frameRate: 60,
        tracks: [],
      },
      status: "idle" as const,
      timeMs: 0,
    };
    const controller = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      getElementTrack: () => undefined,
      setElementAnimation: vi.fn(),
      removeElementAnimation: vi.fn(),
      setElementPropertyKeyframe: vi.fn(),
      setElementColorKeyframe: vi.fn(),
      setElementFillStyleKeyframe: vi.fn(),
      removeElementProperty: vi.fn(),
      preview: vi.fn(async () => undefined),
    };
    render(<AnimationInspector element={null} controller={controller} />);
    expect(screen.getByText("请选择元素")).toBeInTheDocument();
  });
});
