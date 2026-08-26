type ExcalidrawDrawing = {
  type: "excalidraw";
  elements: unknown[];
};

export const normalizeName = (
  value: unknown,
  fallback = "未命名画板.excalidraw",
) => {
  const name = String(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|\0]/g, "-");
  return name.slice(0, 180) || fallback;
};

export const normalizeDrawingName = (value: unknown) => {
  const name = normalizeName(value);
  return name.toLowerCase().endsWith(".excalidraw")
    ? name
    : `${name}.excalidraw`;
};

export const isDrawing = (value: unknown): value is ExcalidrawDrawing =>
  Boolean(
    value &&
      typeof value === "object" &&
      "type" in value &&
      value.type === "excalidraw" &&
      "elements" in value &&
      Array.isArray(value.elements),
  );

export const createEmptyDrawing = () =>
  JSON.stringify(
    {
      type: "excalidraw",
      version: 2,
      source: "workspace",
      elements: [],
      appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
      files: {},
    },
    null,
    2,
  );
