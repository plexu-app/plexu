"use client";
// Cartão do kanban: até 3 campos-chave e o campo de prazo (boards.settings).
import { useState } from "react";
import { exibicaoKanbanAction } from "@/app/w/[ws]/b/[board]/settings/actions";
import { useAcaoConfig } from "@/components/config/config-fases";
import { Button } from "@/components/ui/button";
import { Label, NativeSelect } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";

export function ConfigCartao({
  ws,
  board,
  campos,
  titleFieldId,
  atuais,
  prazo,
}: {
  ws: string;
  board: string;
  campos: { id: string; name: string; type: string }[];
  titleFieldId: string | null;
  atuais: string[];
  prazo: string | null;
}) {
  const { pendente, executar } = useAcaoConfig();
  const [sel, setSel] = useState<string[]>(atuais);
  const [prazoSel, setPrazo] = useState(prazo ?? "");
  const candidatos = campos.filter((c) => c.id !== titleFieldId && c.type !== "relation" && c.type !== "long_text");
  const datas = campos.filter((c) => c.type === "date" || c.type === "datetime");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cartão do kanban</CardTitle>
        <p className="text-xs text-muted-foreground">Até 3 campos aparecem no cartão, abaixo do título. Sem escolha, usamos os 3 primeiros campos curtos.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <fieldset className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Campos do cartão">
          {candidatos.map((c) => {
            const marcado = sel.includes(c.id);
            return (
              <label key={c.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={marcado}
                  disabled={!marcado && sel.length >= 3}
                  onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))}
                />
                {c.name}
              </label>
            );
          })}
        </fieldset>
        <div className="flex items-end gap-3">
          <div className="flex w-64 flex-col gap-1.5">
            <Label htmlFor="prazo-cartao">Prazo mostrado no cartão</Label>
            <NativeSelect id="prazo-cartao" value={prazoSel} onChange={(e) => setPrazo(e.target.value)}>
              <option value="">nenhum campo</option>
              {datas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <span className="pb-2 text-xs text-muted-foreground">{sel.length}/3 campos</span>
          <Button className="ml-auto" disabled={pendente} onClick={() => executar(() => exibicaoKanbanAction(ws, board, { campos: sel, prazo: prazoSel || null }), "Cartão atualizado")}>
            Salvar cartão
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
