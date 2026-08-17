import { Popover as PopoverPrimitive } from "radix-ui";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = ({
  className,
  align = "center",
  sideOffset = 8,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      data-slot="popover-content"
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 rounded-md border bg-popover text-popover-foreground shadow-md outline-none",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
);

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
