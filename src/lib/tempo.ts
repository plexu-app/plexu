// Durações curtas para o cartão e a lista ("214d", "19h", "5m"). Puro.

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** Duração em ms → maior unidade inteira: dias, horas ou minutos (abaixo de 1 minuto, "0m"). */
export function duracaoCurta(ms: number): string {
  const x = Math.max(0, ms);
  if (x >= DIA) return `${Math.floor(x / DIA)}d`;
  if (x >= HORA) return `${Math.floor(x / HORA)}h`;
  return `${Math.floor(x / MINUTO)}m`;
}

/** SLA da fase (phases.sla: {duration, unit}) em ms; null sem SLA válido. */
export function slaEmMs(sla: unknown): number | null {
  if (!sla || typeof sla !== "object") return null;
  const { duration, unit } = sla as { duration?: unknown; unit?: unknown };
  const n = typeof duration === "number" ? duration : Number(duration);
  if (!Number.isFinite(n) || n <= 0) return null;
  const por: Record<string, number> = { minutes: MINUTO, hours: HORA, days: DIA };
  return por[String(unit ?? "days")] ? n * por[String(unit ?? "days")] : null;
}
