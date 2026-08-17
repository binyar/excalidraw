import { IconCircleCheck } from "nucleo-glass";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import React from "react";

import { cn } from "@/lib/utils";

export const Checkbox = ({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) => (
  <CheckboxPrimitive.Root
    data-slot="checkbox"
    className={cn(
      "peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs outline-none transition-shadow data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="grid place-content-center text-current">
      <IconCircleCheck aria-hidden="true" size="1em" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
);
