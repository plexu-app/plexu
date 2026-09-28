"use client";
// Campo de anexo: arrastar ou selecionar arquivos (vários), progresso por arquivo, lista com nome,
// tamanho, download e remover. O upload vai para /api/anexos antes de salvar/criar o card; os ids
// ficam em inputs ocultos f:<field_id> (um marcador vazio permite remover todos) e o core liga os
// anexos ao card na escrita.
import { useRef, useState } from "react";
import { Download, Paperclip, Upload, X } from "lucide-react";
import { aceita, formatarTamanho, normalizarAccept } from "@/lib/anexos";
import { nomeInput } from "@/lib/form-campos";
import { cn } from "@/lib/utils";

export interface AnexoMeta {
  id: string;
  filename: string;
  size: number;
  mime: string | null;
}

interface Envio {
  chave: string;
  nome: string;
  progresso: number;
}

function enviar(ws: string, board: string, fieldId: string, arquivo: File, aoProgresso: (p: number) => void): Promise<AnexoMeta> {
  return new Promise((ok, falha) => {
    const fd = new FormData();
    fd.append("ws", ws);
    fd.append("board", board);
    fd.append("fieldId", fieldId);
    fd.append("arquivo", arquivo);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/anexos");
    xhr.upload.onprogress = (e) => e.lengthComputable && aoProgresso(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let corpo: { anexos?: AnexoMeta[]; erro?: string } = {};
      try {
        corpo = JSON.parse(xhr.responseText);
      } catch {
        // resposta não-JSON
      }
      if (xhr.status >= 200 && xhr.status < 300 && corpo.anexos?.[0]) ok(corpo.anexos[0]);
      else falha(new Error(corpo.erro ?? `falha no envio (${xhr.status})`));
    };
    xhr.onerror = () => falha(new Error("falha de rede no envio"));
    xhr.send(fd);
  });
}

export function CampoAnexos({
  ws,
  board,
  campo,
  valor,
  meta,
  id,
  form,
  obrigatorio,
  aoMudar,
}: {
  ws: string;
  board: string;
  campo: { id: string; name: string; config: Record<string, unknown> };
  valor: unknown;
  meta: Record<string, AnexoMeta>;
  id?: string;
  form?: string;
  obrigatorio?: boolean;
  aoMudar?: () => void;
}) {
  const inicial = (Array.isArray(valor) ? (valor as string[]) : []).map((i) => meta[i] ?? { id: i, filename: "arquivo", size: 0, mime: null });
  const [itens, setItens] = useState<AnexoMeta[]>(inicial);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const accept = normalizarAccept(campo.config.accept);
  const avisar = () => aoMudar && requestAnimationFrame(aoMudar);

  async function receber(arquivos: File[]) {
    setErro(null);
    const recusados = arquivos.filter((a) => !aceita(a.name, a.type, accept));
    if (recusados.length) setErro(`Tipo não aceito: ${recusados.map((a) => a.name).join(", ")} (aceitos: ${accept.replace(/,/g, ", ")})`);
    for (const a of arquivos.filter((x) => !recusados.includes(x))) {
      const chave = `${a.name}-${a.size}-${Math.random()}`;
      setEnvios((e) => [...e, { chave, nome: a.name, progresso: 0 }]);
      try {
        const novo = await enviar(ws, board, campo.id, a, (p) => setEnvios((e) => e.map((x) => (x.chave === chave ? { ...x, progresso: p } : x))));
        setItens((i) => [...i, novo]);
        avisar();
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setEnvios((e) => e.filter((x) => x.chave !== chave));
      }
    }
  }

  return (
    <div className="flex flex-col gap-2" data-campo-anexos={campo.name}>
      <input type="hidden" name={nomeInput(campo.id)} value="" form={form} />
      {itens.map((i) => (
        <input key={i.id} type="hidden" name={nomeInput(campo.id)} value={i.id} form={form} />
      ))}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground",
          arrastando && "border-primary bg-primary/5",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          void receber([...e.dataTransfer.files]);
        }}
        data-zona-anexos
      >
        <Upload className="size-4" aria-hidden />
        <span>Arraste arquivos aqui ou</span>
        <button type="button" className="font-medium text-primary-strong underline-offset-2 hover:underline" onClick={() => input.current?.click()}>
          selecione
        </button>
        <input
          ref={input}
          id={id}
          type="file"
          multiple
          className="sr-only"
          accept={accept || undefined}
          aria-label={`Anexar em ${campo.name}`}
          aria-required={obrigatorio || undefined}
          onChange={(e) => {
            void receber([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        {accept && <span className="text-xs">({accept.replace(/,/g, ", ")})</span>}
      </div>
      {envios.map((e) => (
        <div key={e.chave} className="flex items-center gap-2 text-xs" data-enviando={e.nome}>
          <span className="min-w-0 flex-1 truncate">{e.nome}</span>
          <progress className="h-1.5 w-32" max={100} value={e.progresso} aria-label={`Enviando ${e.nome}`} />
          <span className="w-9 text-right tabular-nums">{e.progresso}%</span>
        </div>
      ))}
      {itens.length > 0 && (
        <ul className="flex flex-col gap-1">
          {itens.map((i) => (
            <li key={i.id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm" data-anexo={i.filename}>
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <a href={`/api/anexos/${i.id}`} className="min-w-0 flex-1 truncate text-primary-strong hover:underline" download>
                {i.filename}
              </a>
              <span className="text-xs text-muted-foreground tabular-nums">{i.size ? formatarTamanho(i.size) : ""}</span>
              <a href={`/api/anexos/${i.id}`} download className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label={`Baixar ${i.filename}`}>
                <Download className="size-3.5" />
              </a>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                aria-label={`Remover ${i.filename}`}
                onClick={() => {
                  setItens((x) => x.filter((y) => y.id !== i.id));
                  avisar();
                }}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {erro && (
        <p className="text-xs text-destructive-strong" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
