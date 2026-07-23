import { useEffect, useMemo, useState } from "react";

type PreviewElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  points?: readonly (readonly [number, number])[];
  isDeleted?: boolean;
};

const readElements = async (fileId: string): Promise<PreviewElement[]> => {
  const response = await fetch(
    `/api/workspace/files/${fileId}/content?preview=true`,
  );
  if (!response.ok) {
    return [];
  }
  const drawing = await response.json();
  return Array.isArray(drawing.elements)
    ? drawing.elements.filter((element: PreviewElement) => !element.isDeleted)
    : [];
};

export const WorkspacePreview = ({ fileId }: { fileId: string }) => {
  const [elements, setElements] = useState<PreviewElement[]>([]);

  useEffect(() => {
    let active = true;
    readElements(fileId)
      .then((next) => active && setElements(next))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [fileId]);

  const bounds = useMemo(() => {
    if (!elements.length) {
      return { x: 0, y: 0, width: 640, height: 360 };
    }
    const x1 = Math.min(...elements.map((element) => element.x));
    const y1 = Math.min(...elements.map((element) => element.y));
    const x2 = Math.max(
      ...elements.map((element) => element.x + Math.max(element.width, 1)),
    );
    const y2 = Math.max(
      ...elements.map((element) => element.y + Math.max(element.height, 1)),
    );
    const padding = Math.max(20, Math.max(x2 - x1, y2 - y1) * 0.12);
    return {
      x: x1 - padding,
      y: y1 - padding,
      width: x2 - x1 + padding * 2,
      height: y2 - y1 + padding * 2,
    };
  }, [elements]);

  return (
    <svg
      className="workspace-preview"
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="画板预览"
    >
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        fill="#fff"
      />
      {elements.length === 0 && (
        <g className="workspace-preview__empty">
          <rect
            x="230"
            y="115"
            width="180"
            height="110"
            rx="12"
            fill="#f1efff"
            stroke="#d9d5ff"
            strokeWidth="3"
          />
          <path
            d="M275 170h90M320 140v60"
            stroke="#a699ff"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </g>
      )}
      {elements.slice(0, 120).map((element) => {
        const common = {
          stroke: element.strokeColor || "#1b1b1f",
          strokeWidth: element.strokeWidth || 2,
          fill:
            element.backgroundColor && element.backgroundColor !== "transparent"
              ? element.backgroundColor
              : "none",
          opacity: (element.opacity ?? 100) / 100,
          transform: element.angle
            ? `rotate(${(element.angle * 180) / Math.PI} ${
                element.x + element.width / 2
              } ${element.y + element.height / 2})`
            : undefined,
        };
        if (element.type === "ellipse") {
          return (
            <ellipse
              key={element.id}
              {...common}
              cx={element.x + element.width / 2}
              cy={element.y + element.height / 2}
              rx={Math.abs(element.width / 2)}
              ry={Math.abs(element.height / 2)}
            />
          );
        }
        if (element.type === "diamond") {
          return (
            <path
              key={element.id}
              {...common}
              d={`M${element.x + element.width / 2} ${element.y}L${
                element.x + element.width
              } ${element.y + element.height / 2}L${
                element.x + element.width / 2
              } ${element.y + element.height}L${element.x} ${
                element.y + element.height / 2
              }Z`}
            />
          );
        }
        if (element.type === "text") {
          return (
            <text
              key={element.id}
              {...common}
              stroke="none"
              fill={element.strokeColor || "#1b1b1f"}
              x={element.x}
              y={element.y + (element.fontSize || 20)}
              fontSize={element.fontSize || 20}
              fontFamily="sans-serif"
            >
              {(element.text || "").slice(0, 80)}
            </text>
          );
        }
        if (
          ["line", "arrow", "freedraw"].includes(element.type) &&
          element.points?.length
        ) {
          const d = element.points
            .map(
              (point, index) =>
                `${index ? "L" : "M"}${element.x + point[0]} ${
                  element.y + point[1]
                }`,
            )
            .join(" ");
          return <path key={element.id} {...common} fill="none" d={d} />;
        }
        return (
          <rect
            key={element.id}
            {...common}
            x={element.x}
            y={element.y}
            width={Math.abs(element.width)}
            height={Math.abs(element.height)}
            rx="6"
          />
        );
      })}
    </svg>
  );
};
