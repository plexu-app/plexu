"use client";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { ativarRegraAction, salvarRegraAction } from "@/app/w/[ws]/b/[board]/settings/actions";
import { EditorCel } from "@/components/config/editor-cel";
import { useAcaoConfig } from "@/components/config/config-fases";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/misc";
import { lint } from "@/lib/expr";

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
  can_create: "pode criar",
  can_enter: "pode entrar na fase",
  can_leave: "pode sair da fase (avançar)",
  can_back: "pode voltar da fase",
  can_edit: "pode editar campo",
  can_delete: "pode excluir",
};

interface Ctx {
  ws: string;
  board: string;
  fases: { id: string; name: string }[];
  campos: { id: string; name: string }[];
  regras: RegraConfig[];
}

export function ConfigRegras(ctx: Ctx) {
  const [editando, setEditando] = useState<string | null>(null);
  const { pendente, executar } = useAcaoConfig();
  const nomeFase = (id: string | null) => (id ? ctx.fases.find((f) => f.id === id)?.name ?? "fase arquivada" : "qualquer fase");
  const nomeCampo = (id: string | null) => (id ? ctx.campos.find((f) => f.id === id)?.name ?? "campo arquivado" : "qualquer campo");
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Regras</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setEditando(editando === "nova" ? null : "nova")}>
          <Plus /> Nova regra
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {editando === "nova" && <EditorRegra ctx={ctx} regra={null} fechar={() => setEditando(null)} />}
        {ctx.regras.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma regra.</p>}
        <ul className="flex flex-col gap-2">
          {ctx.regras.map((r) => {
            const avisos = lint(r.expr);
            return (
              <li key={r.id} className="rounded-md border p-3" data-regra={r.id}>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant={r.enabled ? "default" : "outline"}>{ROTULO_REGRA[r.kind] ?? r.kind}</Badge>
                  <span className="text-muted-foreground">{nomeFase(r.phaseId)}</span>
                  {r.kind === "can_edit" && <span className="text-muted-foreground">· {nomeCampo(r.fieldId)}</span>}
                  {!r.enabled && <Badge variant="outline">desativada</Badge>}
                  {avisos.length > 0 && <Badge variant="destructive">{avisos.length} aviso(s)</Badge>}
                  <div className="ml-auto flex items-center gap-2">
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
                    <Button variant="ghost" size="icon" aria-label="Editar regra" onClick={() => setEditando(editando === r.id ? null : r.id)}>
                      <Pencil />
                    </Button>
                  </div>
                </div>
                <pre className="mt-2 overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-xs">{r.expr}</pre>
                {r.message && <p className="mt-1 text-xs text-muted-foreground">Mensagem: {r.message}</p>}
                {editando === r.id && <EditorRegra ctx={ctx} regra={r} fechar={() => setEditando(null)} />}
              </li>
            );
          })}
        </ul>
      </CardContent>
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
  return (
    <form
      className="mt-3 grid grid-cols-3 gap-3 rounded-md border bg-muted/40 p-3"
      aria-label={regra ? "Editar regra" : "Nova regra"}
      action={() =>
        executar(
          () => salvarRegraAction(ctx.ws, ctx.board, regra?.id ?? null, { kind, phaseId: phaseId || null, fieldId: fieldId || null, expr, message, onFail }),
          regra ? "Regra salva" : "Regra criada",
          fechar,
        )
      }
    >
      <div className="flex flex-col gap-1.5">
        <Label>Tipo</Label>
        <NativeSelect aria-label="Tipo da regra" value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(ROTULO_REGRA).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Fase</Label>
        <NativeSelect aria-label="Fase da regra" value={phaseId} onChange={(e) => setPhase(e.target.value)}>
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
          <Label>Campo</Label>
          <NativeSelect aria-label="Campo da regra" value={fieldId} onChange={(e) => setField(e.target.value)}>
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
          <Label>Se falhar</Label>
          <NativeSelect aria-label="Se falhar" value={onFail} onChange={(e) => setOnFail(e.target.value as "block" | "keep")}>
            <option value="block">bloquear</option>
            <option value="keep">permitir e manter filhos</option>
          </NativeSelect>
        </div>
      ) : (
        <div />
      )}
      <div className="col-span-3 flex flex-col gap-1.5">
        <Label>Expressão (CEL) — verdadeira permite</Label>
        <EditorCel rotulo="Expressão da regra" valor={expr} onChange={setExpr} linhas={3} obrigatorio placeholder='filhos("parcelas").todos(p, p.medida == true)' />
      </div>
      <div className="col-span-3 flex flex-col gap-1.5">
        <Label>Mensagem quando bloquear</Label>
        <Input aria-label="Mensagem da regra" value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <div className="col-span-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={fechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendente}>
          Salvar regra
        </Button>
      </div>
    </form>
  );
}
