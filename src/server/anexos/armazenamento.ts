import "server-only";
// Armazenamento usado pelo app. Hoje: disco local (disco.ts). Para trocar por S3, implementar a
// interface Armazenamento e devolvê-la em armazenamentoPadrao().
import { ArmazenamentoDisco, diretorioAnexos, type Armazenamento } from "./disco";

export { ArmazenamentoDisco, diretorioAnexos, limiteBytes, novaChave, type Armazenamento } from "./disco";

let padrao: Armazenamento | null = null;
export function armazenamentoPadrao(): Armazenamento {
  padrao ??= new ArmazenamentoDisco(diretorioAnexos());
  return padrao;
}
