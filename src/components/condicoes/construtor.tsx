"use client";
// Construtor visual de condições (regras e, no futuro, automações).
// Linhas [campo] [operador] [valor] em grupos E/OU; "modo avançado" mostra o CEL gerado.
// Bidirecional quando a expressão cabe no modelo; senão fica só no modo avançado.
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Code2, ListTree, Plus, Trash2, XCircle } from "lucide-react";
import { EditorCel } from "@/components/config/editor-cel";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { parse } from "@/lib/expr";
import { cn } from "@/lib/utils";
import { gerarCel, grupoVazio, parseCel, type Condicao, type Grupo, type Literal, type No, type Operador } from "./modelo";

export interface CampoCondicao {
  /** Caminho CEL: card.<slug>, fase, fase_destino… */
  caminho: string;
  nome: string;
  tipo: string;
  opcoes?: string[];
}

const OPS_POR_TIPO: Record<string, Operador[]> = {
  texto: ["==", "!=", "contem", "vazio", "preenchido"],
  numero: ["==", "!=", ">", ">=", "<", "<=", "vazio", "preenchido"],
  data: ["==", "!=", ">", ">=", "<", "<=", "vazio", "preenchido"],
  booleano: ["=="],
  opcao: ["==", "!=", "em", "vazio", "preenchido"],
};

const ROTULO_OP: Record<Operador, string> = {
  "==": "é igual a",
  "!=": "é diferente de",
  ">": "maior que",
  ">=": "maior ou igual a",
  "<": "menor que",
  "<=": "menor ou igual a",
  contem: "contém",
  em: "é um de",
  vazio: "está vazio",
  preenchido: "está preenchido",
};

export function familia(tipo: string): keyof typeof OPS_POR_TIPO {
  if (["number", "currency", "rollup"].includes(tipo)) return "numero";
  if (["date", "datetime"].includes(tipo)) return "data";
  if (tipo === "boolean") return "booleano";
  if (["select", "multi_select", "fase"].includes(tipo)) return "opcao";
  return "texto";
}

function valorPadrao(campo: CampoCondicao | undefined, op: Operador): Literal | Literal[] | undefined {
  if (op === "vazio" || op === "preenchido") return undefined;
  const f = familia(campo?.tipo ?? "text");
  if (op === "em") return [];
  if (f === "booleano") return true;
  if (f === "numero") return 0;
  if (f === "opcao") return campo?.opcoes?.[0] ?? "";
  return "";
}

export function ConstrutorCondicoes({
  valor,
  onChange,
  campos,
  rotulo,
}: {
  valor: string;
  onChange: (cel: string) => void;
  campos: CampoCondicao[];
  rotulo: string;
}) {
  const inicial = useMemo(() => parseCel(valor), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [modelo, setModelo] = useState<Grupo>(inicial ?? grupoVazio());
  const [avancado, setAvancado] = useState(inicial === null);
  const [aviso, setAviso] = useState<string | null>(null);
  const validacao = useMemo(() => (valor.trim() ? parse(valor) : null), [valor]);

  const mudar = (m: Grupo) => {
    setModelo(m);
    onChange(gerarCel(m));
  };

  function alternar() {
    if (!avancado) {
      setAvancado(true);
      setAviso(null);
      return;
    }
    const m = parseCel(valor);
    if (!m) {
      setAviso("Esta expressão usa recursos que o modo visual não representa (funções, relações, cálculos). Continue no modo avançado.");
      return;
    }
    setModelo(m);
    setAviso(null);
    setAvancado(false);
  }

  return (
    <div className="flex flex-col gap-2" role="group" aria-label={rotulo}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{avancado ? "Expressão CEL" : "Condições"}</span>
        <Button type="button" variant="ghost" size="sm" onClick={alternar} aria-pressed={avancado}>
          {avancado ? <ListTree /> : <Code2 />} {avancado ? "Modo visual" : "Modo avançado"}
        </Button>
      </div>
      {aviso && (
        <p className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800" role="status">
          <AlertTriangle className="size-3.5" /> {aviso}
        </p>
      )}
      {avancado ? (
        <EditorCel rotulo={`${rotulo} (CEL)`} valor={valor} onChange={onChange} linhas={3} />
      ) : (
        <>
          <EditorGrupo grupo={modelo} campos={campos} onChange={mudar} raiz />
          <div className="flex flex-col gap-1 rounded-md bg-muted px-2 py-1.5">
            <code className="break-all font-mono text-xs text-muted-foreground" data-testid="cel-gerado">
              {valor.trim() || "true"}
            </code>
            {validacao && !validacao.ok && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <XCircle className="size-3.5" /> {validacao.erro.mensagem}
              </p>
            )}
            {validacao?.ok && (
              <>
                <p className="flex items-center gap-1 text-xs text-emerald-700">
                  <CheckCircle2 className="size-3.5" /> Expressão válida
                </p>
                {validacao.avisos.map((a, i) => (
                  <p key={i} className="flex items-center gap-1 text-xs text-amber-700">
                    <AlertTriangle className="size-3.5" /> {a.tipo}: {a.mensagem}
                  </p>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EditorGrupo({ grupo, campos, onChange, raiz, remover }: { grupo: Grupo; campos: CampoCondicao[]; onChange: (g: Grupo) => void; raiz?: boolean; remover?: () => void }) {
  const trocar = (i: number, no: No) => onChange({ ...grupo, itens: grupo.itens.map((x, j) => (j === i ? no : x)) });
  const tirar = (i: number) => onChange({ ...grupo, itens: grupo.itens.filter((_, j) => j !== i) });
  const primeiro = campos[0];
  const novaCondicao = (): Condicao => ({ tipo: "condicao", campo: primeiro?.caminho ?? "card.x", op: "preenchido" });
  return (
    <div className={cn("flex flex-col gap-2", !raiz && "rounded-md border border-dashed p-2")} data-grupo={grupo.op}>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">{raiz ? "Atender" : "Grupo:"}</span>
        <NativeSelect
          aria-label="Combinar condições"
          className="h-7 w-auto text-xs"
          value={grupo.op}
          onChange={(e) => onChange({ ...grupo, op: e.target.value as "&&" | "||" })}
        >
          <option value="&&">todas (E)</option>
          <option value="||">qualquer uma (OU)</option>
        </NativeSelect>
        {remover && (
          <Button type="button" variant="ghost" size="icon" className="ml-auto size-7" aria-label="Remover grupo" onClick={remover}>
            <Trash2 />
          </Button>
        )}
      </div>
      {grupo.itens.length === 0 && <p className="text-xs text-muted-foreground">Sem condições: sempre verdadeiro.</p>}
      {grupo.itens.map((no, i) =>
        no.tipo === "grupo" ? (
          <EditorGrupo key={i} grupo={no} campos={campos} onChange={(g) => trocar(i, g)} remover={() => tirar(i)} />
        ) : (
          <LinhaCondicao key={i} condicao={no} campos={campos} onChange={(c) => trocar(i, c)} remover={() => tirar(i)} />
        ),
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...grupo, itens: [...grupo.itens, novaCondicao()] })}>
          <Plus /> Condição
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange({ ...grupo, itens: [...grupo.itens, { tipo: "grupo", op: grupo.op === "&&" ? "||" : "&&", itens: [novaCondicao()] }] })}
        >
          <Plus /> Grupo
        </Button>
      </div>
    </div>
  );
}

function LinhaCondicao({ condicao, campos, onChange, remover }: { condicao: Condicao; campos: CampoCondicao[]; onChange: (c: Condicao) => void; remover: () => void }) {
  const campo = campos.find((c) => c.caminho === condicao.campo);
  const ops = OPS_POR_TIPO[familia(campo?.tipo ?? "text")];
  const opsVisiveis = ops.includes(condicao.op) ? ops : [condicao.op, ...ops];
  return (
    <div className="flex items-center gap-2" data-condicao>
      <NativeSelect
        aria-label="Campo"
        className="h-8 w-44"
        value={condicao.campo}
        onChange={(e) => {
          const novo = campos.find((c) => c.caminho === e.target.value);
          const opsNovo = OPS_POR_TIPO[familia(novo?.tipo ?? "text")];
          const op = opsNovo.includes(condicao.op) ? condicao.op : opsNovo[0];
          onChange({ tipo: "condicao", campo: e.target.value, op, valor: valorPadrao(novo, op) });
        }}
      >
        {!campo && <option value={condicao.campo}>{condicao.campo}</option>}
        {campos.map((c) => (
          <option key={c.caminho} value={c.caminho}>
            {c.nome}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Operador"
        className="h-8 w-40"
        value={condicao.op}
        onChange={(e) => {
          const op = e.target.value as Operador;
          onChange({ ...condicao, op, valor: valorPadrao(campo, op) ?? undefined });
        }}
      >
        {opsVisiveis.map((o) => (
          <option key={o} value={o}>
            {ROTULO_OP[o]}
          </option>
        ))}
      </NativeSelect>
      <EntradaValor condicao={condicao} campo={campo} onChange={(valor) => onChange({ ...condicao, valor })} />
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Remover condição" onClick={remover}>
        <Trash2 />
      </Button>
    </div>
  );
}

function EntradaValor({ condicao, campo, onChange }: { condicao: Condicao; campo?: CampoCondicao; onChange: (v: Literal | Literal[]) => void }) {
  if (condicao.op === "vazio" || condicao.op === "preenchido") return <span className="flex-1" />;
  const f = familia(campo?.tipo ?? "text");
  const cls = "h-8 flex-1";
  if (f === "booleano") {
    return (
      <NativeSelect aria-label="Valor" className={cls} value={condicao.valor === false ? "false" : "true"} onChange={(e) => onChange(e.target.value === "true")}>
        <option value="true">sim</option>
        <option value="false">não</option>
      </NativeSelect>
    );
  }
  if (condicao.op === "em") {
    const atuais = Array.isArray(condicao.valor) ? condicao.valor.map(String) : [];
    if (campo?.opcoes?.length) {
      return (
        <div className="flex flex-1 flex-wrap gap-x-3 gap-y-1 text-xs" role="group" aria-label="Valores">
          {campo.opcoes.map((o) => (
            <label key={o} className="flex items-center gap-1">
              <input
                type="checkbox"
                className="size-3.5"
                checked={atuais.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...atuais, o] : atuais.filter((x) => x !== o))}
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    return <Input aria-label="Valores (separados por vírgula)" className={cls} value={atuais.join(", ")} onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />;
  }
  if (f === "opcao" && campo?.opcoes?.length) {
    return (
      <NativeSelect aria-label="Valor" className={cls} value={String(condicao.valor ?? "")} onChange={(e) => onChange(e.target.value)}>
        {campo.opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </NativeSelect>
    );
  }
  if (f === "numero") return <NumeroInput valor={typeof condicao.valor === "number" ? condicao.valor : 0} onChange={onChange} className={cls} />;
  return (
    <Input
      aria-label="Valor"
      className={cls}
      type={f === "data" ? "date" : "text"}
      value={typeof condicao.valor === "string" ? condicao.valor : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Número em pt-BR ("1.234,5"): mantém o texto digitado e só emite quando é um número válido. */
function NumeroInput({ valor, onChange, className }: { valor: number; onChange: (n: number) => void; className?: string }) {
  const [texto, setTexto] = useState(String(valor).replace(".", ","));
  return (
    <Input
      aria-label="Valor"
      className={className}
      inputMode="decimal"
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        const n = Number(e.target.value.replace(/\./g, "").replace(",", "."));
        if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n);
      }}
    />
  );
}
