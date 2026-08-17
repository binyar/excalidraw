import {
  ArrowRight,
  Circle,
  Diamond,
  Eraser,
  Hand,
  Image,
  Menu,
  Minus,
  MousePointer2,
  Pencil,
  PenTool,
  Redo2,
  Square,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import "./editorControlIcons.scss";

import type { LucideIcon } from "lucide-react";

const editorControlIcon = (Icon: LucideIcon) => (
  <Icon
    aria-hidden="true"
    className="editor-control-icon"
    focusable="false"
    size="1em"
    strokeWidth={1.8}
  />
);

export const editorMainMenuIcon = editorControlIcon(Menu);
export const editorPenModeIcon = editorControlIcon(PenTool);
export const editorHandIcon = editorControlIcon(Hand);
export const editorSelectionIcon = editorControlIcon(MousePointer2);
export const editorRectangleIcon = editorControlIcon(Square);
export const editorDiamondIcon = editorControlIcon(Diamond);
export const editorEllipseIcon = editorControlIcon(Circle);
export const editorArrowIcon = editorControlIcon(ArrowRight);
export const editorLineIcon = editorControlIcon(Minus);
export const editorFreedrawIcon = editorControlIcon(Pencil);
export const editorTextIcon = editorControlIcon(Type);
export const editorImageIcon = editorControlIcon(Image);
export const editorEraserIcon = editorControlIcon(Eraser);
export const editorZoomInIcon = editorControlIcon(ZoomIn);
export const editorZoomOutIcon = editorControlIcon(ZoomOut);
export const editorUndoIcon = editorControlIcon(Undo2);
export const editorRedoIcon = editorControlIcon(Redo2);
