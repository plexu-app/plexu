"use client";
// Campos no card (kanban): até 8, na ordem escolhida, e o campo de prazo (boards.settings).
// Relações aparecem no sub-rodapé do cartão pela opção "mostrar no card" do próprio campo.
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { exibicaoKanbanAction } from "@/app/w/[ws]/b/[board]/settings/actions";
import { useAcaoConfig } from "@/components/config/config-fases";
import { IconeTipo } from "@/components/icone-tipo";
import { MAX_CAMPOS_CARTAO, PADRAO_CAMPOS_CARTAO } from "@/components/kanban-dados";
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
  const candidatos = campos.filter((c) => c.id !== titleFieldId && c.type !== "relation" && c.type !== "attachment");
  const [sel, setSel] = useState<string[]>(atuais.filter((id) => candidatos.some((c) => c.id === id)));
  const [prazoSel, setPrazo] = useState(prazo ?? "");
  const datas = campos.filter((c) => c.type === "date" || c.type === "datetime");
  const nome = (id: string) => candidatos.find((c) => c.id === id);
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= sel.length) return;
    const n = [...sel];
    [n[i], n[j]] = [n[j], n[i]];
    setSel(n);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Campos no card</CardTitle>
        <p className="text-xs text-ink-2">
          Até {MAX_CAMPOS_CARTAO} campos aparecem no cartão do kanban, na ordem abaixo. Sem escolha, entram os {PADRAO_CAMPOS_CARTAO} primeiros campos curtos.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <fieldset className="flex flex-col gap-1.5" aria-label="Campos do cartão">
          <legend className="rotulo mb-1">Disponíveis</legend>
          {candidatos.map((c) => {
            const marcado = sel.includes(c.id);
            return (
              <label key={c.id} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={marcado}
                  disabled={!marcado && sel.length >= MAX_CAMPOS_CARTAO}
                  onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))}
                />
                <IconeTipo tipo={c.type} className="text-ink-3" />
                {c.name}
              </label>
            );
          })}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <p className="rotulo mb-1">Ordem no cartão</p>
          {sel.length === 0 && <p className="text-xs text-ink-3">Nenhum escolhido: valem os {PADRAO_CAMPOS_CARTAO} primeiros.</p>}
          <ol className="flex flex-col gap-1" data-ordem-cartao>
            {sel.map((id, i) => (
              <li key={id} className="flex items-center gap-2 rounded border border-line bg-paper px-2 py-1 text-[13px]">
                <span className="w-4 font-mono text-[11px] text-ink-3">{i + 1}</span>
                <IconeTipo tipo={nome(id)?.type ?? "text"} className="text-ink-3" />
                <span className="flex-1 truncate">{nome(id)?.name}</span>
                <button type="button" className="text-ink-3 hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir ${nome(id)?.name}`}>
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" className="text-ink-3 hover:text-ink disabled:opacity-30" disabled={i === sel.length - 1} onClick={() => mover(i, 1)} aria-label={`Descer ${nome(id)?.name}`}>
                  <ArrowDown className="size-3.5" />
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex items-end gap-3 md:col-span-2">
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
          <span className="pb-2 font-mono text-xs text-ink-3">
            {sel.length}/{MAX_CAMPOS_CARTAO} campos
          </span>
          <Button className="ml-auto" disabled={pendente} onClick={() => executar(() => exibicaoKanbanAction(ws, board, { campos: sel, prazo: prazoSel || null }), "Cartão atualizado")}>
            Salvar cartão
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
