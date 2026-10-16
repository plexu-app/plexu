"use client";
// Formulário da fase nas configurações (prompt PR 2, C1). No topo, o seletor da fase (com a cor) e, à
// direita, "Condicionais em campos" e "Opções avançadas". À esquerda (≈270px, rolagem própria), a paleta
// de tipos: clicar adiciona no fim, arrastar insere na posição. No centro, a prévia do formulário sobre a
// cor da fase a 10%: cartão de 520px com "Fase atual / nome"; cada campo com alça de arraste, lápis e ⋯
// no hover. Filtro "Campos: ativos / arquivados".
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Archive, ArchiveRestore, ArrowLeft, ArrowRight, ChevronDown, Ellipsis, GitFork, GripVertical, Pencil, Plus, Settings2 } from "lucide-react";
import {
  arquivarCampoAction,
  arquivarFaseAction,
  atualizarFaseAction,
  criarFaseAction,
  moverFaseAction,
  reordenarCamposAction,
  restaurarCampoAction,
} from "@/app/w/[ws]/b/[board]/settings/actions";
import { CampoInput } from "@/components/card/campo-input";
import { Condicionais } from "@/components/config/condicionais";
import { EditorCampo, type CampoConfig, type ContextoCampos, type InicialCampo } from "@/components/config/config-campos";
import { OpcoesAvancadasFase, useAcaoConfig, type FaseConfig } from "@/components/config/config-fases";
import { IconeTipo } from "@/components/icone-tipo";
import { corDaFase, PALETA_FASES } from "@/components/kanban-dados";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { itemMenu, Menu } from "@/components/ui/menu";
import type { Condicional } from "@/lib/condicionais";
import { TIPOS_CAMPO } from "@/lib/config-campos";
import { fasesDoCampo } from "@/lib/fases-preenchimento";
import { cn } from "@/lib/utils";

const RELACIONAIS = new Set(["relation", "lookup", "rollup"]);
const TIPOS_BASICOS = TIPOS_CAMPO.filter((t) => !RELACIONAIS.has(t.tipo));
const TIPOS_RELACAO = [
  { chave: "relation-fluxo", tipo: "relation", rotulo: "Relação com fluxo" },
  { chave: "relation-base", tipo: "relation", rotulo: "Relação com base" },
  { chave: "lookup", tipo: "lookup", rotulo: "Valor de card relacionado" },
  { chave: "rollup", tipo: "rollup", rotulo: "Rollup (soma/contagem)" },
];

export function EditorFormulario({
  ctx,
  modo,
  fases,
  faseId,
  condicionais,
  arquivados,
}: {
  ctx: ContextoCampos;
  /** inicial: primeira fase; fases: as demais; base: board sem fases. */
  modo: "inicial" | "fases" | "base";
  fases: FaseConfig[];
  /** Fase escolhida (?fase=); sem ela, a primeira do modo. */
  faseId: string | null;
  condicionais: Condicional[];
  arquivados: { id: string; name: string; type: string }[];
}) {
  const router = useRouter();
  const { pendente, executar } = useAcaoConfig();
  const [editando, setEditando] = useState<{ campo: CampoConfig | null; inicial?: InicialCampo } | null>(null);
  const [opcoes, setOpcoes] = useState(false);
  const [filtro, setFiltro] = useState<"ativos" | "arquivados">("ativos");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<string[] | null>(null);
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));

  const doModo = modo === "inicial" ? fases.slice(0, 1) : modo === "fases" ? fases.slice(1) : [];
  const fase = modo === "base" ? null : (doModo.find((f) => f.id === faseId) ?? doModo[0] ?? null);
  const indice = fase ? fases.findIndex((f) => f.id === fase.id) : -1;
  const cor = fase ? corDaFase(fase.color, indice) : "var(--f5)";

  // Ordem otimista enquanto a reordenação grava.
  const campos = useMemo(() => {
    const porId = new Map(ctx.campos.map((c) => [c.id, c]));
    return (ordem ?? ctx.campos.map((c) => c.id)).map((id) => porId.get(id)).filter((c): c is CampoConfig => !!c);
  }, [ordem, ctx.campos]);
  const daFase = campos.filter((c) => {
    if (!fase) return true;
    const fs = fasesDoCampo(c.config);
    return !fs.length || fs.includes(fase.id);
  });

  const abrirNovo = (tipo: string, antesDe: string | null = null) => setEditando({ campo: null, inicial: { tipo, fases: fase ? [fase.id] : undefined, antesDe } });

  function aoSoltar(e: DragEndEvent) {
    setArrastando(null);
    const ativo = String(e.active.id);
    const alvo = e.over ? String(e.over.id) : null;
    if (!alvo) return;
    const antesDe = alvo.startsWith("campo:") ? alvo.slice(6) : null;
    if (ativo.startsWith("tipo:")) return abrirNovo(ativo.slice(5).split("|")[0], antesDe);
    const id = ativo.slice(6);
    if (id === antesDe) return;
    const atual = campos.map((c) => c.id).filter((x) => x !== id);
    // Sem alvo de campo ("fim"): depois do último campo desta fase.
    const ultimo = daFase.filter((c) => c.id !== id).at(-1)?.id;
    const pos = antesDe ? atual.indexOf(antesDe) : ultimo ? atual.indexOf(ultimo) + 1 : atual.length;
    atual.splice(pos, 0, id);
    setOrdem(atual);
    executar(
      () => reordenarCamposAction(ctx.ws, ctx.board, atual),
      undefined,
      undefined,
      () => setOrdem(null),
    );
  }

  const tituloArraste = arrastando?.startsWith("tipo:")
    ? (TIPOS_CAMPO.find((t) => t.tipo === arrastando.slice(5).split("|")[0])?.rotulo ?? "")
    : campos.find((c) => `campo:${c.id}` === arrastando)?.name;

  return (
    <div className="flex h-full min-h-0 flex-col" data-editor-formulario>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-6">
        {fase ? (
          modo === "fases" ? (
            <Menu
              rotulo="Escolher fase"
              gatilho={(p) => (
                <button type="button" {...p} className="inline-flex h-8 items-center gap-2 rounded border border-line bg-paper px-3 text-[13px] font-medium hover:bg-bg" data-seletor-fase>
                  <i className="size-2.5 rounded-[2px]" style={{ background: cor }} aria-hidden />
                  {fase.name}
                  <ChevronDown className="size-3.5 text-ink-3" aria-hidden />
                </button>
              )}
            >
              {doModo.map((f) => (
                <button key={f.id} type="button" className={itemMenu} onClick={() => router.replace(`?aba=fases&fase=${f.id}`, { scroll: false })}>
                  <i className="size-2.5 shrink-0 rounded-[2px]" style={{ background: corDaFase(f.color, fases.indexOf(f)) }} aria-hidden />
                  {f.name}
                </button>
              ))}
            </Menu>
          ) : (
            <span className="inline-flex h-8 items-center gap-2 rounded border border-line bg-paper px-3 text-[13px] font-medium" data-seletor-fase>
              <i className="size-2.5 rounded-[2px]" style={{ background: cor }} aria-hidden />
              {fase.name}
            </span>
          )
        ) : (
          modo === "fases" && <span className="text-[13px] text-ink-3">Este fluxo só tem a fase inicial.</span>
        )}
        {modo === "fases" && <NovaFase ws={ctx.ws} board={ctx.board} />}
        <div className="ml-auto flex items-center gap-2">
          <Condicionais ctx={ctx} lista={condicionais} />
          {fase && (
            <Button variant="outline" size="sm" onClick={() => setOpcoes(true)}>
              <Settings2 /> Opções avançadas
            </Button>
          )}
        </div>
      </div>

      <DndContext id={`formulario-${ctx.board}`} sensors={sensores} onDragStart={(e) => setArrastando(String(e.active.id))} onDragEnd={aoSoltar} onDragCancel={() => setArrastando(null)}>
        <div className="grid min-h-0 flex-1 grid-cols-[270px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-r border-line px-4 py-4" aria-label="Tipos de campo" data-paleta>
            <h3 className="rotulo mb-2">Tipos de campo</h3>
            <ul className="flex flex-col gap-1">
              {TIPOS_BASICOS.map((t) => (
                <li key={t.tipo}>
                  <ItemPaleta id={`tipo:${t.tipo}`} tipo={t.tipo} rotulo={t.rotulo} onClick={() => abrirNovo(t.tipo)} />
                </li>
              ))}
            </ul>
            <h3 className="rotulo mb-2 mt-5">Campos de relação</h3>
            <ul className="flex flex-col gap-1">
              {TIPOS_RELACAO.map((t) => (
                <li key={t.chave}>
                  <ItemPaleta id={`tipo:${t.tipo}|${t.chave}`} tipo={t.tipo} rotulo={t.rotulo} onClick={() => abrirNovo(t.tipo)} />
                </li>
              ))}
            </ul>
          </aside>

          <section
            className="min-h-0 overflow-y-auto px-6 py-6"
            style={{ background: `color-mix(in srgb, ${cor} 10%, var(--bg))` }}
            aria-label="Prévia do formulário"
            data-previa-formulario
          >
            <div className="mx-auto mb-3 flex w-[520px] max-w-full items-center justify-end gap-2">
              <Label htmlFor="filtro-campos" className="text-xs">
                Campos
              </Label>
              <NativeSelect id="filtro-campos" aria-label="Filtro de campos" className="h-7 w-36 text-xs" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
                <option value="ativos">ativos</option>
                <option value="arquivados">arquivados ({arquivados.length})</option>
              </NativeSelect>
            </div>
            <div className="mx-auto w-[520px] max-w-full rounded border border-line bg-paper p-6" data-cartao-formulario>
              <header className="mb-5 border-b border-line-2 pb-3">
                <p className="text-xs text-ink-3">{fase ? "Fase atual" : "Formulário"}</p>
                <p className="text-[15px] font-semibold">{fase ? fase.name : "Campos da base"}</p>
                {fase?.descricao && <p className="mt-1 text-xs text-ink-2">{fase.descricao}</p>}
              </header>
              {filtro === "arquivados" ? (
                <ul className="flex flex-col gap-2" data-campos-arquivados>
                  {!arquivados.length && <li className="text-xs text-ink-3">Nenhum campo arquivado.</li>}
                  {arquivados.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 rounded border border-line px-3 py-2 text-sm">
                      <IconeTipo tipo={c.type} className="text-ink-3" />
                      <span className="flex-1 truncate">{c.name}</span>
                      <Button size="sm" variant="ghost" disabled={pendente} onClick={() => executar(() => restaurarCampoAction(ctx.ws, ctx.board, c.id), "Campo restaurado")}>
                        <ArchiveRestore /> Restaurar
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <ol className="flex flex-col gap-1">
                  {daFase.map((c) => (
                    <LinhaCampo
                      key={c.id}
                      c={c}
                      faseId={fase?.id ?? null}
                      ctx={ctx}
                      editar={() => setEditando({ campo: c })}
                      arquivar={() => confirm(`Arquivar o campo "${c.name}"?`) && executar(() => arquivarCampoAction(ctx.ws, ctx.board, c.id), "Campo arquivado")}
                    />
                  ))}
                  <Fim vazio={!daFase.length} />
                </ol>
              )}
            </div>
          </section>
        </div>
        <DragOverlay>{tituloArraste ? <div className="rounded border border-accent bg-paper px-3 py-1.5 text-[13px] font-medium">{tituloArraste}</div> : null}</DragOverlay>
      </DndContext>

      <Dialog open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-w-[760px]" data-editor-campo>
          {editando && <EditorCampo key={editando.campo?.id ?? "novo"} ctx={ctx} campo={editando.campo} inicial={editando.inicial} fechar={() => setEditando(null)} />}
        </DialogContent>
      </Dialog>
      {fase && (
        <Dialog open={opcoes} onOpenChange={setOpcoes}>
          <DialogContent className="max-w-[640px]">
            <DialogHeader>
              <DialogTitle>Opções avançadas · {fase.name}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <OpcoesDaFase ws={ctx.ws} board={ctx.board} fase={fase} indice={indice} total={fases.length} fechar={() => setOpcoes(false)} />
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function ItemPaleta({ id, tipo, rotulo, onClick }: { id: string; tipo: string; rotulo: string; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn("flex h-8 w-full items-center gap-2 rounded border border-transparent px-2 text-left text-[13px] text-ink-2 hover:border-line hover:bg-paper hover:text-ink", isDragging && "opacity-40")}
      aria-label={`Adicionar campo ${rotulo}`}
      data-tipo-paleta={rotulo}
    >
      <IconeTipo tipo={tipo} className="text-ink-3" />
      <span className="truncate">{rotulo}</span>
      <Plus className="ml-auto size-3.5 text-ink-3" aria-hidden />
    </button>
  );
}

function LinhaCampo({ c, faseId, ctx, editar, arquivar }: { c: CampoConfig; faseId: string | null; ctx: ContextoCampos; editar: () => void; arquivar: () => void }) {
  const arraste = useDraggable({ id: `campo:${c.id}` });
  const alvo = useDroppable({ id: `campo:${c.id}` });
  const ajuste = faseId ? ctx.ajustes.find((a) => a.fieldId === c.id && a.phaseId === faseId) : undefined;
  const obrigatorio = ajuste?.required ?? c.requiredExpr?.trim() === "true";
  const condicional = !ajuste?.required && !!c.requiredExpr?.trim() && c.requiredExpr.trim() !== "true";
  const todas = !fasesDoCampo(c.config).length;
  const titulo = ctx.titleFieldId === c.id;
  const gerado = ctx.geradosCondicionais && (ctx.geradosCondicionais.visivel.includes(c.id) || ctx.geradosCondicionais.obrigatorio.includes(c.id));
  return (
    <li
      ref={(n) => {
        arraste.setNodeRef(n);
        alvo.setNodeRef(n);
      }}
      className={cn("group relative rounded border border-transparent px-2 py-2 hover:border-line", arraste.isDragging && "opacity-40", alvo.isOver && "border-t-2 border-t-accent")}
      data-config-campo={c.slug}
      data-campo-formulario={c.name}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="-ml-1 grid size-6 cursor-grab place-items-center rounded text-ink-3 opacity-0 hover:bg-bg focus-visible:opacity-100 active:cursor-grabbing group-hover:opacity-100"
          aria-label={`Arrastar ${c.name}`}
          {...arraste.attributes}
          {...arraste.listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <IconeTipo tipo={c.type} className="text-ink-3" />
        <span className="min-w-0 flex-1 truncate text-sm">
          {c.name}
          {obrigatorio && <span className="ml-0.5 text-err" aria-label="obrigatório">*</span>}
        </span>
        {titulo && <span className="rounded border border-line px-1 font-mono text-[10px] uppercase text-ink-3">título</span>}
        {condicional && <span className="font-mono text-[10px] uppercase text-ink-3">obrigatório se…</span>}
        {gerado && <GitFork className="size-3.5 text-ink-3" aria-label="definido por condicional" />}
        {todas && faseId && <span className="font-mono text-[10px] uppercase text-ink-3">todas as fases</span>}
        <span className="flex items-center gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" className="grid size-6 place-items-center rounded text-ink-3 hover:bg-bg hover:text-ink" aria-label={`Editar ${c.name}`} onClick={editar}>
            <Pencil className="size-3.5" />
          </button>
          <Menu
            rotulo={`Opções do campo ${c.name}`}
            alinhar="end"
            gatilho={(p) => (
              <button type="button" {...p} className="grid size-6 place-items-center rounded text-ink-3 hover:bg-bg hover:text-ink" aria-label={`Mais opções de ${c.name}`}>
                <Ellipsis className="size-3.5" />
              </button>
            )}
          >
            <button type="button" className={itemMenu} onClick={editar}>
              <Pencil className="size-3.5" /> Editar
            </button>
            <button type="button" className={itemMenu} onClick={arquivar} disabled={titulo}>
              <Archive className="size-3.5" /> Arquivar
            </button>
          </Menu>
        </span>
      </div>
      {c.description && <p className="ml-12 text-xs text-ink-2">{c.description}</p>}
      <div className="pointer-events-none ml-12 mt-1.5 select-none" inert aria-hidden>
        {c.type === "relation" ? (
          <div className="flex h-10 items-center rounded border border-line bg-bg px-3 text-xs text-ink-3">Buscar card por título ou id…</div>
        ) : ["sequence", "rollup", "lookup", "dynamic_text"].includes(c.type) ? (
          <div className="flex h-10 items-center rounded border border-dashed border-line bg-bg px-3 text-xs text-ink-3">valor calculado</div>
        ) : c.type === "attachment" ? (
          <div className="flex h-10 items-center rounded border border-dashed border-line px-3 text-xs text-ink-3">Arraste arquivos aqui</div>
        ) : (
          <div className="[&_input:not([type=checkbox])]:h-10 [&_select]:h-10">
            <CampoInput campo={{ id: `previa-${c.id}`, name: c.name, type: c.type, config: c.config }} valor={null} pessoas={{}} />
          </div>
        )}
      </div>
      {c.helpText && <p className="ml-12 mt-1 text-xs text-ink-3">{c.helpText}</p>}
    </li>
  );
}

function Fim({ vazio }: { vazio: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "fim" });
  return (
    <li ref={setNodeRef} className={cn("mt-2 rounded border border-dashed border-line px-3 py-4 text-center text-xs text-ink-3", isOver && "border-accent text-accent")} data-fim-formulario>
      {vazio ? "Nenhum campo nesta fase. Clique ou arraste um tipo da paleta." : "Solte aqui para colocar no fim"}
    </li>
  );
}

function NovaFase({ ws, board }: { ws: string; board: string }) {
  const { pendente, executar } = useAcaoConfig();
  const [nome, setNome] = useState("");
  return (
    <Menu
      rotulo="Nova fase"
      className="w-72 p-2"
      gatilho={(p) => (
        <Button {...p} variant="ghost" size="sm">
          <Plus /> Nova fase
        </Button>
      )}
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          executar(() => criarFaseAction(ws, board, nome), "Fase criada", () => setNome(""));
        }}
      >
        <Input aria-label="Nome da nova fase" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da fase" required />
        <Button type="submit" size="sm" disabled={pendente}>
          Criar
        </Button>
      </form>
    </Menu>
  );
}

/** Nome, cor, fase final, descrição, criação direta, SLA, posição e arquivar. */
function OpcoesDaFase({ ws, board, fase, indice, total, fechar }: { ws: string; board: string; fase: FaseConfig; indice: number; total: number; fechar: () => void }) {
  const { pendente, executar } = useAcaoConfig();
  const [nome, setNome] = useState(fase.name);
  return (
    <div className="flex flex-col gap-4" data-opcoes-avancadas-fase>
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="nome-fase">Nome da fase</Label>
          <Input id="nome-fase" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" disabled={pendente || !nome.trim() || nome === fase.name} onClick={() => executar(() => atualizarFaseAction(ws, board, fase.id, { nome }), "Fase renomeada")}>
          Renomear
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-[13px]">
        <span className="flex items-center gap-1.5" role="radiogroup" aria-label="Cor da fase">
          Cor
          {PALETA_FASES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={fase.color === c}
              aria-label={`Cor ${c}`}
              disabled={pendente}
              onClick={() => executar(() => atualizarFaseAction(ws, board, fase.id, { cor: c }))}
              className={cn("size-4 rounded-full border-2", fase.color === c ? "border-ink" : "border-transparent")}
              style={{ background: corDaFase(c, 0) }}
            />
          ))}
        </span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="size-4" checked={fase.isTerminal} disabled={pendente} onChange={(e) => executar(() => atualizarFaseAction(ws, board, fase.id, { terminal: e.target.checked }))} />
          Fase final
        </label>
        <span className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" disabled={pendente || indice <= 0} onClick={() => executar(() => moverFaseAction(ws, board, fase.id, -1))} aria-label="Mover fase para a esquerda">
            <ArrowLeft />
          </Button>
          <Button variant="ghost" size="sm" disabled={pendente || indice >= total - 1} onClick={() => executar(() => moverFaseAction(ws, board, fase.id, 1))} aria-label="Mover fase para a direita">
            <ArrowRight />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-err"
            disabled={pendente}
            onClick={() =>
              confirm(`Arquivar a fase "${fase.name}"?`) &&
              executar(() => arquivarFaseAction(ws, board, fase.id), "Fase arquivada", fechar)
            }
          >
            <Archive /> Arquivar fase
          </Button>
        </span>
      </div>
      <OpcoesAvancadasFase ws={ws} board={board} fase={fase} primeira={indice === 0} />
      <p className="text-xs text-ink-3">Permissões por fase ainda não existem no Plexu: quem configura o board configura todas as fases.</p>
    </div>
  );
}
