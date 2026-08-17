import { render } from "@testing-library/react";

import {
  editorArrowIcon,
  editorDiamondIcon,
  editorEllipseIcon,
  editorEraserIcon,
  editorFreedrawIcon,
  editorHandIcon,
  editorImageIcon,
  editorLineIcon,
  editorMainMenuIcon,
  editorPenModeIcon,
  editorRectangleIcon,
  editorRedoIcon,
  editorSelectionIcon,
  editorTextIcon,
  editorUndoIcon,
  editorZoomInIcon,
  editorZoomOutIcon,
} from "./editorControlIcons";
import { LibraryIcon, searchIcon, TrashIcon } from "./icons";

describe("editor control icon boundary", () => {
  it("uses Lucide only for the controls inside the requested editor regions", () => {
    const editorIcons = [
      editorMainMenuIcon,
      editorPenModeIcon,
      editorHandIcon,
      editorSelectionIcon,
      editorRectangleIcon,
      editorDiamondIcon,
      editorEllipseIcon,
      editorArrowIcon,
      editorLineIcon,
      editorFreedrawIcon,
      editorTextIcon,
      editorImageIcon,
      editorEraserIcon,
      editorZoomInIcon,
      editorZoomOutIcon,
      editorUndoIcon,
      editorRedoIcon,
    ];
    const { container } = render(
      <>
        {editorIcons.map((icon, index) => (
          <span key={index}>{icon}</span>
        ))}
      </>,
    );

    expect(container.querySelectorAll("svg.editor-control-icon")).toHaveLength(
      editorIcons.length,
    );
    expect(container.querySelectorAll("svg.lucide")).toHaveLength(
      editorIcons.length,
    );
  });

  it("keeps shared icons outside those regions on Nucleo Glass", () => {
    const { container } = render(
      <>
        {LibraryIcon}
        {searchIcon}
        {TrashIcon}
      </>,
    );

    expect(container.querySelectorAll("svg.nucleo-glass-icon")).toHaveLength(3);
    expect(container.querySelector("svg.editor-control-icon")).toBeNull();
    expect(container.querySelector("svg.lucide")).toBeNull();
  });
});
