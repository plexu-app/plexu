"use client";
// Editor de campo (prompt PR 2, C1): modal de 760px em duas colunas — à esquerda nome, descrição e ajuda
// (opcionais), opções do tipo, obrigatoriedade e fases; à direita a prévia ao vivo. No rodapé, as
// dependências do campo. Linguagem de usuário: CEL só dentro de "Avançado" ou do modo avançado do construtor.
// A lista de campos por fase fica em editor-formulario.tsx.
import { useState } from "react";
import { Calculator, GitFork } from "lucide-react";
import { ajustarFaseAction, salvarCampoAction } from "@/app/w/[ws]/b/[board]/settings/actions";
import { CampoInput } from "@/components/card/campo-input";
import { ConstrutorCondicoes, type CampoCondicao } from "@/components/condicoes/construtor";
import { EditorCel } from "@/components/config/editor-cel";
import { useAcaoConfig } from "@/components/config/config-fases";
import { Button } from "@/components/ui/button";
import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Badge, Table, TBody, Td, Th, THead, Tr } from "@/components/ui/misc";
import { TIPOS_CAMPO, TIPOS_COLUNA_EDITAVEL } from "@/lib/config-campos";
import { fasesDoCampo } from "@/lib/fases-preenchimento";
import { exprDoValorFixo, lerValorInicial, TIPOS_DATA, TIPOS_NUMERO, type ModoInicial } from "@/lib/valor-inicial";
import { cn } from "@/lib/utils";

export interface CampoConfig {
  id: string;
  name: string;
  slug: string;
  type: string;
  config: Record<string, unknown>;
  requiredExpr: string | null;
  visibleExpr: string | null;
  defaultValueExpr: string | null;
  uniqueValue: boolean;
  helpText: string | null;
  description?: string | null;
  validation?: Record<string, unknown> | null;
}

export interface ContextoCampos {
  ws: string;
  board: string;
  titleFieldId: string | null;
  fases: { id: string; name: string }[];
  ajustes: { fieldId: string; phaseId: string; visible: boolean | null; editable: boolean | null; required: boolean | null }[];
  boards: { id: string; name: string }[];
  /** relações que um rollup pode agregar: do board ou de outros boards apontando para ele */
  relacoesVia: {
    id: string;
    rotulo: string;
    /** nome da relação e do board do outro lado (para "Vem de") */
    nome?: string;
    board?: string;
    /** campos do card do outro lado, para o lookup */
    campos?: { slug: string; name: string; type: string }[];
  }[];
  campos: CampoConfig[];
  /** campos de cada board (sem relações): colunas da sub-tabela de uma relação 1:N */
  camposPorBoard?: Record<string, { id: string; name: string; type: string }[]>;
  /** campos disponíveis no construtor de condições */
  condicoes: CampoCondicao[];
  /** Onde cada campo é usado (rodapé do editor). */
  dependencias?: Record<string, { tipo: string; nome: string }[]>;
  /** Campos com visibilidade/obrigatoriedade definidas pelas condicionais em campos. */
  geradosCondicionais?: { visivel: string[]; obrigatorio: string[] };
}

const rotuloTipo = new Map(TIPOS_CAMPO.map((t) => [t.tipo, t.rotulo]));
const calculado = new Set(TIPOS_CAMPO.filter((t) => t.calculado).map((t) => t.tipo));


/** Fases de preenchimento válidas do campo, na ordem das fases do board. */
function fasesNaLista(ctx: ContextoCampos, config: Record<string, unknown>): string[] {
  const ids = new Set(fasesDoCampo(config));
  return ctx.fases.filter((f) => ids.has(f.id)).map((f) => f.id);
}

type Config = Record<string, unknown>;
const sub = (c: Config, k: string) => ((c[k] ?? {}) as Config);

/** Nunca/sempre/quando… (decisão 11): constantes viram expressão fixa; "quando…" usa o construtor. */
function RegraDoCampo({
  rotulo,
  valor,
  onChange,
  opcoes,
  campos,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  opcoes: { rotulo: string; expr: string }[];
  campos: CampoCondicao[];
}) {
  const fixa = opcoes.find((o) => o.expr === valor.trim());
  const [condicional, setCondicional] = useState(!fixa);
  return (
    <div className="flex flex-col gap-2">
      <Label>{rotulo}</Label>
      <div className="flex gap-1" role="radiogroup" aria-label={rotulo}>
        {[...opcoes.map((o) => ({ ...o, cond: false })), { rotulo: "quando…", expr: "", cond: true }].map((o) => {
          const ativo = o.cond ? condicional : !condicional && valor.trim() === o.expr;
          return (
            <button
              key={o.rotulo}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => {
                setCondicional(o.cond);
                if (!o.cond) onChange(o.expr);
                else if (fixa) onChange("");
              }}
              className={cn("rounded-md border px-2.5 py-1 text-xs", ativo ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted")}
            >
              {o.rotulo}
            </button>
          );
        })}
      </div>
      {condicional && <ConstrutorCondicoes rotulo={`${rotulo} — condição`} valor={valor} onChange={onChange} campos={campos} />}
    </div>
  );
}

/** "Valor inicial": nenhum, data de hoje ou um valor fixo; expressões ficam no Avançado. */
function ValorInicial({ tipo, config, expr, onChange }: { tipo: string; config: Config; expr: string; onChange: (v: string) => void }) {
  const lido = lerValorInicial(tipo, expr);
  const [modo, setModo] = useState<ModoInicial>(lido.modo);
  const [fixo, setFixo] = useState(lido.fixo);
  const opcoes = Array.isArray(config.options) ? (config.options as unknown[]).map((o) => (typeof o === "string" ? o : String((o as Config).value ?? ""))) : [];
  const exemplo = TIPOS_DATA.has(tipo)
    ? "Ex.: a data de hoje."
    : TIPOS_NUMERO.has(tipo)
      ? "Ex.: 0 ou 1.000,00."
      : tipo === "boolean"
        ? "Ex.: já vem marcado."
        : opcoes.length
          ? `Ex.: “${opcoes[0]}”.`
          : "Ex.: “A definir”.";
  const mudarFixo = (v: string) => {
    setFixo(v);
    onChange(exprDoValorFixo(tipo, v));
  };
  const escolher = (m: ModoInicial) => {
    setModo(m);
    if (m === "nenhum") onChange("");
    if (m === "hoje") onChange("hoje()");
    if (m === "fixo") onChange(exprDoValorFixo(tipo, fixo || (tipo === "boolean" ? "true" : "")));
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="valor-inicial-modo">Valor inicial</Label>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect id="valor-inicial-modo" aria-label="Valor inicial" className="w-48" value={modo} onChange={(e) => escolher(e.target.value as ModoInicial)}>
          <option value="nenhum">nenhum</option>
          {TIPOS_DATA.has(tipo) && <option value="hoje">data de hoje</option>}
          <option value="fixo">um valor fixo</option>
          {modo === "avancado" && <option value="avancado">personalizado (Avançado)</option>}
        </NativeSelect>
        {modo === "fixo" &&
          (tipo === "boolean" ? (
            <NativeSelect aria-label="Valor fixo" className="w-32" value={fixo || "true"} onChange={(e) => mudarFixo(e.target.value)}>
              <option value="true">marcado</option>
              <option value="false">desmarcado</option>
            </NativeSelect>
          ) : opcoes.length ? (
            <NativeSelect aria-label="Valor fixo" className="w-44" value={fixo} onChange={(e) => mudarFixo(e.target.value)}>
              <option value="">—</option>
              {opcoes.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <Input aria-label="Valor fixo" className="w-56" value={fixo} onChange={(e) => mudarFixo(e.target.value)} />
          ))}
      </div>
      <p className="text-xs text-muted-foreground">Preenchido ao criar o card, se ninguém informar outro. {exemplo}</p>
    </div>
  );
}

/** Campo novo vindo da paleta: tipo, fase e posição já escolhidos. */
export interface InicialCampo {
  tipo?: string;
  fases?: string[];
  /** Inserir antes deste campo (arrastar da paleta para uma posição). */
  antesDe?: string | null;
}

export function EditorCampo({ ctx, campo, fechar, inicial }: { ctx: ContextoCampos; campo: CampoConfig | null; fechar: () => void; inicial?: InicialCampo }) {
  const { pendente, executar } = useAcaoConfig();
  const [nome, setNome] = useState(campo?.name ?? "");
  const [slug, setSlug] = useState(campo?.slug ?? "");
  const [tipo, setTipo] = useState(campo?.type ?? inicial?.tipo ?? "text");
  const [descricao, setDescricao] = useState(campo?.description ?? "");
  const [comDescricao, setComDescricao] = useState(!!campo?.description);
  const [comAjuda, setComAjuda] = useState(!!campo?.helpText);
  const geradoVisivel = !!campo && !!ctx.geradosCondicionais?.visivel.includes(campo.id);
  const geradoObrigatorio = !!campo && !!ctx.geradosCondicionais?.obrigatorio.includes(campo.id);
  const dependencias = campo ? (ctx.dependencias?.[campo.id] ?? []) : [];
  // Fases arquivadas saem da seleção ao abrir: o servidor recusaria ids que não são fases ativas.
  const [config, setConfig] = useState<Config>(() => {
    const c = { ...(campo?.config ?? (inicial?.fases?.length ? { fill_phases: inicial.fases } : {})) };
    if (Array.isArray(c.fill_phases)) c.fill_phases = fasesNaLista(ctx, c);
    if (Array.isArray(c.fill_phases) && !(c.fill_phases as string[]).length) delete c.fill_phases;
    return c;
  });
  const [requiredExpr, setRequired] = useState(campo?.requiredExpr ?? "");
  const [visibleExpr, setVisible] = useState(campo?.visibleExpr ?? "");
  const [defaultExpr, setDefault] = useState(campo?.defaultValueExpr ?? "");
  const [versaoInicial, setVersaoInicial] = useState(0);
  const [unico, setUnico] = useState(campo?.uniqueValue ?? false);
  const [ajuda, setAjuda] = useState(campo?.helpText ?? "");
  const [formato, setFormato] = useState(String(campo?.validation?.regex ?? ""));
  const [msgFormato, setMsgFormato] = useState(String(campo?.validation?.message ?? ""));
  const [titulo, setTitulo] = useState(ctx.titleFieldId !== null && ctx.titleFieldId === campo?.id);
  const set = (k: string, v: Config) => setConfig((c) => ({ ...c, [k]: v }));
  const proprias = ctx.campos.filter((c) => c.type === "relation" && c.id !== campo?.id);
  const condicoes = ctx.condicoes.filter((c) => c.caminho !== `card.${campo?.slug}`);
  const ehCalculado = calculado.has(tipo);
  const fasesSel = fasesNaLista(ctx, config);
  const mudarFasesSel = (ids: string[]) =>
    setConfig((c) => {
      const resto = { ...c };
      delete resto.fill_phases;
      const ordenadas = ctx.fases.filter((f) => ids.includes(f.id)).map((f) => f.id);
      if (!ordenadas.length) delete resto.editable_everywhere;
      return ordenadas.length ? { ...resto, fill_phases: ordenadas } : resto;
    });

  return (
    <form
      className="flex min-h-0 flex-col"
      aria-label={campo ? `Editar campo ${campo.name}` : "Novo campo"}
      action={() =>
        executar(
          () =>
            salvarCampoAction(ctx.ws, ctx.board, campo?.id ?? null, {
              nome,
              slug,
              tipo,
              config,
              requiredExpr,
              visibleExpr,
              defaultValueExpr: defaultExpr,
              unico,
              ajuda: comAjuda ? ajuda : "",
              descricao: comDescricao ? descricao : "",
              antesDe: campo ? null : (inicial?.antesDe ?? null),
              titulo,
              validacao: { ...(campo?.validation ?? {}), regex: formato, message: msgFormato },
            }),
          campo ? "Campo salvo" : "Campo criado",
          fechar,
        )
      }
    >
      <DialogHeader>
        <DialogTitle>{campo ? `Editar campo: ${campo.name}` : "Novo campo"}</DialogTitle>
        <DialogDescription>Como o campo aparece e quando precisa ser preenchido.</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid grid-cols-[minmax(0,1fr)_240px] gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campo-nome">Nome</Label>
              <Input id="campo-nome" aria-label="Nome do campo" value={nome} onChange={(e) => setNome(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campo-tipo">Tipo</Label>
              <NativeSelect id="campo-tipo" aria-label="Tipo do campo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_CAMPO.map((t) => (
                  <option key={t.tipo} value={t.tipo}>
                    {t.rotulo}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="flex flex-col gap-2" data-opcionais-campo>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={comDescricao} onChange={(e) => setComDescricao(e.target.checked)} /> Descrição
            </label>
            {comDescricao && <Textarea aria-label="Descrição do campo" rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Aparece abaixo do nome, no formulário." />}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={comAjuda} onChange={(e) => setComAjuda(e.target.checked)} aria-label="Mostrar texto de ajuda" /> Texto de ajuda
            </label>
            {comAjuda && <Input id="campo-ajuda" aria-label="Texto de ajuda" value={ajuda} onChange={(e) => setAjuda(e.target.value)} placeholder="Aparece abaixo do campo." />}
          </div>
          {ctx.fases.length > 0 && (
            <fieldset className="flex flex-col gap-2" aria-describedby="campo-fases-ajuda">
              <legend className="mb-1.5 text-sm font-medium">{ehCalculado ? "Aparece a partir das fases…" : "Preenchido nas fases…"}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2" role="group" aria-label="Preenchido nas fases">
                {ctx.fases.map((f) => (
                  <label key={f.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={fasesSel.includes(f.id)}
                      onChange={(e) => mudarFasesSel(e.target.checked ? [...fasesSel, f.id] : fasesSel.filter((x) => x !== f.id))}
                    />
                    {f.name}
                  </label>
                ))}
              </div>
              {!ehCalculado && (
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    disabled={!fasesSel.length}
                    checked={fasesSel.length > 0 && config.editable_everywhere === true}
                    onChange={(e) =>
                      setConfig((c) => {
                        const resto = { ...c };
                        delete resto.editable_everywhere;
                        return e.target.checked ? { ...resto, editable_everywhere: true } : resto;
                      })
                    }
                  />
                  Pode ser editado em qualquer fase depois disso
                </label>
              )}
              <p id="campo-fases-ajuda" className="text-xs text-muted-foreground">
                {!fasesSel.length
                  ? "Nenhuma fase marcada: aparece e pode ser editado em todas as fases."
                  : ehCalculado
                    ? "Fica oculto antes da primeira fase marcada."
                    : config.editable_everywhere === true
                      ? "Fica oculto antes da primeira fase marcada e pode ser editado em todas as seguintes."
                      : "Fica oculto antes da primeira fase marcada, editável nas marcadas e somente leitura nas outras."}
              </p>
            </fieldset>
          )}
          <div className="flex gap-5 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="size-4" checked={titulo} onChange={(e) => setTitulo(e.target.checked)} /> usar como título do card
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="size-4" checked={unico} onChange={(e) => setUnico(e.target.checked)} /> não pode repetir entre cards do board
            </label>
          </div>
          <section className="rounded-md border p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Opções de {rotuloTipo.get(tipo) ?? tipo}</h3>
            <ConfigPorTipo tipo={tipo} config={config} set={set} ctx={ctx} proprias={proprias} />
          </section>
          {!ehCalculado && (
            <>
              {geradoVisivel ? (
                <p className="rounded border border-dashed border-line px-3 py-2 text-xs text-ink-2" data-gerado-condicional="visivel">
                  <GitFork className="mr-1 inline size-3.5" aria-hidden /> Quando aparece é definido pelas condicionais em campos.
                </p>
              ) : (
                <RegraDoCampo rotulo="Aparece" valor={visibleExpr} onChange={setVisible} opcoes={[{ rotulo: "sempre", expr: "" }]} campos={condicoes} />
              )}
              {geradoObrigatorio ? (
                <p className="rounded border border-dashed border-line px-3 py-2 text-xs text-ink-2" data-gerado-condicional="obrigatorio">
                  <GitFork className="mr-1 inline size-3.5" aria-hidden /> Quando é obrigatório é definido pelas condicionais em campos.
                </p>
              ) : (
                <RegraDoCampo
                  rotulo="Obrigatório"
                  valor={requiredExpr}
                  onChange={setRequired}
                  opcoes={[
                    { rotulo: "nunca", expr: "" },
                    { rotulo: "sempre", expr: "true" },
                  ]}
                  campos={condicoes}
                />
              )}
              <ValorInicial key={`${tipo}:${versaoInicial}`} tipo={tipo} config={config} expr={defaultExpr} onChange={setDefault} />
            </>
          )}
          <details className="rounded-md border p-3" data-testid="campo-avancado">
            <summary className="cursor-pointer text-sm font-medium">Avançado</summary>
            <div className="mt-3 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="campo-slug">Identificador nas expressões</Label>
                <Input id="campo-slug" aria-label="Slug do campo" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="gerado do nome" className="w-64 font-mono" />
                <p className="text-xs text-muted-foreground">Usado como card.{slug || "identificador"} em condições e fórmulas.</p>
              </div>
              {!ehCalculado && (
                <div className="flex flex-col gap-1.5">
                  <Label>Valor inicial calculado (CEL)</Label>
                  <EditorCel
                    rotulo="Valor inicial (CEL)"
                    valor={defaultExpr}
                    onChange={(v) => {
                      setDefault(v);
                      setVersaoInicial((n) => n + 1);
                    }}
                    placeholder='hoje()  ou  "servico"'
                  />
                </div>
              )}
              {(tipo === "text" || tipo === "long_text") && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="campo-formato">Formato (regex)</Label>
                    <Input id="campo-formato" aria-label="Formato (regex)" className="font-mono" value={formato} onChange={(e) => setFormato(e.target.value)} placeholder="^[A-Z ]+$" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="campo-formato-msg">Mensagem quando o formato não bate</Label>
                    <Input id="campo-formato-msg" aria-label="Mensagem de formato" value={msgFormato} onChange={(e) => setMsgFormato(e.target.value)} placeholder="Ex.: use só letras maiúsculas" />
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground">Sem mensagem, aparece “Formato inválido. Esperado: …”. A validação vale no formulário e no servidor.</p>
                </div>
              )}
              <ConfigAvancadaPorTipo tipo={tipo} config={config} set={set} />
              {campo && ctx.fases.length > 0 && <MatrizFases ctx={ctx} campo={campo} />}
            </div>
          </details>
        </div>
        <PreviaCampo
          nome={nome}
          tipo={tipo}
          config={config}
          ajuda={comAjuda ? ajuda : ""}
          descricao={comDescricao ? descricao : ""}
          obrigatorio={requiredExpr.trim() === "true"}
          condicional={!!requiredExpr.trim() && requiredExpr.trim() !== "true"}
        />
      </DialogBody>
      <DialogFooter className="items-start justify-between">
        <details className="min-w-0 max-w-[60%] text-[13px]" data-dependencias-campo>
          <summary className="cursor-pointer text-ink-2 hover:text-ink">Dependências do campo ({dependencias.length})</summary>
          {dependencias.length ? (
            <ul className="mt-2 flex max-h-32 flex-col gap-1 overflow-y-auto text-xs text-ink-2">
              {dependencias.map((d, i) => (
                <li key={i}>{d.nome}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-ink-3">{campo ? "Nenhuma regra, automação ou expressão usa este campo." : "Campo novo: ainda não é usado."}</p>
          )}
        </details>
        <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={fechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendente}>
          Salvar campo
        </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

/** Opções em CEL de cada tipo (filtros), mostradas só no Avançado. */
function ConfigAvancadaPorTipo({ tipo, config, set }: { tipo: string; config: Config; set: (k: string, v: Config) => void }) {
  if (tipo === "relation") {
    const r = sub(config, "relation");
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Quais cards podem ser escolhidos (CEL sobre o card do outro board)</Label>
        <EditorCel rotulo="Filtro da relação" valor={String(r.filter_expr ?? "")} onChange={(v) => set("relation", { ...r, filter_expr: v })} placeholder='card.status == "open"' />
      </div>
    );
  }
  if (tipo === "rollup") {
    const r = sub(config, "rollup");
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Considerar só os cards que… (CEL sobre o card relacionado)</Label>
        <EditorCel rotulo="Filtro do rollup" valor={String(r.filter_expr ?? "")} onChange={(v) => set("rollup", { ...r, filter_expr: v })} placeholder="card.paga == true" />
      </div>
    );
  }
  return null;
}

/** Como o campo aparece no card, com as opções atuais do formulário. */
function PreviaCampo({
  nome,
  tipo,
  config,
  ajuda,
  descricao,
  obrigatorio,
  condicional,
}: {
  nome: string;
  tipo: string;
  config: Config;
  ajuda: string;
  descricao: string;
  obrigatorio: boolean;
  condicional: boolean;
}) {
  const ehCalculado = calculado.has(tipo);
  return (
    <aside className="flex flex-col gap-2 self-start rounded-md border bg-muted/40 p-3" aria-label="Prévia do campo" data-testid="previa-campo">
      <span className="text-xs text-ink-2">Esta é uma prévia do seu campo</span>
      <div className="flex items-center gap-2">
        <Label>
          {nome || "Nome do campo"}
          {obrigatorio && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        {ehCalculado && (
          <Badge variant="calculado">
            <Calculator className="size-3" /> calculado
          </Badge>
        )}
        {condicional && <Badge variant="outline">obrigatório se…</Badge>}
      </div>
      {descricao && <p className="-mt-1 text-xs text-ink-2">{descricao}</p>}
      {ehCalculado ? (
        <div className="min-h-9 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
          {tipo === "sequence" ? String(sub(config, "sequence").pattern ?? "{n}") : tipo === "dynamic_text" ? String(sub(config, "dynamic_text").template ?? "") : "valor calculado"}
        </div>
      ) : tipo === "relation" ? (
        <div className="min-h-9 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">Buscar card por título ou id…</div>
      ) : tipo === "attachment" ? (
        <div className="min-h-9 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">Anexos</div>
      ) : (
        <CampoInput key={`${tipo}:${JSON.stringify(config)}`} campo={{ id: "previa", name: nome || "Campo", type: tipo, config }} valor={null} pessoas={{ exemplo: "Pessoa exemplo" }} />
      )}
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
    </aside>
  );
}

function ConfigPorTipo({
  tipo,
  config,
  set,
  ctx,
  proprias,
}: {
  tipo: string;
  config: Config;
  set: (k: string, v: Config) => void;
  ctx: ContextoCampos;
  proprias: CampoConfig[];
}) {
  const linha = "flex flex-col gap-1.5";
  switch (tipo) {
    case "select":
    case "multi_select": {
      const opcoes = Array.isArray(config.options) ? (config.options as unknown[]).map((o) => (typeof o === "string" ? o : String((o as Config).value ?? ""))) : [];
      return (
        <div className={linha}>
          <Label>Opções (uma por linha)</Label>
          <Textarea
            aria-label="Opções"
            rows={4}
            defaultValue={opcoes.join("\n")}
            onChange={(e) => {
              const lista = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
              set("options", lista as unknown as Config);
            }}
          />
        </div>
      );
    }
    case "currency":
      return (
        <div className={linha}>
          <Label>Moeda (código ISO)</Label>
          <Input aria-label="Moeda" className="w-24" defaultValue={String(sub(config, "currency").code ?? "BRL")} onChange={(e) => set("currency", { code: e.target.value.toUpperCase() })} />
        </div>
      );
    case "person":
      return (
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="size-4" checked={config.multiple === true} onChange={(e) => set("multiple", e.target.checked as unknown as Config)} /> várias pessoas
        </label>
      );
    case "relation": {
      const r = sub(config, "relation");
      const upd = (k: string, v: unknown) => set("relation", { ...r, [k]: v });
      const lock = Array.isArray(r.lock_fields_while_linked) ? (r.lock_fields_while_linked as string[]) : [];
      return (
        <div className="grid grid-cols-2 gap-3">
          <div className={linha}>
            <Label>Board relacionado</Label>
            <NativeSelect aria-label="Board relacionado" value={String(r.target_board ?? "")} onChange={(e) => upd("target_board", e.target.value)}>
              <option value="">—</option>
              {ctx.boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className={linha}>
            <Label>Um ou vários</Label>
            <NativeSelect aria-label="Um ou vários" value={String(r.cardinality ?? "many")} onChange={(e) => upd("cardinality", e.target.value)}>
              <option value="many">vários cards</option>
              <option value="one">um card</option>
            </NativeSelect>
          </div>
          <div className={linha}>
            <Label>Como o outro board vê esta relação</Label>
            <Input aria-label="Como o outro board vê esta relação" placeholder="ex.: contrato" value={String(r.inverse_name ?? "")} onChange={(e) => upd("inverse_name", e.target.value)} />
          </div>
          <div className="flex flex-col justify-end gap-1 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="size-4" checked={r.exclusive === true} onChange={(e) => upd("exclusive", e.target.checked)} /> Cada card do outro board só pode ser escolhido uma vez
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="size-4" checked={r.is_parent === true} onChange={(e) => upd("is_parent", e.target.checked)} /> o card escolhido é o pai deste
            </label>
            {r.cardinality === "one" && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" className="size-4" checked={r.show_on_card === true} onChange={(e) => upd("show_on_card", e.target.checked)} /> Mostrar no card (kanban)
              </label>
            )}
          </div>
          {ctx.campos.length > 0 && (
            <div className={`${linha} col-span-2`}>
              <Label>Travar estes campos enquanto houver card ligado</Label>
              <div className="flex flex-wrap gap-3 text-sm">
                {ctx.campos.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={lock.includes(c.id)}
                      onChange={(e) => upd("lock_fields_while_linked", e.target.checked ? [...lock, c.id] : lock.filter((x) => x !== c.id))}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <ColunasSubTabela ctx={ctx} r={r} upd={upd} />
        </div>
      );
    }
    case "sequence": {
      const s = sub(config, "sequence");
      const upd = (k: string, v: unknown) => set("sequence", { ...s, [k]: v });
      return (
        <div className="grid grid-cols-4 gap-3">
          <div className={`${linha} col-span-2`}>
            <Label>Padrão</Label>
            <Input aria-label="Padrão da sequência" className="font-mono" value={String(s.pattern ?? "{n}")} onChange={(e) => upd("pattern", e.target.value)} />
            <p className="text-xs text-muted-foreground">Tokens: {"{n}"} {"{n:4}"} {"{ano}"} {"{mes}"} {"{dia}"} {"{pai.<slug>}"}</p>
          </div>
          <div className={linha}>
            <Label>Reinicia por</Label>
            <NativeSelect aria-label="Escopo da sequência" value={String(s.scope ?? "global")} onChange={(e) => upd("scope", e.target.value)}>
              <option value="global">nunca (global)</option>
              <option value="year">ano</option>
              <option value="month">mês</option>
              <option value="day">dia</option>
              <option value="parent">card pai</option>
            </NativeSelect>
          </div>
          <div className={linha}>
            <Label>Semente / zeros</Label>
            <div className="flex gap-2">
              <Input aria-label="Semente" type="number" value={String(s.seed ?? 1)} onChange={(e) => upd("seed", e.target.value)} />
              <Input aria-label="Zeros à esquerda" type="number" value={String(s.pad ?? 4)} onChange={(e) => upd("pad", e.target.value)} />
            </div>
          </div>
          {s.scope === "parent" && (
            <div className={`${linha} col-span-2`}>
              <Label>Relação com o pai</Label>
              <NativeSelect aria-label="Relação com o pai" value={String(s.parent_field ?? "")} onChange={(e) => upd("parent_field", e.target.value)}>
                <option value="">—</option>
                {proprias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
        </div>
      );
    }
    case "attachment":
      return (
        <div className={linha}>
          <Label>Tipos de arquivo aceitos</Label>
          <Input aria-label="Tipos de arquivo aceitos" value={String(config.accept ?? "")} onChange={(e) => set("accept", e.target.value as unknown as Config)} placeholder=".pdf, .docx, image/*" />
          <p className="text-xs text-muted-foreground">Extensões ou tipos, separados por vírgula. Vazio aceita qualquer arquivo.</p>
        </div>
      );
    case "lookup": {
      const l = sub(config, "lookup");
      const upd = (k: string, v: unknown) => set("lookup", { ...l, [k]: v });
      const rel = ctx.relacoesVia.find((v) => v.id === l.via_field);
      const path = String(l.path ?? "");
      const META: Record<string, string> = { titulo: "Título", fase: "Fase", status: "Status" };
      const campoOrigem = rel?.campos?.find((c) => c.slug === path);
      const nomeOrigem = campoOrigem?.name ?? META[path] ?? path;
      const modo = l.mode === "copy" ? "copy" : l.editable_writeback === true ? "writeback" : "ref";
      const setModo = (m: string) => set("lookup", { ...l, mode: m === "copy" ? "copy" : "ref", editable_writeback: m === "writeback" });
      // Writeback só grava em campo digitável: metadados e campos calculados ficam fora.
      const origemCalculada = !campoOrigem || calculado.has(campoOrigem.type);
      return (
        <div className="grid grid-cols-2 gap-3">
          <div className={linha}>
            <Label>Pela relação</Label>
            <NativeSelect aria-label="Relação do valor relacionado" value={String(l.via_field ?? "")} onChange={(e) => upd("via_field", e.target.value)}>
              <option value="">—</option>
              {ctx.relacoesVia.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.rotulo}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className={linha}>
            <Label>Campo do card relacionado</Label>
            {rel?.campos ? (
              <NativeSelect aria-label="Campo do card relacionado" value={path} onChange={(e) => upd("path", e.target.value)}>
                <option value="">—</option>
                {rel.campos.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
                {Object.entries(META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
                {path && !rel.campos.some((c) => c.slug === path) && !META[path] && <option value={path}>{path} (não encontrado)</option>}
              </NativeSelect>
            ) : (
              <Input aria-label="Campo do card relacionado" className="font-mono" value={path} onChange={(e) => upd("path", e.target.value)} placeholder="nome" />
            )}
          </div>
          {rel && path && (
            <p className="col-span-2 text-xs text-muted-foreground" data-vem-de>
              Vem de: {rel.board ? `${rel.board} → ` : ""}
              {rel.nome ?? rel.rotulo} → {nomeOrigem}
            </p>
          )}
          <fieldset className={`${linha} col-span-2`}>
            <legend className="mb-1 text-sm font-medium">Como o valor fica aqui</legend>
            {[
              { v: "copy", t: "Copiar uma vez (pode divergir depois)", d: "Copia ao ligar ou trocar o card; depois cada um segue o seu caminho." },
              { v: "ref", t: "Espelhar (sempre igual ao card de origem)", d: "Mostra sempre o valor atual do card de origem; aqui é somente leitura." },
              {
                v: "writeback",
                t: "Espelhar e permitir editar daqui (altera o card de origem)",
                d: origemCalculada && path ? "Indisponível: o campo de origem é calculado ou de sistema." : "Editar aqui grava no card de origem, com as regras de lá; todos os espelhos acompanham.",
              },
            ].map((o) => (
              <label key={o.v} className="flex items-start gap-2 py-0.5 text-sm">
                <input
                  type="radio"
                  name="modo-lookup"
                  className="mt-1"
                  value={o.v}
                  checked={modo === o.v}
                  disabled={o.v === "writeback" && origemCalculada && !!path && modo !== "writeback"}
                  onChange={() => setModo(o.v)}
                />
                <span>
                  {o.t}
                  <span className="block text-xs text-muted-foreground">{o.d}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      );
    }
    case "rollup": {
      const r = sub(config, "rollup");
      const upd = (k: string, v: unknown) => set("rollup", { ...r, [k]: v });
      return (
        <div className="grid grid-cols-4 gap-3">
          <div className={`${linha} col-span-2`}>
            <Label>Somar a partir da relação</Label>
            <NativeSelect aria-label="Relação agregada" value={String(r.via_field ?? "")} onChange={(e) => upd("via_field", e.target.value)}>
              <option value="">—</option>
              {ctx.relacoesVia.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.rotulo}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className={linha}>
            <Label>Agregação</Label>
            <NativeSelect aria-label="Agregação" value={String(r.agg ?? "count")} onChange={(e) => upd("agg", e.target.value)}>
              <option value="count">contar</option>
              <option value="sum">somar</option>
              <option value="avg">média</option>
              <option value="min">mínimo</option>
              <option value="max">máximo</option>
            </NativeSelect>
          </div>
          <div className={linha}>
            <Label>Formato</Label>
            <NativeSelect aria-label="Formato" value={String(r.format ?? "")} onChange={(e) => upd("format", e.target.value || undefined)}>
              <option value="">número</option>
              <option value="currency">moeda</option>
            </NativeSelect>
          </div>
          <div className={`${linha} col-span-2`}>
            <Label>Campo dos cards relacionados</Label>
            <Input aria-label="Campo agregado" className="font-mono" value={String(r.expr ?? "")} onChange={(e) => upd("expr", e.target.value)} placeholder="valor" />
          </div>
        </div>
      );
    }
    case "dynamic_text": {
      const t = sub(config, "dynamic_text");
      return (
        <div className={linha}>
          <Label>Modelo do texto</Label>
          <Input aria-label="Modelo do texto" value={String(t.template ?? "")} onChange={(e) => set("dynamic_text", { template: e.target.value })} placeholder="{numero} · {qtd_parcelas} parcela(s)" />
          <p className="text-xs text-muted-foreground">Trechos entre chaves: um slug ({"{numero}"}) ou uma expressão CEL ({"{card.global - card.pago}"}).</p>
        </div>
      );
    }
    default:
      return <p className="text-xs text-muted-foreground">Este tipo não tem configuração adicional.</p>;
  }
}

type Tri = boolean | null;
const TRI: { valor: string; rotulo: string }[] = [
  { valor: "", rotulo: "padrão" },
  { valor: "1", rotulo: "sim" },
  { valor: "0", rotulo: "não" },
];
const deTri = (v: Tri) => (v === null ? "" : v ? "1" : "0");
const paraTri = (s: string): Tri => (s === "" ? null : s === "1");

/**
 * Colunas da sub-tabela de uma relação 1:N (relation.table_fields): quais campos do board filho aparecem
 * e quais se editam direto na tabela. Board filho: o de destino, ou este quando "o card escolhido é o pai".
 */
function ColunasSubTabela({ ctx, r, upd }: { ctx: ContextoCampos; r: Record<string, unknown>; upd: (k: string, v: unknown) => void }) {
  const umPorUm = r.cardinality === "one" && r.is_parent !== true;
  const boardFilho = r.is_parent === true ? null : String(r.target_board ?? "");
  const campos = (boardFilho ? ctx.camposPorBoard?.[boardFilho] : ctx.campos.filter((c) => c.type !== "relation")) ?? [];
  if (umPorUm || !campos.length) return null;
  const cols = (Array.isArray(r.table_fields) ? r.table_fields : []) as { field: string; editable?: boolean }[];
  const set = (n: { field: string; editable?: boolean }[]) => upd("table_fields", n);
  return (
    <fieldset className="col-span-2 rounded-md border px-3 py-2" aria-label="Colunas na sub-tabela">
      <legend className="px-1 text-sm font-medium">Colunas na sub-tabela</legend>
      <p className="mb-2 text-xs text-muted-foreground">{cols.length ? "Na ordem da lista." : "Sem escolha: os 6 primeiros campos."} “Editar na tabela” vale para sim/não, data, número, moeda e seleção.</p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
        {campos.map((c) => {
          const col = cols.find((x) => x.field === c.id);
          const editavelTipo = TIPOS_COLUNA_EDITAVEL.has(c.type);
          return (
            <li key={c.id} className="flex items-center gap-3 text-sm" data-coluna={c.name}>
              <label className="flex flex-1 items-center gap-1.5">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={!!col}
                  onChange={(e) => set(e.target.checked ? [...cols, { field: c.id }] : cols.filter((x) => x.field !== c.id))}
                />
                {c.name}
              </label>
              <label className={cn("flex items-center gap-1 text-xs", !editavelTipo && "opacity-50")} title={editavelTipo ? undefined : "Este tipo de campo não se edita na tabela"}>
                <input
                  type="checkbox"
                  className="size-3.5"
                  aria-label={`Editar ${c.name} na tabela`}
                  disabled={!col || !editavelTipo}
                  checked={!!col?.editable}
                  onChange={(e) => set(cols.map((x) => (x.field === c.id ? { field: x.field, ...(e.target.checked ? { editable: true } : {}) } : x)))}
                />
                editar na tabela
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

function MatrizFases({ ctx, campo }: { ctx: ContextoCampos; campo: CampoConfig }) {
  const { pendente, executar } = useAcaoConfig();
  return (
    <div className="mt-2 rounded-md border bg-background p-2">
      <p className="mb-2 text-xs text-muted-foreground">Exceções por fase: vencem a fase de origem e as condições acima (padrão = sem exceção).</p>
      <Table>
        <THead>
          <Tr>
            <Th>Fase</Th>
            <Th>Visível</Th>
            <Th>Editável</Th>
            <Th>Obrigatório</Th>
          </Tr>
        </THead>
        <TBody>
          {ctx.fases.map((f) => {
            const a = ctx.ajustes.find((x) => x.fieldId === campo.id && x.phaseId === f.id) ?? { visible: null, editable: null, required: null };
            const mudar = (k: "visible" | "editable" | "required", v: string) =>
              executar(() => ajustarFaseAction(ctx.ws, ctx.board, campo.id, f.id, { ...{ visible: a.visible, editable: a.editable, required: a.required }, [k]: paraTri(v) }), "Ajuste salvo");
            return (
              <Tr key={f.id}>
                <Td>{f.name}</Td>
                {(["visible", "editable", "required"] as const).map((k) => (
                  <Td key={k}>
                    <NativeSelect aria-label={`${k} em ${f.name}`} className="h-8 w-28" value={deTri(a[k])} disabled={pendente} onChange={(e) => mudar(k, e.target.value)}>
                      {TRI.map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.rotulo}
                        </option>
                      ))}
                    </NativeSelect>
                  </Td>
                ))}
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
