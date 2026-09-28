"use client";
import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { arquivarWorkspaceAction, excluirWorkspaceAction, restaurarWorkspaceAction } from "@/app/w/[ws]/settings/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";

function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {texto}
    </p>
  );
}

/** Botão de restaurar um workspace arquivado (owner). */
export function RestaurarWorkspace({ ws, nome }: { ws: string; nome: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <span className="flex items-center gap-2">
      <Erro texto={erro} />
      <Button
        variant="outline"
        size="sm"
        disabled={pendente}
        aria-label={`Restaurar ${nome}`}
        onClick={() =>
          iniciar(async () => {
            const r = await restaurarWorkspaceAction(ws);
            if (r && !r.ok) setErro(r.motivo);
          })
        }
      >
        <ArchiveRestore /> Restaurar
      </Button>
    </span>
  );
}

/** Zona de perigo das configurações do workspace: arquivar/restaurar e excluir (digitando o nome). */
export function ZonaDePerigo({ ws, nome, arquivado }: { ws: string; nome: string; arquivado: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <section aria-labelledby="zona-de-perigo" className="rounded-lg border border-destructive/40">
      <h2 id="zona-de-perigo" className="border-b border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive">
        Zona de perigo
      </h2>
      <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="text-sm">
          <p className="font-medium">{arquivado ? "Restaurar workspace" : "Arquivar workspace"}</p>
          <p className="text-muted-foreground">
            {arquivado
              ? "Volta para a barra lateral e para as listas, como estava."
              : "Some da barra lateral e das listas para todos. Nada é apagado; o owner pode restaurar em Workspaces arquivados."}
          </p>
        </div>
        {arquivado ? (
          <RestaurarWorkspace ws={ws} nome={nome} />
        ) : (
          <Button
            variant="outline"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await arquivarWorkspaceAction(ws);
                if (r && !r.ok) setErro(r.motivo);
              })
            }
          >
            <Archive /> Arquivar
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="text-sm">
          <p className="font-medium">Excluir workspace</p>
          <p className="text-muted-foreground">Apaga boards, cards, ligações, anexos, comentários, automações e views. Não dá para desfazer.</p>
        </div>
        <Excluir ws={ws} nome={nome} />
      </div>
      {erro && (
        <div className="px-4 pb-3">
          <Erro texto={erro} />
        </div>
      )}
    </section>
  );
}

function Excluir({ ws, nome }: { ws: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const confere = digitado.trim() === nome.trim();
  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        setDigitado("");
        setErro(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 /> Excluir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!confere) return;
            iniciar(async () => {
              const r = await excluirWorkspaceAction(ws, digitado);
              if (r && !r.ok) setErro(r.motivo);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Excluir “{nome}”?</DialogTitle>
            <DialogDescription>
              Boards, cards, ligações, anexos (inclusive os arquivos), comentários, automações e views serão apagados. O histórico de eventos fica guardado para
              auditoria. Não dá para desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-2">
            <Label htmlFor="confirmar-exclusao">
              Digite <strong className="select-all">{nome}</strong> para confirmar
            </Label>
            <Input id="confirmar-exclusao" value={digitado} onChange={(e) => setDigitado(e.target.value)} autoComplete="off" autoFocus />
            <Erro texto={erro} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={!confere || pendente}>
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
