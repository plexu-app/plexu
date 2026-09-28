import "server-only";
// Ciclo de vida do workspace pela UI: o core arquiva/restaura/exclui (transação); aqui, depois do
// commit, os arquivos dos anexos excluídos saem do armazenamento.
import { excluirWorkspace, type Actor, type ResultadoExclusao } from "@/core";
import { armazenamentoPadrao, type Armazenamento } from "./anexos/armazenamento";

export async function excluirWorkspaceComArquivos(
  input: { workspaceId: string; actor: Actor; confirmacao: string },
  arm: Armazenamento = armazenamentoPadrao(),
): Promise<ResultadoExclusao & { arquivosNaoRemovidos: number }> {
  const r = await excluirWorkspace(input);
  // Fora da transação: um arquivo que falhe não desfaz a exclusão; fica registrado no log.
  let falhas = 0;
  for (const chave of r.chavesAnexos) {
    try {
      await arm.remover(chave);
    } catch (e) {
      falhas++;
      console.error(`anexo ${chave}: não foi possível remover do armazenamento`, e);
    }
  }
  return { ...r, arquivosNaoRemovidos: falhas };
}
