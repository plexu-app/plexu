// Tipos do export de estrutura do Pipefy (scripts/pipefy-export.ts). Só o que o conversor lê.

export interface PfRepoRef {
  __typename?: string;
  id: string;
  name?: string;
}

export interface PfCampo {
  id: string;
  internal_id?: string | null;
  label: string;
  type: string;
  required?: boolean | null;
  editable?: boolean | null;
  unique?: boolean | null;
  description?: string | null;
  help?: string | null;
  options?: string[] | null;
  connectedRepo?: PfRepoRef | null;
  canConnectMultiples?: boolean | null;
  childMustExistToFinishParent?: boolean | null;
  allChildrenMustBeDoneToFinishParent?: boolean | null;
  allChildrenMustBeDoneToMoveParent?: boolean | null;
}

export interface PfExpressao {
  structure_id: string;
  field_address: string;
  operation: string;
  value: string | null;
}

export interface PfCondicao {
  expressions?: PfExpressao[] | null;
  expressions_structure?: string[][] | null;
}

export interface PfCondicional {
  id: string;
  name?: string | null;
  condition?: PfCondicao | null;
  actions?: { actionId: string; whenEvaluator: boolean; phaseField?: { id: string } | null }[] | null;
}

export interface PfFase {
  id: string;
  name: string;
  done?: boolean | null;
  index?: number | null;
  fields?: PfCampo[] | null;
  fieldConditions?: PfCondicional[] | null;
  cards_can_be_moved_to_phases?: { id: string }[] | null;
}

export interface PfAutomacao {
  id: string;
  name: string;
  active?: boolean | null;
  event_id: string;
  /** Pipe dono do gatilho. A API lista a automação também no pipe onde ela age. */
  event_repo?: PfRepoRef | null;
  action_id: string;
  event_params?: {
    to_phase_id?: string | null;
    inPhaseId?: string | null;
    fromPhaseId?: string | null;
    triggerFields?: { id: string; label?: string }[] | null;
  } | null;
  condition?: PfCondicao | null;
  action_repo_v2?: PfRepoRef | null;
  action_params?: {
    to_phase_id?: string | null;
    field_map?: { fieldId: string; inputMode?: string | null; value?: string | null }[] | null;
  } | null;
}

export interface PfRepo {
  id: string;
  name: string;
  title_field?: { id: string } | null;
  start_form_fields?: PfCampo[] | null;
  startFormFieldConditions?: PfCondicional[] | null;
  phases?: PfFase[] | null;
  table_fields?: PfCampo[] | null;
  labels?: { id: string; name: string }[] | null;
}

export interface PfExport {
  fonte: "pipefy";
  id: string;
  tipo: "pipe" | "table";
  repo: PfRepo;
  automacoes: PfAutomacao[];
  nao_exportavel?: string[];
}
