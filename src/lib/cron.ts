// Cron simples (5 campos: minuto hora dia-do-mês mês dia-da-semana) avaliado no fuso do workspace.
// Aceita *, n, a-b, */n, a-b/n e listas com vírgula. Dia da semana 0-6 (0 ou 7 = domingo).
// Com dia-do-mês e dia-da-semana restritos, vale qualquer um dos dois (semântica do cron clássico).

export interface Cron {
  minutos: Set<number>;
  horas: Set<number>;
  dias: Set<number>;
  meses: Set<number>;
  semana: Set<number>;
  diaLivre: boolean;
  semanaLivre: boolean;
}

const LIMITES: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];
const NOMES = ["minuto", "hora", "dia do mês", "mês", "dia da semana"];

function campo(texto: string, i: number): Set<number> {
  const [min, max] = LIMITES[i];
  const saida = new Set<number>();
  for (const parte of texto.split(",")) {
    const m = parte.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) throw new Error(`cron: ${NOMES[i]} inválido: "${parte}"`);
    const passo = m[2] ? Number(m[2]) : 1;
    const [a, fim] = m[1] === "*" ? [min, max] : m[1].split("-").map(Number);
    const b = fim ?? (m[2] ? max : a);
    if (a < min || b > max || a > b || passo < 1) throw new Error(`cron: ${NOMES[i]} fora do intervalo ${min}-${max}: "${parte}"`);
    for (let v = a; v <= b; v += passo) saida.add(i === 4 && v === 7 ? 0 : v);
  }
  return saida;
}

export function parseCron(expr: string): Cron {
  const partes = String(expr ?? "").trim().split(/\s+/);
  if (partes.length !== 5) throw new Error("cron: use 5 campos (minuto hora dia mês dia-da-semana), ex.: 0 8 * * 1-5");
  const [minutos, horas, dias, meses, semana] = partes.map(campo);
  return { minutos, horas, dias, meses, semana, diaLivre: partes[2] === "*", semanaLivre: partes[4] === "*" };
}

const SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Partes da data/hora no fuso. */
export function partesNoFuso(d: Date, timezone: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), hora: Number(p.hour), minuto: Number(p.minute), semana: SEMANA[p.weekday] };
}

export function casa(c: Cron, d: Date, timezone: string): boolean {
  const p = partesNoFuso(d, timezone);
  if (!c.minutos.has(p.minuto) || !c.horas.has(p.hora) || !c.meses.has(p.mes)) return false;
  const dia = c.dias.has(p.dia);
  const sem = c.semana.has(p.semana);
  if (c.diaLivre && c.semanaLivre) return true;
  if (c.diaLivre) return sem;
  if (c.semanaLivre) return dia;
  return dia || sem;
}

/** Instantes (início de minuto) em (desde, ate] que casam com a expressão; no máximo 1 dia de busca. */
export function slotsEntre(expr: string | Cron, timezone: string, desde: Date, ate: Date): Date[] {
  const c = typeof expr === "string" ? parseCron(expr) : expr;
  const MIN = 60_000;
  const inicio = Math.max(Math.floor(desde.getTime() / MIN) + 1, Math.floor(ate.getTime() / MIN) - 24 * 60);
  const fim = Math.floor(ate.getTime() / MIN);
  const saida: Date[] = [];
  for (let m = inicio; m <= fim; m++) {
    const d = new Date(m * MIN);
    if (casa(c, d, timezone)) saida.push(d);
  }
  return saida;
}
