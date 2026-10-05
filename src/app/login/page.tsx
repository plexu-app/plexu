import { redirect } from "next/navigation";
import { FormAuth } from "@/components/form-auth";
import { Logo } from "@/components/marca";
import { AlternarTema } from "@/components/tema";
import { Card, CardContent } from "@/components/ui/misc";
import { entrar } from "@/app/auth-actions";
import { usuarioAtual } from "@/server/auth/sessao";
import { haUsuarios } from "@/server/consultas";

export const dynamic = "force-dynamic";

export default async function Login() {
  if (!(await haUsuarios())) redirect("/setup");
  if (await usuarioAtual()) redirect("/");
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-bg p-6">
      <AlternarTema className="absolute right-4 top-4" />
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-3">
            <Logo altura={40} />
            <h1 className="text-lg font-semibold">Entrar no Plexu</h1>
          </div>
          <FormAuth
            acao={entrar}
            botao="Entrar"
            campos={[
              { nome: "email", rotulo: "E-mail", tipo: "email", autoComplete: "email" },
              { nome: "senha", rotulo: "Senha", tipo: "password", autoComplete: "current-password" },
            ]}
          />
        </CardContent>
      </Card>
    </main>
  );
}
