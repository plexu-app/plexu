// Worker de automações (pg-boss sobre o mesmo Postgres). MVP: esqueleto.
import { PgBoss } from "pg-boss";

const boss = new PgBoss(process.env.DATABASE_URL ?? "postgres://plexu:plexu@localhost:5432/plexu");
boss.on("error", (e: Error) => console.error(e));
await boss.start();
await boss.createQueue("automation.run");
await boss.work<{ automationId: string; eventId: string }>("automation.run", async (jobs) => {
  for (const job of jobs) console.log("automation.run", job.id, job.data);
});
console.log("worker up");
