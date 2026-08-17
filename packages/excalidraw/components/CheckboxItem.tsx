import clsx from "clsx";
import React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { checkIcon } from "./icons";

export const CheckboxItem: React.FC<{
  checked: boolean;
  onChange: (checked: boolean, event: React.MouseEvent) => void;
  className?: string;
  children?: React.ReactNode;
}> = ({ children, checked, onChange, className }) => {
  return (
    <div
      className={clsx(
        "Checkbox flex cursor-pointer select-none items-center gap-2 py-1 text-sm",
        className,
        { "is-checked": checked },
      )}
      onClick={(event) => {
        onChange(!checked, event);
        (
          (event.currentTarget as HTMLDivElement).querySelector(
            ".Checkbox-box",
          ) as HTMLButtonElement
        ).focus();
      }}
    >
      <CheckboxPrimitive.Root
        className="Checkbox-box"
        checked={checked}
        onCheckedChange={() => undefined}
      >
        <span className="flex size-4 shrink-0 items-center justify-center rounded border border-primary shadow-xs data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground">
          <CheckboxPrimitive.Indicator className="size-3.5">
            {checkIcon}
          </CheckboxPrimitive.Indicator>
        </span>
      </CheckboxPrimitive.Root>
      <div className="Checkbox-label flex items-center">{children}</div>
    </div>
  );
};
