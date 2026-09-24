"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AbasBoard({ abas }: { abas: { href: string; rotulo: string }[] }) {
  const atual = usePathname();
  const ativa = [...abas].sort((a, b) => b.href.length - a.href.length).find((a) => atual === a.href || atual.startsWith(`${a.href}/`));
  return (
    <nav className="flex gap-1 text-sm">
      {abas.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={cn("rounded-md px-2.5 py-1 text-muted-foreground hover:bg-muted", ativa?.href === a.href && "bg-muted font-medium text-foreground")}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
