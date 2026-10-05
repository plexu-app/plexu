"use client";
// Modal e painel lateral (sheet) no padrão shadcn/ui, sobre @radix-ui/react-dialog.
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

function Fundo({ className }: { className?: string }) {
  return <D.Overlay className={cn("fixed inset-0 z-40 bg-scrim", className)} />;
}

function BotaoFechar() {
  return (
    <D.Close className="absolute right-3 top-3 rounded p-1 text-ink-3 hover:bg-bg hover:text-ink focus-visible:outline-2 focus-visible:outline-accent" aria-label="Fechar">
      <X className="size-4" />
    </D.Close>
  );
}

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <Fundo />
      <D.Content
        className={cn(
          "fixed left-1/2 top-[8vh] z-50 flex max-h-[84vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 flex-col rounded border border-line bg-paper text-ink focus:outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <BotaoFechar />
      </D.Content>
    </D.Portal>
  );
}

/** Painel lateral à direita (~720px), rolagem própria. */
export function SheetContent({ className, children, ...props }: React.ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <Fundo />
      <D.Content
        className={cn("fixed inset-y-0 right-0 z-50 flex w-[min(720px,100vw)] flex-col border-l border-line bg-paper text-ink focus:outline-none", className)}
        {...props}
      >
        {children}
        <BotaoFechar />
      </D.Content>
    </D.Portal>
  );
}

export const DialogHeader = ({ className, ...p }: React.ComponentProps<"div">) => <div className={cn("flex flex-col gap-1 border-b border-line px-5 py-3.5 pr-12", className)} {...p} />;
export const DialogBody = ({ className, ...p }: React.ComponentProps<"div">) => <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)} {...p} />;
export const DialogFooter = ({ className, ...p }: React.ComponentProps<"div">) => <div className={cn("flex justify-end gap-2 border-t border-line px-5 py-3", className)} {...p} />;
export const DialogTitle = ({ className, ...p }: React.ComponentProps<typeof D.Title>) => <D.Title className={cn("text-[15px] font-semibold tracking-[-0.01em]", className)} {...p} />;
export const DialogDescription = ({ className, ...p }: React.ComponentProps<typeof D.Description>) => (
  <D.Description className={cn("text-[13px] text-ink-2", className)} {...p} />
);
