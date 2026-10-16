"use client";
// Visão Lista (docs/design/prompt-redesign-pr2.md, A4): cabeçalho fixo, colunas de sistema + campos,
// ordenação no servidor (?ordem=&dir=), páginas de 50 carregadas ao rolar e linhas virtualizadas (altura
// fixa de 40px: só as visíveis vão para o DOM). Colunas escolhidas e ordenadas no botão Colunas, salvas
// na view do board. Seleção múltipla para mover em massa.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp, Columns3 } from "lucide-react";
import { toast } from "sonner";
import { maisLinhasAction, moverEmMassaAction, salvarColunasListaAction } from "@/app/w/[ws]/actions";
import { IconeTipo } from "@/components/icone-tipo";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import type { FiltrosBoard } from "@/lib/filtros";
import type { ColunaLista, LinhaLista } from "@/lib/lista";
import { hrefCard } from "@/lib/rotas";
import { cn } from "@/lib/utils";

const ALTURA = 40;
const SOBRA = 12;

export function Lista({
  ws,
  board,
  disponiveis,
  visiveis: visiveisIniciais,
  linhas: iniciais,
  total,
  filtros,
  ordem,
  fases,
}: {
  ws: string;
  board: string;
  disponiveis: ColunaLista[];
  visiveis: ColunaLista[];
  linhas: LinhaLista[];
  total: number;
  filtros: FiltrosBoard;
  ordem: { coluna: string; dir: "asc" | "desc" };
  fases: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  const [linhas, setLinhas] = useState(iniciais);
  const [carregando, setCarregando] = useState(false);
  const [visiveis, setVisiveis] = useState(visiveisIniciais);
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState("");
  const [pendente, iniciar] = useTransition();
  const caixa = useRef<HTMLDivElement>(null);
  const [janela, setJanela] = useState({ topo: 0, altura: 800 });
  useEffect(() => {
    setLinhas(iniciais);
    setSelecao(new Set());
  }, [iniciais]);
  useEffect(() => setVisiveis(visiveisIniciais), [visiveisIniciais]);

  const carregarMais = useCallback(async () => {
    if (carregando || linhas.length >= total) return;
    setCarregando(true);
    try {
      const novas = await maisLinhasAction(ws, board, filtros, ordem, linhas.length);
      setLinhas((atual) => {
        const vistos = new Set(atual.map((l) => l.id));
        return [...atual, ...novas.filter((l) => !vistos.has(l.id))];
      });
    } finally {
      setCarregando(false);
    }
  }, [carregando, linhas.length, total, ws, board, filtros, ordem]);

  const aoRolar = () => {
    const el = caixa.current;
    if (!el) return;
    setJanela({ topo: el.scrollTop, altura: el.clientHeight });
    if (el.scrollTop + el.clientHeight > linhas.length * ALTURA - 10 * ALTURA) void carregarMais();
  };
  useEffect(() => {
    const el = caixa.current;
    if (el) setJanela({ topo: el.scrollTop, altura: el.clientHeight });
  }, []);

  const inicio = Math.max(0, Math.floor(janela.topo / ALTURA) - SOBRA);
  const fim = Math.min(linhas.length, Math.ceil((janela.topo + janela.altura) / ALTURA) + SOBRA);
  const visiveisAgora = linhas.slice(inicio, fim);

  const ordenar = (col: ColunaLista) => {
    if (!col.ordenavel) return;
    const p = new URLSearchParams(params.toString());
    const dir = ordem.coluna === col.id && ordem.dir === "asc" ? "desc" : "asc";
    p.set("ordem", col.id);
    p.set("dir", dir);
    router.replace(`${caminho}?${p.toString()}`, { scroll: false });
  };

  const todosMarcados = linhas.length > 0 && linhas.every((l) => selecao.has(l.id));
  const alternar = (id: string) => setSelecao((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)));

  function moverSelecionados() {
    if (!destino || !selecao.size) return;
    iniciar(async () => {
      const r = await moverEmMassaAction(ws, board, [...selecao], destino);
      if (r.falhas.length) toast.error(`${r.movidos} movido(s); ${r.falhas.length} não puderam ir`, { description: r.falhas[0].motivo });
      else toast.success(`${r.movidos} movido(s)`);
      setSelecao(new Set());
      router.refresh();
    });
  }

  const colSpan = visiveis.length + 1;
  return (
    <div className="flex h-full min-h-0 flex-col border-t border-line bg-bg" data-lista>
      <div className="flex h-12 shrink-0 items-center gap-3 px-6 text-[13px] text-ink-2">
        <span className="font-mono text-[11px] text-ink-3" data-contagem-lista>
          {linhas.length < total ? `${linhas.length} de ${total}` : `${total}`} {total === 1 ? "cartão" : "cartões"}
        </span>
        {selecao.size > 0 && fases.length > 0 && (
          <div className="flex items-center gap-2" role="group" aria-label="Ações em massa">
            <span className="font-medium text-ink">{selecao.size} selecionado(s)</span>
            <NativeSelect aria-label="Mover selecionados para" className="h-8 w-48" value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Mover para…</option>
              {fases.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </NativeSelect>
            <Button size="sm" variant="outline" disabled={!destino || pendente} onClick={moverSelecionados}>
              Mover
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelecao(new Set())}>
              Limpar seleção
            </Button>
          </div>
        )}
        <div className="ml-auto">
          <EscolherColunas ws={ws} board={board} disponiveis={disponiveis} visiveis={visiveis} aoSalvar={setVisiveis} />
        </div>
      </div>
      <div ref={caixa} onScroll={aoRolar} className="min-h-0 flex-1 overflow-auto px-6 pb-6">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="h-10">
              <th className="w-10 border-y border-l border-line bg-paper px-3 text-left">
                <input
                  type="checkbox"
                  className="size-4"
                  aria-label="Selecionar todos os carregados"
                  checked={todosMarcados}
                  onChange={() => setSelecao(todosMarcados ? new Set() : new Set(linhas.map((l) => l.id)))}
                />
              </th>
              {visiveis.map((c, i) => {
                const ativa = ordem.coluna === c.id;
                return (
                  <th
                    key={c.id}
                    className={cn("whitespace-nowrap border-y border-line bg-paper px-3 text-left font-mono text-[10px] font-normal uppercase tracking-[0.06em] text-ink-3", i === visiveis.length - 1 && "border-r")}
                    aria-sort={ativa ? (ordem.dir === "asc" ? "ascending" : "descending") : "none"}
                    data-coluna-lista={c.nome}
                  >
                    <button type="button" disabled={!c.ordenavel} className="inline-flex items-center gap-1 uppercase hover:text-ink disabled:hover:text-ink-3" onClick={() => ordenar(c)}>
                      {c.tipo !== "sistema" && <IconeTipo tipo={c.tipo} className="size-3.5" />}
                      {c.nome}
                      {c.ordenavel && (ativa ? ordem.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {inicio > 0 && <tr style={{ height: inicio * ALTURA }} aria-hidden />}
            {visiveisAgora.map((l) => (
              <tr key={l.id} className="h-10 bg-paper hover:bg-bg" data-linha={l.id} aria-selected={selecao.has(l.id)}>
                <td className="border-b border-l border-line-2 px-3">
                  <input type="checkbox" className="size-4" aria-label={`Selecionar ${l.titulo}`} checked={selecao.has(l.id)} onChange={() => alternar(l.id)} />
                </td>
                {visiveis.map((c, i) => (
                  <td key={c.id} className={cn("max-w-72 truncate whitespace-nowrap border-b border-line-2 px-3", i === visiveis.length - 1 && "border-r")}>
                    <Celula coluna={c} linha={l} href={hrefCard(ws, l.id)} />
                  </td>
                ))}
              </tr>
            ))}
            {fim < linhas.length && <tr style={{ height: (linhas.length - fim) * ALTURA }} aria-hidden />}
            {linhas.length < total && (
              <tr>
                <td colSpan={colSpan} className="py-3 text-center font-mono text-[11px] text-ink-3">
                  {carregando ? "carregando…" : `${total - linhas.length} a carregar`}
                </td>
              </tr>
            )}
            {total === 0 && (
              <tr>
                <td colSpan={colSpan} className="border-x border-b border-line bg-paper px-3 py-6 text-center text-ink-3">
                  Nenhum cartão.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Celula({ coluna, linha, href }: { coluna: ColunaLista; linha: LinhaLista; href: string }) {
  const texto = linha.textos[coluna.id] ?? "";
  if (coluna.id === "__titulo")
    return (
      <Link href={href} scroll={false} className="font-medium text-ink hover:underline">
        {texto}
      </Link>
    );
  if (coluna.id === "__fase" && texto)
    return (
      <span className="inline-flex items-center gap-1.5">
        <i className="size-2 shrink-0 rounded-[2px]" style={{ background: linha.corFase ?? "var(--f5)" }} aria-hidden />
        {texto}
      </span>
    );
  if ((coluna.tipo === "select" || coluna.tipo === "multi_select") && texto)
    return (
      <span className="flex gap-1">
        {texto.split(", ").map((t) => (
          <span key={t} className="rounded-[3px] bg-line-2 px-1.5 py-px text-[11px] text-ink-2">
            {t}
          </span>
        ))}
      </span>
    );
  return <span className={cn(coluna.tipo === "sistema" && coluna.id !== "__responsaveis" && "font-mono text-xs text-ink-2")}>{texto}</span>;
}

function EscolherColunas({
  ws,
  board,
  disponiveis,
  visiveis,
  aoSalvar,
}: {
  ws: string;
  board: string;
  disponiveis: ColunaLista[];
  visiveis: ColunaLista[];
  aoSalvar: (c: ColunaLista[]) => void;
}) {
  // Ordem de edição: visíveis na ordem atual, depois as ocultas.
  const inicial = useMemo(() => [...visiveis.map((c) => c.id), ...disponiveis.filter((c) => !visiveis.some((v) => v.id === c.id)).map((c) => c.id)], [visiveis, disponiveis]);
  const [ordem, setOrdem] = useState(inicial);
  const [marcadas, setMarcadas] = useState(() => new Set(visiveis.map((c) => c.id)));
  const [pendente, iniciar] = useTransition();
  useEffect(() => {
    setOrdem(inicial);
    setMarcadas(new Set(visiveis.map((c) => c.id)));
  }, [inicial, visiveis]);
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= ordem.length) return;
    const n = [...ordem];
    [n[i], n[j]] = [n[j], n[i]];
    setOrdem(n);
  };
  const salvar = () =>
    iniciar(async () => {
      const ids = ordem.filter((id) => marcadas.has(id));
      const r = await salvarColunasListaAction(ws, board, ids);
      if (!r.ok) {
        toast.error(r.motivo);
        return;
      }
      aoSalvar(ids.map((id) => disponiveis.find((c) => c.id === id)!).filter(Boolean));
      toast.success("Colunas salvas");
    });
  return (
    <Menu
      rotulo="Colunas da lista"
      alinhar="end"
      fecharAoClicar={false}
      className="w-80"
      gatilho={(p) => (
        <Button {...p} size="sm" variant="outline">
          <Columns3 /> Colunas
        </Button>
      )}
    >
      <ul className="max-h-96 overflow-y-auto">
        {ordem.map((id, i) => {
          const c = disponiveis.find((x) => x.id === id);
          if (!c) return null;
          return (
            <li key={id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-bg" data-opcao-coluna={c.nome}>
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <input type="checkbox" className="size-4" checked={marcadas.has(id)} onChange={() => setMarcadas((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)))} />
                <span className="truncate">{c.nome}</span>
              </label>
              <button type="button" className="text-ink-3 hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir ${c.nome}`}>
                <ChevronUp className="size-4" />
              </button>
              <button type="button" className="text-ink-3 hover:text-ink disabled:opacity-30" disabled={i === ordem.length - 1} onClick={() => mover(i, 1)} aria-label={`Descer ${c.nome}`}>
                <ChevronDown className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-1 flex justify-between border-t border-line-2 px-1 pt-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOrdem(disponiveis.map((c) => c.id));
            setMarcadas(new Set(disponiveis.map((c) => c.id)));
          }}
        >
          Padrão
        </Button>
        <Button size="sm" disabled={pendente || marcadas.size === 0} onClick={salvar}>
          Salvar colunas
        </Button>
      </div>
    </Menu>
  );
}
