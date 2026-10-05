import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-8 w-full rounded border border-line bg-paper px-2.5 py-1 text-[13.5px] text-ink placeholder:text-ink-3 focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-ink-2",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-20 w-full rounded border border-line bg-paper px-2.5 py-1.5 text-[13.5px] text-ink placeholder:text-ink-3 focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-ink-2",
        className,
      )}
      {...props}
    />
  );
}

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "flex h-8 w-full rounded border border-line bg-paper px-2 py-1 text-[13.5px] text-ink focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-ink-2",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-xs leading-none text-ink-2", className)} {...props} />;
}
