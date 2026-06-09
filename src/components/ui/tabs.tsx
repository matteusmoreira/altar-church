"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    density?: "default" | "compact"
  }
>(({ className, density = "default", ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    data-density={density}
    className={cn(
      "inline-flex max-w-full items-center justify-start gap-1 overflow-x-auto rounded-md bg-muted p-1 text-muted-foreground/70 scrollbar-thin data-[density=compact]:gap-0.5 data-[density=compact]:p-0.5 data-[density=compact]:[&_[role=tab]]:px-2 data-[density=compact]:[&_[role=tab]]:py-1 data-[density=compact]:[&_[role=tab]]:text-xs data-[density=compact]:[&_[role=tab]_svg]:h-3.5 data-[density=compact]:[&_[role=tab]_svg]:w-3.5",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium outline-offset-2 transition-all touch-manipulation hover:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 disabled:pointer-events-none disabled:opacity-50 md:min-h-0 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:shadow-black/5 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
