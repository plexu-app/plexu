"use client";
// Formulário da fase atual com salvamento automático: cada campo grava sozinho ao mudar (500 ms) ou ao
// perder o foco, com indicador "salvando/salvo/erro". Erro de formato ou do core mantém o valor na tela,
// com a mensagem. Campos de relação entram na posição deles (sub-tabela ou seletor, com seus próprios
// formulários). O modal de criação continua com botão (src/components/novo-card).
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Calculator, Check, Link2, Loader2, Lock } from "lucide-react";
import { salvarCamposAction } from "@/app/w/[ws]/actions";
import type { AnexoMeta } from "@/components/card/campo-anexos";
import { CampoInput } from "@/components/card/campo-input";
import { RelacaoNaCriacao } from "@/components/card/relacao-criacao";
import { Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { formatarValor } from "@/lib/formatar";
import { nomeInput } from "@/lib/form-campos";
import { cn } from "@/lib/utils";
import { validarFormato } from "@/lib/validacao";

export interface CampoForm {
  campo: { id: string; name: string; type: string; config: Record<string, unknown>; helpText: string | null; validation?: Record<string, unknown> | null };
  valor: unknown;
  estado?: {
    visivel: boolean;
    editavel: boolean;
    obrigatorio: boolean;
    calculado: boolean;
    travado: boolean;
    erro?: string;
    motivo?: string;
    espelho?: { cardId: string | null; campo: { id: string; name: string; type: string; config: Record<string, unknown> } };
  };
  /** Texto de exibição já resolvido (ex.: títulos dos cards de um espelho de relação). */
  exibicao?: string;
  /** Cards escolhidos, para editar um espelho de relação. */
  inicialRelacao?: { id: string; title: string }[];
}

type Salvamento = { estado: "ocioso" } | { estado: "editando" } | { estado: "salvando" } | { estado: "salvo" } | { estado: "erro"; mensagem: string };

const ESPERA_MS = 500;

/** Valores atuais do campo no DOM (inputs dentro do container com name f:<id>), como o formulário enviaria. */
function lerValores(el: HTMLElement, fieldId: string): FormData {
  const nome = nomeInput(fieldId);
  const fd = new FormData();
  fd.append("campos", fieldId);
  el.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${CSS.escape(nome)}"]`).forEach((i) => {
    if (i instanceof HTMLInputElement && (i.type === "checkbox" || i.type === "radio")) {
      if (i.checked) fd.append(nome, i.value || "on");
    } else fd.append(nome, i.value);
  });
  return fd;
}

const assinatura = (fd: FormData) => JSON.stringify([...fd.entries()].map(([k, v]) => [k, String(v)]));

/**
 * Salva o campo sozinho: debounce ao mudar, imediato ao sair. Uma gravação por vez; se mudar durante a
 * gravação, grava de novo no fim com o valor mais recente. Não envia o que já está salvo.
 */
function AutoSalvar({
  ws,
  board,
  cardId,
  campo,
  children,
  aoSalvar,
}: {
  ws: string;
  board: string;
  cardId: string;
  campo: CampoForm["campo"];
  children: (aoMudar: () => void) => React.ReactNode;
  aoSalvar: (s: Salvamento) => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emCurso = useRef(false);
  const deNovo = useRef(false);
  const ultimo = useRef<string | null>(null);
  const alterado = useRef(false);

  const salvar = useCallback(async () => {
    if (!ref.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (emCurso.current) {
      deNovo.current = true;
      return;
    }
    const fd = lerValores(ref.current, campo.id);
    const sig = assinatura(fd);
    if (sig === ultimo.current) {
      if (alterado.current) aoSalvar({ estado: "salvo" }); // mexeu e voltou ao valor salvo
      alterado.current = false;
      return;
    }
    // Formato (regex) com a mensagem do campo, antes de enviar.
    const valores = fd.getAll(nomeInput(campo.id)).map(String);
    const msg = valores.length === 1 ? validarFormato(campo, valores[0].trim()) : null;
    if (msg) {
      aoSalvar({ estado: "erro", mensagem: msg });
      return;
    }
    emCurso.current = true;
    aoSalvar({ estado: "salvando" });
    try {
      const r = await salvarCamposAction(ws, board, cardId, fd);
      if (r.ok) {
        ultimo.current = sig;
        alterado.current = false;
        aoSalvar({ estado: "salvo" });
        router.refresh();
      } else aoSalvar({ estado: "erro", mensagem: r.motivo });
    } catch {
      aoSalvar({ estado: "erro", mensagem: "Sem conexão com o servidor. Tente de novo." });
    } finally {
      emCurso.current = false;
      if (deNovo.current) {
        deNovo.current = false;
        void salvar();
      }
    }
  }, [ws, board, cardId, campo, aoSalvar, router]);

  // Valor inicial = já salvo (não regrava ao sair sem mudar nada).
  useEffect(() => {
    if (ref.current && ultimo.current === null) ultimo.current = assinatura(lerValores(ref.current, campo.id));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [campo.id]);

  const agendar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    alterado.current = true;
    aoSalvar({ estado: "editando" }); // o "salvo" anterior não vale mais
    timer.current = setTimeout(() => void salvar(), ESPERA_MS);
  }, [salvar, aoSalvar]);

  return (
    <div
      ref={ref}
      onChange={agendar}
      onBlur={(e) => {
        // Saiu do campo (não só de um input para outro dentro dele): grava já.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void salvar();
      }}
    >
      {children(agendar)}
    </div>
  );
}

function Indicador({ s }: { s: Salvamento }) {
  if (s.estado === "ocioso") return null;
  return (
    <span
      className={cn("ml-auto inline-flex items-center gap-1 text-xs", s.estado === "erro" ? "text-destructive-strong" : "text-muted-foreground")}
      aria-live="polite"
      data-indicador-salvamento
    >
      {s.estado === "salvando" && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {s.estado === "salvo" && <Check className="size-3" aria-hidden />}
      {s.estado === "erro" && <AlertCircle className="size-3" aria-hidden />}
      {s.estado === "editando" ? "editando" : s.estado === "salvando" ? "salvando…" : s.estado === "salvo" ? "salvo" : "erro"}
    </span>
  );
}

export function FormCampos({
  ws,
  board,
  cardId,
  campos,
  pessoas,
  relacoes = {},
  anexos = {},
}: {
  ws: string;
  board: string;
  cardId: string;
  campos: CampoForm[];
  pessoas: Record<string, string>;
  /** Conteúdo de cada campo de relação (sub-tabela ou seletor), por field_id. */
  relacoes?: Record<string, React.ReactNode>;
  /** Metadados dos anexos atuais do card (id → nome/tamanho). */
  anexos?: Record<string, AnexoMeta>;
}) {
  const [salvamentos, setSalvamentos] = useState<Record<string, Salvamento>>({});
  const mapaPessoas = new Map(Object.entries(pessoas));
  const marcar = useCallback((id: string) => (s: Salvamento) => setSalvamentos((x) => ({ ...x, [id]: s })), []);
  // Um callback estável por campo (o AutoSalvar depende dele).
  const marcadores = useRef(new Map<string, (s: Salvamento) => void>());
  const marcadorDe = (id: string) => {
    if (!marcadores.current.has(id)) marcadores.current.set(id, marcar(id));
    return marcadores.current.get(id)!;
  };

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      {campos.map(({ campo, valor, estado, exibicao, inicialRelacao }) => {
        if (campo.type === "relation") {
          const conteudo = relacoes[campo.id];
          return conteudo ? (
            <div key={campo.id} className="col-span-2" data-campo={campo.name}>
              {conteudo}
            </div>
          ) : null;
        }
        const idInput = `campo-${campo.id}`;
        const calculado = !!estado?.calculado;
        const editavel = !calculado && estado?.editavel !== false;
        const s = salvamentos[campo.id] ?? { estado: "ocioso" };
        const faltando = estado?.obrigatorio && (valor === null || valor === "" || (Array.isArray(valor) && !valor.length));
        return (
          <div
            key={campo.id}
            className={campo.type === "long_text" || campo.type === "dynamic_text" ? "col-span-2" : ""}
            data-campo={campo.name}
            data-salvamento={editavel ? s.estado : undefined}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <Label htmlFor={idInput}>
                {campo.name}
                {estado?.obrigatorio && <span className="ml-0.5 text-destructive" aria-label="obrigatório">*</span>}
              </Label>
              {calculado && (
                <Badge variant="calculado" title="Valor calculado automaticamente; não editável">
                  <Calculator className="size-3" /> calculado
                </Badge>
              )}
              {estado?.travado && (
                <Badge variant="outline" title="Travado enquanto houver ligação na relação configurada">
                  <Lock className="size-3" /> travado
                </Badge>
              )}
              {!calculado && !estado?.travado && !editavel && (
                <Badge variant="outline" title={estado?.motivo} aria-label={estado?.motivo ? `somente leitura: ${estado.motivo}` : undefined} data-motivo={estado?.motivo}>
                  somente leitura
                </Badge>
              )}
              {editavel && <Indicador s={s} />}
            </div>
            {campo.type === "lookup" && estado?.espelho && (
              <p className="-mt-1 mb-1.5 flex items-center gap-1 text-xs text-muted-foreground" data-origem-espelho>
                <Link2 className="size-3" aria-hidden /> espelha “{estado.espelho.campo.name}” do card de origem{editavel ? " — editar aqui altera a origem" : ""}
              </p>
            )}
            {editavel ? (
              <AutoSalvar ws={ws} board={board} cardId={cardId} campo={campo} aoSalvar={marcadorDe(campo.id)}>
                {(aoMudar) =>
                  estado?.espelho?.campo.type === "relation" ? (
                    <RelacaoNaCriacao ws={ws} board={board} campo={{ id: campo.id, name: campo.name, config: estado.espelho.campo.config }} id={idInput} inicial={inicialRelacao} aoMudar={aoMudar} />
                  ) : (
                    <CampoInput
                      campo={estado?.espelho ? { ...campo, type: estado.espelho.campo.type, config: estado.espelho.campo.config } : campo}
                      valor={valor}
                      pessoas={pessoas}
                      id={idInput}
                      obrigatorio={estado?.obrigatorio}
                      anexos={{ ws, board, meta: anexos }}
                      aoMudar={aoMudar}
                    />
                  )
                }
              </AutoSalvar>
            ) : (
              <div
                id={idInput}
                className={`min-h-9 rounded-md border px-3 py-2 text-sm ${calculado ? "border-dashed border-primary/30 bg-primary/5" : "bg-muted"}`}
              >
                {(exibicao ?? formatarValor(campo, valor, mapaPessoas)) || <span className="text-muted-foreground">—</span>}
              </div>
            )}
            {s.estado === "erro" && (
              <p className="mt-1 text-xs text-destructive-strong" role="alert" data-erro-campo>
                {s.mensagem}
              </p>
            )}
            {faltando && s.estado !== "erro" && <p className="mt-1 text-xs text-destructive">Obrigatório nesta fase</p>}
            {campo.helpText && <p className="mt-1 text-xs text-muted-foreground">{campo.helpText}</p>}
            {estado?.erro && <p className="mt-1 text-xs text-destructive">Expressão do campo com erro: {estado.erro}</p>}
          </div>
        );
      })}
    </div>
  );
}
