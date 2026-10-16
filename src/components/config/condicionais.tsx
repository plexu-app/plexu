"use client";
// Condicionais em campos (prompt PR 2, C1): modal de 520px com busca, filtro por campo e a lista ordenada
// (a ordem importa: a última que se aplica vence). Editor: nome (com "sugerir nome" a partir da condição),
// condições no construtor (campo · operador · valor, grupos E/OU), "Quando verdadeiro" e "Quando falso"
// com ações (exibir, ocultar, tornar obrigatório, tornar opcional, bloquear edição) sobre campos.
// Salvar grava a lista inteira e recompila as expressões dos campos (src/lib/condicionais.ts).
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GitFork, Pencil, Plus, Search, Trash, X } from "lucide-react";
import { salvarCondicionaisAction } from "@/app/w/[ws]/b/[board]/settings/actions";
import { ConstrutorCondicoes } from "@/components/condicoes/construtor";
import { parseCel, resumir } from "@/components/condicoes/modelo";
import { useAcaoConfig } from "@/components/config/config-fases";
import type { ContextoCampos } from "@/components/config/config-campos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { itemMenu, Menu } from "@/components/ui/menu";
import { ACOES_CONDICIONAL, type AcaoEmCampos, type Condicional } from "@/lib/condicionais";

const novoId = () => `c${Math.random().toString(36).slice(2, 10)}`;

export function Condicionais({ ctx, lista: inicial }: { ctx: ContextoCampos; lista: Condicional[] }) {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState(inicial);
  const [editando, setEditando] = useState<Condicional | null>(null);
  const [busca, setBusca] = useState("");
  const [campoFiltro, setCampoFiltro] = useState("");
  const { pendente, executar } = useAcaoConfig();
  const nomeCampo = (id: string) => ctx.campos.find((c) => c.id === id)?.name ?? "campo removido";
  const nomeCaminho = useMemo(() => new Map(ctx.condicoes.map((c) => [c.caminho, c.nome])), [ctx.condicoes]);

  const salvar = (nova: Condicional[], msg: string, depois?: () => void) =>
    executar(
      () => salvarCondicionaisAction(ctx.ws, ctx.board, nova),
      msg,
      () => {
        setLista(nova);
        depois?.();
      },
    );

  const visiveis = lista.filter((c) => {
    const alvo = [...c.seVerdadeiro, ...c.seFalso].flatMap((a) => a.campos);
    const ok = !campoFiltro || alvo.includes(campoFiltro) || c.condicao.includes(ctx.campos.find((x) => x.id === campoFiltro)?.slug ?? "\0");
    return ok && (!busca.trim() || c.nome.toLowerCase().includes(busca.trim().toLowerCase()));
  });
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= lista.length) return;
    const n = [...lista];
    [n[i], n[j]] = [n[j], n[i]];
    salvar(n, "Ordem salva");
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <GitFork /> Condicionais em campos{lista.length ? ` (${lista.length})` : ""}
      </Button>
      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          setAberto(v);
          if (!v) setEditando(null);
        }}
      >
        <DialogContent className="max-w-[520px]" data-condicionais>
          {editando ? (
            <EditorCondicional
              ctx={ctx}
              inicial={editando}
              pendente={pendente}
              nomeCaminho={(c) => nomeCaminho.get(c) ?? c}
              voltar={() => setEditando(null)}
              salvar={(c) => {
                const existe = lista.some((x) => x.id === c.id);
                salvar(existe ? lista.map((x) => (x.id === c.id ? c : x)) : [...lista, c], "Condicional salva", () => setEditando(null));
              }}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Condicionais em campos</DialogTitle>
                <DialogDescription>Mostre, esconda, exija ou bloqueie campos conforme o que foi preenchido. A ordem importa: a última que se aplica vence.</DialogDescription>
              </DialogHeader>
              <DialogBody className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <label className="flex h-8 flex-1 items-center gap-2 rounded border border-line px-2.5 text-[13px] focus-within:border-accent">
                    <Search className="size-3.5 text-ink-3" aria-hidden />
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" aria-label="Buscar condicional" className="min-w-0 flex-1 bg-transparent outline-none" />
                  </label>
                  <NativeSelect aria-label="Filtrar por campo" className="w-40" value={campoFiltro} onChange={(e) => setCampoFiltro(e.target.value)}>
                    <option value="">todos os campos</option>
                    {ctx.campos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                {!visiveis.length && <p className="py-4 text-center text-[13px] text-ink-3">{lista.length ? "Nenhuma condicional com esse filtro." : "Nenhuma condicional ainda."}</p>}
                <ol className="flex flex-col gap-2">
                  {visiveis.map((c) => {
                    const i = lista.indexOf(c);
                    return (
                      <li key={c.id} className="rounded border border-line px-3 py-2" data-condicional={c.nome}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-ink-3">{i + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{c.nome}</span>
                          <button type="button" className="text-ink-3 hover:text-ink disabled:opacity-30" disabled={pendente || i === 0} onClick={() => mover(i, -1)} aria-label={`Subir ${c.nome}`}>
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button type="button" className="text-ink-3 hover:text-ink disabled:opacity-30" disabled={pendente || i === lista.length - 1} onClick={() => mover(i, 1)} aria-label={`Descer ${c.nome}`}>
                            <ArrowDown className="size-3.5" />
                          </button>
                          <button type="button" className="text-ink-3 hover:text-ink" onClick={() => setEditando(c)} aria-label={`Editar ${c.nome}`}>
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            className="text-ink-3 hover:text-err"
                            disabled={pendente}
                            onClick={() => confirm(`Excluir a condicional "${c.nome}"?`) && salvar(lista.filter((x) => x.id !== c.id), "Condicional excluída")}
                            aria-label={`Excluir ${c.nome}`}
                          >
                            <Trash className="size-3.5" />
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-ink-2">
                          Se {descrever(c.condicao, (x) => nomeCaminho.get(x) ?? x)}:{" "}
                          {[...c.seVerdadeiro.map((a) => resumoAcao(a, nomeCampo)), ...c.seFalso.map((a) => `senão ${resumoAcao(a, nomeCampo)}`)].join("; ")}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </DialogBody>
              <DialogFooter>
                <Button onClick={() => setEditando({ id: novoId(), nome: "", condicao: "", seVerdadeiro: [{ acao: "exibir", campos: [] }], seFalso: [] })}>
                  <Plus /> Nova condicional
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const rotuloAcao = (a: string) => ACOES_CONDICIONAL.find((x) => x.acao === a)?.rotulo ?? a;
const resumoAcao = (a: AcaoEmCampos, nome: (id: string) => string) => `${rotuloAcao(a.acao).toLowerCase()} ${a.campos.map(nome).join(", ")}`;

/** Condição em linguagem de usuário; o que não cabe no construtor aparece como CEL. */
function descrever(cel: string, rotulo: (caminho: string) => string) {
  if (!cel.trim()) return "sempre";
  const m = parseCel(cel);
  return m ? resumir(m, rotulo) : cel;
}

function EditorCondicional({
  ctx,
  inicial,
  pendente,
  nomeCaminho,
  voltar,
  salvar,
}: {
  ctx: ContextoCampos;
  inicial: Condicional;
  pendente: boolean;
  nomeCaminho: (c: string) => string;
  voltar: () => void;
  salvar: (c: Condicional) => void;
}) {
  const [c, setC] = useState(inicial);
  const ramo = (k: "seVerdadeiro" | "seFalso", titulo: string) => (
    <section className="flex flex-col gap-2" aria-label={titulo} data-ramo={k}>
      <h4 className="text-[13px] font-semibold">{titulo}</h4>
      {c[k].map((a, i) => (
        <div key={i} className="flex items-start gap-2">
          <NativeSelect
            aria-label={`Ação ${i + 1} (${titulo})`}
            className="w-40"
            value={a.acao}
            onChange={(e) => setC({ ...c, [k]: c[k].map((x, j) => (j === i ? { ...x, acao: e.target.value as AcaoEmCampos["acao"] } : x)) })}
          >
            {ACOES_CONDICIONAL.map((x) => (
              <option key={x.acao} value={x.acao}>
                {x.rotulo}
              </option>
            ))}
          </NativeSelect>
          <EscolherCampos
            rotulo={`Campos da ação ${i + 1} (${titulo})`}
            campos={ctx.campos}
            valor={a.campos}
            onChange={(campos) => setC({ ...c, [k]: c[k].map((x, j) => (j === i ? { ...x, campos } : x)) })}
          />
          <button type="button" className="mt-2 text-ink-3 hover:text-err" onClick={() => setC({ ...c, [k]: c[k].filter((_, j) => j !== i) })} aria-label={`Remover ação ${i + 1} (${titulo})`}>
            <X className="size-4" />
          </button>
        </div>
      ))}
      <button type="button" className="self-start text-[13px] text-accent hover:underline" onClick={() => setC({ ...c, [k]: [...c[k], { acao: "exibir", campos: [] }] })}>
        + ação
      </button>
    </section>
  );
  return (
    <form
      className="flex min-h-0 flex-col"
      aria-label="Editar condicional"
      onSubmit={(e) => {
        e.preventDefault();
        salvar({ ...c, seVerdadeiro: c.seVerdadeiro.filter((a) => a.campos.length), seFalso: c.seFalso.filter((a) => a.campos.length) });
      }}
    >
      <DialogHeader>
        <DialogTitle>{inicial.nome ? `Condicional: ${inicial.nome}` : "Nova condicional"}</DialogTitle>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="cond-nome">Nome</Label>
            <Input id="cond-nome" aria-label="Nome da condicional" value={c.nome} onChange={(e) => setC({ ...c, nome: e.target.value })} required />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setC({ ...c, nome: `Se ${descrever(c.condicao, nomeCaminho)}`.slice(0, 120) })}>
            Sugerir nome
          </Button>
        </div>
        <section className="flex flex-col gap-2" aria-label="Condições">
          <h4 className="text-[13px] font-semibold">Condições</h4>
          <ConstrutorCondicoes rotulo="Condição da condicional" valor={c.condicao} onChange={(condicao) => setC({ ...c, condicao })} campos={ctx.condicoes} />
        </section>
        {ramo("seVerdadeiro", "Quando verdadeiro")}
        {ramo("seFalso", "Quando falso")}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={voltar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendente}>
          Salvar condicional
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Escolha de vários campos (menu com caixas de seleção). */
function EscolherCampos({ rotulo, campos, valor, onChange }: { rotulo: string; campos: { id: string; name: string }[]; valor: string[]; onChange: (v: string[]) => void }) {
  const nomes = valor.map((id) => campos.find((c) => c.id === id)?.name).filter(Boolean);
  return (
    <Menu
      rotulo={rotulo}
      className="max-h-64 w-64 overflow-y-auto"
      gatilho={(p) => (
        <button type="button" {...p} aria-label={rotulo} className="flex h-8 min-w-0 flex-1 items-center rounded border border-line bg-paper px-2.5 text-left text-[13px] hover:bg-bg">
          <span className="truncate">{nomes.length ? nomes.join(", ") : <span className="text-ink-3">escolha os campos</span>}</span>
        </button>
      )}
    >
      {campos.map((c) => (
        <label key={c.id} className={itemMenu}>
          <input type="checkbox" className="size-4" checked={valor.includes(c.id)} onChange={(e) => onChange(e.target.checked ? [...valor, c.id] : valor.filter((x) => x !== c.id))} />
          {c.name}
        </label>
      ))}
    </Menu>
  );
}
