// Setup global do vitest: cria o banco plexu_test se não existir e aplica as migrações antes da suíte.
import { garantirBanco, migrar } from "../db/migrar";
import { urlDeTeste } from "./banco";

export default async function setup() {
  const url = urlDeTeste();
  if (await garantirBanco(url)) console.log(`[vitest] banco de teste criado: ${new URL(url).pathname.slice(1)}`);
  await migrar(url);
}
