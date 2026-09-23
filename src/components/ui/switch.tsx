import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors duration-(--motion-quick) ease-(--ease-out) data-[state=checked]:bg-accent data-[state=unchecked]:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-fg transition-transform duration-(--motion-quick) ease-(--ease-out) data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent-fg" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";
