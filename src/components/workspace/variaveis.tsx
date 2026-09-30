"use client";
// Variáveis ({{ var.NOME }} nas automações) e SMTP do workspace. Segredos nunca voltam para a tela.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { removerVariavelAction, salvarSmtpAction, salvarVariavelAction } from "@/app/w/[ws]/settings/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";

type Resultado = { ok: true } | { ok: false; motivo: string };

function useSalvar() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const salvar = (fn: () => Promise<Resultado>, sucesso: string, depois?: () => void) =>
    iniciar(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(sucesso);
        depois?.();
        router.refresh();
      } else toast.error("Não foi possível salvar", { description: r.motivo });
    });
  return { pendente, salvar };
}

export function Variaveis({ ws, variaveis }: { ws: string; variaveis: { key: string; value: string; secreta: boolean }[] }) {
  const { pendente, salvar } = useSalvar();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [secreta, setSecreta] = useState(false);
  return (
    <section aria-labelledby="variaveis" className="rounded-lg border">
      <h2 id="variaveis" className="border-b px-4 py-2 text-sm font-semibold">
        Variáveis das automações
      </h2>
      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="text-sm text-muted-foreground">Use nos passos como {"{{ var.NOME }}"}. Secretas (tokens, senhas) ficam cifradas, não são exibidas e aparecem mascaradas no log.</p>
        {variaveis.length > 0 && (
          <ul className="flex flex-col divide-y rounded-md border">
            {variaveis.map((v) => (
              <li key={v.key} className="flex items-center gap-3 px-3 py-1.5 text-sm" data-variavel={v.key}>
                <span className="font-mono">{v.key}</span>
                {v.secreta ? (
                  <Badge variant="outline">
                    <KeyRound className="size-3" /> secreta
                  </Badge>
                ) : (
                  <span className="truncate text-muted-foreground">{v.value}</span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  aria-label={`Remover ${v.key}`}
                  disabled={pendente}
                  onClick={() => confirm(`Remover a variável ${v.key}?`) && salvar(() => removerVariavelAction(ws, v.key), "Variável removida")}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid grid-cols-[1fr_2fr_auto_auto] items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            salvar(() => salvarVariavelAction(ws, key, value, secreta), "Variável salva", () => {
              setKey("");
              setValue("");
              setSecreta(false);
            });
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="var-nome">Nome</Label>
            <Input id="var-nome" className="font-mono" value={key} onChange={(e) => setKey(e.target.value)} placeholder="TOKEN_ERP" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="var-valor">Valor</Label>
            <Input id="var-valor" type={secreta ? "password" : "text"} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
          </div>
          <label className="flex h-9 items-center gap-1.5 text-sm">
            <input type="checkbox" className="size-4" checked={secreta} onChange={(e) => setSecreta(e.target.checked)} /> secreta
          </label>
          <Button type="submit" disabled={pendente || !key.trim()}>
            Salvar variável
          </Button>
        </form>
      </div>
    </section>
  );
}

export function ConfigSmtp({ ws, atual }: { ws: string; atual: { host: string; port: number; secure: boolean; user: string; from: string; temSenha: boolean } | null }) {
  const { pendente, salvar } = useSalvar();
  const [d, setD] = useState({ host: atual?.host ?? "", port: atual?.port ?? 587, secure: atual?.secure ?? false, user: atual?.user ?? "", from: atual?.from ?? "", senha: "" });
  const upd = (k: keyof typeof d, v: unknown) => setD({ ...d, [k]: v });
  return (
    <section aria-labelledby="smtp" className="rounded-lg border">
      <h2 id="smtp" className="border-b px-4 py-2 text-sm font-semibold">
        E-mail (SMTP)
      </h2>
      <form
        className="grid grid-cols-2 gap-3 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          salvar(() => salvarSmtpAction(ws, { ...d, port: Number(d.port) }), "SMTP salvo", () => upd("senha", ""));
        }}
      >
        <p className="col-span-2 text-sm text-muted-foreground">Usado pelo passo “Enviar e-mail”. Sem SMTP, os e-mails das automações ficam registrados como não enviados.</p>
        <div className="flex flex-col gap-1">
          <Label htmlFor="smtp-host">Servidor</Label>
          <Input id="smtp-host" value={d.host} onChange={(e) => upd("host", e.target.value)} placeholder="smtp.exemplo.com" />
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="smtp-porta">Porta</Label>
            <Input id="smtp-porta" type="number" value={d.port} onChange={(e) => upd("port", e.target.value)} />
          </div>
          <label className="flex h-9 items-center gap-1.5 text-sm">
            <input type="checkbox" className="size-4" checked={d.secure} onChange={(e) => upd("secure", e.target.checked)} /> TLS direto (465)
          </label>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="smtp-usuario">Usuário</Label>
          <Input id="smtp-usuario" value={d.user} onChange={(e) => upd("user", e.target.value)} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="smtp-senha">Senha</Label>
          <Input id="smtp-senha" type="password" value={d.senha} onChange={(e) => upd("senha", e.target.value)} placeholder={atual?.temSenha ? "•••••• (mantida)" : ""} autoComplete="new-password" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="smtp-de">Remetente</Label>
          <Input id="smtp-de" value={d.from} onChange={(e) => upd("from", e.target.value)} placeholder="Plexu <plexu@exemplo.com>" />
        </div>
        <div className="flex items-end justify-end">
          <Button type="submit" disabled={pendente}>
            Salvar SMTP
          </Button>
        </div>
      </form>
    </section>
  );
}
