"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Calculator, Plus, Unlink } from "lucide-react";
import { toast } from "sonner";
import { criarFilhoAction, criarFilhoComCamposAction, desligarAction, editarRelacionadoAction } from "@/app/w/[ws]/actions";
import { CampoInput } from "@/components/card/campo-input";
import { BuscaRelacao } from "@/components/card/seletor-relacao";
import { NovoCard, type FaseNovoCard } from "@/components/novo-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Table, TBody, Td, Th, THead, Tr } from "@/components/ui/misc";
import { formatarValor, idCurto, TIPOS_CALCULADOS_UI, tituloOu, valorDoCard } from "@/lib/formatar";
import { colunasSubTabela } from "@/lib/kanban";

interface CampoFilho {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
}

interface Linha {
  id: string;
  title: string;
  props: Record<string, unknown>;
  computed: Record<string, unknown>;
}

const TIPOS_CRIACAO = new Set(["text", "number", "currency", "date", "boolean", "select", "cpf", "cnpj", "person"]);

/**
 * Filhos de um card como sub-tabela inline. lado "origem": relação do board do pai (pai → filhos);
 * lado "destino": relação is_parent do board dos filhos (filho → pai).
 */
export function SubTabela({
  ws,
  board,
  cardId,
  campo,
  lado,
  boardFilho,
  linhas,
  pessoas,
  obrigatorios,
  faseNovo,
  hoje,
}: {
  ws: string;
  board: string;
  cardId: string;
  campo: { id: string; name: string };
  lado: "origem" | "destino";
  boardFilho: { id: string; slug: string; name: string; campos: CampoFilho[]; titleFieldId: string | null };
  linhas: Linha[];
  pessoas: Record<string, string>;
  /** Campos do board filho que podem ser obrigatórios na criação. */
  obrigatorios: string[];
  /** Formulário completo da fase inicial do board filho. */
  faseNovo: FaseNovoCard;
  hoje: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const formNovo = useRef<HTMLFormElement>(null);
  const mapaPessoas = new Map(Object.entries(pessoas));
  const colunas = colunasSubTabela(boardFilho.campos, boardFilho.titleFieldId);
  const titulo = boardFilho.campos.find((c) => c.id === boardFilho.titleFieldId);
  const criaveis = [...(titulo && TIPOS_CRIACAO.has(titulo.type) ? [titulo] : []), ...colunas.filter((c) => TIPOS_CRIACAO.has(c.type))];
  // "Adicionar" rápido só se os campos dele cobrem todos os obrigatórios do filho (a relação com o pai
  // conta como preenchida quando é do lado do filho). Senão, o botão abre o formulário completo.
  const cobertos = new Set([...criaveis.map((c) => c.id), ...(lado === "destino" ? [campo.id] : [])]);
  const rapido = obrigatorios.every((id) => cobertos.has(id));
  const [modal, setModal] = useState(false);

  const executar = (fn: () => Promise<{ ok: boolean; motivo?: string }>, erro: string, depois?: () => void) =>
    iniciar(async () => {
      const r = await fn();
      if (r.ok) {
        depois?.();
        router.refresh();
      } else toast.error(erro, { description: r.motivo });
    });

  return (
    <Card data-subtabela={campo.name}>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>
          {campo.name} <span className="font-normal text-muted-foreground">· {boardFilho.name} ({linhas.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-2">
        <Table>
          <THead>
            <Tr>
              <Th>Card</Th>
              {colunas.map((c) => (
                <Th key={c.id}>
                  <span className="inline-flex items-center gap-1">
                    {c.name}
                    {TIPOS_CALCULADOS_UI.has(c.type) && <Calculator className="size-3 text-primary" aria-label="calculado" />}
                  </span>
                </Th>
              ))}
              <Th className="w-10" />
            </Tr>
          </THead>
          <TBody>
            {linhas.map((l) => (
              <Tr key={l.id} data-linha={l.id}>
                <Td>
                  <Link href={`/w/${ws}/b/${boardFilho.slug}/c/${l.id}`} className="hover:underline">
                    {tituloOu(l.title, l.id)}
                  </Link>{" "}
                  <span className="font-mono text-xs text-muted-foreground">{idCurto(l.id)}</span>
                </Td>
                {colunas.map((c) => {
                  const v = valorDoCard(c, l);
                  return (
                    <Td key={c.id}>
                      {c.type === "boolean" ? (
                        <CheckboxRemoto
                          rotulo={`${c.name} de ${tituloOu(l.title, l.id)}`}
                          valor={v === true}
                          salvar={(novo) => editarRelacionadoAction(ws, board, cardId, l.id, c.id, novo)}
                          erro={`Não foi possível alterar ${c.name}`}
                        />
                      ) : (
                        formatarValor(c, v, mapaPessoas)
                      )}
                    </Td>
                  );
                })}
                <Td>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Desligar ${tituloOu(l.title, l.id)}`}
                    disabled={pendente}
                    onClick={() => executar(() => desligarAction(ws, board, cardId, campo.id, l.id, lado), "Não foi possível desligar")}
                  >
                    <Unlink />
                  </Button>
                </Td>
              </Tr>
            ))}
            {linhas.length === 0 && (
              <Tr>
                <Td colSpan={colunas.length + 2} className="text-muted-foreground">
                  Nenhum item.
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>

        {rapido ? (
        <form
          ref={formNovo}
          className="flex flex-wrap items-end gap-2 border-t px-2 pt-3"
          aria-label={`Novo item em ${campo.name}`}
          action={(form) =>
            executar(() => criarFilhoAction(ws, board, cardId, campo.id, lado, boardFilho.id, form), "Não foi possível criar", () => formNovo.current?.reset())
          }
        >
          {criaveis.map((c) => (
            <input key={`h-${c.id}`} type="hidden" name="campos" value={c.id} />
          ))}
          {criaveis.map((c) => (
            <label key={c.id} className={`flex flex-col gap-1 text-xs text-muted-foreground ${c.type === "boolean" ? "items-center" : "w-36"}`}>
              {c.name}
              <CampoInput campo={c} valor={null} pessoas={pessoas} compacto />
            </label>
          ))}
          <Button type="submit" size="sm" disabled={pendente}>
            <Plus /> Adicionar
          </Button>
        </form>
        ) : (
          <div className="border-t px-2 pt-3">
            <Button type="button" size="sm" onClick={() => setModal(true)} aria-label={`Adicionar em ${campo.name}`}>
              <Plus /> Adicionar
            </Button>
            <NovoCard
              ws={ws}
              board={boardFilho.slug}
              fase={faseNovo}
              aberto={modal}
              onOpenChange={setModal}
              pessoas={pessoas}
              hoje={hoje}
              titulo={`Novo item em ${campo.name}`}
              descricao={`${boardFilho.name}, vinculado a este card. `}
              enviar={(form) => criarFilhoComCamposAction(ws, board, cardId, campo.id, lado, boardFilho.id, form)}
              aoCriar={() => {
                toast.success("Item criado");
                router.refresh();
              }}
            />
          </div>
        )}
        {lado === "origem" && (
          <div className="px-2 pb-2">
            <BuscaRelacao
              ws={ws}
              board={board}
              cardId={cardId}
              fieldId={campo.id}
              excluir={linhas.map((l) => l.id)}
              rotulo={`Ligar existente em ${campo.name}`}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Checkbox com atualização otimista: marca na hora e volta se o core recusar. */
function CheckboxRemoto({
  rotulo,
  valor,
  salvar,
  erro,
}: {
  rotulo: string;
  valor: boolean;
  salvar: (novo: boolean) => Promise<{ ok: boolean; motivo?: string }>;
  erro: string;
}) {
  const router = useRouter();
  const [marcado, setMarcado] = useState(valor);
  const [pendente, iniciar] = useTransition();
  useEffect(() => setMarcado(valor), [valor]);
  return (
    <input
      type="checkbox"
      className="size-4"
      aria-label={rotulo}
      checked={marcado}
      disabled={pendente}
      onChange={(e) => {
        const novo = e.target.checked;
        setMarcado(novo);
        iniciar(async () => {
          const r = await salvar(novo);
          if (r.ok) router.refresh();
          else {
            setMarcado(!novo);
            toast.error(erro, { description: r.motivo });
          }
        });
      }}
    />
  );
}
