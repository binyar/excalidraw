import clsx from "clsx";
import { useRef } from "react";
import { createPortal } from "react-dom";

import { KEYS } from "@excalidraw/common";

import { useCreatePortalContainer } from "../hooks/useCreatePortalContainer";

import type { AppState } from "../types";

export const Modal: React.FC<{
  className?: string;
  children: React.ReactNode;
  maxWidth?: number;
  onCloseRequest(): void;
  labelledBy: string;
  theme?: AppState["theme"];
  closeOnClickOutside?: boolean;
}> = (props) => {
  const { closeOnClickOutside = true } = props;
  const modalRoot = useCreatePortalContainer({
    className: "powdoo-modal-container absolute z-[var(--zIndex-modal)]",
  });

  const animationsDisabledRef = useRef(
    document.body.classList.contains("powdoo-animations-disabled"),
  );

  if (!modalRoot) {
    return null;
  }

  const handleKeydown = (event: React.KeyboardEvent) => {
    if (event.key === KEYS.ESCAPE) {
      event.nativeEvent.stopImmediatePropagation();
      event.stopPropagation();
      props.onCloseRequest();
    }
  };

  return createPortal(
    <div
      className={clsx(
        "Modal absolute inset-0 flex flex-col items-center justify-center overflow-auto p-10",
        props.className,
        {
          "animations-disabled": animationsDisabledRef.current,
        },
      )}
      role="dialog"
      aria-modal="true"
      onKeyDown={handleKeydown}
      aria-labelledby={props.labelledBy}
    >
      <div
        className="Modal__background fixed inset-0 z-[1] bg-black/50 backdrop-blur-[1px]"
        onClick={closeOnClickOutside ? props.onCloseRequest : undefined}
      />
      <div
        className="Modal__content relative z-[2] max-h-full w-full overflow-y-auto rounded-lg border bg-background shadow-lg focus:outline-none"
        style={{ maxWidth: props.maxWidth }}
        tabIndex={0}
      >
        {props.children}
      </div>
    </div>,
    modalRoot,
  );
};
