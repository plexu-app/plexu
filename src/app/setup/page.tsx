import { redirect } from "next/navigation";
import { FormAuth } from "@/components/form-auth";
import { Logo } from "@/components/marca";
import { AlternarTema } from "@/components/tema";
import { Card, CardContent } from "@/components/ui/misc";
import { criarPrimeiroAcesso } from "@/app/auth-actions";
import { haUsuarios } from "@/server/consultas";

export const dynamic = "force-dynamic";

export default async function Setup() {
  if (await haUsuarios()) redirect("/login");
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-bg p-6">
      <AlternarTema className="absolute right-4 top-4" />
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-3">
            <Logo altura={40} />
            <div>
              <h1 className="text-lg font-semibold">Primeiro acesso</h1>
              <p className="text-sm text-muted-foreground">Crie o workspace e a conta de administrador (owner).</p>
            </div>
          </div>
          <FormAuth
            acao={criarPrimeiroAcesso}
            botao="Criar workspace"
            campos={[
              { nome: "workspace", rotulo: "Nome do workspace" },
              { nome: "nome", rotulo: "Seu nome", autoComplete: "name" },
              { nome: "email", rotulo: "E-mail", tipo: "email", autoComplete: "email" },
              { nome: "senha", rotulo: "Senha (mín. 8 caracteres)", tipo: "password", autoComplete: "new-password" },
            ]}
          />
        </CardContent>
      </Card>
    </main>
  );
}
