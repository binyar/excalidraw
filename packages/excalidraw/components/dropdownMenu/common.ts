import React, { useContext } from "react";

import { composeEventHandlers } from "@excalidraw/common";

export const DropdownMenuContentPropsContext = React.createContext<{
  onSelect?: (event: Event) => void;
}>({});

export const getDropdownMenuItemClassName = (
  className = "",
  selected = false,
  hovered = false,
) => {
  return `dropdown-menu-item dropdown-menu-item-base relative flex h-8 w-full cursor-default select-none items-center gap-2 rounded-sm px-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 ${className} ${
    selected ? "dropdown-menu-item--selected" : ""
  } ${hovered ? "dropdown-menu-item--hovered" : ""}`.trim();
};

export const useHandleDropdownMenuItemSelect = (
  onSelect: ((event: Event) => void) | undefined,
) => {
  const DropdownMenuContentProps = useContext(DropdownMenuContentPropsContext);

  return composeEventHandlers(onSelect, (event) => {
    DropdownMenuContentProps.onSelect?.(event);
  });
};
