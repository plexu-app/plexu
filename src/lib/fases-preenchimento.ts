// Fases de preenchimento de um campo (decisão 18-revisada):
//   fields.config.fill_phases: uuid[]  fases onde o campo é preenchido;
//   fields.config.editable_everywhere: bool (padrão false).
// Padrão por fase, com F = fases listadas que são fases ativas do board:
//   antes da primeira de F: oculto (nem editável nem obrigatório);
//   numa fase de F: editável (visível/obrigatório seguem as expressões);
//   nas outras (depois da primeira): somente leitura, ou editável se editable_everywhere.
// field_phase_settings continua como override fino, atributo por atributo. Campo sem fases (ou só
// com fases que não existem mais) mantém o comportamento de sempre. Campos calculados: a primeira
// fase é onde passam a ser exibidos. Pura: usada pelo core e pelos formulários.

export interface AjusteFase {
  visible: boolean | null;
  editable: boolean | null;
  required: boolean | null;
}

export interface FaseOrdenada {
  id: string;
  position: number;
}

/** fill_phases como veio na config (ids), sem validar contra as fases do board. */
export function fasesDoCampo(config: Record<string, unknown> | null | undefined): string[] {
  const v = config?.fill_phases;
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x !== ""))] : [];
}

export const editavelSempre = (config: Record<string, unknown> | null | undefined) => config?.editable_everywhere === true;

/** Fases de preenchimento que existem no board, em ordem de posição. */
export function fasesValidas<F extends FaseOrdenada>(config: Record<string, unknown> | null | undefined, fases: readonly F[]): F[] {
  const ids = new Set(fasesDoCampo(config));
  return fases.filter((f) => ids.has(f.id)).sort((a, b) => a.position - b.position);
}

/** Primeira fase de preenchimento válida (agrupamento na configuração), ou null. */
export function primeiraFase<F extends FaseOrdenada>(config: Record<string, unknown> | null | undefined, fases: readonly F[]): F | null {
  return fasesValidas(config, fases)[0] ?? null;
}

/** Padrão implícito pelas fases de preenchimento, ou undefined quando não se aplica. */
export function padraoDasFases(config: Record<string, unknown> | null | undefined, fases: readonly FaseOrdenada[], faseId: string | null): AjusteFase | undefined {
  if (!faseId) return undefined;
  const validas = fasesValidas(config, fases);
  const atual = fases.find((f) => f.id === faseId);
  if (!validas.length || !atual) return undefined;
  if (atual.position < validas[0].position) return { visible: false, editable: false, required: false };
  if (validas.some((f) => f.id === faseId) || editavelSempre(config)) return undefined;
  return { visible: null, editable: false, required: null };
}

/** Override explícito (field_phase_settings) por cima do padrão, atributo por atributo. */
export function combinarAjuste(explicito: AjusteFase | null | undefined, padrao: AjusteFase | undefined): AjusteFase | undefined {
  if (!padrao) return explicito ?? undefined;
  if (!explicito) return padrao;
  return {
    visible: explicito.visible ?? padrao.visible,
    editable: explicito.editable ?? padrao.editable,
    required: explicito.required ?? padrao.required,
  };
}

export function ajusteEfetivo(
  config: Record<string, unknown> | null | undefined,
  fases: readonly FaseOrdenada[],
  faseId: string | null,
  explicito: AjusteFase | null | undefined,
): AjusteFase | undefined {
  return combinarAjuste(explicito, padraoDasFases(config, fases, faseId));
}

/**
 * Nomes das fases em que o campo é obrigatório mas fica oculto — configuração contraditória
 * (ex.: exceção required=true numa fase antes de fill_phases, ou visible "false" com required).
 * Não bloqueia nada: o core nunca exige campo oculto. Serve ao aviso em Settings → Campos.
 */
export function obrigatorioOculto(
  fases: readonly { id: string; name: string }[],
  ajustes: readonly (AjusteFase & { fieldId: string; phaseId: string })[],
  campo: { id: string; config: Record<string, unknown>; requiredExpr: string | null; visibleExpr: string | null },
): string[] {
  if (campo.visibleExpr?.trim() === "false" && campo.requiredExpr?.trim() && campo.requiredExpr.trim() !== "false") return ["todas as fases"];
  const ordenadas = fases.map((f, i) => ({ id: f.id, position: i }));
  return fases
    .filter((f) => {
      const aj = ajusteEfetivo(campo.config, ordenadas, f.id, ajustes.find((a) => a.fieldId === campo.id && a.phaseId === f.id));
      return aj?.required === true && aj.visible === false;
    })
    .map((f) => f.name);
}
