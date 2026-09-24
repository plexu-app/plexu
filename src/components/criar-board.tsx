"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { criarBoardAction } from "@/app/w/[ws]/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";

export function CriarBoard({ ws }: { ws: string }) {
  const [pendente, iniciar] = useTransition();
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Novo board</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex items-end gap-3"
          action={(form) =>
            iniciar(async () => {
              const r = await criarBoardAction(ws, form);
              if (r && !r.ok) toast.error(r.motivo);
            })
          }
        >
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="nome-board">Nome</Label>
            <Input id="nome-board" name="nome" required placeholder="Ex.: Contratos" />
          </div>
          <div className="flex w-40 flex-col gap-1.5">
            <Label htmlFor="kind-board">Tipo</Label>
            <NativeSelect id="kind-board" name="kind" defaultValue="workflow">
              <option value="workflow">Fluxo (com fases)</option>
              <option value="database">Base (cadastro)</option>
            </NativeSelect>
          </div>
          <Button type="submit" disabled={pendente}>
            Criar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
