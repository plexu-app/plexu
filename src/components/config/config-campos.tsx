"use client";
import { useState } from "react";
import { Archive, Calculator, Pencil, Plus } from "lucide-react";
import { ajustarFaseAction, arquivarCampoAction, salvarCampoAction } from "@/app/w/[ws]/b/[board]/settings/actions";
import { EditorCel } from "@/components/config/editor-cel";
import { useAcaoConfig } from "@/components/config/config-fases";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TBody, Td, Th, THead, Tr } from "@/components/ui/misc";
import { TIPOS_CAMPO } from "@/lib/config-campos";

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
}

const rotuloTipo = new Map(TIPOS_CAMPO.map((t) => [t.tipo, t.rotulo]));
const calculado = new Set(TIPOS_CAMPO.filter((t) => t.calculado).map((t) => t.tipo));

export function ConfigCampos(ctx: ContextoCampos) {
  const [editando, setEditando] = useState<string | null>(null);
  const { pendente, executar } = useAcaoConfig();
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Campos</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setEditando(editando === "novo" ? null : "novo")}>
          <Plus /> Novo campo
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-2">
        {editando === "novo" && <EditorCampo ctx={ctx} campo={null} fechar={() => setEditando(null)} />}
        <Table>
          <THead>
            <Tr>
              <Th>Nome</Th>
              <Th>Slug</Th>
              <Th>Tipo</Th>
              <Th className="w-24" />
            </Tr>
          </THead>
          <TBody>
            {ctx.campos.map((c) => (
              <FragmentoCampo key={c.id}>
                <Tr data-config-campo={c.slug}>
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
                  <Td className="text-right">
                    <Button variant="ghost" size="icon" aria-label={`Editar ${c.name}`} onClick={() => setEditando(editando === c.id ? null : c.id)}>
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
                {editando === c.id && (
                  <Tr>
                    <Td colSpan={4} className="bg-muted/40">
                      <EditorCampo ctx={ctx} campo={c} fechar={() => setEditando(null)} />
                      {ctx.fases.length > 0 && <MatrizFases ctx={ctx} campo={c} />}
                    </Td>
                  </Tr>
                )}
              </FragmentoCampo>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FragmentoCampo({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

type Config = Record<string, unknown>;
const sub = (c: Config, k: string) => ((c[k] ?? {}) as Config);

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

  return (
    <form
      className="grid grid-cols-2 gap-3 p-2"
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
      <div className="flex flex-col gap-1.5">
        <Label>Nome</Label>
        <Input aria-label="Nome do campo" value={nome} onChange={(e) => setNome(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Slug (usado nas expressões)</Label>
        <Input aria-label="Slug do campo" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="gerado a partir do nome" className="font-mono" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Tipo</Label>
        <NativeSelect aria-label="Tipo do campo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS_CAMPO.map((t) => (
            <option key={t.tipo} value={t.tipo}>
              {t.rotulo}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex items-end gap-4 pb-2 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="size-4" checked={titulo} onChange={(e) => setTitulo(e.target.checked)} /> usar como título
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="size-4" checked={unico} onChange={(e) => setUnico(e.target.checked)} /> valor único
        </label>
      </div>

      <div className="col-span-2 rounded-md border bg-background p-3">
        <ConfigPorTipo tipo={tipo} config={config} set={set} ctx={ctx} proprias={proprias} />
      </div>

      {!calculado.has(tipo) && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label>Obrigatório se (CEL; vazio = nunca)</Label>
            <EditorCel rotulo="Obrigatório se" valor={requiredExpr} onChange={setRequired} placeholder='fase == "Elaboração"' />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Visível se (CEL; vazio = sempre)</Label>
            <EditorCel rotulo="Visível se" valor={visibleExpr} onChange={setVisible} placeholder='card.tipo == "servico"' />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Valor padrão na criação (CEL)</Label>
            <EditorCel rotulo="Valor padrão" valor={defaultExpr} onChange={setDefault} placeholder="hoje()" />
          </div>
        </>
      )}
      <div className="flex flex-col gap-1.5">
        <Label>Ajuda</Label>
        <Input aria-label="Texto de ajuda" value={ajuda} onChange={(e) => setAjuda(e.target.value)} />
      </div>
      <div className="col-span-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={fechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendente}>
          Salvar campo
        </Button>
      </div>
    </form>
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
