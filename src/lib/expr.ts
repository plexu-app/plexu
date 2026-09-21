// Motor de expressões (regras, condições, visibilidade, fórmulas).
// Contrato: ver docs/PRODUTO.md decisão 15. Implementação CEL entra na próxima iteração.
export type ExprContext = {
  card: Record<string, unknown>;
  pai?: Record<string, unknown>;
  fase?: string;
  fase_origem?: string;
  fase_destino?: string;
  usuario?: { id: string; email: string };
};

export function evaluate(expr: string, ctx: ExprContext): boolean {
  void ctx;
  throw new Error(`expr engine not implemented: ${expr}`);
}
