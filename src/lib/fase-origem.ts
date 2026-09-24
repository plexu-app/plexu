// Fase de origem de um campo (fields.config.origin_phase_id): padrão de comportamento por fase.
//   antes da origem: oculto (e portanto nem editável nem obrigatório);
//   na origem: editável (visível/obrigatório seguem as expressões);
//   depois da origem: somente leitura.
// field_phase_settings continua como override, atributo por atributo. Campo sem origem (ou com origem
// que não é fase ativa do board) mantém o comportamento de sempre. Para campos calculados a origem é
// a fase em que passam a ser exibidos. Pura: usada pelo core e pelos formulários.

export interface AjusteFase {
  visible: boolean | null;
  editable: boolean | null;
  required: boolean | null;
}

export interface FaseOrdenada {
  id: string;
  position: number;
}

export function origemDoCampo(config: Record<string, unknown> | null | undefined): string | null {
  const v = config?.origin_phase_id;
  return typeof v === "string" && v ? v : null;
}

/** Padrão implícito pela fase de origem, ou undefined quando não se aplica. */
export function padraoDaOrigem(origemId: string | null, fases: readonly FaseOrdenada[], faseId: string | null): AjusteFase | undefined {
  if (!origemId || !faseId) return undefined;
  const origem = fases.find((f) => f.id === origemId);
  const atual = fases.find((f) => f.id === faseId);
  if (!origem || !atual) return undefined;
  if (atual.position < origem.position) return { visible: false, editable: false, required: false };
  if (atual.position > origem.position) return { visible: null, editable: false, required: null };
  return undefined;
}

/** Override explícito (field_phase_settings) por cima do padrão da origem, atributo por atributo. */
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
  return combinarAjuste(explicito, padraoDaOrigem(origemDoCampo(config), fases, faseId));
}
