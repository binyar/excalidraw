import clsx from "clsx";
import React, { useEffect, useState } from "react";

import { KEYS, queryFocusableElements } from "@excalidraw/common";

import { useSetAtom } from "../editor-jotai";
import { useCallbackRefState } from "../hooks/useCallbackRefState";
import { t } from "../i18n";

import {
  useExcalidrawContainer,
  useEditorInterface,
  useExcalidrawSetAppState,
} from "./App";
import { isLibraryMenuOpenAtom } from "./LibraryMenu";
import { Modal } from "./Modal";
import { CloseIcon } from "./icons";

export type DialogSize = number | "small" | "regular" | "wide" | undefined;

export interface DialogProps {
  children: React.ReactNode;
  className?: string;
  size?: DialogSize;
  onCloseRequest(): void;
  title: React.ReactNode | false;
  autofocus?: boolean;
  closeOnClickOutside?: boolean;
}

function getDialogSize(size: DialogSize): number {
  if (size && typeof size === "number") {
    return size;
  }

  switch (size) {
    case "small":
      return 550;
    case "wide":
      return 1024;
    case "regular":
    default:
      return 800;
  }
}

export const Dialog = (props: DialogProps) => {
  const [islandNode, setIslandNode] = useCallbackRefState<HTMLDivElement>();
  const [lastActiveElement] = useState(document.activeElement);
  const { id } = useExcalidrawContainer();
  const isFullscreen = useEditorInterface().formFactor === "phone";

  useEffect(() => {
    if (!islandNode) {
      return;
    }

    const focusableElements = queryFocusableElements(islandNode);

    setTimeout(() => {
      if (focusableElements.length > 0 && props.autofocus !== false) {
        // If there's an element other than close, focus it.
        (focusableElements[1] || focusableElements[0]).focus();
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEYS.TAB) {
        const focusableElements = queryFocusableElements(islandNode);
        const { activeElement } = document;
        const currentIndex = focusableElements.findIndex(
          (element) => element === activeElement,
        );

        if (currentIndex === 0 && event.shiftKey) {
          focusableElements[focusableElements.length - 1].focus();
          event.preventDefault();
        } else if (
          currentIndex === focusableElements.length - 1 &&
          !event.shiftKey
        ) {
          focusableElements[0].focus();
          event.preventDefault();
        }
      }
    };

    islandNode.addEventListener("keydown", handleKeyDown);

    return () => islandNode.removeEventListener("keydown", handleKeyDown);
  }, [islandNode, props.autofocus]);

  const setAppState = useExcalidrawSetAppState();
  const setIsLibraryMenuOpen = useSetAtom(isLibraryMenuOpenAtom);

  const onClose = () => {
    setAppState({ openMenu: null });
    setIsLibraryMenuOpen(false);
    (lastActiveElement as HTMLElement).focus();
    props.onCloseRequest();
  };

  return (
    <Modal
      className={clsx("Dialog", props.className, {
        "Dialog--fullscreen p-0 [&_.Modal__content]:absolute [&_.Modal__content]:inset-0 [&_.Modal__content]:max-w-none [&_.Modal__content]:rounded-none [&_.Modal__content]:border-0":
          isFullscreen,
      })}
      labelledBy="dialog-title"
      maxWidth={getDialogSize(props.size)}
      onCloseRequest={onClose}
      closeOnClickOutside={props.closeOnClickOutside}
    >
      <div ref={setIslandNode} className="p-6">
        {props.title && (
          <h2
            id={`${id}-dialog-title`}
            className="Dialog__title mb-6 border-b pb-3 text-left text-lg font-semibold tracking-tight"
          >
            <span className="Dialog__titleContent">{props.title}</span>
          </h2>
        )}
        {isFullscreen && (
          <button
            className="Dialog__close absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onClose}
            title={t("buttons.close")}
            aria-label={t("buttons.close")}
            type="button"
          >
            {CloseIcon}
          </button>
        )}
        <div className="Dialog__content">{props.children}</div>
      </div>
    </Modal>
  );
};
