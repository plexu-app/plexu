"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { EstadoForm } from "@/app/auth-actions";

export interface CampoAuth {
  nome: string;
  rotulo: string;
  tipo?: string;
  autoComplete?: string;
}

export function FormAuth({
  acao,
  campos,
  botao,
}: {
  acao: (s: EstadoForm, f: FormData) => Promise<EstadoForm>;
  campos: CampoAuth[];
  botao: string;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  return (
    <form action={enviar} className="flex flex-col gap-4" key={JSON.stringify(estado.valores ?? {})}>
      {campos.map((c) => (
        <div key={c.nome} className="flex flex-col gap-1.5">
          <Label htmlFor={c.nome}>{c.rotulo}</Label>
          <Input
            id={c.nome}
            name={c.nome}
            type={c.tipo ?? "text"}
            autoComplete={c.autoComplete}
            defaultValue={c.tipo === "password" ? undefined : estado.valores?.[c.nome]}
            required
          />
        </div>
      ))}
      {estado.erro && (
        <p role="alert" className="text-sm text-destructive">
          {estado.erro}
        </p>
      )}
      <Button type="submit" disabled={pendente}>
        {pendente ? "Aguarde…" : botao}
      </Button>
    </form>
  );
}
