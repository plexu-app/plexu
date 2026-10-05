import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Pílulas do mockup (.pill, .calc): mono 10px caixa-alta, raio 3px.
const badgeVariants = cva("inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.06em]", {
  variants: {
    variant: {
      default: "border-transparent bg-accent-soft text-accent",
      secondary: "border-transparent bg-bg text-ink-2",
      outline: "border-line text-ink-3",
      destructive: "border-transparent bg-err-soft text-err",
      calculado: "border-line text-ink-3",
      ok: "border-transparent bg-ok-soft text-ok",
      aviso: "border-transparent bg-warn-soft text-warn",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded border border-line bg-paper", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 border-b border-line px-3 py-2", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("text-[13px] font-semibold", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-3", className)} {...props} />;
}

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}
export const THead = ({ className, ...p }: React.ComponentProps<"thead">) => <thead className={cn("[&_tr]:border-b [&_tr]:border-line-2", className)} {...p} />;
export const TBody = ({ className, ...p }: React.ComponentProps<"tbody">) => <tbody className={cn("[&_tr:last-child]:border-0", className)} {...p} />;
export const Tr = ({ className, ...p }: React.ComponentProps<"tr">) => <tr className={cn("h-9 border-b border-line-2 hover:bg-bg", className)} {...p} />;
export const Th = ({ className, ...p }: React.ComponentProps<"th">) => (
  <th className={cn("h-8 px-3 text-left align-middle font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-ink-3", className)} {...p} />
);
export const Td = ({ className, ...p }: React.ComponentProps<"td">) => <td className={cn("px-3 py-0 align-middle", className)} {...p} />;
