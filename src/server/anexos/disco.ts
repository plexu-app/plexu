// Armazenamento de anexos em disco local (Node puro, sem "server-only": usado também pelo seed).
// <ATTACHMENTS_DIR>/<2 primeiros caracteres da chave>/<chave>. A chave é aleatória.
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { LIMITE_PADRAO_MB } from "../../lib/anexos";

export interface Armazenamento {
  gravar(chave: string, dados: Uint8Array): Promise<void>;
  /** Conteúdo como stream web (para Response), ou null se a chave não existe. */
  ler(chave: string): Promise<ReadableStream<Uint8Array> | null>;
  remover(chave: string): Promise<void>;
}

/** storage_key aleatório (não deriva do nome do arquivo). */
export const novaChave = () => randomBytes(20).toString("hex");

const CHAVE = /^[a-f0-9]{32,64}$/;

export class ArmazenamentoDisco implements Armazenamento {
  constructor(private dir: string) {}

  private caminho(chave: string) {
    if (!CHAVE.test(chave)) throw new Error("storage_key inválido");
    return join(this.dir, chave.slice(0, 2), chave);
  }

  async gravar(chave: string, dados: Uint8Array) {
    await mkdir(join(this.dir, chave.slice(0, 2)), { recursive: true });
    await writeFile(this.caminho(chave), dados, { flag: "wx" });
  }

  async ler(chave: string) {
    const p = this.caminho(chave);
    try {
      await stat(p);
    } catch {
      return null;
    }
    return Readable.toWeb(createReadStream(p)) as ReadableStream<Uint8Array>;
  }

  async remover(chave: string) {
    await rm(this.caminho(chave), { force: true });
  }
}

/** Pasta dos anexos: ATTACHMENTS_DIR; padrão /data/attachments em produção, .data/attachments no dev. */
export function diretorioAnexos(): string {
  return process.env.ATTACHMENTS_DIR || (process.env.NODE_ENV === "production" ? "/data/attachments" : join(process.cwd(), ".data", "attachments"));
}

/** Limite por arquivo: ATTACHMENTS_MAX_MB (padrão 25 MB). */
export function limiteBytes(): number {
  const mb = Number(process.env.ATTACHMENTS_MAX_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : LIMITE_PADRAO_MB) * 1024 * 1024;
}
