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
  return <D.Overlay className={cn("fixed inset-0 z-40 bg-black/30", className)} />;
}

function BotaoFechar() {
  return (
    <D.Close className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Fechar">
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
          "fixed left-1/2 top-[8vh] z-50 flex max-h-[84vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 flex-col rounded-lg border bg-background shadow-xl focus:outline-none",
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
      <Fundo className="bg-black/20" />
      <D.Content
        className={cn("fixed inset-y-0 right-0 z-50 flex w-[min(720px,100vw)] flex-col border-l bg-background shadow-2xl focus:outline-none", className)}
        {...props}
      >
        {children}
        <BotaoFechar />
      </D.Content>
    </D.Portal>
  );
}

export const DialogHeader = ({ className, ...p }: React.ComponentProps<"div">) => <div className={cn("flex flex-col gap-1 border-b px-5 py-4 pr-12", className)} {...p} />;
export const DialogBody = ({ className, ...p }: React.ComponentProps<"div">) => <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)} {...p} />;
export const DialogFooter = ({ className, ...p }: React.ComponentProps<"div">) => <div className={cn("flex justify-end gap-2 border-t px-5 py-3", className)} {...p} />;
export const DialogTitle = ({ className, ...p }: React.ComponentProps<typeof D.Title>) => <D.Title className={cn("text-base font-semibold", className)} {...p} />;
export const DialogDescription = ({ className, ...p }: React.ComponentProps<typeof D.Description>) => (
  <D.Description className={cn("text-sm text-muted-foreground", className)} {...p} />
);
