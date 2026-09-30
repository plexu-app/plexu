"use client";
// Settings → Ações: botões no card com os mesmos passos das automações, condição de visibilidade e
// mini-form opcional (valores em form.<chave> nas expressões).
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { arquivarAcaoAction, salvarAcaoAction } from "@/app/w/[ws]/b/[board]/settings/actions";
import { ConstrutorCondicoes } from "@/components/condicoes/construtor";
import { useAcaoConfig } from "@/components/config/config-fases";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { ContextoAutomacoes } from "./contexto";
import { EditorPassos, type PassoUI } from "./editor-passos";

export interface CampoFormUI {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean";
  required?: boolean;
}

export interface AcaoUI {
  id: string;
  nome: string;
  visivel: string;
  form: CampoFormUI[];
  steps: Record<string, unknown>[];
  runAs: "user" | "system";
  enabled: boolean;
}

export function ConfigAcoes({ ctx, acoes }: { ctx: ContextoAutomacoes; acoes: AcaoUI[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const { pendente, executar } = useAcaoConfig();
  const atual = editando && editando !== "nova" ? acoes.find((a) => a.id === editando) ?? null : null;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Ações</CardTitle>
        <Button size="sm" onClick={() => setEditando("nova")}>
          <Plus /> Nova ação
        </Button>
      </CardHeader>
      <CardContent>
        {!acoes.length && <p className="text-sm text-muted-foreground">Nenhuma ação. Ações viram botões no card: quem clica executa os passos (com um formulário curto, se quiser).</p>}
        <ul className="flex flex-col divide-y rounded-md border">
          {acoes.map((a) => (
            <li key={a.id} className={cn("flex items-center gap-3 px-3 py-2", !a.enabled && "opacity-60")} data-acao-config={a.nome}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{a.nome}</span>
                  {a.runAs === "system" && <Badge variant="outline">como sistema</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {a.steps.length} passo(s){a.form.length ? ` · formulário com ${a.form.length} campo(s)` : ""}
                  {a.visivel ? " · visível sob condição" : ""}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Editar ${a.nome}`} onClick={() => setEditando(a.id)}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Arquivar ${a.nome}`}
                disabled={pendente}
                onClick={() => confirm(`Arquivar a ação "${a.nome}"?`) && executar(() => arquivarAcaoAction(ctx.ws, ctx.board, a.id), "Ação arquivada")}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
      <Dialog open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-w-4xl">{editando !== null && <EditorAcao key={editando} ctx={ctx} atual={atual} fechar={() => setEditando(null)} />}</DialogContent>
      </Dialog>
    </Card>
  );
}

function EditorAcao({ ctx, atual, fechar }: { ctx: ContextoAutomacoes; atual: AcaoUI | null; fechar: () => void }) {
  const { pendente, executar } = useAcaoConfig();
  const [nome, setNome] = useState(atual?.nome ?? "");
  const [visivel, setVisivel] = useState(atual?.visivel ?? "");
  const [form, setForm] = useState<CampoFormUI[]>(atual?.form ?? []);
  const [passos, setPassos] = useState<PassoUI[]>((atual?.steps as PassoUI[]) ?? []);
  const [runAs, setRunAs] = useState<"user" | "system">(atual?.runAs ?? "user");
  const setCampo = (i: number, c: Partial<CampoFormUI>) => setForm(form.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const condicoes = ctx.condicoes.filter((c) => c.caminho !== "fase_origem" && c.caminho !== "fase_destino");
  return (
    <form
      className="flex min-h-0 flex-col"
      aria-label={atual ? "Editar ação" : "Nova ação"}
      action={() =>
        executar(() => salvarAcaoAction(ctx.ws, ctx.board, atual?.id ?? null, { nome, visivel, form, steps: passos, runAs }), atual ? "Ação salva" : "Ação criada", fechar)
      }
    >
      <DialogHeader>
        <DialogTitle>{atual ? `Editar ação: ${atual.nome}` : "Nova ação"}</DialogTitle>
        <DialogDescription>Um botão no card. Os passos rodam na hora, com as regras do board valendo para quem clicou.</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="acao-nome">Nome do botão</Label>
            <Input id="acao-nome" aria-label="Nome da ação" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Registrar pagamento" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="acao-como">Executar como</Label>
            <NativeSelect id="acao-como" aria-label="Executar como" value={runAs} onChange={(e) => setRunAs(e.target.value as "user" | "system")}>
              <option value="user">quem clicou</option>
              <option value="system">sistema</option>
            </NativeSelect>
          </div>
        </div>
        <section className="flex flex-col gap-2 rounded-md border p-3">
          <h3 className="text-sm font-semibold">Aparece quando (opcional)</h3>
          <ConstrutorCondicoes rotulo="Visível quando" valor={visivel} onChange={setVisivel} campos={condicoes} />
        </section>
        <section className="flex flex-col gap-2 rounded-md border p-3">
          <h3 className="text-sm font-semibold">Formulário antes de executar (opcional)</h3>
          {form.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_8rem_auto_auto] items-center gap-2" data-campo-form={i + 1}>
              <Input aria-label={`Rótulo do campo ${i + 1}`} value={c.label} onChange={(e) => setCampo(i, { label: e.target.value })} placeholder="Data do pagamento" />
              <Input aria-label={`Identificador do campo ${i + 1}`} className="font-mono" value={c.key} onChange={(e) => setCampo(i, { key: e.target.value })} placeholder="data_pagamento" />
              <NativeSelect aria-label={`Tipo do campo ${i + 1}`} value={c.type} onChange={(e) => setCampo(i, { type: e.target.value as CampoFormUI["type"] })}>
                <option value="text">texto</option>
                <option value="number">número</option>
                <option value="date">data</option>
                <option value="boolean">sim/não</option>
              </NativeSelect>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" className="size-4" checked={!!c.required} onChange={(e) => setCampo(i, { required: e.target.checked })} />
                obrigatório
              </label>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remover campo ${i + 1}`} onClick={() => setForm(form.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setForm([...form, { key: "", label: "", type: "text" }])}>
            <Plus /> Campo do formulário
          </Button>
          {form.length > 0 && <p className="text-xs text-muted-foreground">Use nos passos como form.identificador (ex.: {"{{ form.data_pagamento }}"} ou a expressão form.data_pagamento).</p>}
        </section>
        <section className="flex flex-col gap-2 rounded-md border p-3">
          <h3 className="text-sm font-semibold">Passos</h3>
          <EditorPassos ctx={ctx} passos={passos} onChange={setPassos} />
        </section>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={fechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendente}>
          Salvar ação
        </Button>
      </DialogFooter>
    </form>
  );
}
