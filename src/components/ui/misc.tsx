import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "border-transparent bg-primary/10 text-primary",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      outline: "text-muted-foreground",
      destructive: "border-transparent bg-destructive/10 text-destructive",
      calculado: "border-dashed border-primary/40 bg-primary/5 text-primary",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-lg border bg-background shadow-xs", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 border-b px-4 py-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("text-sm font-semibold", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}
export const THead = ({ className, ...p }: React.ComponentProps<"thead">) => <thead className={cn("[&_tr]:border-b", className)} {...p} />;
export const TBody = ({ className, ...p }: React.ComponentProps<"tbody">) => <tbody className={cn("[&_tr:last-child]:border-0", className)} {...p} />;
export const Tr = ({ className, ...p }: React.ComponentProps<"tr">) => <tr className={cn("border-b hover:bg-muted/50", className)} {...p} />;
export const Th = ({ className, ...p }: React.ComponentProps<"th">) => (
  <th className={cn("h-9 px-2 text-left align-middle text-xs font-medium text-muted-foreground", className)} {...p} />
);
export const Td = ({ className, ...p }: React.ComponentProps<"td">) => <td className={cn("px-2 py-1.5 align-middle", className)} {...p} />;
