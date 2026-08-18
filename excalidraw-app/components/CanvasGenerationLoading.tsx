import { useAtomValue } from "../app-jotai";
import { isCanvasGeneratingAtom } from "../ai/canvasGenerationState";

import "./CanvasGenerationLoading.scss";

import type { CSSProperties } from "react";

const GRID_COLUMNS = 40;
const GRID_ROWS = 20;
const DOT_COUNT = GRID_COLUMNS * GRID_ROWS;

type DotStyle = CSSProperties & {
  "--canvas-loading-delay": string;
  "--canvas-loading-scale": number;
};

const dots = Array.from({ length: DOT_COUNT }, (_, index) => {
  const row = Math.floor(index / GRID_COLUMNS);
  const column = index % GRID_COLUMNS;
  const distanceFromUpperRight = Math.hypot(
    column - GRID_COLUMNS * 0.68,
    row - GRID_ROWS * 0.3,
  );
  const distanceFromLowerLeft = Math.hypot(
    column - GRID_COLUMNS * 0.3,
    row - GRID_ROWS * 0.7,
  );
  const strength = Math.max(
    Math.exp(-(distanceFromUpperRight ** 2) / 58),
    Math.exp(-(distanceFromLowerLeft ** 2) / 58),
  );
  return {
    index,
    style: {
      "--canvas-loading-delay": `${-(
        (row * 103 + column * 71 + Math.abs(row - column) * 29) %
        1900
      )}ms`,
      "--canvas-loading-scale": Number((0.34 + strength * 1.35).toFixed(3)),
    } as DotStyle,
  };
});

export const CanvasGenerationLoading = () => {
  const isGenerating = useAtomValue(isCanvasGeneratingAtom);
  if (!isGenerating) {
    return null;
  }

  return (
    <div
      className="canvas-generation-loading"
      role="status"
      aria-label="正在创建画布"
    >
      <div className="canvas-generation-loading__grid" aria-hidden="true">
        {dots.map((dot) => (
          <span key={dot.index} style={dot.style} />
        ))}
      </div>
    </div>
  );
};
