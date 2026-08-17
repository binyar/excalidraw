import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { animationProjectSchema } from "../schema";
import { ANIMATION_SCHEMA_VERSION, type AnimationProject } from "../types";

import {
  AnimationPanel,
  isPropertySupportedByElement,
  isPropertySupportedByElements,
  scrollAnimationTrackIntoView,
  type AnimationPlaybackController,
} from "./AnimationPanel";
import { deletePropertySegment } from "./animationEditorState";

const createProject = (): AnimationProject => ({
  schemaVersion: ANIMATION_SCHEMA_VERSION,
  id: "dashboard-animation",
  durationMs: 2000,
  frameRate: 30,
  tracks: [
    {
      id: "title-track",
      name: "标题",
      target: { type: "element", elementId: "title" },
      startMs: 100,
      durationMs: 1000,
      properties: [
        {
          property: "transform.x",
          keyframes: [
            { atMs: 0, value: 0 },
            { atMs: 500, value: 120 },
          ],
        },
        {
          property: "transform.y",
          keyframes: [
            { atMs: 0, value: 0 },
            { atMs: 500, value: 60 },
          ],
        },
      ],
    },
    {
      id: "map-track",
      name: "地图",
      target: { type: "element", elementId: "map" },
      durationMs: 1500,
      properties: [
        {
          property: "visual.opacity",
          keyframes: [{ atMs: 0, value: 1 }],
        },
      ],
    },
    {
      id: "metric-track",
      name: "指标卡",
      target: { type: "element", elementId: "metric" },
      durationMs: 1200,
      properties: [
        {
          property: "transform.scale",
          keyframes: [{ atMs: 0, value: 1 }],
        },
      ],
    },
  ],
});

const playback: AnimationPlaybackController = {
  play: vi.fn(),
  pause: vi.fn(),
  seek: vi.fn(),
};

const ControlledPanel = ({
  currentTimeMs = 850,
  isPlaying = false,
  activeTrackId,
  onSelectTrack,
}: {
  currentTimeMs?: number;
  isPlaying?: boolean;
  activeTrackId?: string | null;
  onSelectTrack?: (trackId: string) => void;
}) => {
  const [project, setProject] = useState(createProject);
  return (
    <>
      <AnimationPanel
        project={project}
        currentTimeMs={currentTimeMs}
        isPlaying={isPlaying}
        playback={playback}
        onProjectChange={setProject}
        activeTrackId={activeTrackId}
        onSelectTrack={onSelectTrack}
        onCreateCamera={vi.fn()}
        getTrackTargetElements={(trackId) => [
          {
            id: trackId.replace("-track", ""),
            type: "rectangle",
            opacity: 100,
            strokeColor: "#1e1e1e",
            backgroundColor: "transparent",
            fillStyle: "hachure",
            strokeWidth: 1,
            strokeStyle: "solid",
            roughness: 1,
            roundness: null,
          } as any,
        ]}
      />
      <output data-testid="project-state">{JSON.stringify(project)}</output>
    </>
  );
};

const readProject = () =>
  JSON.parse(
    screen.getByTestId("project-state").textContent ?? "",
  ) as AnimationProject;

const ControlledTransitionPanel = () => {
  const [project, setProject] = useState<AnimationProject>({
    schemaVersion: ANIMATION_SCHEMA_VERSION,
    id: "transition-editor",
    durationMs: 3000,
    frameRate: 60,
    scenes: [
      { id: "chapter-1", name: "第一章", startMs: 0, durationMs: 1000 },
      { id: "chapter-2", name: "第二章", startMs: 1800, durationMs: 1200 },
    ],
    tracks: [],
  });
  return (
    <>
      <AnimationPanel
        project={project}
        currentTimeMs={1200}
        isPlaying={false}
        playback={playback}
        onProjectChange={setProject}
      />
      <output data-testid="project-state">{JSON.stringify(project)}</output>
    </>
  );
};

const ControlledCameraTransitionPanel = () => {
  const [project, setProject] = useState<AnimationProject>({
    schemaVersion: ANIMATION_SCHEMA_VERSION,
    id: "camera-transition-editor",
    durationMs: 3000,
    frameRate: 60,
    scenes: [
      { id: "chapter-1", name: "第一章", startMs: 0, durationMs: 1000 },
      { id: "chapter-2", name: "第二章", startMs: 1800, durationMs: 1200 },
    ],
    tracks: [
      {
        id: "camera-transition",
        target: {
          type: "transition",
          transitionId: "chapter-1-2",
          layerId: "camera",
          fromSceneId: "chapter-1",
          toSceneId: "chapter-2",
          effect: "camera",
          direction: "left",
          role: "bridge",
        },
        startMs: 1000,
        durationMs: 800,
        properties: [],
      },
    ],
  });
  return (
    <>
      <AnimationPanel
        project={project}
        currentTimeMs={1200}
        isPlaying={false}
        playback={playback}
        onProjectChange={setProject}
      />
      <output data-testid="project-state">{JSON.stringify(project)}</output>
    </>
  );
};

const ControlledTextPanel = () => {
  const [project, setProject] = useState<AnimationProject>({
    schemaVersion: ANIMATION_SCHEMA_VERSION,
    id: "text-animation",
    durationMs: 2000,
    frameRate: 30,
    tracks: [
      {
        id: "copy-track",
        name: "正文",
        target: { type: "element", elementId: "copy" },
        durationMs: 1200,
        properties: [],
      },
    ],
  });
  return (
    <>
      <AnimationPanel
        project={project}
        currentTimeMs={400}
        isPlaying={false}
        playback={playback}
        onProjectChange={setProject}
        getTrackTargetElements={() => [
          {
            id: "copy",
            type: "text",
            opacity: 100,
            strokeColor: "#1e1e1e",
            fontSize: 28,
            fontFamily: 2,
            textAlign: "center",
            verticalAlign: "middle",
          } as any,
        ]}
      />
      <output data-testid="project-state">{JSON.stringify(project)}</output>
    </>
  );
};

describe("AnimationPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("selects an externally activated Object track", () => {
    const project = createProject();

    const { rerender } = render(
      <AnimationPanel
        project={project}
        currentTimeMs={850}
        isPlaying={false}
        playback={playback}
        onProjectChange={vi.fn()}
        activeTrackId="map-track"
      />,
    );

    expect(
      document.querySelector('[data-animation-track-id="map-track"]'),
    ).toHaveClass("is-selected");
    rerender(
      <AnimationPanel
        project={project}
        currentTimeMs={850}
        isPlaying={false}
        playback={playback}
        onProjectChange={vi.fn()}
        activeTrackId="metric-track"
      />,
    );
    expect(
      document.querySelector('[data-animation-track-id="metric-track"]'),
    ).toHaveClass("is-selected");
  });

  it("deletes an Object immediately through the host callback", () => {
    const onDeleteObject = vi.fn();
    render(
      <AnimationPanel
        project={createProject()}
        currentTimeMs={0}
        isPlaying={false}
        playback={playback}
        onProjectChange={vi.fn()}
        onDeleteObject={onDeleteObject}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "删除 标题 动画及画布元素",
      }),
    );

    expect(onDeleteObject).toHaveBeenCalledWith("title-track");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("scrolls only as far as needed to reveal the active Object row", () => {
    const editor = { clientHeight: 200, scrollTop: 0 };

    scrollAnimationTrackIntoView(editor, {
      offsetTop: 500,
      offsetHeight: 80,
    });
    expect(editor.scrollTop).toBe(380);

    scrollAnimationTrackIntoView(editor, {
      offsetTop: 420,
      offsetHeight: 40,
    });
    expect(editor.scrollTop).toBe(380);

    scrollAnimationTrackIntoView(editor, {
      offsetTop: 120,
      offsetHeight: 40,
    });
    expect(editor.scrollTop).toBe(120);
  });

  it("renders DSL layers and delegates transport without importing Motion", () => {
    const { rerender } = render(<ControlledPanel />);

    expect(screen.getAllByText("标题").length).toBeGreaterThan(0);
    expect(screen.getAllByText("地图").length).toBeGreaterThan(0);
    expect(screen.getAllByText("指标卡").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", {
        name: "在当前时间创建场景边界并添加PPT翻页",
      }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "添加空间运镜" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "播放动画" }));
    rerender(<ControlledPanel isPlaying />);
    fireEvent.click(screen.getByRole("button", { name: "暂停动画" }));
    fireEvent.change(screen.getByRole("slider", { name: "动画时间轴" }), {
      target: { value: "1000" },
    });

    expect(playback.play).toHaveBeenCalledTimes(1);
    expect(playback.pause).toHaveBeenCalledTimes(1);
    expect(playback.seek).toHaveBeenCalledWith(1000);
  });

  it("shows camera position as one paired row and hides center coordinates", () => {
    const cameraProject: AnimationProject = {
      ...createProject(),
      tracks: [
        {
          id: "camera-main-animation",
          name: "主镜头",
          target: { type: "camera", cameraId: "main" },
          properties: [
            {
              property: "camera.centerX",
              keyframes: [{ atMs: 0, value: 400 }],
            },
            {
              property: "camera.centerY",
              keyframes: [{ atMs: 0, value: 300 }],
            },
            {
              property: "camera.zoom",
              keyframes: [{ atMs: 0, value: 1 }],
            },
          ],
        },
      ],
    };

    render(
      <AnimationPanel
        project={cameraProject}
        currentTimeMs={0}
        isPlaying={false}
        playback={playback}
        onProjectChange={vi.fn()}
      />,
    );

    expect(screen.getByText("位置")).toBeInTheDocument();
    expect(screen.getByText("镜头缩放")).toBeInTheDocument();
    expect(screen.queryByText("中心 X")).not.toBeInTheDocument();
    expect(screen.queryByText("中心 Y")).not.toBeInTheDocument();
  });

  it("separates the scene camera from animation objects", () => {
    const project = createProject();
    project.tracks.unshift({
      id: "camera-main-animation",
      name: "主镜头",
      target: { type: "camera", cameraId: "main" },
      properties: [
        { property: "camera.centerX", keyframes: [{ atMs: 0, value: 0 }] },
        { property: "camera.centerY", keyframes: [{ atMs: 0, value: 0 }] },
        { property: "camera.zoom", keyframes: [{ atMs: 0, value: 1 }] },
      ],
    });

    render(
      <AnimationPanel
        project={project}
        currentTimeMs={0}
        isPlaying={false}
        playback={playback}
        onProjectChange={vi.fn()}
      />,
    );

    expect(screen.getByText("场景")).toBeInTheDocument();
    expect(screen.getByText("动画对象")).toBeInTheDocument();
    expect(screen.getByText("主镜头")).toBeInTheDocument();
    expect(
      document.querySelector(
        ".animation-panel__section-divider .animation-panel__lane-playhead",
      ),
    ).toBeInTheDocument();
  });

  it("keeps playhead and keyframe markers fully inside the timeline at zero", () => {
    const project = createProject();
    project.tracks[1].properties?.[0].keyframes.push({
      atMs: 500,
      value: 0.5,
    });

    render(
      <AnimationPanel
        project={project}
        currentTimeMs={0}
        isPlaying={false}
        playback={playback}
        onProjectChange={vi.fn()}
      />,
    );

    expect(
      document
        .querySelector<HTMLElement>(".animation-panel")
        ?.style.getPropertyValue("--animation-panel-playhead-position"),
    ).toBe("0px");
    expect(
      screen
        .getByRole("button", {
          name: "地图对象关键帧，位于 0 毫秒",
        })
        .style.getPropertyValue("--animation-panel-marker-position"),
    ).toBe("0px");
    expect(
      screen
        .getByRole("button", {
          name: "地图不透明度关键帧，位于 0 毫秒",
        })
        .style.getPropertyValue("--animation-panel-marker-position"),
    ).toBe("0px");
    const zeroFrameLane = screen.getByRole("button", {
      name: "地图对象关键帧，位于 0 毫秒",
    }).parentElement!;
    expect(
      zeroFrameLane.querySelector(".animation-panel__lane-playhead"),
    ).toBeInTheDocument();
    expect(
      zeroFrameLane
        .querySelector<HTMLElement>(".animation-panel__object-span")
        ?.style.getPropertyValue("--animation-panel-segment-start-position"),
    ).toBe("0px");
    expect(
      screen
        .getByRole("button", {
          name: "地图不透明度动画函数，从 0 毫秒 到 500 毫秒",
        })
        .style.getPropertyValue("--animation-panel-segment-start-position"),
    ).toBe("0px");
  });

  it("separates timeline zoom from project duration", () => {
    render(<ControlledPanel />);
    const panel = document.querySelector<HTMLElement>(".animation-panel")!;

    expect(
      panel.style.getPropertyValue("--animation-panel-timeline-width"),
    ).toBe("720px");
    fireEvent.change(screen.getByRole("combobox", { name: "时间轴缩放比例" }), {
      target: { value: "50" },
    });
    expect(
      panel.style.getPropertyValue("--animation-panel-timeline-width"),
    ).toBe("100px");
    expect(readProject().durationMs).toBe(2000);

    fireEvent.click(screen.getByRole("button", { name: "时间轴适应窗口" }));
    expect(
      panel.style.getPropertyValue("--animation-panel-timeline-width"),
    ).toBe("720px");
  });

  it("snaps lane seeking to the visible minor tick grid", () => {
    render(<ControlledPanel />);
    const lane = document.querySelector<HTMLElement>(
      ".animation-panel__lane.is-property",
    )!;
    vi.spyOn(lane, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 1000,
      top: 0,
      right: 1000,
      bottom: 29,
      height: 29,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent(
      lane,
      new MouseEvent("pointerdown", { bubbles: true, clientX: 333 }),
    );
    expect(playback.seek).toHaveBeenCalledWith(700);
  });

  it("edits project duration without allowing existing content to be cut", () => {
    render(<ControlledPanel />);
    const durationInput = screen.getByRole("textbox", {
      name: "动画总时长",
    });

    fireEvent.change(durationInput, { target: { value: "3s" } });
    fireEvent.blur(durationInput);
    expect(readProject().durationMs).toBe(3000);

    fireEvent.change(durationInput, { target: { value: "1s" } });
    fireEvent.blur(durationInput);
    expect(readProject().durationMs).toBe(3000);
    expect(screen.getByRole("alert")).toHaveTextContent("之后仍存在动画内容");
  });

  it("starts large generated projects with only the active track expanded", () => {
    const project = createProject();
    project.tracks = Array.from({ length: 41 }, (_, index) => ({
      id: `large-track-${index}`,
      name: `轨道 ${index + 1}`,
      target: { type: "element" as const, elementId: `element-${index}` },
      durationMs: 1000,
      properties: [
        {
          property: "visual.opacity" as const,
          keyframes: [{ atMs: 0, value: 1 }],
        },
      ],
    }));

    render(
      <AnimationPanel
        project={project}
        currentTimeMs={0}
        isPlaying={false}
        playback={playback}
        onProjectChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "收起 轨道 1" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "展开 轨道 2" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("adds and deletes paired x/y keyframes from the position path row", () => {
    render(<ControlledPanel />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "标题添加位置路径关键帧",
      }),
    );
    let project = readProject();
    expect(
      project.tracks[0].properties?.[0].keyframes.map(
        (keyframe) => keyframe.atMs,
      ),
    ).toEqual([0, 500, 750]);
    expect(
      project.tracks[0].properties?.[1].keyframes.map(
        (keyframe) => keyframe.atMs,
      ),
    ).toEqual([0, 500, 750]);
    expect(animationProjectSchema.safeParse(project).success).toBe(true);

    const keyframe = screen.getByRole("button", {
      name: "标题位置路径关键帧，位于 850 毫秒",
    });
    fireEvent.pointerDown(keyframe, { clientX: 0 });
    fireEvent.pointerUp(window, { clientX: 0 });
    fireEvent.click(screen.getByRole("button", { name: "删除选中的关键帧" }));

    project = readProject();
    expect(
      project.tracks[0].properties?.[0].keyframes.map(
        (keyframe) => keyframe.atMs,
      ),
    ).toEqual([0, 500]);
    expect(
      project.tracks[0].properties?.[1].keyframes.map(
        (keyframe) => keyframe.atMs,
      ),
    ).toEqual([0, 500]);
    expect(animationProjectSchema.safeParse(project).success).toBe(true);
  });

  it("uses aligned object/property rows with editable parameter values", () => {
    render(<ControlledPanel />);

    expect(screen.queryByLabelText("标题 delay")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("标题 duration")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "+ Keyframe" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "标题对象关键帧，位于 100 毫秒",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "标题对象关键帧，位于 600 毫秒",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("标题 property to add"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "标题添加水平位置关键帧",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "标题添加垂直位置关键帧",
      }),
    ).not.toBeInTheDocument();
    [
      "位置路径",
      "缩放",
      "旋转",
      "不透明度",
      "背景颜色",
      "填充样式",
      "显示状态",
    ].forEach((property) =>
      expect(
        screen.getByRole("button", {
          name: `标题添加${property}关键帧`,
        }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "标题添加旋转关键帧",
      }),
    );
    expect(
      readProject().tracks[0].properties?.some(
        (property) => property.property === "transform.rotate",
      ),
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("button", {
        name: "标题添加背景颜色关键帧",
      }),
    );
    expect(
      readProject().tracks[0].properties?.some(
        (property) => property.property === "visual.backgroundColor",
      ),
    ).toBe(true);
  });

  it("shows text-only properties as visual controls and writes discrete keyframes", () => {
    render(<ControlledTextPanel />);

    ["字号", "字体", "文字对齐"].forEach((property) =>
      expect(
        screen.getByRole("button", {
          name: `正文添加${property}关键帧`,
        }),
      ).toBeInTheDocument(),
    );
    [
      "背景颜色",
      "填充样式",
      "描边颜色",
      "描边宽度",
      "边框样式",
      "线条风格",
      "边角",
      "垂直对齐",
    ].forEach((property) =>
      expect(
        screen.queryByRole("button", {
          name: `正文添加${property}关键帧`,
        }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTitle("居中")).toHaveClass("active");

    fireEvent.click(screen.getByTitle("右对齐"));

    expect(
      readProject().tracks[0].properties?.find(
        (property) => property.property === "text.textAlign",
      )?.keyframes[0],
    ).toMatchObject({ atMs: 400, value: "right", hold: true });
  });

  it("maps every canvas element type to its native appearance capabilities", () => {
    const appearanceProperties = [
      "visual.strokeColor",
      "visual.backgroundColor",
      "visual.fillStyle",
      "visual.strokeWidth",
      "visual.strokeStyle",
      "visual.roughness",
      "visual.roundness",
      "text.fontSize",
      "text.fontFamily",
      "text.textAlign",
      "text.verticalAlign",
    ] as const;
    const expectedByType = {
      rectangle: appearanceProperties.slice(0, 7),
      ellipse: appearanceProperties.slice(0, 6),
      diamond: appearanceProperties.slice(0, 7),
      line: appearanceProperties.slice(0, 7),
      arrow: [
        "visual.strokeColor",
        "visual.strokeWidth",
        "visual.strokeStyle",
        "visual.roughness",
      ],
      freedraw: [
        "visual.strokeColor",
        "visual.backgroundColor",
        "visual.fillStyle",
        "visual.strokeWidth",
      ],
      text: ["text.fontSize", "text.fontFamily", "text.textAlign"],
      image: ["visual.roundness"],
      iframe: [
        "visual.backgroundColor",
        "visual.fillStyle",
        "visual.strokeWidth",
        "visual.strokeStyle",
        "visual.roughness",
        "visual.roundness",
      ],
      embeddable: [
        "visual.strokeColor",
        "visual.backgroundColor",
        "visual.fillStyle",
        "visual.strokeWidth",
        "visual.strokeStyle",
        "visual.roughness",
        "visual.roundness",
      ],
      frame: [],
      magicframe: [],
    } as const;

    Object.entries(expectedByType).forEach(([type, expected]) => {
      const element = { type, containerId: null } as any;
      expect(
        appearanceProperties.filter((property) =>
          isPropertySupportedByElement(property, element),
        ),
        type,
      ).toEqual(expected);
    });

    expect(
      isPropertySupportedByElement("text.verticalAlign", {
        type: "text",
        containerId: "shape",
      } as any),
    ).toBe(true);
    expect(
      isPropertySupportedByElement(
        "text.verticalAlign",
        { type: "text", containerId: "arrow" } as any,
        (id) => ({ id, type: "arrow" } as any),
      ),
    ).toBe(false);

    const rectangle = { type: "rectangle" } as any;
    const arrow = { type: "arrow" } as any;
    expect(
      isPropertySupportedByElements("visual.strokeColor", [rectangle, arrow]),
    ).toBe(true);
    expect(
      isPropertySupportedByElements("visual.backgroundColor", [
        rectangle,
        arrow,
      ]),
    ).toBe(false);
  });

  it("draws segments only for interpolated properties, including roundness", () => {
    const project: AnimationProject = {
      schemaVersion: ANIMATION_SCHEMA_VERSION,
      id: "property-behavior",
      durationMs: 1000,
      frameRate: 60,
      tracks: [
        {
          id: "card-style",
          name: "卡片",
          target: { type: "element", elementId: "card" },
          durationMs: 1000,
          properties: [
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
              property: "visual.roughness",
              keyframes: [
                { atMs: 0, value: 0, hold: true },
                { atMs: 1000, value: 2, hold: true },
              ],
            },
            {
              property: "visual.roundness",
              // Legacy projects stored roundness with hold. The timeline and
              // runtime must still treat it as an interpolated property.
              keyframes: [
                { atMs: 0, value: "sharp", hold: true },
                { atMs: 1000, value: "round", hold: true },
              ],
            },
          ],
        },
      ],
    };
    render(
      <AnimationPanel
        project={project}
        currentTimeMs={0}
        isPlaying={false}
        playback={playback}
        onProjectChange={vi.fn()}
        getTrackTargetElements={() =>
          [
            {
              id: "card",
              type: "rectangle",
              fillStyle: "hachure",
              strokeStyle: "solid",
              strokeColor: "#1e1e1e",
              backgroundColor: "transparent",
              strokeWidth: 1,
              roughness: 1,
              opacity: 100,
              roundness: null,
            },
          ] as any
        }
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: "卡片填充样式动画函数，从 0 毫秒 到 1 秒",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "卡片边框样式动画函数，从 0 毫秒 到 1 秒",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "卡片线条风格动画函数，从 0 毫秒 到 1 秒",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "连接卡片填充样式，从 0 毫秒 到 1 秒",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "连接卡片线条风格，从 0 毫秒 到 1 秒",
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "卡片边角动画函数，从 0 毫秒 到 1 秒",
      }),
    ).toBeInTheDocument();
  });

  it("shows playhead values and writes parameter changes at the playhead", () => {
    render(<ControlledPanel />);

    expect(screen.getByLabelText("标题位置路径 X")).toHaveValue(120);
    expect(screen.getByLabelText("标题位置路径 Y")).toHaveValue(60);
    expect(screen.getByLabelText("标题缩放数值")).toHaveValue(100);
    expect(screen.getByLabelText("标题旋转数值")).toHaveValue(0);
    expect(screen.getByLabelText("标题不透明度数值")).toHaveValue(100);
    expect(screen.getAllByTitle("斜线")[0]).toHaveClass("active");
    expect(screen.getAllByTitle("显示")[0]).toHaveClass("active");

    fireEvent.change(screen.getByLabelText("标题位置路径 X"), {
      target: { value: "180" },
    });
    fireEvent.change(screen.getByLabelText("标题缩放数值"), {
      target: { value: "125" },
    });
    fireEvent.change(screen.getByLabelText("标题背景颜色数值"), {
      target: { value: "#a5d8ff" },
    });
    fireEvent.click(screen.getAllByTitle("纯色")[0]);
    fireEvent.click(screen.getAllByTitle("隐藏")[0]);

    const project = readProject();
    expect(
      project.tracks[0].properties
        ?.find((property) => property.property === "transform.x")
        ?.keyframes.find((keyframe) => keyframe.atMs === 750)?.value,
    ).toBe(180);
    expect(
      project.tracks[0].properties
        ?.find((property) => property.property === "transform.scale")
        ?.keyframes.find((keyframe) => keyframe.atMs === 750)?.value,
    ).toBe(1.25);
    expect(
      project.tracks[0].properties
        ?.find((property) => property.property === "visual.backgroundColor")
        ?.keyframes.find((keyframe) => keyframe.atMs === 750)?.value,
    ).toBe("#A5D8FFFF");
    expect(
      project.tracks[0].properties
        ?.find((property) => property.property === "visual.fillStyle")
        ?.keyframes.find((keyframe) => keyframe.atMs === 750)?.value,
    ).toBe("solid");
    expect(
      project.tracks[0].properties
        ?.find((property) => property.property === "element.visibility")
        ?.keyframes.find((keyframe) => keyframe.atMs === 750),
    ).toMatchObject({ value: "hidden", hold: true });
    expect(animationProjectSchema.safeParse(project).success).toBe(true);
  });

  it("updates the selected keyframe instead of the current playhead", () => {
    render(<ControlledPanel />);
    const keyframe = screen.getByRole("button", {
      name: "标题位置路径关键帧，位于 600 毫秒",
    });
    fireEvent.pointerDown(keyframe, { clientX: 0 });
    fireEvent.pointerUp(window, { clientX: 0 });

    fireEvent.change(screen.getByLabelText("标题位置路径 X"), {
      target: { value: "240" },
    });

    const xKeyframes = readProject().tracks[0].properties?.find(
      (property) => property.property === "transform.x",
    )?.keyframes;
    expect(xKeyframes?.find((keyframe) => keyframe.atMs === 500)?.value).toBe(
      240,
    );
    expect(xKeyframes?.some((keyframe) => keyframe.atMs === 750)).toBe(false);
  });

  it("drags numeric inputs horizontally while preserving direct input", () => {
    render(<ControlledPanel />);
    const input = screen.getByLabelText("标题位置路径 X");

    expect(input).toHaveClass("animation-panel__draggable-number");
    fireEvent(
      input,
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 100,
      }),
    );
    expect(document.body).toHaveClass("powdoo-cursor-resize");
    fireEvent(
      window,
      new MouseEvent("pointermove", { bubbles: true, clientX: 120 }),
    );
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
    expect(document.body).not.toHaveClass("powdoo-cursor-resize");

    expect(screen.getByLabelText("标题位置路径 X")).toHaveValue(130);
    expect(
      readProject()
        .tracks[0].properties?.find(
          (property) => property.property === "transform.x",
        )
        ?.keyframes.find((keyframe) => keyframe.atMs === 750)?.value,
    ).toBe(130);

    fireEvent.change(screen.getByLabelText("标题位置路径 X"), {
      target: { value: "150" },
    });
    expect(screen.getByLabelText("标题位置路径 X")).toHaveValue(150);
  });

  it("keeps property rows in a fixed order when a track becomes active", () => {
    render(<ControlledPanel />);
    const readPropertyOrder = () => {
      const firstObject = document.querySelector(
        ".animation-panel__object-group",
      );
      return Array.from(
        firstObject?.querySelectorAll(".animation-panel__property-name") ?? [],
      ).map((element) => element.textContent);
    };
    const expectedOrder = [
      "位置路径",
      "缩放",
      "旋转",
      "不透明度",
      "背景颜色",
      "填充样式",
      "描边颜色",
      "描边宽度",
      "边框样式",
      "线条风格",
      "边角",
      "显示状态",
    ];

    expect(readPropertyOrder()).toEqual(expectedOrder);
    const firstObject = document.querySelector(
      ".animation-panel__object-group",
    );
    expect(
      firstObject?.querySelectorAll(".animation-panel__property-segment"),
    ).toHaveLength(1);
    expect(
      firstObject
        ?.querySelector(".animation-panel__property-name")
        ?.closest(".animation-panel__property-row"),
    ).not.toHaveClass("is-empty");
    expect(
      Array.from(
        firstObject?.querySelectorAll(".animation-panel__property-name") ?? [],
      )
        .find((element) => element.textContent === "缩放")
        ?.closest(".animation-panel__property-row"),
    ).toHaveClass("is-empty");
    expect(
      firstObject?.querySelector(".animation-panel__object-span"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "标题添加背景颜色关键帧",
      }),
    );
    expect(readPropertyOrder()).toEqual(expectedOrder);
  });

  it("only connects adjacent keyframes and opens the easing editor", async () => {
    render(<ControlledPanel />);

    expect(
      screen.queryByRole("button", {
        name: "地图不透明度动画函数，从 0 毫秒 到 0 毫秒",
      }),
    ).not.toBeInTheDocument();

    const segment = screen.getByRole("button", {
      name: "标题位置路径动画函数，从 100 毫秒 到 600 毫秒",
    });
    vi.spyOn(segment, "getBoundingClientRect").mockReturnValue({
      left: 400,
      top: 200,
      width: 200,
      height: 12,
      right: 600,
      bottom: 212,
      x: 400,
      y: 200,
      toJSON: () => ({}),
    });
    fireEvent.click(segment);

    expect(
      screen.getByRole("button", {
        name: "标题位置路径动画函数，从 100 毫秒 到 600 毫秒",
      }),
    ).toHaveClass("is-selected");
    expect(screen.getByLabelText("动画函数编辑器")).toBeInTheDocument();
    const initialCurve = screen.getByLabelText("贝塞尔动画曲线");
    expect(initialCurve).toHaveTextContent("XY");
    expect(initialCurve.querySelector(".is-axis")).toHaveAttribute("y1", "18");
    expect(initialCurve.querySelector(".is-axis")).toHaveAttribute("y2", "190");

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      fireEvent.pointerDown(document.body, { button: 0, pointerType: "mouse" });
    });
    expect(screen.queryByLabelText("动画函数编辑器")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "标题位置路径动画函数，从 100 毫秒 到 600 毫秒",
      }),
    );

    fireEvent.change(screen.getByLabelText("动画函数预设"), {
      target: { value: "ease-in-out" },
    });
    expect(readProject().tracks[0].properties?.[0].keyframes[0].easing).toBe(
      undefined,
    );
    fireEvent.click(screen.getByRole("button", { name: "应用" }));
    let project = readProject();
    for (const propertyName of ["transform.x", "transform.y"] as const) {
      expect(
        project.tracks[0].properties
          ?.find((property) => property.property === propertyName)
          ?.keyframes.find((keyframe) => keyframe.atMs === 0)?.easing,
      ).toEqual({ type: "preset", name: "ease-in-out" });
    }

    fireEvent.click(
      screen.getByRole("button", {
        name: "标题位置路径动画函数，从 100 毫秒 到 600 毫秒",
      }),
    );
    fireEvent.change(screen.getByLabelText("动画函数预设"), {
      target: { value: "custom" },
    });
    fireEvent.change(screen.getByLabelText("贝塞尔曲线 X1"), {
      target: { value: "0.33" },
    });
    project = readProject();
    expect(project.tracks[0].properties?.[0].keyframes[0].easing).toEqual({
      type: "preset",
      name: "ease-in-out",
    });

    const curve = screen.getByLabelText("贝塞尔动画曲线");
    vi.spyOn(curve, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 220,
      height: 120,
      right: 220,
      bottom: 120,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(screen.getByLabelText("贝塞尔控制点 1"));
    fireEvent(
      window,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 100,
        clientY: 50,
      }),
    );
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
    fireEvent.click(screen.getByRole("button", { name: "应用" }));
    project = readProject();
    expect(project.tracks[0].properties?.[0].keyframes[0].easing).toMatchObject(
      { type: "cubic-bezier", x1: 0.42, y1: 0.57 },
    );
    expect(animationProjectSchema.safeParse(project).success).toBe(true);
  });

  it("deletes a segment and removes endpoints without other connections", () => {
    render(<ControlledPanel />);
    const segmentName = "标题位置路径动画函数，从 100 毫秒 到 600 毫秒";
    fireEvent.click(screen.getByRole("button", { name: segmentName }));
    fireEvent.click(screen.getByRole("button", { name: "删除连线" }));

    const project = readProject();
    for (const propertyName of ["transform.x", "transform.y"] as const) {
      expect(
        project.tracks[0].properties?.find(
          (property) => property.property === propertyName,
        ),
      ).toBeUndefined();
    }
    expect(animationProjectSchema.safeParse(project).success).toBe(true);
    expect(screen.queryByRole("button", { name: segmentName })).toBeNull();
    expect(screen.queryByLabelText("动画函数编辑器")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "连接标题位置路径，从 100 毫秒 到 600 毫秒",
      }),
    ).toBeNull();
  });

  it("keeps shared endpoint keyframes when deleting only their middle segment", () => {
    const project: AnimationProject = {
      schemaVersion: ANIMATION_SCHEMA_VERSION,
      id: "shared-segment-endpoints",
      durationMs: 400,
      frameRate: 30,
      tracks: [
        {
          id: "shared-track",
          target: { type: "element", elementId: "shape" },
          properties: [
            {
              property: "transform.x",
              keyframes: [
                { atMs: 0, value: 0 },
                { atMs: 100, value: 10 },
                { atMs: 200, value: 20 },
                { atMs: 300, value: 30 },
              ],
            },
          ],
        },
      ],
    };
    const next = deletePropertySegment(
      project,
      "shared-track",
      "transform.x",
      100,
      200,
    );
    expect(next.tracks[0].properties?.[0].keyframes).toEqual([
      { atMs: 0, value: 0 },
      { atMs: 100, value: 10, hold: true },
      { atMs: 200, value: 20 },
      { atMs: 300, value: 30 },
    ]);
  });

  it("selects a segment against external track state and deletes it with Delete", () => {
    const SyncedPanel = () => {
      const [activeTrackId, setActiveTrackId] = useState("map-track");
      return (
        <>
          <ControlledPanel
            activeTrackId={activeTrackId}
            onSelectTrack={setActiveTrackId}
          />
          <output data-testid="active-track">{activeTrackId}</output>
        </>
      );
    };
    render(<SyncedPanel />);
    const segmentName = "标题位置路径动画函数，从 100 毫秒 到 600 毫秒";
    fireEvent.pointerDown(screen.getByRole("button", { name: segmentName }), {
      button: 0,
    });

    expect(screen.getByTestId("active-track")).toHaveTextContent("title-track");
    expect(screen.getByLabelText("动画函数编辑器")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Delete" });

    const project = readProject();
    expect(project.tracks[0].properties).toEqual([]);
    expect(screen.queryByRole("button", { name: segmentName })).toBeNull();
  });

  it("drags a position path keyframe and moves x/y together", () => {
    render(<ControlledPanel />);
    const keyframe = screen.getByRole("button", {
      name: "标题位置路径关键帧，位于 600 毫秒",
    });
    vi.spyOn(keyframe.parentElement!, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 1000,
      top: 0,
      right: 1000,
      bottom: 34,
      height: 34,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(keyframe, { clientX: 300 });
    fireEvent(
      window,
      new MouseEvent("pointermove", { bubbles: true, clientX: 600 }),
    );
    fireEvent(
      window,
      new MouseEvent("pointerup", { bubbles: true, clientX: 600 }),
    );

    const project = readProject();
    expect(
      project.tracks[0].properties?.[0].keyframes.map(({ atMs }) => atMs),
    ).toEqual([0, 1100]);
    expect(
      project.tracks[0].properties?.[1].keyframes.map(({ atMs }) => atMs),
    ).toEqual([0, 1100]);
    expect(animationProjectSchema.safeParse(project).success).toBe(true);
  });

  it("drags an object keyframe as the aggregate switch for all properties", () => {
    render(<ControlledPanel />);
    const keyframe = screen.getByRole("button", {
      name: "标题对象关键帧，位于 600 毫秒",
    });
    vi.spyOn(keyframe.parentElement!, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 1000,
      top: 0,
      right: 1000,
      bottom: 42,
      height: 42,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(keyframe, { clientX: 300 });
    fireEvent(
      window,
      new MouseEvent("pointermove", { bubbles: true, clientX: 500 }),
    );
    fireEvent(
      window,
      new MouseEvent("pointerup", { bubbles: true, clientX: 500 }),
    );

    const project = readProject();
    expect(
      project.tracks[0].properties?.[0].keyframes.map(({ atMs }) => atMs),
    ).toEqual([0, 900]);
    expect(
      project.tracks[0].properties?.[1].keyframes.map(({ atMs }) => atMs),
    ).toEqual([0, 900]);
    expect(animationProjectSchema.safeParse(project).success).toBe(true);
  });

  it("deletes the last keyframe and leaves an editable empty track", () => {
    render(<ControlledPanel currentTimeMs={0} />);
    fireEvent.click(screen.getAllByText("地图")[0]);
    const keyframe = screen.getByRole("button", {
      name: "地图不透明度关键帧，位于 0 毫秒",
    });
    fireEvent.pointerDown(keyframe, { clientX: 0 });
    fireEvent.pointerUp(window, { clientX: 0 });
    fireEvent.click(screen.getByRole("button", { name: "删除选中的关键帧" }));

    const project = readProject();
    expect(project.tracks[1].properties).toHaveLength(0);
    expect(animationProjectSchema.safeParse(project).success).toBe(true);
  });

  it("adds, edits, and removes a first-class chapter transition", () => {
    render(<ControlledTransitionPanel />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "添加 第一章 到 第二章 的章节转场",
      }),
    );
    expect(screen.getByText("PPT 翻页")).toBeTruthy();
    expect(screen.getByText("转场进度")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "打开PPT翻页转场设置" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("option", { name: "PPT 画布推移" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "镜头漫游" }),
    ).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("combobox", { name: "方向擦除转场转场类型" }),
      { target: { value: "push" } },
    );

    let project = readProject();
    expect(project.tracks[0].target).toMatchObject({
      type: "transition",
      effect: "push",
      fromSceneId: "chapter-1",
      toSceneId: "chapter-2",
    });
    expect(
      project.tracks[0].properties?.some(
        (property) => property.property === "transition.scale",
      ),
    ).toBe(true);
    expect(animationProjectSchema.safeParse(project).success).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "删除画布推移转场" }));
    project = readProject();
    expect(project.tracks).toHaveLength(0);
  });

  it("creates manual scenes at the playhead when the project has no scenes", () => {
    render(<ControlledPanel currentTimeMs={850} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "在当前时间创建场景边界并添加PPT翻页",
      }),
    );

    const project = readProject();
    expect(project.scenes).toEqual([
      { id: "scene-1", name: "场景 1", startMs: 0, durationMs: 850 },
      {
        id: "scene-2",
        name: "场景 2",
        startMs: 850,
        durationMs: 1150,
      },
    ]);
    expect(
      project.tracks.some(
        (track) =>
          track.target.type === "transition" &&
          track.target.fromSceneId === "scene-1" &&
          track.target.toSceneId === "scene-2" &&
          track.target.effect === "directional-wipe",
      ),
    ).toBe(true);
    expect(animationProjectSchema.safeParse(project).success).toBe(true);
  });

  it("keeps the page-transition entry enabled and replaces a camera boundary", () => {
    render(<ControlledCameraTransitionPanel />);

    const switchButton = screen.getByRole("button", {
      name: "将 第一章 到 第二章 从空间运镜切换为PPT翻页",
    });
    expect(switchButton).toBeEnabled();
    fireEvent.click(switchButton);

    const project = readProject();
    expect(project.tracks).toHaveLength(1);
    expect(project.tracks[0].target).toMatchObject({
      type: "transition",
      transitionId: "chapter-1-2",
      fromSceneId: "chapter-1",
      toSceneId: "chapter-2",
      effect: "directional-wipe",
    });
    expect(project.tracks[0].startMs).toBe(1000);
    expect(project.tracks[0].durationMs).toBe(800);
    expect(animationProjectSchema.safeParse(project).success).toBe(true);
  });
});
