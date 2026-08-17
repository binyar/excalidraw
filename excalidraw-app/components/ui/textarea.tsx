import type React from "react";

import { cn } from "@/lib/utils";

export const Textarea = ({
  className,
  ...props
}: React.ComponentProps<"textarea">) => (
  <textarea
    data-slot="textarea"
    className={cn(
      "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
      className,
    )}
    {...props}
  />
);
