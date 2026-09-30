// Worker de automações (pg-boss sobre o mesmo Postgres).
// - despacho: a cada segundo, eventos novos → automation_runs "queued" → job no pg-boss;
// - agendados: a cada 30 s, varredura de cron e campos de data;
// - reenvio: execuções que ficaram sem job (queda) voltam para a fila;
// - saúde: GET /health em WORKER_PORT (usado pelo e2e).
import { createServer } from "node:http";
import { PgBoss } from "pg-boss";
import { despacharEventos, pendentesParaReenviar, podarDespacho, varrerAgendadas } from "../automacoes/despacho";
import { executarRun } from "../automacoes/executor";

const FILA = "automacao.execucao";
const boss = new PgBoss(process.env.DATABASE_URL ?? "postgres://plexu:plexu@localhost:5433/plexu");
boss.on("error", (e: Error) => console.error("pg-boss:", e));
await boss.start();
await boss.createQueue(FILA, { policy: "exclusive" }).catch(() => {});

const enviar = (runId: string, startAfter?: number) => boss.send(FILA, { runId }, { singletonKey: runId, ...(startAfter ? { startAfter } : {}) });

await boss.work<{ runId: string }>(FILA, { localConcurrency: 4 }, async (jobs) => {
  for (const job of jobs) {
    const r = await executarRun(job.data.runId);
    if (r?.reenfileirarEm) await enviar(job.data.runId, r.reenfileirarEm);
  }
});

/** Laço que não para por erro nem se sobrepõe. */
function laco(nome: string, ms: number, fn: () => Promise<void>) {
  let rodando = false;
  setInterval(async () => {
    if (rodando) return;
    rodando = true;
    try {
      await fn();
    } catch (e) {
      console.error(`${nome}:`, e);
    } finally {
      rodando = false;
    }
  }, ms);
}

laco("despacho", 1000, async () => {
  for (const id of await despacharEventos()) await enviar(id);
});
laco("agendados", 30_000, async () => {
  for (const id of await varrerAgendadas()) await enviar(id);
});
laco("reenvio", 60_000, async () => {
  for (const id of await pendentesParaReenviar()) await enviar(id);
  await podarDespacho();
});

const porta = Number(process.env.WORKER_PORT ?? 3001);
createServer((req, res) => {
  res.writeHead(req.url === "/health" ? 200 : 404, { "content-type": "text/plain" });
  res.end(req.url === "/health" ? "ok" : "");
}).listen(porta);

for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.on(sinal, async () => {
    await boss.stop({ graceful: true, timeout: 10_000 }).catch(() => {});
    process.exit(0);
  });
}
console.log(`worker up (saúde em :${porta}/health)`);
