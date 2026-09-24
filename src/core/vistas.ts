// Leituras que dependem da maquinaria de regras (não escrevem).
import { executar } from "./cards";
import {
  ajuste,
  carregarQuadro,
  lerCard,
  lerLigacoes,
  TIPOS_SOMENTE_LEITURA,
  vistaDe,
} from "./meta";
import { avaliarMovimento, compilar, montarContexto, travaCampo } from "./rules";
import type { ExprCompilada } from "../lib/expr";
import type { Actor, OpcoesOp } from "./types";

export interface EstadoCampo {
  visivel: boolean;
  editavel: boolean;
  obrigatorio: boolean;
  /** sequence, rollup, dynamic_text (e demais tipos calculados). */
  calculado: boolean;
  /** Travado por lock_fields_while_linked. */
  travado: boolean;
  /** Erro ao avaliar visible_expr/required_expr (campo fica visível e não obrigatório). */
  erro?: string;
}

/**
 * Estado de cada campo do card na fase atual: field_phase_settings vence; sem ajuste,
 * visible_expr/required_expr. Regras can_edit não entram aqui: são avaliadas ao salvar.
 */
export function estadoDosCampos(input: { cardId: string; actor: Actor }, opts?: OpcoesOp) {
  return executar(input.actor, opts, async (op): Promise<Record<string, EstadoCampo>> => {
    const card = await lerCard(op, input.cardId);
    const q = await carregarQuadro(op, card.boardId);
    const ligs = await lerLigacoes(op, [card.id]);

    const compiladas = new Map<string, ExprCompilada | Error>();
    for (const c of q.campos) {
      for (const fonte of [c.visibleExpr, c.requiredExpr]) {
        if (!fonte || compiladas.has(fonte)) continue;
        try {
          compiladas.set(fonte, compilar(fonte));
        } catch (e) {
          compiladas.set(fonte, e as Error);
        }
      }
    }
    const validas = [...compiladas.values()].filter((e): e is ExprCompilada => !(e instanceof Error));
    const ctx = await montarContexto(op, { quadro: q, card: vistaDe(card), ligacoes: ligs }, validas);

    const saida: Record<string, EstadoCampo> = {};
    for (const c of q.campos) {
      let erro: string | undefined;
      const avaliar = (fonte: string | null, padrao: boolean) => {
        if (!fonte) return padrao;
        const e = compiladas.get(fonte)!;
        try {
          if (e instanceof Error) throw e;
          return e.evaluateBool(ctx);
        } catch (x) {
          erro = (x as Error).message;
          return padrao;
        }
      };
      const aj = ajuste(q, c.id, card.phaseId);
      const calculado = TIPOS_SOMENTE_LEITURA.has(c.type);
      const travado = ligs.some((l) => travaCampo(l, c, card.id));
      // Invariante: campo oculto nunca é exigido (mesma regra de verificarObrigatorios).
      const visivel = aj?.visible ?? avaliar(c.visibleExpr, true);
      saida[c.id] = {
        visivel,
        obrigatorio: visivel && !calculado && (aj?.required ?? avaliar(c.requiredExpr, false)),
        editavel: !calculado && aj?.editable !== false && !travado,
        calculado,
        travado,
        ...(erro ? { erro } : {}),
      };
    }
    return saida;
  });
}

export interface MovimentoPossivel {
  faseId: string;
  permitido: boolean;
  /** Motivo do bloqueio (regra, obrigatório faltando) ou avisos quando permitido. */
  motivo?: string;
}

/** Para cada outra fase do board: o card pode ir para lá agora? Mesma avaliação de moveCard, sem mover. */
export function movimentosDoCard(input: { cardId: string; actor: Actor }, opts?: OpcoesOp) {
  return executar(input.actor, opts, async (op): Promise<MovimentoPossivel[]> => {
    const card = await lerCard(op, input.cardId);
    const q = await carregarQuadro(op, card.boardId);
    const alvo = { quadro: q, card: vistaDe(card), ligacoes: await lerLigacoes(op, [card.id]) };
    const origem = card.phaseId ? q.fasePorId.get(card.phaseId) ?? null : null;
    const saida: MovimentoPossivel[] = [];
    for (const destino of q.fases) {
      if (destino.id === card.phaseId) continue;
      const r = await avaliarMovimento(op, alvo, origem, destino);
      saida.push(r.ok ? { faseId: destino.id, permitido: true, ...(r.avisos?.length ? { motivo: r.avisos.join(" ") } : {}) } : { faseId: destino.id, permitido: false, motivo: r.motivo });
    }
    return saida;
  });
}
