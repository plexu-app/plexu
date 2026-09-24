"use client";
import { useState } from "react";
import { Archive, Calculator, Pencil, Plus } from "lucide-react";
import { ajustarFaseAction, arquivarCampoAction, salvarCampoAction } from "@/app/w/[ws]/b/[board]/settings/actions";
import { CampoInput } from "@/components/card/campo-input";
import { ConstrutorCondicoes, type CampoCondicao } from "@/components/condicoes/construtor";
import { EditorCel } from "@/components/config/editor-cel";
import { useAcaoConfig } from "@/components/config/config-fases";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TBody, Td, Th, THead, Tr } from "@/components/ui/misc";
import { TIPOS_CAMPO } from "@/lib/config-campos";
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
}

export interface ContextoCampos {
  ws: string;
  board: string;
  titleFieldId: string | null;
  fases: { id: string; name: string }[];
  ajustes: { fieldId: string; phaseId: string; visible: boolean | null; editable: boolean | null; required: boolean | null }[];
  boards: { id: string; name: string }[];
  /** relações que um rollup pode agregar: do board ou de outros boards apontando para ele */
  relacoesVia: { id: string; rotulo: string }[];
  campos: CampoConfig[];
  /** campos disponíveis no construtor de condições */
  condicoes: CampoCondicao[];
}

const rotuloTipo = new Map(TIPOS_CAMPO.map((t) => [t.tipo, t.rotulo]));
const calculado = new Set(TIPOS_CAMPO.filter((t) => t.calculado).map((t) => t.tipo));

export function ConfigCampos(ctx: ContextoCampos) {
  const [editando, setEditando] = useState<string | null>(null);
  const { pendente, executar } = useAcaoConfig();
  const campoEditado = editando && editando !== "novo" ? ctx.campos.find((c) => c.id === editando) ?? null : null;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Campos</CardTitle>
        <Button size="sm" onClick={() => setEditando("novo")}>
          <Plus /> Novo campo
        </Button>
      </CardHeader>
      <CardContent className="p-2">
        <Table>
          <THead>
            <Tr>
              <Th>Nome</Th>
              <Th>Slug</Th>
              <Th>Tipo</Th>
              <Th>Regras do campo</Th>
              <Th className="w-24" />
            </Tr>
          </THead>
          <TBody>
            {ctx.campos.map((c) => (
              <Tr key={c.id} data-config-campo={c.slug}>
                <Td className="font-medium">
                  {c.name}
                  {ctx.titleFieldId === c.id && (
                    <Badge variant="secondary" className="ml-2">
                      título
                    </Badge>
                  )}
                </Td>
                <Td className="font-mono text-xs">{c.slug}</Td>
                <Td>
                  <span className="inline-flex items-center gap-1">
                    {rotuloTipo.get(c.type) ?? c.type}
                    {calculado.has(c.type) && <Calculator className="size-3 text-primary" aria-label="calculado" />}
                  </span>
                </Td>
                <Td className="text-xs text-muted-foreground">
                  {[c.requiredExpr && (c.requiredExpr === "true" ? "obrigatório" : "obrigatório se…"), c.visibleExpr && "visível se…", c.uniqueValue && "único"]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </Td>
                <Td className="text-right">
                  <Button variant="ghost" size="icon" aria-label={`Editar ${c.name}`} onClick={() => setEditando(c.id)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Arquivar ${c.name}`}
                    disabled={pendente}
                    onClick={() => executar(() => arquivarCampoAction(ctx.ws, ctx.board, c.id), "Campo arquivado")}
                  >
                    <Archive />
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </CardContent>
      <Dialog open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-w-5xl">
          {editando !== null && <EditorCampo key={editando} ctx={ctx} campo={campoEditado} fechar={() => setEditando(null)} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

type Config = Record<string, unknown>;
const sub = (c: Config, k: string) => ((c[k] ?? {}) as Config);

/** Sim/não/condicional (decisão 11): sim/não viram expressão constante; condicional usa o construtor. */
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
        {[...opcoes.map((o) => ({ ...o, cond: false })), { rotulo: "condicional", expr: "", cond: true }].map((o) => {
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

function EditorCampo({ ctx, campo, fechar }: { ctx: ContextoCampos; campo: CampoConfig | null; fechar: () => void }) {
  const { pendente, executar } = useAcaoConfig();
  const [nome, setNome] = useState(campo?.name ?? "");
  const [slug, setSlug] = useState(campo?.slug ?? "");
  const [tipo, setTipo] = useState(campo?.type ?? "text");
  const [config, setConfig] = useState<Config>(campo?.config ?? {});
  const [requiredExpr, setRequired] = useState(campo?.requiredExpr ?? "");
  const [visibleExpr, setVisible] = useState(campo?.visibleExpr ?? "");
  const [defaultExpr, setDefault] = useState(campo?.defaultValueExpr ?? "");
  const [unico, setUnico] = useState(campo?.uniqueValue ?? false);
  const [ajuda, setAjuda] = useState(campo?.helpText ?? "");
  const [titulo, setTitulo] = useState(ctx.titleFieldId !== null && ctx.titleFieldId === campo?.id);
  const set = (k: string, v: Config) => setConfig((c) => ({ ...c, [k]: v }));
  const proprias = ctx.campos.filter((c) => c.type === "relation" && c.id !== campo?.id);
  const condicoes = ctx.condicoes.filter((c) => c.caminho !== `card.${campo?.slug}`);

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
              ajuda,
              titulo,
            }),
          campo ? "Campo salvo" : "Campo criado",
          fechar,
        )
      }
    >
      <DialogHeader>
        <DialogTitle>{campo ? `Editar campo: ${campo.name}` : "Novo campo"}</DialogTitle>
        <DialogDescription>O slug identifica o campo nas expressões (card.{slug || "slug"}).</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid grid-cols-[minmax(0,1fr)_280px] gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campo-nome">Nome</Label>
              <Input id="campo-nome" aria-label="Nome do campo" value={nome} onChange={(e) => setNome(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campo-slug">Slug</Label>
              <Input id="campo-slug" aria-label="Slug do campo" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="gerado do nome" className="font-mono" />
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
          <div className="flex gap-5 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="size-4" checked={titulo} onChange={(e) => setTitulo(e.target.checked)} /> usar como título do card
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="size-4" checked={unico} onChange={(e) => setUnico(e.target.checked)} /> valor único no board
            </label>
          </div>
          <section className="rounded-md border p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Opções de {rotuloTipo.get(tipo) ?? tipo}</h3>
            <ConfigPorTipo tipo={tipo} config={config} set={set} ctx={ctx} proprias={proprias} />
          </section>
          {!calculado.has(tipo) && (
            <>
              <RegraDoCampo
                rotulo="Obrigatório"
                valor={requiredExpr}
                onChange={setRequired}
                opcoes={[
                  { rotulo: "não", expr: "" },
                  { rotulo: "sim", expr: "true" },
                ]}
                campos={condicoes}
              />
              <RegraDoCampo rotulo="Visível" valor={visibleExpr} onChange={setVisible} opcoes={[{ rotulo: "sempre", expr: "" }]} campos={condicoes} />
              <div className="flex flex-col gap-1.5">
                <Label>Valor padrão na criação (CEL, opcional)</Label>
                <EditorCel rotulo="Valor padrão" valor={defaultExpr} onChange={setDefault} placeholder='hoje()  ou  "servico"' />
              </div>
            </>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campo-ajuda">Ajuda (aparece abaixo do campo)</Label>
            <Input id="campo-ajuda" aria-label="Texto de ajuda" value={ajuda} onChange={(e) => setAjuda(e.target.value)} />
          </div>
          {campo && ctx.fases.length > 0 && <MatrizFases ctx={ctx} campo={campo} />}
        </div>
        <PreviaCampo nome={nome} tipo={tipo} config={config} ajuda={ajuda} obrigatorio={requiredExpr.trim() === "true"} condicional={!!requiredExpr.trim() && requiredExpr.trim() !== "true"} />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={fechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendente}>
          Salvar campo
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Como o campo aparece no card, com as opções atuais do formulário. */
function PreviaCampo({ nome, tipo, config, ajuda, obrigatorio, condicional }: { nome: string; tipo: string; config: Config; ajuda: string; obrigatorio: boolean; condicional: boolean }) {
  const ehCalculado = calculado.has(tipo);
  return (
    <aside className="flex flex-col gap-2 self-start rounded-md border bg-muted/40 p-3" aria-label="Prévia do campo" data-testid="previa-campo">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia</span>
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
            <Label>Board de destino</Label>
            <NativeSelect aria-label="Board de destino" value={String(r.target_board ?? "")} onChange={(e) => upd("target_board", e.target.value)}>
              <option value="">—</option>
              {ctx.boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className={linha}>
            <Label>Cardinalidade</Label>
            <NativeSelect aria-label="Cardinalidade" value={String(r.cardinality ?? "many")} onChange={(e) => upd("cardinality", e.target.value)}>
              <option value="many">vários cards</option>
              <option value="one">um card</option>
            </NativeSelect>
          </div>
          <div className={linha}>
            <Label>Nome do outro lado (inverse_name)</Label>
            <Input aria-label="Nome inverso" value={String(r.inverse_name ?? "")} onChange={(e) => upd("inverse_name", e.target.value)} />
          </div>
          <div className="flex flex-col justify-end gap-1 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="size-4" checked={r.exclusive === true} onChange={(e) => upd("exclusive", e.target.checked)} /> exclusiva (o card de destino só
              pode estar em um card desta relação)
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="size-4" checked={r.is_parent === true} onChange={(e) => upd("is_parent", e.target.checked)} /> o destino é o pai deste card
            </label>
          </div>
          <div className={`${linha} col-span-2`}>
            <Label>Filtro do seletor (CEL sobre o card de destino)</Label>
            <EditorCel rotulo="Filtro da relação" valor={String(r.filter_expr ?? "")} onChange={(v) => upd("filter_expr", v)} placeholder='card.status == "open"' />
          </div>
          {ctx.campos.length > 0 && (
            <div className={`${linha} col-span-2`}>
              <Label>Travar estes campos enquanto houver ligação</Label>
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
    case "rollup": {
      const r = sub(config, "rollup");
      const upd = (k: string, v: unknown) => set("rollup", { ...r, [k]: v });
      return (
        <div className="grid grid-cols-4 gap-3">
          <div className={`${linha} col-span-2`}>
            <Label>Relação agregada</Label>
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
            <Label>Campo agregado (slug do card relacionado)</Label>
            <Input aria-label="Campo agregado" className="font-mono" value={String(r.expr ?? "")} onChange={(e) => upd("expr", e.target.value)} placeholder="valor" />
          </div>
          <div className={`${linha} col-span-2`}>
            <Label>Filtro (CEL sobre o card relacionado)</Label>
            <EditorCel rotulo="Filtro do rollup" valor={String(r.filter_expr ?? "")} onChange={(v) => upd("filter_expr", v)} placeholder="card.paga == true" />
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

function MatrizFases({ ctx, campo }: { ctx: ContextoCampos; campo: CampoConfig }) {
  const { pendente, executar } = useAcaoConfig();
  return (
    <div className="mt-2 rounded-md border bg-background p-2">
      <p className="mb-2 text-xs text-muted-foreground">Comportamento por fase (padrão = herda do campo e das expressões).</p>
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
