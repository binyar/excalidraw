import clsx from "clsx";
import React from "react";

import { composeEventHandlers } from "@excalidraw/common";

interface ButtonProps
  extends React.DetailedHTMLProps<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  > {
  type?: "button" | "submit" | "reset";
  onSelect: () => any;
  /** whether button is in active state */
  selected?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * A generic button component that follows Excalidraw's design system.
 * Style can be customised using `className` or `style` prop.
 * Accepts all props that a regular `button` element accepts.
 */
export const Button = ({
  type = "button",
  onSelect,
  selected,
  children,
  className = "",
  ...rest
}: ButtonProps) => {
  return (
    <button
      onClick={composeEventHandlers(rest.onClick, (event) => {
        onSelect();
      })}
      type={type}
      className={clsx(
        "powdoo-button inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-4 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        className,
        { "border-primary bg-primary text-primary-foreground": selected },
      )}
      {...rest}
    >
      {children}
    </button>
  );
};
