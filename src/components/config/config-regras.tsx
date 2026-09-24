"use client";
import { useState } from "react";
import { AlertTriangle, Pencil, Plus } from "lucide-react";
import { ativarRegraAction, salvarRegraAction } from "@/app/w/[ws]/b/[board]/settings/actions";
import { ConstrutorCondicoes, type CampoCondicao } from "@/components/condicoes/construtor";
import { parseCel, resumir } from "@/components/condicoes/modelo";
import { useAcaoConfig } from "@/components/config/config-fases";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { lint } from "@/lib/expr";
import { cn } from "@/lib/utils";

export interface RegraConfig {
  id: string;
  kind: string;
  phaseId: string | null;
  fieldId: string | null;
  expr: string;
  message: string | null;
  onFail: unknown;
  enabled: boolean;
}

export const ROTULO_REGRA: Record<string, string> = {
  can_create: "Pode criar",
  can_enter: "Pode entrar na fase",
  can_leave: "Pode avançar da fase",
  can_back: "Pode voltar da fase",
  can_edit: "Pode editar campo",
  can_delete: "Pode excluir",
};

interface Ctx {
  ws: string;
  board: string;
  fases: { id: string; name: string }[];
  campos: { id: string; name: string }[];
  regras: RegraConfig[];
  condicoes: CampoCondicao[];
}

/** Resumo em português da expressão; expressões fora do modo visual aparecem como "expressão avançada". */
export function resumoRegra(expr: string, condicoes: CampoCondicao[]): { texto: string; avancada: boolean } {
  const m = parseCel(expr);
  if (!m) return { texto: expr.length > 90 ? `${expr.slice(0, 90)}…` : expr, avancada: true };
  const nomes = new Map(condicoes.map((c) => [c.caminho, c.nome]));
  return { texto: resumir(m, (c) => nomes.get(c) ?? c), avancada: false };
}

export function ConfigRegras(ctx: Ctx) {
  const [editando, setEditando] = useState<string | null>(null);
  const { pendente, executar } = useAcaoConfig();
  const nomeFase = (id: string | null) => (id ? ctx.fases.find((f) => f.id === id)?.name ?? "fase arquivada" : "qualquer fase");
  const nomeCampo = (id: string | null) => (id ? ctx.campos.find((f) => f.id === id)?.name ?? "campo arquivado" : "qualquer campo");
  const regraEditada = editando && editando !== "nova" ? ctx.regras.find((r) => r.id === editando) ?? null : null;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Regras</CardTitle>
        <Button size="sm" onClick={() => setEditando("nova")}>
          <Plus /> Nova regra
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {ctx.regras.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma regra. Regras decidem quando um card pode ser criado, mover de fase, ser editado ou excluído.</p>}
        <ul className="flex flex-col divide-y rounded-md border">
          {ctx.regras.map((r) => {
            const resumo = resumoRegra(r.expr, ctx.condicoes);
            const avisos = lint(r.expr);
            return (
              <li key={r.id} className={cn("flex items-center gap-3 px-3 py-2", !r.enabled && "opacity-60")} data-regra={r.id}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="font-medium">{ROTULO_REGRA[r.kind] ?? r.kind}</span>
                    <span className="text-muted-foreground"> · {nomeFase(r.phaseId)}</span>
                    {r.kind === "can_edit" && <span className="text-muted-foreground"> · {nomeCampo(r.fieldId)}</span>}
                    <span className="text-muted-foreground"> · </span>
                    <span data-testid="resumo-regra" className={cn(resumo.avancada && "font-mono text-xs")}>
                      {resumo.avancada ? "expressão avançada: " : "quando "}
                      {resumo.texto}
                    </span>
                  </div>
                  {r.message && <p className="truncate text-xs text-muted-foreground">Mensagem: {r.message}</p>}
                </div>
                {avisos.length > 0 && (
                  <Badge variant="destructive" title={avisos.map((a) => a.mensagem).join("\n")}>
                    <AlertTriangle className="size-3" /> {avisos.length} aviso(s)
                  </Badge>
                )}
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={r.enabled}
                    disabled={pendente}
                    onChange={(e) => executar(() => ativarRegraAction(ctx.ws, ctx.board, r.id, e.target.checked))}
                  />
                  ativa
                </label>
                <Button variant="ghost" size="icon" aria-label="Editar regra" onClick={() => setEditando(r.id)}>
                  <Pencil />
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
      <Dialog open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-w-3xl">{editando !== null && <EditorRegra key={editando} ctx={ctx} regra={regraEditada} fechar={() => setEditando(null)} />}</DialogContent>
      </Dialog>
    </Card>
  );
}

function EditorRegra({ ctx, regra, fechar }: { ctx: Ctx; regra: RegraConfig | null; fechar: () => void }) {
  const { pendente, executar } = useAcaoConfig();
  const [kind, setKind] = useState(regra?.kind ?? "can_leave");
  const [phaseId, setPhase] = useState(regra?.phaseId ?? "");
  const [fieldId, setField] = useState(regra?.fieldId ?? "");
  const [expr, setExpr] = useState(regra?.expr ?? "");
  const [message, setMessage] = useState(regra?.message ?? "");
  const [onFail, setOnFail] = useState<"block" | "keep">((regra?.onFail as { children?: string } | null)?.children === "keep" ? "keep" : "block");
  const transicao = kind === "can_enter" || kind === "can_leave" || kind === "can_back";
  const condicoes = ctx.condicoes.filter((c) => transicao || (c.caminho !== "fase_origem" && c.caminho !== "fase_destino"));
  return (
    <form
      className="flex min-h-0 flex-col"
      aria-label={regra ? "Editar regra" : "Nova regra"}
      action={() =>
        executar(
          () => salvarRegraAction(ctx.ws, ctx.board, regra?.id ?? null, { kind, phaseId: phaseId || null, fieldId: fieldId || null, expr: expr.trim() || "true", message, onFail }),
          regra ? "Regra salva" : "Regra criada",
          fechar,
        )
      }
    >
      <DialogHeader>
        <DialogTitle>{regra ? "Editar regra" : "Nova regra"}</DialogTitle>
        <DialogDescription>A ação é permitida quando a condição é verdadeira; caso contrário, o usuário vê a mensagem.</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="regra-tipo">Tipo</Label>
            <NativeSelect id="regra-tipo" aria-label="Tipo da regra" value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(ROTULO_REGRA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="regra-fase">Fase</Label>
            <NativeSelect id="regra-fase" aria-label="Fase da regra" value={phaseId} onChange={(e) => setPhase(e.target.value)}>
              <option value="">qualquer fase</option>
              {ctx.fases.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          {kind === "can_edit" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="regra-campo">Campo</Label>
              <NativeSelect id="regra-campo" aria-label="Campo da regra" value={fieldId} onChange={(e) => setField(e.target.value)}>
                <option value="">qualquer campo</option>
                {ctx.campos.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : kind === "can_back" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="regra-falha">Se falhar</Label>
              <NativeSelect id="regra-falha" aria-label="Se falhar" value={onFail} onChange={(e) => setOnFail(e.target.value as "block" | "keep")}>
                <option value="block">bloquear</option>
                <option value="keep">permitir e manter filhos</option>
              </NativeSelect>
            </div>
          ) : (
            <div />
          )}
        </div>
        <ConstrutorCondicoes rotulo="Condição da regra" valor={expr} onChange={setExpr} campos={condicoes} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="regra-msg">Mensagem quando bloquear</Label>
          <Input id="regra-msg" aria-label="Mensagem da regra" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ex.: Todas as parcelas precisam estar medidas." />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={fechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendente}>
          Salvar regra
        </Button>
      </DialogFooter>
    </form>
  );
}
