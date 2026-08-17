import { CaptureUpdateAction, newElementWith } from "@excalidraw/element";
import {
  useExcalidrawAPI,
  useExcalidrawElements,
} from "@excalidraw/excalidraw/components/App";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconBot } from "nucleo-glass";

import { animationWorkspace } from "../../src/animation/inspector";

import { hasPendingAiCreatePrompt } from "../ai/pendingPrompt";
import { getWorkspaceFileIdFromPath } from "../workspace/editorRoute";

import { AIStoryPanel } from "./AIStoryPanel";
import { Button } from "./ui/button";

export const AppSidebar = () => {
  const { selectedElementIds, theme } = useUIAppState();
  const elements = useExcalidrawElements();
  const excalidrawAPI = useExcalidrawAPI();
  const botIconId = useId().replace(/:/g, "");
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const previousSelectedElementIdRef = useRef<string | null | undefined>(
    undefined,
  );
  const previousSceneElementIdsRef = useRef<Set<string> | null>(null);
  const previousBackgroundColorsRef = useRef<Map<string, string> | null>(null);
  const restoredBackgroundColorsRef = useRef(new Map<string, string>());
  const previousFillStylesRef = useRef<Map<
    string,
    "hachure" | "cross-hatch" | "solid" | "zigzag"
  > | null>(null);
  const restoredFillStylesRef = useRef(
    new Map<string, "hachure" | "cross-hatch" | "solid" | "zigzag">(),
  );
  const selectedIds = Object.keys(selectedElementIds).filter(
    (elementId) => selectedElementIds[elementId],
  );
  const selectedElement =
    selectedIds.length === 1
      ? elements.find(
          (element) =>
            element.id === selectedIds[0] && element.isDeleted === false,
        ) ?? null
      : null;

  useEffect(() => {
    const workspaceFileId = getWorkspaceFileIdFromPath();
    if (workspaceFileId && hasPendingAiCreatePrompt(workspaceFileId)) {
      setIsAiChatOpen(true);
    }
  }, []);

  useEffect(() => {
    const currentElementIds = new Set(
      elements
        .filter((element) => element.isDeleted === false)
        .map((element) => element.id),
    );
    const previousElementIds = previousSceneElementIdsRef.current;
    previousSceneElementIdsRef.current = currentElementIds;
    if (!previousElementIds) {
      return;
    }
    const removedElementIds = new Set(
      [...previousElementIds].filter(
        (elementId) => !currentElementIds.has(elementId),
      ),
    );
    animationWorkspace.removeElementAnimations(removedElementIds);
  }, [elements]);

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    const initialElements = excalidrawAPI.getSceneElements();
    previousBackgroundColorsRef.current = new Map(
      initialElements.map((element) => [element.id, element.backgroundColor]),
    );
    previousFillStylesRef.current = new Map(
      initialElements.map((element) => [element.id, element.fillStyle]),
    );

    return excalidrawAPI.onChange((nextElements) => {
      const currentElements = nextElements.filter(
        (element) => element.isDeleted === false,
      );
      const currentBackgroundColors = new Map(
        currentElements.map((element) => [element.id, element.backgroundColor]),
      );
      const previousBackgroundColors = previousBackgroundColorsRef.current;
      previousBackgroundColorsRef.current = currentBackgroundColors;
      const currentFillStyles = new Map(
        currentElements.map((element) => [element.id, element.fillStyle]),
      );
      const previousFillStyles = previousFillStylesRef.current;
      previousFillStylesRef.current = currentFillStyles;
      if (!previousBackgroundColors || !previousFillStyles) {
        return;
      }

      const colorsToRestore = new Map<string, string>();
      const fillStylesToRestore = new Map<
        string,
        "hachure" | "cross-hatch" | "solid" | "zigzag"
      >();
      currentElements.forEach((element) => {
        const restoredColor = restoredBackgroundColorsRef.current.get(
          element.id,
        );
        if (restoredColor === element.backgroundColor) {
          restoredBackgroundColorsRef.current.delete(element.id);
          return;
        }
        const previousColor = previousBackgroundColors.get(element.id);
        if (
          previousColor === undefined ||
          previousColor === element.backgroundColor ||
          !animationWorkspace.stageElementBackgroundColor(
            element.id,
            element.backgroundColor,
          )
        ) {
          return;
        }
        colorsToRestore.set(element.id, previousColor);
        restoredBackgroundColorsRef.current.set(element.id, previousColor);
      });
      currentElements.forEach((element) => {
        const restoredFillStyle = restoredFillStylesRef.current.get(element.id);
        if (restoredFillStyle === element.fillStyle) {
          restoredFillStylesRef.current.delete(element.id);
          return;
        }
        const previousFillStyle = previousFillStyles.get(element.id);
        if (
          previousFillStyle === undefined ||
          previousFillStyle === element.fillStyle ||
          !animationWorkspace.stageElementFillStyle(
            element.id,
            element.fillStyle,
          )
        ) {
          return;
        }
        fillStylesToRestore.set(element.id, previousFillStyle);
        restoredFillStylesRef.current.set(element.id, previousFillStyle);
      });
      if (colorsToRestore.size === 0 && fillStylesToRestore.size === 0) {
        return;
      }

      excalidrawAPI.updateScene({
        elements: nextElements.map((element) => {
          const backgroundColor = colorsToRestore.get(element.id);
          const fillStyle = fillStylesToRestore.get(element.id);
          return backgroundColor === undefined && fillStyle === undefined
            ? element
            : newElementWith(element, {
                ...(backgroundColor === undefined ? {} : { backgroundColor }),
                ...(fillStyle === undefined ? {} : { fillStyle }),
              });
        }),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    });
  }, [excalidrawAPI]);

  useEffect(() => {
    const selectedElementChanged =
      previousSelectedElementIdRef.current !== (selectedElement?.id ?? null);
    previousSelectedElementIdRef.current = selectedElement?.id ?? null;

    if (!selectedElementChanged) {
      return;
    }
    animationWorkspace.setActiveElement(selectedElement?.id ?? null);
    if (!selectedElement) {
      return;
    }

    animationWorkspace.ensureElementTrack({
      id: selectedElement.id,
      type: selectedElement.type,
      strokeColor: selectedElement.strokeColor,
      backgroundColor: selectedElement.backgroundColor,
      fillStyle: selectedElement.fillStyle,
    });
  }, [selectedElement]);

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    return excalidrawAPI.onPointerUp((activeTool, pointerDownState) => {
      if (
        activeTool.type !== "selection" ||
        (!pointerDownState.drag.hasOccurred &&
          !pointerDownState.resize.isResizing)
      ) {
        return;
      }

      const currentElements = excalidrawAPI.getSceneElements();
      const currentElementsById = new Map(
        currentElements.map((element) => [element.id, element]),
      );
      const restoredElementIds = new Set<string>();

      for (const [elementId, original] of pointerDownState.originalElements) {
        const current = currentElementsById.get(elementId);
        if (!current || !animationWorkspace.getElementTrack(elementId)) {
          continue;
        }

        const originalCenterX = original.x + original.width / 2;
        const originalCenterY = original.y + original.height / 2;
        const currentCenterX = current.x + current.width / 2;
        const currentCenterY = current.y + current.height / 2;
        const isRotation = pointerDownState.resize.handleType === "rotation";
        const isResize = pointerDownState.resize.isResizing && !isRotation;
        const xDelta = isResize
          ? currentCenterX - originalCenterX
          : current.x - original.x;
        const yDelta = isResize
          ? currentCenterY - originalCenterY
          : current.y - original.y;
        const widthRatio =
          original.width === 0 ? 1 : Math.abs(current.width / original.width);
        const heightRatio =
          original.height === 0
            ? 1
            : Math.abs(current.height / original.height);
        const scaleMultiplier = isResize
          ? (widthRatio + heightRatio) / 2
          : undefined;
        const rotationDelta = isRotation
          ? ((current.angle - original.angle) * 180) / Math.PI
          : undefined;

        if (
          !animationWorkspace.stageElementTransform(elementId, {
            xDelta,
            yDelta,
            scaleMultiplier,
            rotationDelta,
          })
        ) {
          continue;
        }
        restoredElementIds.add(elementId);
      }

      if (restoredElementIds.size === 0) {
        return;
      }
      excalidrawAPI.updateScene({
        elements: currentElements.map((element) => {
          if (!restoredElementIds.has(element.id)) {
            return element;
          }
          const original = pointerDownState.originalElements.get(element.id)!;
          const {
            id: _id,
            index: _index,
            isDeleted: _isDeleted,
            version: _version,
            versionNonce: _versionNonce,
            updated: _updated,
            ...originalState
          } = original;
          return newElementWith(
            element,
            originalState as Parameters<typeof newElementWith>[1],
          );
        }),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    });
  }, [excalidrawAPI]);

  return (
    typeof document !== "undefined" &&
    createPortal(
      <div className={`theme--${theme} ai-chatbot-layer`}>
        {!isAiChatOpen && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ai-chatbot-trigger pointer-events-auto absolute right-4 top-4 size-10 rounded-none border-0 bg-transparent p-0 shadow-none hover:bg-transparent [&_svg]:size-6"
            aria-label="AI 对话"
            title="AI 对话"
            onClick={() => setIsAiChatOpen(true)}
          >
            <IconBot
              aria-hidden="true"
              className="ai-chatbot-bot-icon"
              uniqueId={`ai-chatbot-trigger-${botIconId}-`}
            />
          </Button>
        )}
        {isAiChatOpen && (
          <aside
            className="ai-chatbot-sidebar pointer-events-auto absolute inset-y-0 right-0 flex w-[min(454px,100vw)] min-w-0 flex-col overflow-hidden border-l bg-background shadow-xl"
            aria-label="AI 对话"
          >
            <AIStoryPanel onClose={() => setIsAiChatOpen(false)} />
          </aside>
        )}
      </div>,
      document.body,
    )
  );
};
