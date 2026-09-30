"use client";
// Passos de automação/ação como cards ordenáveis (subir/descer), um formulário por tipo.
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { METODOS_HTTP, ROTULO_ALVO, TIPOS_PASSO, type TipoPasso } from "@/lib/automacoes";
import { editavel, type ContextoAutomacoes } from "./contexto";

export type PassoUI = Record<string, unknown> & { type: TipoPasso };

const ROTULO = new Map(TIPOS_PASSO.map((t) => [t.tipo, t.rotulo]));
const s = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

export function passoVazio(tipo: TipoPasso): PassoUI {
  switch (tipo) {
    case "move_card":
      return { type: tipo, phase: "" };
    case "set_field":
      return { type: tipo, field: "", value: "" };
    case "create_related_card":
      return { type: tipo, board: "", relation: "", phase: "", fields: {} };
    case "send_email":
      return { type: tipo, to: "", subject: "", body: "" };
    case "http_request":
      return { type: tipo, method: "POST", url: "", headers: {}, body: "" };
    case "add_comment":
      return { type: tipo, body: "" };
  }
}

const AJUDA_MODELO = "Use {{ card.campo }} para valores do card e {{ var.NOME }} para variáveis do workspace.";

export function EditorPassos({ ctx, passos, onChange }: { ctx: ContextoAutomacoes; passos: PassoUI[]; onChange: (p: PassoUI[]) => void }) {
  const trocar = (i: number, p: PassoUI) => onChange(passos.map((x, j) => (j === i ? p : x)));
  const mover = (i: number, d: -1 | 1) => {
    const n = [...passos];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    onChange(n);
  };
  return (
    <div className="flex flex-col gap-2" data-passos>
      <ol className="flex flex-col gap-2">
        {passos.map((p, i) => (
          <li key={i} className="rounded-md border bg-background p-3" data-passo={i + 1}>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary-strong">{i + 1}</span>
              <span className="flex-1 text-sm font-medium">{ROTULO.get(p.type)}</span>
              <Button type="button" variant="ghost" size="icon" aria-label={`Subir passo ${i + 1}`} disabled={i === 0} onClick={() => mover(i, -1)}>
                <ArrowUp />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={`Descer passo ${i + 1}`} disabled={i === passos.length - 1} onClick={() => mover(i, 1)}>
                <ArrowDown />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remover passo ${i + 1}`} onClick={() => onChange(passos.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
            <CamposPasso ctx={ctx} p={p} n={i + 1} set={(q) => trocar(i, q)} />
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-2">
        <NativeSelect
          aria-label="Adicionar passo"
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...passos, passoVazio(e.target.value as TipoPasso)]);
          }}
          className="w-auto"
        >
          <option value="">+ Adicionar passo…</option>
          {TIPOS_PASSO.map((t) => (
            <option key={t.tipo} value={t.tipo}>
              {t.rotulo}
            </option>
          ))}
        </NativeSelect>
        {!passos.length && <span className="text-xs text-muted-foreground">Os passos rodam em ordem e param no primeiro erro.</span>}
      </div>
    </div>
  );
}

function Linha({ rotulo, children, largura = "" }: { rotulo: string; children: React.ReactNode; largura?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${largura}`}>
      <span className="text-xs font-medium text-muted-foreground">{rotulo}</span>
      {children}
    </label>
  );
}

/** Seletor "em qual card": este, pai(s) ou filhos pela relação. Trocar o alvo limpa fase/campo. */
function SeletorAlvo({ ctx, p, rot, set }: { ctx: ContextoAutomacoes; p: PassoUI; rot: (x: string) => string; set: (p: PassoUI) => void }) {
  const t = p.target as { type?: string; relation?: string } | undefined;
  const valor = t?.type && t.type !== "self" ? `${t.type}:${t.relation}` : "self";
  return (
    <Linha rotulo="Em qual card">
      <NativeSelect
        aria-label={rot("Card alvo")}
        value={valor}
        onChange={(e) => {
          const [type, relation] = e.target.value.split(":");
          const resto: PassoUI = { ...p };
          delete resto.target;
          set({ ...resto, ...(type === "self" ? {} : { target: { type, relation } }), ...(p.type === "move_card" ? { phase: "" } : p.type === "set_field" ? { field: "" } : {}) } as PassoUI);
        }}
      >
        <option value="self">{ROTULO_ALVO.self}</option>
        {ctx.relacoes.map((r) => (
          <option key={`p${r.id}`} value={`parent:${r.id}`}>
            {ROTULO_ALVO.parent} via {r.rotulo}
          </option>
        ))}
        {ctx.relacoes.map((r) => (
          <option key={`c${r.id}`} value={`children:${r.id}`}>
            {ROTULO_ALVO.children} via {r.rotulo}
          </option>
        ))}
      </NativeSelect>
    </Linha>
  );
}

/** Fases e campos do board do card alvo (este board, ou o do outro lado da relação). */
function doAlvo(ctx: ContextoAutomacoes, p: PassoUI) {
  const t = p.target as { type?: string; relation?: string } | undefined;
  if (!t?.type || t.type === "self") return { fases: ctx.fases, campos: ctx.campos };
  const outro = ctx.boards.find((b) => b.id === ctx.relacoes.find((r) => r.id === t.relation)?.outro);
  return { fases: outro?.fases ?? [], campos: outro?.campos ?? [] };
}

function CamposPasso({ ctx, p, n, set }: { ctx: ContextoAutomacoes; p: PassoUI; n: number; set: (p: PassoUI) => void }) {
  const upd = (k: string, v: unknown) => set({ ...p, [k]: v });
  const rot = (x: string) => `${x} (passo ${n})`;
  const alvo = doAlvo(ctx, p);
  switch (p.type) {
    case "move_card":
      return (
        <div className="grid grid-cols-2 gap-2">
          <SeletorAlvo ctx={ctx} p={p} rot={rot} set={set} />
          <Linha rotulo="Para a fase">
            <NativeSelect aria-label={rot("Fase de destino")} value={s(p.phase)} onChange={(e) => upd("phase", e.target.value)}>
              <option value="">—</option>
              {alvo.fases.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </NativeSelect>
          </Linha>
        </div>
      );
    case "set_field": {
      const modo = p.expr !== undefined ? "expr" : p.value === null ? "limpar" : "valor";
      const campo = alvo.campos.find((c) => c.id === p.field);
      return (
        <div className="grid grid-cols-4 gap-2">
          <SeletorAlvo ctx={ctx} p={p} rot={rot} set={set} />
          <Linha rotulo="Campo">
            <NativeSelect aria-label={rot("Campo")} value={s(p.field)} onChange={(e) => upd("field", e.target.value)}>
              <option value="">—</option>
              {alvo.campos.filter(editavel).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Linha>
          <Linha rotulo="Como">
            <NativeSelect
              aria-label={rot("Como preencher")}
              value={modo}
              onChange={(e) => {
                const base: PassoUI = { type: "set_field", field: p.field, ...(p.target ? { target: p.target } : {}) };
                set({ ...base, ...(e.target.value === "expr" ? { expr: "" } : e.target.value === "limpar" ? { value: null } : { value: "" }) });
              }}
            >
              <option value="valor">com o valor</option>
              <option value="expr">com uma expressão</option>
              <option value="limpar">limpar (vazio)</option>
            </NativeSelect>
          </Linha>
          {modo === "valor" &&
            (campo?.type === "boolean" ? (
              <Linha rotulo="Valor">
                <NativeSelect aria-label={rot("Valor")} value={p.value === true ? "true" : "false"} onChange={(e) => upd("value", e.target.value === "true")}>
                  <option value="true">sim</option>
                  <option value="false">não</option>
                </NativeSelect>
              </Linha>
            ) : (
              <Linha rotulo="Valor">
                <Input aria-label={rot("Valor")} value={s(p.value)} onChange={(e) => upd("value", e.target.value)} type={campo?.type === "date" ? "date" : "text"} />
              </Linha>
            ))}
          {modo === "expr" && (
            <Linha rotulo="Expressão">
              <Input aria-label={rot("Expressão")} className="font-mono" value={s(p.expr)} onChange={(e) => upd("expr", e.target.value)} placeholder="card.valor * 2" />
            </Linha>
          )}
        </div>
      );
    }
    case "create_related_card": {
      const alvo = ctx.boards.find((b) => b.id === p.board);
      const mapa = (p.fields ?? {}) as Record<string, string>;
      const relacoes = ctx.relacoes.filter((r) => r.outro === p.board);
      return (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            <Linha rotulo="Board do novo card">
              <NativeSelect aria-label={rot("Board do novo card")} value={s(p.board)} onChange={(e) => set({ ...p, board: e.target.value, relation: "", phase: "", fields: {} })}>
                <option value="">—</option>
                {ctx.boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </Linha>
            <Linha rotulo="Ligar a este card pela relação">
              <NativeSelect aria-label={rot("Relação")} value={s(p.relation)} onChange={(e) => upd("relation", e.target.value)}>
                <option value="">não ligar</option>
                {relacoes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.rotulo}
                  </option>
                ))}
              </NativeSelect>
            </Linha>
            <Linha rotulo="Fase">
              <NativeSelect aria-label={rot("Fase do novo card")} value={s(p.phase)} onChange={(e) => upd("phase", e.target.value)}>
                <option value="">primeira fase</option>
                {alvo?.fases.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </NativeSelect>
            </Linha>
          </div>
          {alvo && (
            <fieldset className="rounded-md border p-2">
              <legend className="px-1 text-xs font-medium text-muted-foreground">Campos do novo card (expressões sobre este card; texto entre aspas)</legend>
              <div className="grid grid-cols-2 gap-2">
                {alvo.campos.filter(editavel).filter((c) => c.type !== "relation").map((c) => (
                  <Linha key={c.id} rotulo={c.name}>
                    <Input
                      aria-label={rot(`Novo card: ${c.name}`)}
                      className="font-mono"
                      value={mapa[c.id] ?? ""}
                      onChange={(e) => upd("fields", { ...mapa, [c.id]: e.target.value })}
                      placeholder={`card.${c.slug}`}
                    />
                  </Linha>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      );
    }
    case "send_email":
      return (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Linha rotulo="Para">
              <Input aria-label={rot("Para")} value={s(p.to)} onChange={(e) => upd("to", e.target.value)} placeholder="{{ card.email }}" />
            </Linha>
            <Linha rotulo="Assunto">
              <Input aria-label={rot("Assunto")} value={s(p.subject)} onChange={(e) => upd("subject", e.target.value)} />
            </Linha>
          </div>
          <Linha rotulo="Corpo">
            <Textarea aria-label={rot("Corpo do e-mail")} rows={4} value={s(p.body)} onChange={(e) => upd("body", e.target.value)} />
          </Linha>
          <p className="text-xs text-muted-foreground">{AJUDA_MODELO} Sem SMTP configurado no workspace, o e-mail fica registrado como não enviado.</p>
        </div>
      );
    case "http_request": {
      const headers = Object.entries((p.headers ?? {}) as Record<string, string>);
      const setHeaders = (h: [string, string][]) => upd("headers", Object.fromEntries(h));
      return (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[8rem_1fr] gap-2">
            <Linha rotulo="Método">
              <NativeSelect aria-label={rot("Método")} value={s(p.method) || "POST"} onChange={(e) => upd("method", e.target.value)}>
                {METODOS_HTTP.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </NativeSelect>
            </Linha>
            <Linha rotulo="URL">
              <Input aria-label={rot("URL")} value={s(p.url)} onChange={(e) => upd("url", e.target.value)} placeholder="https://erp.exemplo.com/api/contratos" />
            </Linha>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Headers</span>
            {headers.map(([k, v], i) => (
              <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                <Input aria-label={rot(`Header ${i + 1} nome`)} value={k} onChange={(e) => setHeaders(headers.map((h, j) => (j === i ? [e.target.value, h[1]] : h)))} placeholder="Authorization" />
                <Input aria-label={rot(`Header ${i + 1} valor`)} value={v} onChange={(e) => setHeaders(headers.map((h, j) => (j === i ? [h[0], e.target.value] : h)))} placeholder="Bearer {{ var.TOKEN }}" />
                <Button type="button" variant="ghost" size="icon" aria-label={rot(`Remover header ${i + 1}`)} onClick={() => setHeaders(headers.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setHeaders([...headers, ["", ""]])}>
              <Plus /> Header
            </Button>
          </div>
          {s(p.method) !== "GET" && (
            <Linha rotulo="Corpo">
              <Textarea aria-label={rot("Corpo da requisição")} rows={3} className="font-mono" value={s(p.body)} onChange={(e) => upd("body", e.target.value)} placeholder='{"numero": "{{ card.numero }}"}' />
            </Linha>
          )}
          <p className="text-xs text-muted-foreground">{AJUDA_MODELO} Segredos (como tokens) ficam em variáveis secretas e aparecem mascarados no log.</p>
        </div>
      );
    }
    case "add_comment":
      return (
        <div className="grid grid-cols-[14rem_1fr] gap-2">
          <SeletorAlvo ctx={ctx} p={p} rot={rot} set={set} />
          <Linha rotulo="Comentário">
            <Textarea aria-label={rot("Comentário")} rows={2} value={s(p.body)} onChange={(e) => upd("body", e.target.value)} placeholder="Card movido para {{ card.fase }}" />
          </Linha>
        </div>
      );
  }
}

