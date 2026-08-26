import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  CanvasDraftElement,
  CanvasElementStyle,
  StoryArtifact,
} from "../../../src/ai/story/types.ts";

type CanvasElementOverride = {
  elementId: string;
  label?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  style?: Partial<CanvasElementStyle>;
};

export type CurrentCanvasState = {
  storyId?: string;
  elements?: CanvasElementOverride[];
};

const isStoryArtifact = (value: unknown): value is StoryArtifact =>
  typeof value === "object" &&
  value !== null &&
  "kind" in value &&
  value.kind === "story-artifact" &&
  "canvas" in value;

export const parseCurrentCanvasState = (
  value: unknown,
): CurrentCanvasState | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const storyId =
    "storyId" in value && typeof value.storyId === "string"
      ? value.storyId
      : undefined;
  const elements =
    "elements" in value && Array.isArray(value.elements)
      ? value.elements.flatMap((item): CanvasElementOverride[] => {
          if (
            typeof item !== "object" ||
            item === null ||
            !("elementId" in item) ||
            typeof item.elementId !== "string"
          ) {
            return [];
          }
          const record = item as Record<string, unknown>;
          return [
            {
              elementId: item.elementId,
              ...(typeof record.label === "string"
                ? { label: record.label }
                : {}),
              ...(typeof record.x === "number" ? { x: record.x } : {}),
              ...(typeof record.y === "number" ? { y: record.y } : {}),
              ...(typeof record.width === "number"
                ? { width: record.width }
                : {}),
              ...(typeof record.height === "number"
                ? { height: record.height }
                : {}),
              ...(typeof record.style === "object" && record.style !== null
                ? { style: record.style as Partial<CanvasElementStyle> }
                : {}),
            },
          ];
        })
      : undefined;
  return { storyId, elements };
};

export const latestStoryArtifact = (
  transcript: AgentMessage[],
): StoryArtifact | null => {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const message = transcript[index];
    if (message?.role === "toolResult" && isStoryArtifact(message.details)) {
      return message.details;
    }
  }
  return null;
};

export const compactEditContext = (artifact: StoryArtifact | null): string => {
  if (!artifact) {
    return "";
  }
  const canvas = artifact.canvas;
  return JSON.stringify({
    id: canvas.id,
    title: canvas.title,
    summary: canvas.summary,
    beats: canvas.beats,
    spaceLayouts: canvas.spaceLayouts || [],
    sections: canvas.sections || [],
    elements: canvas.elements,
    libraryAssets: (canvas.libraryAssets || []).map(
      ({ elements: _elements, ...asset }) => asset,
    ),
    connectors: canvas.connectors,
    directorPlan: artifact.directorPlan,
  });
};

const finite = (value: number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const applyOverride = (
  element: CanvasDraftElement,
  override: CanvasElementOverride,
): CanvasDraftElement => ({
  ...element,
  ...(override.label !== undefined ? { label: override.label } : {}),
  x: finite(override.x, element.x),
  y: finite(override.y, element.y),
  width: Math.max(1, finite(override.width, element.width)),
  height: Math.max(1, finite(override.height, element.height)),
  ...(override.style ? { style: { ...element.style, ...override.style } } : {}),
});

export const applyCurrentCanvasState = (
  artifact: StoryArtifact | null,
  currentCanvasState: CurrentCanvasState | null,
): StoryArtifact | null => {
  if (
    !artifact ||
    !currentCanvasState ||
    currentCanvasState.storyId !== artifact.canvas.id ||
    !currentCanvasState.elements
  ) {
    return artifact;
  }
  const overrides = new Map(
    currentCanvasState.elements
      .slice(0, 500)
      .map((item) => [item.elementId, item]),
  );
  const canvas = structuredClone(artifact.canvas);
  canvas.elements = canvas.elements.map((element) => {
    const override = overrides.get(element.id);
    return override ? applyOverride(element, override) : element;
  });
  return { ...artifact, canvas };
};
