import { Switch as SwitchPrimitive } from "radix-ui";
import type React from "react";

import { cn } from "@/lib/utils";

export const Switch = ({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) => (
  <SwitchPrimitive.Root
    data-slot="switch"
    className={cn(
      "peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent bg-input shadow-xs outline-none transition-all data-[state=checked]:bg-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)]" />
  </SwitchPrimitive.Root>
);
